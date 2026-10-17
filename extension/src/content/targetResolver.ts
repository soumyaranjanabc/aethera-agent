import type { LayoutNode } from "../shared/types";
import { collectSnapshot } from "../sanitizer/domSanitizer";

export type Want = "input" | "clickable";

const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

export function scoreLabel(label: string, query: string): number {
  const l = norm(label);
  const q = norm(query);
  if (!l || !q) return 0;
  if (l === q) return 100;
  if (l.startsWith(q)) return 85;
  if (l.includes(q)) return 70;
  if (q.includes(l) && l.length >= 3) return 55;
  const lt = new Set(l.split(" "));
  const qt = q.split(" ");
  const hit = qt.filter((t) => lt.has(t)).length;
  return hit ? Math.round((50 * hit) / qt.length) : 0;
}

const NON_TEXT = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "image", "file", "hidden"]);

function isTextInput(n: LayoutNode): boolean {
  if (n.tag === "textarea") return true;
  if (n.tag !== "input") return false;
  const t = n.inputType ?? "text";
  // Never auto-type into password fields. Credentials need explicit human confirmation (Phase 9).
  return t !== "password" && !NON_TEXT.has(t);
}

export function findTarget(
  nodes: LayoutNode[],
  query: string,
  want: Want,
  minScore = 40
): { node: LayoutNode; score: number } | null {
  let best: { node: LayoutNode; score: number } | null = null;
  for (const n of nodes) {
    if (!n.interactive) continue;
    if (want === "input" ? !isTextInput(n) : n.tag === "input" && isTextInput(n)) continue;
    const score = scoreLabel(n.text, query);
    if (score < minScore) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && n.rect.y < best.node.rect.y)
    ) {
      best = { node: n, score };
    }
  }
  return best;
}

export function resolveTarget(
  query: string,
  want: Want
): { x: number; y: number; label: string } | null {
  const snap = collectSnapshot();
  const hit = findTarget(snap.nodes, query, want);
  if (!hit) return null;
  const { x, y, w, h } = hit.node.rect;
  return { x: Math.round(x + w / 2), y: Math.round(y + h / 2), label: hit.node.text };
}