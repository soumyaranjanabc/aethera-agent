"""Pure label logic: kept free of Playwright so it can be unit tested."""

CLASSES = ["button", "input", "select", "checkbox", "link", "tab", "table", "card", "canvas", "pii"]
CID = {c: i for i, c in enumerate(CLASSES)}


def split_of(seed: int) -> str:
    """All scenes of one seed land in the same split, so no layout leaks across splits."""
    r = seed % 10
    return "val" if r == 8 else "test" if r == 9 else "train"


def clip_box(it, W, H, min_vis=0.5, big_frac=0.15, min_px=4):
    """Clip a ground-truth box to the viewport.

    Returns (x0, y0, x1, y1) or None. Kept when at least `min_vis` of the element is visible,
    or when the clipped part covers at least `big_frac` of the screen (long tables and cards
    that run past the bottom edge are still clearly visible objects).
    """
    x0, y0 = it["x"], it["y"]
    x1, y1 = x0 + it["w"], y0 + it["h"]
    area = (x1 - x0) * (y1 - y0)
    if area <= 0:
        return None
    cx0, cy0, cx1, cy1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    cw, ch = cx1 - cx0, cy1 - cy0
    if cw < min_px or ch < min_px:
        return None
    if cw * ch / area >= min_vis or cw * ch >= big_frac * W * H:
        return (cx0, cy0, cx1, cy1)
    return None


def to_yolo_line(cid, box, W, H) -> str:
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2 / W, (y0 + y1) / 2 / H
    w, h = (x1 - x0) / W, (y1 - y0) / H
    return f"{cid} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"