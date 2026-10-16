import { describe, it, expect, vi } from "vitest";
import { prepareMaskRects, blackout } from "../src/sanitizer/canvasMasker";

describe("canvasMasker", () => {
  it("pads, scales to device pixels", () => {
    const out = prepareMaskRects([{ x: 10, y: 10, w: 20, h: 10 }], { w: 100, h: 50 }, 2, 2);
    expect(out).toEqual([{ x: 16, y: 16, w: 48, h: 28 }]);
  });

  it("clamps to the image and drops fully off-screen rects", () => {
    const out = prepareMaskRects(
      [
        { x: 90, y: 10, w: 50, h: 10 }, // runs past right edge
        { x: -50, y: -50, w: 20, h: 20 }, // fully off-screen
      ],
      { w: 100, h: 50 },
      2,
      2
    );
    expect(out).toHaveLength(1);
    expect(out[0].x + out[0].w).toBe(200);
  });

  it("blackout fills every rect with solid black", () => {
    const ctx = { fillStyle: "", fillRect: vi.fn() };
    blackout(ctx, [{ x: 1, y: 2, w: 3, h: 4 }, { x: 5, y: 6, w: 7, h: 8 }]);
    expect(ctx.fillStyle).toBe("#000000");
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
    expect(ctx.fillRect).toHaveBeenCalledWith(1, 2, 3, 4);
  });
});