import { describe, it, expect } from "vitest";
import golden from "./fixtures/nameFeatures.golden.json";
import { K, NB, decodeNames, featurize, flattenFeatures, fnv1a, shapeOf, tokenize } from "../src/sanitizer/nameFeatures";

describe("name features: parity with Python", () => {
  it("constants match", () => {
    expect(golden.K).toBe(K);
    expect(golden.NB).toBe(NB);
  });

  it("FNV-1a known vectors", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });

  for (const c of golden.features) {
    it(`tokens, shapes and ids identical: ${JSON.stringify(c.text).slice(0, 40)}`, () => {
      const toks = tokenize(c.text);
      expect(toks.map((t) => t.text)).toEqual(c.tokens.map((t) => t[0]));
      if (c.ascii) expect(toks.map((t) => [t.start, t.end])).toEqual(c.tokens.map((t) => [t[1], t[2]]));
      const f = featurize(toks);
      expect(f.shapes).toEqual(c.shapes);
      expect(f.ids).toEqual(c.ids);
    });
  }

  for (const c of golden.decode) {
    it(`decode identical: ${c.text}`, () => {
      expect(decodeNames(tokenize(c.text), c.p, c.thr).map((m) => [m.start, m.end])).toEqual(c.spans);
    });
  }

  it("shapes", () => {
    expect([shapeOf("S"), shapeOf("MOCKSAT"), shapeOf("ab1"), shapeOf("McD"), shapeOf("12"), shapeOf(".")]).toEqual([2, 3, 1, 5, 4, 6]);
  });

  it("flattenFeatures has the ONNX layout", () => {
    const f = featurize(tokenize("Name: Priya"));
    const flat = flattenFeatures(f);
    expect(flat.T).toBe(3);
    expect(flat.ids.length).toBe(3 * K);
    expect(Number(flat.ids[K])).toBe(f.ids[1][0]);
    expect(Array.from(flat.shapes, Number)).toEqual(f.shapes);
  });
});