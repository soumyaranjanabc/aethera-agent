#!/usr/bin/env python3
"""Runs the ONNX model (what ships) on both held-out sets and writes the fixture the TS benchmark reads."""
import argparse
import json
import random

import numpy as np
import onnxruntime as ort

from common import decode, featurize, score

ap = argparse.ArgumentParser()
ap.add_argument("--onnx", default="out/name_net.onnx")
ap.add_argument("--data", default="data")
ap.add_argument("--out", default="out")
ap.add_argument("--thr", type=float, default=0.5, help="threshold written to the TS fixture")
a = ap.parse_args()
sess = ort.InferenceSession(a.onnx, providers=["CPUExecutionProvider"])


def probs(text):
    toks, ids, shapes = featurize(text)
    if not toks:
        return toks, []
    lg = sess.run(None, {"ids": np.array([ids], dtype=np.int64), "shapes": np.array([shapes], dtype=np.int64)})[0][0]
    return toks, 1 / (1 + np.exp(lg[:, 0] - lg[:, 1]))


report, cache = {}, {}
for name in ("test_iid", "test_ood"):
    ex = [json.loads(l) for l in open(f"{a.data}/{name}.jsonl")]
    cache[name] = [(e, *probs(e["text"])) for e in ex]
    print(f"\n{name}: {sum(1 for e in ex if not e['spans'])} clean / {len(ex)} sentences")
    for thr in (0.3, 0.5, 0.7):
        s = score(ex, [decode(t, p, thr) if len(t) else [] for _, t, p in cache[name]])
        report[f"{name}@{thr}"] = s
        print(f"  thr {thr}: recall {s['recall']:.3f} | precision {s['precision']:.3f} | clean sentences flagged {s['clean_fp']:.3f}")

rng = random.Random(0)
pos = [c for c in cache["test_ood"] if c[0]["spans"]]
neg = [c for c in cache["test_ood"] if not c[0]["spans"]]
pick = rng.sample(pos, 200) + rng.sample(neg, 100)
fx = {"thr": a.thr, "examples": [
    {"text": e["text"], "gold": e["spans"], "model": [list(s) for s in (decode(t, p, a.thr) if len(t) else [])]}
    for e, t, p in pick]}
json.dump(fx, open(f"{a.out}/heldout.json", "w"))
json.dump(report, open(f"{a.out}/report.json", "w"), indent=2)
print("\nwrote", f"{a.out}/heldout.json", "and report.json")