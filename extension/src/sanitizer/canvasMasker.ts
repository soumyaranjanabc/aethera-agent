import type { Rect } from "../shared/types";

/** Minimal 2D-context surface so this is unit-testable without a real canvas. */
export interface Fillable {
  fillStyle: unknown;
  fillRect(x: number, y: number, w: number, h: number): void;
}

/**
 * Converts viewport-CSS-pixel rects into device-pixel rects:
 * pads them (so glyph edges don't peek out), scales, and clamps to the image.
 */
export function prepareMaskRects(
  rects: Rect[],
  viewport: { w: number; h: number },
  scale: number,
  padCssPx = 2
): Rect[] {
  const W = Math.round(viewport.w * scale);
  const H = Math.round(viewport.h * scale);
  const out: Rect[] = [];
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor((r.x - padCssPx) * scale));
    const y0 = Math.max(0, Math.floor((r.y - padCssPx) * scale));
    const x1 = Math.min(W, Math.ceil((r.x + r.w + padCssPx) * scale));
    const y1 = Math.min(H, Math.ceil((r.y + r.h + padCssPx) * scale));
    if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

export function blackout(ctx: Fillable, rects: Rect[]): void {
  ctx.fillStyle = "#000000";
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** Draws the screenshot offscreen, blacks out the masks, returns a redacted PNG. Throws on any failure (fail closed). */
export async function redactImageBlob(
  blob: Blob,
  rects: Rect[],
  viewport: { w: number; h: number }
): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  try {
    const scale = bmp.width / viewport.w;
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.drawImage(bmp, 0, 0);
    blackout(ctx, prepareMaskRects(rects, viewport, scale));
    return await canvas.convertToBlob({ type: "image/png" });
  } finally {
    bmp.close();
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(bin)}`;
}