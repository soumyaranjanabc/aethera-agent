import type { PIIType } from "../shared/types";
import { RULES } from "./patterns";

export interface PIIMatch {
  type: PIIType;
  start: number;
  end: number;
  confidence: number;
}

export interface DetectOptions {
  /** Drop matches below this confidence. Default 0.5. */
  minConfidence?: number;
}

type CustomDetector = (text: string) => PIIMatch[];
const customDetectors = new Set<CustomDetector>();

/**
 * Plug-in point for the Phase 6 ML (token-classification) detector.
 * Returns an unregister function.
 */
export function registerDetector(fn: CustomDetector): () => void {
  customDetectors.add(fn);
  return () => customDetectors.delete(fn);
}

/** Merges overlapping spans into their union (privacy-first: redact more, never less). */
function mergeMatches(raw: PIIMatch[]): PIIMatch[] {
  if (raw.length === 0) return [];
  const sorted = [...raw].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: PIIMatch[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = out[out.length - 1];
    const next = sorted[i];
    if (next.start < cur.end) {
      cur.end = Math.max(cur.end, next.end);
      if (next.confidence > cur.confidence) {
        cur.type = next.type;
        cur.confidence = next.confidence;
      }
    } else {
      out.push({ ...next });
    }
  }
  return out;
}

export function detectPII(text: string, opts: DetectOptions = {}): PIIMatch[] {
  if (!text || text.length < 4) return [];
  const min = opts.minConfidence ?? 0.5;
  const raw: PIIMatch[] = [];

  for (const rule of RULES) {
    if (rule.confidence < min) continue;
    for (const m of text.matchAll(rule.regex)) {
      let start = m.index ?? 0;
      let value = m[0];
      if (rule.group !== undefined) {
        const span = m.indices?.[rule.group];
        if (!span) continue;
        start = span[0];
        value = text.slice(span[0], span[1]);
      }
      if (rule.validate && !rule.validate(value)) continue;
      raw.push({ type: rule.type, start, end: start + value.length, confidence: rule.confidence });
    }
  }

  for (const fn of customDetectors) {
    try {
      for (const m of fn(text)) if (m.confidence >= min) raw.push(m);
    } catch (e) {
      console.error("[AETHERA] custom detector failed", e);
    }
  }

  return mergeMatches(raw);
}

/** Replaces every detected span with a [TYPE] token. */
export function redactText(
  text: string,
  opts: DetectOptions = {}
): { text: string; matches: PIIMatch[] } {
  const matches = detectPII(text, opts);
  let out = text;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    out = out.slice(0, m.start) + `[${m.type}]` + out.slice(m.end);
  }
  return { text: out, matches };
}