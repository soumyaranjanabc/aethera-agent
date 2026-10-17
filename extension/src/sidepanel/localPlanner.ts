import type { Action } from "../shared/types";

export type Plan = { ok: true; actions: Action[] } | { ok: false; error: string };

const clean = (s: string) =>
  s
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/^the\s+/i, "")
    .replace(/\s+(?:button|tab|link|page|field|box)$/i, "")
    .trim();

function planOne(raw: string): Action[] | null {
  const c = raw.trim().replace(/[.!]+$/, "");
  let m: RegExpMatchArray | null;

  if (/^(?:press|hit)\s+enter$/i.test(c)) return [{ type: "PRESS", key: "Enter" }];

  if ((m = c.match(/^scroll\s+(down|up)(?:\s+(\d+))?$/i))) {
    const px = m[2] ? parseInt(m[2], 10) : 500;
    return [{ type: "SCROLL", dy: m[1].toLowerCase() === "down" ? px : -px }];
  }

  if ((m = c.match(/^(?:type|enter|write)\s+(.+?)\s+(?:in|into|on)\s+(.+)$/i))) {
    return [{ type: "TYPE_INTO", target: clean(m[2]), text: clean(m[1]) }];
  }

  if ((m = c.match(/^(?:search|find)(?:\s+for)?\s+(.+?)(?:\s+(?:in|on)\s+(.+))?$/i))) {
    return [{ type: "TYPE_INTO", target: m[2] ? clean(m[2]) : "search", text: clean(m[1]), clear: true }];
  }

  if ((m = c.match(/^(click|tap|open|go to|select|press|export|download)\s+(?:on\s+)?(.+)$/i))) {
    const verb = m[1].toLowerCase();
    const rest = clean(m[2]);
    const target = verb === "export" || verb === "download" ? `${verb} ${rest}` : rest;
    return [{ type: "CLICK_TARGET", target }];
  }

  return null;
}

/** Stand-in for the cloud planner (Phase 8). The LLM will emit the same Action JSON. */
export function planCommand(text: string): Plan {
  const parts = text.split(/\s*(?:;|\band then\b|\bthen\b)\s*/i).filter((p) => p.trim());
  if (parts.length === 0) return { ok: false, error: "Type a command first." };
  const actions: Action[] = [];
  for (const p of parts) {
    const a = planOne(p);
    if (!a) return { ok: false, error: `I don't understand: "${p.trim()}"` };
    actions.push(...a);
  }
  return { ok: true, actions };
}