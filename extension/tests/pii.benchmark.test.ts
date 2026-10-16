import { describe, it, expect } from "vitest";
import { detectPII } from "../src/sanitizer/detector";
import { CORPUS } from "./fixtures/piiCorpus";

type Span = { start: number; end: number };

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/** True if the union of detections fully covers the expected span. */
function covered(span: Span, dets: Span[]): boolean {
  let pos = span.start;
  for (const d of [...dets].sort((a, b) => a.start - b.start)) {
    if (d.end <= pos) continue;
    if (d.start > pos) break;
    pos = d.end;
    if (pos >= span.end) return true;
  }
  return pos >= span.end;
}

function evaluate() {
  let expectedTotal = 0, expectedHit = 0, detTotal = 0, detTrue = 0, cleanFalsePositives = 0;
  const perType: Record<string, { exp: number; hit: number }> = {};

  for (const s of CORPUS) {
    const expected: Span[] = s.pii.map((p) => {
      const i = s.text.indexOf(p);
      if (i < 0) throw new Error(`Corpus bug: "${p}" not found in "${s.text}"`);
      return { start: i, end: i + p.length };
    });
    const dets = detectPII(s.text);

    detTotal += dets.length;
    for (const d of dets) if (expected.some((e) => overlaps(d, e))) detTrue++;
    if (s.pii.length === 0) cleanFalsePositives += dets.length;

    for (const e of expected) {
      expectedTotal++;
      const hit = covered(e, dets);
      if (hit) expectedHit++;
      const t = (perType[s.type] ??= { exp: 0, hit: 0 });
      t.exp++;
      if (hit) t.hit++;
      if (!hit) console.warn(`MISSED [${s.type}] "${s.text.slice(e.start, e.end)}" in "${s.text}"`);
    }
  }

  const recall = expectedHit / expectedTotal;
  const precision = detTotal === 0 ? 1 : detTrue / detTotal;
  return { recall, precision, cleanFalsePositives, perType, expectedTotal, detTotal };
}

describe("PII benchmark", () => {
  const r = evaluate();

  console.log(
    `\nPII BENCHMARK  recall=${(r.recall * 100).toFixed(1)}%  precision=${(r.precision * 100).toFixed(1)}%  ` +
      `(${r.expectedTotal} expected spans, ${r.detTotal} detections)`
  );
  console.table(
    Object.fromEntries(
      Object.entries(r.perType).map(([k, v]) => [k, { expected: v.exp, covered: v.hit, recall: `${((v.hit / v.exp) * 100).toFixed(0)}%` }])
    )
  );

  it("recall >= 95% (full-span coverage)", () => {
    expect(r.recall).toBeGreaterThanOrEqual(0.95);
  });

  it("precision >= 90%", () => {
    expect(r.precision).toBeGreaterThanOrEqual(0.9);
  });

  it("zero false positives on clean telemetry-style text", () => {
    expect(r.cleanFalsePositives).toBe(0);
  });
});