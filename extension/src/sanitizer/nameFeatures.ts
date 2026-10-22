/** TypeScript twin of ml/pii/common.py. Must stay identical: tests/fixtures/nameFeatures.golden.json enforces it. */
import type { PIIMatch } from "./detector";

export const NB = 32768;
export const K = 20;
export const SHAPE = { pad: 0, lower: 1, cap: 2, upper: 3, digit: 4, mixed: 5, punct: 6 } as const;

const TOKEN_RE = /[A-Za-z0-9]+|[^\sA-Za-z0-9]/gu;
const enc = new TextEncoder();

export interface Token { text: string; start: number; end: number }
export interface Features { ids: number[][]; shapes: number[] }

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) out.push({ text: m[0], start: m.index!, end: m.index! + m[0].length });
  return out;
}

export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (const b of enc.encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const bucket = (s: string) => 1 + (fnv1a(s) % (NB - 1));

export function shapeOf(w: string): number {
  if (!/^[A-Za-z0-9]+$/.test(w)) return SHAPE.punct;
  if (/^[0-9]+$/.test(w)) return SHAPE.digit;
  if (/^[A-Z][a-z0-9]*$/.test(w)) return SHAPE.cap;
  if (/^[A-Z0-9]+$/.test(w)) return SHAPE.upper;
  if (/^[a-z0-9]+$/.test(w)) return SHAPE.lower;
  return SHAPE.mixed;
}

export function tokenIds(w: string): number[] {
  const lw = w.toLowerCase();
  const feats = ["w:" + lw];
  if (shapeOf(w) !== SHAPE.punct) {
    const p = "<" + lw + ">";
    for (const n of [3, 4, 2]) for (let i = 0; i <= p.length - n; i++) feats.push("g:" + p.slice(i, i + n));
  }
  const ids = feats.map(bucket).slice(0, K);
  while (ids.length < K) ids.push(0);
  return ids;
}

export function featurize(tokens: Token[]): Features {
  return { ids: tokens.map((t) => tokenIds(t.text)), shapes: tokens.map((t) => shapeOf(t.text)) };
}

/** Flat int64 buffers in the layout the ONNX model expects: ids [1,T,K], shapes [1,T]. */
export function flattenFeatures(f: Features) {
  const T = f.shapes.length;
  const ids = new BigInt64Array(T * K);
  f.ids.forEach((row, t) => row.forEach((v, k) => { ids[t * K + k] = BigInt(v); }));
  return { T, ids, shapes: BigInt64Array.from(f.shapes, (v) => BigInt(v)) };
}

export const pName = (l0: number, l1: number) => 1 / (1 + Math.exp(l0 - l1));

export function decodeNames(tokens: Token[], p: ArrayLike<number>, thr = 0.5): PIIMatch[] {
  const out: PIIMatch[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (p[i] < thr) { i++; continue; }
    let j = i;
    while (j + 1 < tokens.length && p[j + 1] >= thr) j++;
    let a = i, b = j;
    while (a <= b && shapeOf(tokens[a].text) === SHAPE.punct) a++;
    while (b >= a && shapeOf(tokens[b].text) === SHAPE.punct) b--;
    if (a <= b) out.push({ type: "NAME", start: tokens[a].start, end: tokens[b].end, confidence: 0.8 });
    i = j + 1;
  }
  return out;
}