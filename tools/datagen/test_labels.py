from labels import CID, clip_box, split_of, to_yolo_line

W, H = 1280, 800


def box(x, y, w, h):
    return {"x": x, "y": y, "w": w, "h": h}


def test_inside_box_is_kept_unchanged():
    assert clip_box(box(10, 20, 100, 40), W, H) == (10, 20, 110, 60)


def test_fully_offscreen_is_dropped():
    assert clip_box(box(10, 900, 100, 40), W, H) is None


def test_mostly_hidden_small_box_is_dropped():
    # only 30% of this button is visible -> would teach the model a partial object
    assert clip_box(box(10, 780, 100, 60), W, H) is None


def test_tall_table_running_past_bottom_is_kept_and_clipped():
    assert clip_box(box(0, 300, 1280, 1500), W, H) == (0, 300, 1280, 800)


def test_tiny_sliver_is_dropped():
    assert clip_box(box(10, 797, 100, 40), W, H) is None


def test_split_is_stable_per_seed():
    assert [split_of(s) for s in (1, 7, 8, 9, 18, 19)] == ["train", "train", "val", "test", "val", "test"]


def test_yolo_line_is_normalised():
    line = to_yolo_line(CID["pii"], (0, 0, 640, 400), W, H)
    assert line == "9 0.250000 0.250000 0.500000 0.500000"