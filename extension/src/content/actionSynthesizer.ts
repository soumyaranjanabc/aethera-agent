import type { Action, ActionResult } from "../shared/types";
import { resolveTarget } from "./targetResolver";
/**
 * Resolves the element at a viewport point, descending into open shadow roots.
 * (document.elementFromPoint stops at the shadow host.)
 */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let el: Element | null = document.elementFromPoint(x, y);
  while (el && el.shadowRoot && typeof el.shadowRoot.elementFromPoint === "function") {
    const inner = el.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === el) break;
    el = inner;
  }
  return el;
}

function deepActiveElement(): Element | null {
  let el: Element | null = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  return el;
}

function fireMouse(el: Element, type: string, x: number, y: number) {
  el.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      button: 0,
    })
  );
}

function doClick(x: number, y: number): ActionResult {
  const el = deepElementFromPoint(x, y);
  if (!el) return { ok: false, detail: `No element at (${x}, ${y})` };

  fireMouse(el, "mouseover", x, y);
  fireMouse(el, "mousedown", x, y);
  if (el instanceof HTMLElement) el.focus();
  fireMouse(el, "mouseup", x, y);

  // el.click() fires a 'click' event AND triggers native default behaviour
  // (checkbox toggle, link navigation, form submit button).
  if (el instanceof HTMLElement) el.click();
  else fireMouse(el, "click", x, y);

  return { ok: true, detail: `Clicked <${el.tagName.toLowerCase()}> at (${x}, ${y})` };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // React/Vue-controlled inputs ignore plain `el.value = x`; use the native setter.
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function doType(text: string, x?: number, y?: number): ActionResult {
  const el: Element | null =
    typeof x === "number" && typeof y === "number" ? deepElementFromPoint(x, y) : deepActiveElement();

  if (!el || el === document.body) return { ok: false, detail: "No focusable target to type into" };
  if (el instanceof HTMLElement) el.focus();

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, el.value + text);
    el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    el.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    return { ok: true, detail: `Typed ${text.length} chars into <${el.tagName.toLowerCase()}>` };
  }

  if (el instanceof HTMLElement && el.isContentEditable) {
    const done = typeof document.execCommand === "function" && document.execCommand("insertText", false, text);
    if (!done) {
      el.textContent = (el.textContent ?? "") + text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return { ok: true, detail: `Typed ${text.length} chars into contenteditable` };
  }

  return { ok: false, detail: `<${el.tagName.toLowerCase()}> is not a text-editable element` };
}

function doScroll(dy: number, dx = 0): ActionResult {
  window.scrollBy({ top: dy, left: dx });
  return { ok: true, detail: `Scrolled by (dx=${dx}, dy=${dy})` };
}

function doPress(key: string): ActionResult {
  const el = deepActiveElement() ?? document.body;
  const init = { key, bubbles: true, cancelable: true, composed: true };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));

  if (key === "Enter" && el instanceof HTMLElement) {
    const form = el.closest("form");
    if (form && typeof form.requestSubmit === "function") form.requestSubmit();
  }
  return { ok: true, detail: `Pressed key "${key}"` };
}
function doTypeInto(target: string, text: string, clear = false): ActionResult {
  const hit = resolveTarget(target, "input");
  if (!hit) return { ok: false, detail: `No visible input matching "${target}"` };
  if (clear) {
    const el = deepElementFromPoint(hit.x, hit.y);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      setNativeValue(el, "");
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }
  const res = doType(text, hit.x, hit.y);
  return { ok: res.ok, detail: `Found "${hit.label}" at (${hit.x}, ${hit.y}). ${res.detail}` };
}

function doClickTarget(target: string): ActionResult {
  const hit = resolveTarget(target, "clickable");
  if (!hit) return { ok: false, detail: `No visible button/link matching "${target}"` };
  const res = doClick(hit.x, hit.y);
  return { ok: res.ok, detail: `Found "${hit.label}" at (${hit.x}, ${hit.y}). ${res.detail}` };
}

export function executeAction(action: Action): ActionResult {
  try {
    switch (action.type) {
      case "CLICK":
        return doClick(action.x, action.y);
      case "TYPE":
        return doType(action.text, action.x, action.y);
      case "SCROLL":
        return doScroll(action.dy, action.dx);
      case "PRESS":
        return doPress(action.key);
      case "TYPE_INTO":
        return doTypeInto(action.target, action.text, action.clear);
      case "CLICK_TARGET":
        return doClickTarget(action.target);
      default:
        return { ok: false, detail: `Unknown action: ${JSON.stringify(action)}` };
    }
  } catch (err) {
    return { ok: false, detail: `Exception: ${(err as Error).message}` };
  }
}