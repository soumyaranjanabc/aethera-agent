import { registerDetector, type PIIMatch } from "./detector";

const MAX_ENTRIES = 5000;
const cache = new Map<string, PIIMatch[]>();
let recording: Set<string> | null = null;

export function setNameSpans(text: string, spans: PIIMatch[]): void {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(text, spans.map((s) => ({ ...s })));
}

export function clearNameCache(): void {
  cache.clear();
}

/** Runs fn while recording every string the detector is asked about (pass 1 of the two-pass flow). */
export function withRecording<T>(fn: () => T): { result: T; strings: string[] } {
  const seen = new Set<string>();
  recording = seen;
  try {
    const result = fn();
    return { result, strings: [...seen] };
  } finally {
    recording = null;
  }
}

// Synchronous hook for the async model: spans must be primed (setNameSpans) before the sanitizer runs.
registerDetector((text) => {
  recording?.add(text);
  return cache.get(text) ?? [];
});