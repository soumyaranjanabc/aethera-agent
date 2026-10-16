import { describe, it, expect, beforeEach } from "vitest";
import { collectSnapshot, sanitizeUrl } from "../src/sanitizer/domSanitizer";
import { makeAadhaar } from "../src/sanitizer/checksums";

const RECT = { left: 10, top: 10, width: 120, height: 24, right: 130, bottom: 34, x: 10, y: 10 };

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "";
  (Element.prototype as any).getBoundingClientRect = () => RECT;
  (Range.prototype as any).getClientRects = () => [RECT];
  (Range.prototype as any).getBoundingClientRect = () => RECT;
});

describe("collectSnapshot", () => {
  it("redacts PII in text and masks its region", () => {
    document.body.innerHTML = `<p>Mail ravi.kumar@isro.gov.in today</p>`;
    const snap = collectSnapshot();
    expect(snap.nodes.some((n) => n.text.includes("[EMAIL]"))).toBe(true);
    expect(snap.maskRects.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(snap)).not.toContain("ravi.kumar");
    expect(snap.stats.byType.EMAIL).toBe(1);
  });

  it("masks password fields and never emits their value", () => {
    document.body.innerHTML = `<label>Password</label><input type="password" value="hunter2">`;
    const snap = collectSnapshot();
    const pw = snap.nodes.find((n) => n.inputType === "password")!;
    expect(pw.sensitive).toBe(true);
    expect(snap.maskRects.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(snap)).not.toContain("hunter2");
  });

  it("masks non-empty text inputs by default and respects maskInputValues:false", () => {
    document.body.innerHTML = `<input type="text" value="Anil Kumar">`;
    const on = collectSnapshot();
    expect(on.maskRects.length).toBe(1);
    expect(JSON.stringify(on)).not.toContain("Anil Kumar");

    const off = collectSnapshot({ maskInputValues: false });
    expect(off.maskRects.length).toBe(0);
  });

  it("traverses open shadow roots", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<p>Duty phone 9876543210</p>`;
    const snap = collectSnapshot();
    expect(snap.stats.byType.PHONE).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(snap)).not.toContain("9876543210");
  });

  it("masks iframes by default", () => {
    document.body.innerHTML = `<iframe></iframe>`;
    const snap = collectSnapshot();
    expect(snap.maskRects.length).toBe(1);
    expect(snap.nodes.find((n) => n.tag === "iframe")?.sensitive).toBe(true);
  });

  it("ignores <script> and <style> content", () => {
    document.body.innerHTML = `<style>.x{}</style><script>var e="a@b.co"</script><p>ok text</p>`;
    const snap = collectSnapshot();
    expect(JSON.stringify(snap)).not.toContain("a@b.co");
    expect(snap.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("masks elements marked data-aethera-redact and drops their text", () => {
    document.body.innerHTML = `<div data-aethera-redact>Secret stuff here</div>`;
    const snap = collectSnapshot();
    expect(snap.maskRects.length).toBe(1);
    expect(JSON.stringify(snap)).not.toContain("Secret stuff here");
  });

  it("masks canvas by default and can be switched off", () => {
    document.body.innerHTML = `<canvas></canvas>`;
    expect(collectSnapshot().maskRects.length).toBe(1);
    expect(collectSnapshot({ maskAllCanvas: false }).maskRects.length).toBe(0);
  });
  it("catches a name whose label is in a sibling text node", () => {
    document.body.innerHTML = `<div>Operator: <b>Dr. Anil Sharma</b></div>`;
    const snap = collectSnapshot();
    expect(JSON.stringify(snap)).not.toContain("Anil Sharma");
    expect(snap.stats.byType.NAME).toBeGreaterThanOrEqual(1);
    expect(snap.maskRects.length).toBeGreaterThanOrEqual(1);
  });
    it("credential inside a styled child is fully masked and not leaked", () => {
    document.body.innerHTML = `<div>Token: <b>password: Sup3rS3cret!</b></div>`;
    const snap = collectSnapshot();
    expect(JSON.stringify(snap)).not.toContain("Sup3rS3cret");
    expect(snap.stats.byType.CREDENTIAL).toBeGreaterThanOrEqual(1);
  });
  it("PRIVACY INVARIANT: no raw PII anywhere in the serialized snapshot", () => {
    const a = makeAadhaar("23456789012");
    const aSp = `${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)}`;
    document.body.innerHTML = `
      <p>Aadhaar ${aSp}</p>
      <p>Email s.nair@vssc.gov.in</p>
      <p>Phone +91 98765 43210</p>
      <p>Card 4111 1111 1111 1111</p>
      <p>password: Sup3rS3cret!</p>
      <p>Pad 13.0827, 80.2707</p>`;
    const json = JSON.stringify(collectSnapshot());
    for (const raw of [aSp, a, "s.nair@vssc.gov.in", "98765 43210", "4111 1111 1111 1111", "Sup3rS3cret", "13.0827", "80.2707"]) {
      expect(json).not.toContain(raw);
    }
  });
});

describe("sanitizeUrl", () => {
  it("drops query/hash and replaces id-like path segments", () => {
    const r = sanitizeUrl("https://isro.example/telemetry/12345678/view?token=abc#frag");
    expect(r.origin).toBe("https://isro.example");
    expect(r.path).toBe("/telemetry/:id/view");
  });
});