import { describe, it, expect, beforeEach } from "vitest";
import { collectSnapshot } from "../src/sanitizer/domSanitizer";
import type { PIIMatch } from "../src/sanitizer/detector";
import { clearNameCache, setNameSpans, withRecording } from "../src/sanitizer/nameCache";

const RECT = { left: 10, top: 10, width: 120, height: 24, right: 130, bottom: 34, x: 10, y: 10 };

beforeEach(() => {
  clearNameCache();
  document.body.innerHTML = "";
  document.title = "";
  (Element.prototype as any).getBoundingClientRect = () => RECT;
  (Range.prototype as any).getClientRects = () => [RECT];
  (Range.prototype as any).getBoundingClientRect = () => RECT;
});

// Stands in for the ONNX model (Phase 7 runs the real one on the recorded strings).
const fakeNer = (t: string): PIIMatch[] => {
  const i = t.indexOf("Meera Nair");
  return i < 0 ? [] : [{ type: "NAME", start: i, end: i + 10, confidence: 0.8 }];
};

describe("two-pass priming", () => {
  it("masks a name the regex rules cannot see, only after priming", () => {
    document.body.innerHTML = `<p>Please forward this to Meera Nair before noon</p>`;
    expect(JSON.stringify(collectSnapshot())).toContain("Meera Nair");   // regex alone leaks it

    const { strings } = withRecording(() => collectSnapshot());
    expect(strings.some((s) => s.includes("Meera Nair"))).toBe(true);
    for (const s of strings) setNameSpans(s, fakeNer(s));

    const snap = collectSnapshot();
    expect(JSON.stringify(snap)).not.toContain("Meera Nair");
    expect(snap.stats.byType.NAME).toBeGreaterThanOrEqual(1);
    expect(snap.maskRects.length).toBeGreaterThanOrEqual(1);
  });

  it("an empty cache changes nothing", () => {
    document.body.innerHTML = `<p>Mail ravi@isro.gov.in today</p>`;
    expect(JSON.stringify(collectSnapshot())).not.toContain("ravi@isro");
  });
});