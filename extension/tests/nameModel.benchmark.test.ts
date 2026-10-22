import { describe, it, expect } from "vitest";
import heldout from "./fixtures/nameHeldout.json";
import { detectPII } from "../src/sanitizer/detector";
import { clearNameCache, setNameSpans } from "../src/sanitizer/nameCache";

type Ex = { text: string; gold: [number, number][]; model: [number, number][] };
const data = heldout.examples as unknown as Ex[];

function run(withModel: boolean) {
  clearNameCache();
  if (withModel) for (const e of data) setNameSpans(e.text, e.model.map(([start, end]) => ({ type: "NAME" as const, start, end, confidence: 0.8 })));
  let gold = 0, hit = 0, clean = 0, flagged = 0;
  for (const e of data) {
    const ms = detectPII(e.text);
    for (const [gs, ge] of e.gold) {
      gold++;
      const cov = ms.reduce((s, m) => s + Math.max(0, Math.min(ge, m.end) - Math.max(gs, m.start)), 0);
      if (cov >= 0.9 * (ge - gs)) hit++;
    }
    if (e.gold.length === 0) { clean++; if (ms.length) flagged++; }
  }
  return { recall: hit / Math.max(gold, 1), cleanFlagged: flagged / Math.max(clean, 1), gold, clean };
}

describe.skipIf(data.length === 0)("names: regex rules vs regex + model (held-out templates, unseen names)", () => {
  const base = run(false);
  const both = run(true);
  console.table({ "regex only": base, "regex + model": both });

  it("the model never removes coverage", () => expect(both.recall).toBeGreaterThanOrEqual(base.recall));
  it("combined name recall >= 0.85 (initial target, tune after the first run)", () => expect(both.recall).toBeGreaterThanOrEqual(0.85));
  it("clean sentences flagged <= regex-only + 0.05 (initial target)", () => expect(both.cleanFlagged).toBeLessThanOrEqual(base.cleanFlagged + 0.05));
});