#!/usr/bin/env python3
"""Generate a YOLO-format UI + PII dataset from the mock pages.

Usage (from tools/datagen, venv active):
    python generate.py --size smoke      # ~20 images, run this first
    python generate.py --size medium     # ~1500 images
"""
import argparse
import functools
import json
import random
import shutil
import sys
import threading
from collections import Counter, defaultdict
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

from labels import CID, CLASSES, clip_box, split_of, to_yolo_line

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "mock-isro"
SPLITS = ["train", "val", "test"]

# size -> (mock seeds, generic seeds). Mock seeds make 5 images each (login + 4 tabs).
SIZES = {"smoke": (3, 6), "small": (30, 150), "medium": (150, 750), "large": (500, 2500)}
VIEWPORTS = [(1280, 800), (1440, 900), (1024, 768), (1366, 768)]

# name, extra query, selector to wait for, must the scene contain PII?
MOCK_SCENES = [
    ("login", "&view=login", ".login", False),
    ("overview", "&tab=overview", "#panel", True),
    ("telemetry", "&tab=telemetry", "#panel", True),
    ("operators", "&tab=operators", "#panel", True),
    ("alerts", "&tab=alerts", "#panel", True),
]


class DatasetError(Exception):
    pass


def start_server():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    httpd = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(SITE)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f"http://127.0.0.1:{httpd.server_address[1]}"


def build_scenes(args):
    n_mock, n_gen = SIZES[args.size]
    n_mock = args.mock_seeds if args.mock_seeds is not None else n_mock
    n_gen = args.generic_seeds if args.generic_seeds is not None else n_gen
    s0 = args.seed_start
    scenes = []
    for seed in range(s0, s0 + n_mock):
        for name, extra, wait, need_pii in MOCK_SCENES:
            scenes.append(dict(source="mock", seed=seed, name=name, need_pii=need_pii, wait=wait,
                               path=f"/index.html?mode=train&seed={seed}{extra}"))
    for seed in range(s0, s0 + n_gen):
        scenes.append(dict(source="generic", seed=seed, name="page", need_pii=True,
                           wait="body[data-ready]", path=f"/generic.html?seed={seed}"))
    return scenes


def capture(page, base, sc, W, H):
    errors = []
    on_err = lambda e: errors.append(str(e))  # noqa: E731
    page.on("pageerror", on_err)
    url = base + sc["path"]
    try:
        page.goto(url, wait_until="load")
        page.wait_for_selector(sc["wait"], timeout=10_000)
        page.wait_for_function("typeof window.__AETHERA_GROUND_TRUTH__ === 'function'", timeout=10_000)
        page.wait_for_timeout(150)
        gt = page.evaluate("window.__AETHERA_GROUND_TRUTH__()")
        png = page.screenshot(type="png")
    except Exception as e:
        raise DatasetError(f"{url}\n  page failed to load or expose ground truth: {e}")
    finally:
        page.remove_listener("pageerror", on_err)

    if errors:
        raise DatasetError(f"{url}\n  JavaScript error on the page: {errors[0]}")
    vp = gt["viewport"]
    if (vp["w"], vp["h"]) != (W, H):
        raise DatasetError(f"{url}\n  viewport mismatch: page says {vp['w']}x{vp['h']}, expected {W}x{H}")
    if not gt["ui"]:
        raise DatasetError(f"{url}\n  EMPTY ui ground truth. Refusing to write a blank label file.")
    if sc["need_pii"] and not gt["pii"]:
        raise DatasetError(f"{url}\n  EMPTY pii ground truth on a scene that must contain PII.")

    boxes = []
    for it in gt["ui"]:
        if it["cls"] not in CID:
            raise DatasetError(f"{url}\n  unknown ui class '{it['cls']}'. Add it to labels.CLASSES or fix the page.")
        b = clip_box(it, W, H)
        if b:
            boxes.append((CID[it["cls"]], b))
    for it in gt["pii"]:
        b = clip_box(it, W, H)
        if b:
            boxes.append((CID["pii"], b))
    if not boxes:
        raise DatasetError(f"{url}\n  no boxes left after clipping to the viewport.")
    return png, boxes


def draw_previews(records, out, n=12):
    pdir = out / "previews"
    pdir.mkdir(exist_ok=True)
    palette = ["#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4", "#46f0f0", "#f032e6", "#bcf60c", "#ff0000"]
    for rec in random.Random(0).sample(records, min(n, len(records))):
        img = Image.open(rec["img"]).convert("RGB")
        d = ImageDraw.Draw(img)
        for cid, (x0, y0, x1, y1) in rec["boxes"]:
            col = palette[cid % len(palette)]
            d.rectangle([x0, y0, x1, y1], outline=col, width=2)
            d.text((x0 + 2, max(0, y0 - 11)), CLASSES[cid], fill=col)
        img.save(pdir / Path(rec["img"]).name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", choices=SIZES, default="medium")
    ap.add_argument("--mock-seeds", type=int)
    ap.add_argument("--generic-seeds", type=int)
    ap.add_argument("--seed-start", type=int, default=1)
    ap.add_argument("--out", default=str(ROOT / "datasets" / "aethera-ui"))
    ap.add_argument("--vary-viewport", action="store_true", help="cycle 4 viewport sizes (better generalisation)")
    ap.add_argument("--no-zip", action="store_true")
    args = ap.parse_args()

    out = Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    for s in SPLITS:
        (out / "images" / s).mkdir(parents=True)
        (out / "labels" / s).mkdir(parents=True)

    scenes = build_scenes(args)
    print(f"Generating {len(scenes)} images -> {out}")
    httpd, base = start_server()

    counts = {s: Counter() for s in SPLITS}
    images = Counter()
    records = []

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1280, "height": 800}, device_scale_factor=1,
                                      reduced_motion="reduce")
            page = ctx.new_page()
            for i, sc in enumerate(scenes, 1):
                W, H = VIEWPORTS[sc["seed"] % 4] if args.vary_viewport else (1280, 800)
                page.set_viewport_size({"width": W, "height": H})
                png, boxes = capture(page, base, sc, W, H)

                split = split_of(sc["seed"])
                stem = f"{sc['source']}_{sc['seed']:05d}_{sc['name']}"
                img_path = out / "images" / split / f"{stem}.png"
                img_path.write_bytes(png)
                (out / "labels" / split / f"{stem}.txt").write_text(
                    "\n".join(to_yolo_line(c, b, W, H) for c, b in boxes) + "\n")
                images[split] += 1
                for c, _ in boxes:
                    counts[split][CLASSES[c]] += 1
                records.append({"img": str(img_path), "boxes": boxes})
                if i % 50 == 0 or i == len(scenes):
                    print(f"  {i}/{len(scenes)}")
            browser.close()
    except DatasetError as e:
        print(f"\nFAILED (nothing was zipped):\n  {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        httpd.shutdown()

    (out / "classes.txt").write_text("\n".join(CLASSES) + "\n")
    names = "\n".join(f"  {i}: {c}" for i, c in enumerate(CLASSES))
    (out / "data.yaml").write_text(
        f"path: .  # set to the dataset folder (e.g. /content/aethera-ui in Colab)\n"
        f"train: images/train\nval: images/val\ntest: images/test\nnames:\n{names}\n")

    report = {"images": dict(images), "boxes": {s: dict(counts[s]) for s in SPLITS}, "classes": CLASSES}
    (out / "report.json").write_text(json.dumps(report, indent=2))
    draw_previews(records, out)

    print("\nImages per split:", dict(images))
    print(f"{'class':<10}" + "".join(f"{s:>8}" for s in SPLITS))
    for c in CLASSES:
        print(f"{c:<10}" + "".join(f"{counts[s][c]:>8}" for s in SPLITS))
    for c in CLASSES:
        if counts["train"][c] < 30:
            print(f"WARNING: only {counts['train'][c]} train boxes for '{c}'. Use a bigger --size.")

    if not args.no_zip:
        z = shutil.make_archive(str(out), "zip", root_dir=out)
        print(f"\nZip ready: {z}")
    print(f"Previews: {out / 'previews'}")


if __name__ == "__main__":
    main()