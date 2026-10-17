import type { LayoutNode, Rect, SanitizedSnapshot } from "../shared/types";
import { detectPII, redactText, type PIIMatch } from "./detector";

export interface SanitizerOptions {
  /** Mask every <canvas> (fail closed; canvas pixels can't be text-scanned). */
  maskAllCanvas: boolean;
  /** Mask <iframe>/<object>/<embed> (content is opaque to us). */
  maskIframes: boolean;
  /** Mask every non-empty text input/textarea, not just those with detected PII. */
  maskInputValues: boolean;
  /** Include redacted text in layout nodes. */
  includeText: boolean;
  maxNodes: number;
  maxVisits: number;
  maxTextLen: number;
}

export const DEFAULT_OPTIONS: SanitizerOptions = {
  maskAllCanvas: true,
  maskIframes: true,
  maskInputValues: true,
  includeText: true,
  maxNodes: 1500,
  maxVisits: 100_000,
  maxTextLen: 160,
};

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK"]);
const OPAQUE_TAGS = new Set(["IFRAME", "FRAME", "OBJECT", "EMBED"]);
const INTERACTIVE_SEL =
  "a[href],button,summary,[role=button],[role=link],[role=checkbox],[role=menuitem],[role=tab],[onclick]";
const STRONG_SENSITIVE = /pass(?:word|wd|code)|pwd|secret|api[-_ ]?key|aadhaar|aadhar|card[-_ ]?num|cvv|cvc/i;
const SHORT_SENSITIVE = /(?:^|[^a-z])(?:pan|otp|ssn|pin)(?:[^a-z]|$)/i;
const NON_TEXT_INPUT = new Set(["button", "submit", "reset", "checkbox", "radio", "range", "color", "image", "file"]);

interface Ctx {
  o: SanitizerOptions;
  vw: number;
  vh: number;
  nodes: LayoutNode[];
  masks: Rect[];
  maskKeys: Set<string>;
  byType: Record<string, number>;
  spans: number;
  truncated: boolean;
  complete: boolean;
  visits: number;
}

/* ---------------- helpers ---------------- */

function toRect(r: { left: number; top: number; width: number; height: number }): Rect {
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}

function intersectsViewport(r: Rect, vw: number, vh: number): boolean {
  return r.w > 0 && r.h > 0 && r.x < vw && r.y < vh && r.x + r.w > 0 && r.y + r.h > 0;
}

function unionRects(rs: Rect[]): Rect | null {
  if (rs.length === 0) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rs) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function rangeRects(node: Text, s: number, e: number): Rect[] {
  try {
    const r = document.createRange();
    r.setStart(node, s);
    r.setEnd(node, e);
    if (typeof r.getClientRects !== "function") return [];
    return Array.from(r.getClientRects())
      .map(toRect)
      .filter((x) => x.w > 0 && x.h > 0);
  } catch {
    return [];
  }
}

function addMask(ctx: Ctx, r: Rect) {
  if (!intersectsViewport(r, ctx.vw, ctx.vh)) return;
  const key = `${r.x},${r.y},${r.w},${r.h}`;
  if (ctx.maskKeys.has(key)) return;
  ctx.maskKeys.add(key);
  ctx.masks.push(r);
}

function addNode(ctx: Ctx, n: Omit<LayoutNode, "id">) {
  if (ctx.nodes.length >= ctx.o.maxNodes) {
    ctx.truncated = true; // nodes are capped, masks are NOT
    return;
  }
  ctx.nodes.push({ id: ctx.nodes.length + 1, ...n });
}

function bump(ctx: Ctx, matches: PIIMatch[]) {
  for (const m of matches) {
    ctx.byType[m.type] = (ctx.byType[m.type] ?? 0) + 1;
    ctx.spans++;
  }
}

function safeText(ctx: Ctx, raw: string): { text: string; count: number } {
  if (!ctx.o.includeText) return { text: "", count: 0 };
  const collapsed = raw.replace(/\s+/g, " ").trim().slice(0, 2000);
  const red = redactText(collapsed); // redact BEFORE truncating so no token is cut in half
  return { text: red.text.slice(0, ctx.o.maxTextLen), count: red.matches.length };
}

/** Field-name / attribute heuristics for sensitive inputs. */
function isSensitiveField(el: Element, type: string): boolean {
  if (type === "password") return true;
  const auto = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  if (/(^|\s)(cc-|current-password|new-password|one-time-code)/.test(auto)) return true;
  const hints = [el.getAttribute("name"), el.id, el.getAttribute("aria-label"), el.getAttribute("placeholder")]
    .filter(Boolean)
    .join(" ");
  return STRONG_SENSITIVE.test(hints) || SHORT_SENSITIVE.test(hints);
}

/* ---------------- public: URL sanitizer ---------------- */

export function sanitizeUrl(href: string): { origin: string; path: string } {
  try {
    const u = new URL(href);
    const segs = u.pathname.split("/").map((seg) => {
      if (/^\d{4,}$/.test(seg)) return ":id";
      if (/^[0-9a-f]{16,}$/i.test(seg)) return ":id";
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
      return seg;
    });
    return { origin: u.origin, path: redactText(segs.join("/")).text }; // query + hash dropped
  } catch {
    return { origin: "", path: "" };
  }
}

/* ---------------- node handlers ---------------- */
/** Text just before this node (e.g. "Operator: " before <b>Name</b>), used only as detection context. */
function labelContext(node: Text): string {
  let prev: Node | null = node.previousSibling;
  const parent = node.parentElement;
  if (!prev && parent && /^(B|STRONG|SPAN|I|EM|U|MARK|CODE|A)$/.test(parent.tagName.toUpperCase())) {
    prev = parent.previousSibling;
  }
  return prev && prev.nodeType === 3 ? (prev.nodeValue ?? "").slice(-40) : "";
}
/** Table columns whose cells hold person names (a regex can't recognise a bare "Priya Menon"). */
const NAME_COLUMN =
  /^(?:full\s*)?name$|^(?:operator|officer|engineer|scientist|contact(?:\s*person)?|user(?:name)?|assigned\s*to|acknowledged\s*by|duty\s*officer)$/i;

function columnImpliesName(parent: Element | null): boolean {
  const cell = parent?.closest("td");
  const table = cell?.closest("table");
  if (!cell || !table) return false;
  const header = table.rows[0]?.cells[cell.cellIndex];
  if (!header || header === cell) return false;
  return NAME_COLUMN.test((header.textContent ?? "").replace(/\s+/g, " ").trim());
}

function handleText(node: Text, ctx: Ctx) {
  const raw = node.nodeValue ?? "";
  if (raw.trim().length < 2) return;
  const parent = node.parentElement;
  if (parent && SKIP_TAGS.has(parent.tagName.toUpperCase())) return;
  const prefix = labelContext(node);
  let matches: PIIMatch[] = detectPII(prefix + raw)
    .filter((m) => m.end > prefix.length)
    .map((m) => ({
      ...m,
      start: Math.max(0, m.start - prefix.length),
      end: Math.min(raw.length, m.end - prefix.length),
    }))
    .filter((m) => m.end > m.start);
  if (columnImpliesName(parent)) {
    matches = [{ type: "NAME", start: 0, end: raw.length, confidence: 0.7 }];
  }
  if (matches.length) {
    bump(ctx, matches);
    for (const m of matches) {
      const rects = rangeRects(node, m.start, m.end);
      if (rects.length) rects.forEach((r) => addMask(ctx, r));
      else if (parent) addMask(ctx, toRect(parent.getBoundingClientRect())); // fail closed
      // Credentials: always mask the whole text node, never a partial span.
      if (m.type === "CREDENTIAL") rangeRects(node, 0, raw.length).forEach((r) => addMask(ctx, r));
    }
  }

  // Interactive elements already produce their own labelled node.
  if (parent?.closest(INTERACTIVE_SEL)) return;

  const bounds = unionRects(rangeRects(node, 0, raw.length)) ?? (parent ? toRect(parent.getBoundingClientRect()) : null);
  if (!bounds || !intersectsViewport(bounds, ctx.vw, ctx.vh)) return;
  let shown = raw;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    shown = shown.slice(0, m.start) + `[${m.type}]` + shown.slice(m.end);
  }
  const text = ctx.o.includeText ? shown.replace(/\s+/g, " ").trim().slice(0, ctx.o.maxTextLen) : "";
  addNode(ctx, {
    tag: parent ? parent.tagName.toLowerCase() : "#text",
    role: "text",
    text,
    rect: bounds,
    interactive: false,
    sensitive: matches.length > 0,
    redactions: matches.length,
  });
}

function handleElement(el: Element, ctx: Ctx): "descend" | "skip" {
  const tag = el.tagName.toUpperCase();
  if (SKIP_TAGS.has(tag)) return "skip";

  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return "skip";

  const rect = toRect(el.getBoundingClientRect());
  const visible = intersectsViewport(rect, ctx.vw, ctx.vh);

  // 1) Explicit opt-in redaction
  if (el.hasAttribute("data-aethera-redact")) {
    if (visible) {
      addMask(ctx, rect);
      addNode(ctx, { tag: tag.toLowerCase(), role: "redacted", text: "[REDACTED]", rect, interactive: false, sensitive: true, redactions: 0 });
    }
    ctx.byType["EXPLICIT"] = (ctx.byType["EXPLICIT"] ?? 0) + 1;
    return "skip";
  }

  // 2) Opaque embedded content
  if (OPAQUE_TAGS.has(tag)) {
    if (visible) {
      if (ctx.o.maskIframes) addMask(ctx, rect);
      addNode(ctx, { tag: tag.toLowerCase(), role: "embedded", text: "", rect, interactive: false, sensitive: ctx.o.maskIframes, redactions: 0 });
    }
    return "skip";
  }

  // 3) Canvas (pixels; cannot be text-scanned here. Phase 3 vision handles it.)
  if (tag === "CANVAS") {
    const mask = ctx.o.maskAllCanvas || el.hasAttribute("data-aethera-mask");
    if (visible) {
      if (mask) addMask(ctx, rect);
      addNode(ctx, { tag: "canvas", role: "canvas", text: "", rect, interactive: false, sensitive: mask, redactions: 0 });
    }
    return "skip";
  }

  // 4) Form controls: never emit values
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    const input = el as HTMLInputElement;
    const type = tag === "INPUT" ? (input.type || "text").toLowerCase() : tag.toLowerCase();
    if (type === "hidden") return "skip";

    let sensitive = isSensitiveField(el, type);
    if (sensitive) ctx.byType["SENSITIVE_FIELD"] = (ctx.byType["SENSITIVE_FIELD"] ?? 0) + 1;

    const value = tag === "SELECT" ? "" : input.value ?? "";
    if (value) {
      const ms = detectPII(value);
      if (ms.length) {
        sensitive = true;
        bump(ctx, ms);
      }
    }
    const textual = tag !== "SELECT" && !NON_TEXT_INPUT.has(type);
    const shouldMask = sensitive || (ctx.o.maskInputValues && textual && value.length > 0);

    if (visible) {
      if (shouldMask) addMask(ctx, rect);
      const assoc = (el as HTMLInputElement).labels?.[0]?.textContent ?? "";
      const label = el.getAttribute("aria-label") || assoc || el.getAttribute("placeholder") || el.getAttribute("title") || "";
      addNode(ctx, {
        tag: tag.toLowerCase(),
        role: el.getAttribute("role") ?? (tag === "SELECT" ? "select" : "textbox"),
        inputType: type,
        text: safeText(ctx, label).text,
        rect,
        interactive: true,
        sensitive: sensitive || shouldMask,
        redactions: 0,
      });
    }
    return "skip"; // never descend: <textarea> children are its raw value
  }

  // 5) Other interactive elements: emit a labelled node, still descend so text gets masked
  if (visible && el.matches(INTERACTIVE_SEL)) {
    const label = el.getAttribute("aria-label") || el.textContent || "";
    const { text, count } = safeText(ctx, label);
    addNode(ctx, {
      tag: tag.toLowerCase(),
      role: el.getAttribute("role") ?? (tag === "A" ? "link" : tag === "BUTTON" ? "button" : "interactive"),
      text,
      rect,
      interactive: true,
      sensitive: count > 0,
      redactions: count,
    });
  }

  return "descend";
}

/* ---------------- public: snapshot ---------------- */

export function collectSnapshot(options: Partial<SanitizerOptions> = {}): SanitizedSnapshot {
  const o: SanitizerOptions = { ...DEFAULT_OPTIONS, ...options };
  const ctx: Ctx = {
    o,
    vw: window.innerWidth,
    vh: window.innerHeight,
    nodes: [],
    masks: [],
    maskKeys: new Set(),
    byType: {},
    spans: 0,
    truncated: false,
    complete: true,
    visits: 0,
  };

  const stack: Node[] = [document.body ?? document.documentElement];
  while (stack.length) {
    if (++ctx.visits > o.maxVisits) {
      ctx.complete = false;
      break;
    }
    const n = stack.pop()!;
    if (n.nodeType === 1) {
      const el = n as Element;
      if (handleElement(el, ctx) === "descend") {
        const kids: Node[] = [];
        if (el.shadowRoot) el.shadowRoot.childNodes.forEach((c) => kids.push(c)); // open shadow roots
        el.childNodes.forEach((c) => kids.push(c));
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      }
    } else if (n.nodeType === 3) {
      handleText(n as Text, ctx);
    }
  }

  return {
    page: { ...sanitizeUrl(location.href), title: redactText(document.title).text.slice(0, 120) },
    viewport: { w: ctx.vw, h: ctx.vh, dpr: window.devicePixelRatio || 1 },
    nodes: ctx.nodes,
    maskRects: ctx.masks,
    stats: {
      nodes: ctx.nodes.length,
      redactedSpans: ctx.spans,
      maskedRegions: ctx.masks.length,
      byType: ctx.byType,
      nodesTruncated: ctx.truncated,
      complete: ctx.complete,
    },
  };
}