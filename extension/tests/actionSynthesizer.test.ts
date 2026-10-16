import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeAction } from "../src/content/actionSynthesizer";

function mockPoint(el: Element | null) {
  (document as any).elementFromPoint = vi.fn(() => el);
}

describe("executeAction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("CLICK fires exactly one click event on the target", () => {
    document.body.innerHTML = `<button id="b">Go</button>`;
    const btn = document.getElementById("b")!;
    mockPoint(btn);
    const onClick = vi.fn();
    btn.addEventListener("click", onClick);

    const res = executeAction({ type: "CLICK", x: 10, y: 10 });

    expect(res.ok).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("CLICK returns ok:false when nothing is at the point", () => {
    mockPoint(null);
    const res = executeAction({ type: "CLICK", x: 1, y: 1 });
    expect(res.ok).toBe(false);
    expect(res.detail).toContain("No element");
  });

  it("TYPE sets value and fires input event on <input>", () => {
    document.body.innerHTML = `<input id="i" />`;
    const inp = document.getElementById("i") as HTMLInputElement;
    mockPoint(inp);
    const onInput = vi.fn();
    inp.addEventListener("input", onInput);

    const res = executeAction({ type: "TYPE", text: "ISRO", x: 5, y: 5 });

    expect(res.ok).toBe(true);
    expect(inp.value).toBe("ISRO");
    expect(onInput).toHaveBeenCalled();
  });

  it("TYPE appends to existing text", () => {
    document.body.innerHTML = `<textarea id="t">abc</textarea>`;
    const ta = document.getElementById("t") as HTMLTextAreaElement;
    mockPoint(ta);
    executeAction({ type: "TYPE", text: "def", x: 5, y: 5 });
    expect(ta.value).toBe("abcdef");
  });

  it("TYPE fails on non-editable element", () => {
    document.body.innerHTML = `<div id="d">text</div>`;
    mockPoint(document.getElementById("d"));
    const res = executeAction({ type: "TYPE", text: "x", x: 5, y: 5 });
    expect(res.ok).toBe(false);
  });

  it("SCROLL calls window.scrollBy with the right delta", () => {
    window.scrollBy = vi.fn() as any;
    const res = executeAction({ type: "SCROLL", dy: 300 });
    expect(res.ok).toBe(true);
    expect(window.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ top: 300 }));
  });

  it("PRESS dispatches keydown and keyup", () => {
    const down = vi.fn();
    const up = vi.fn();
    document.body.addEventListener("keydown", down);
    document.body.addEventListener("keyup", up);

    const res = executeAction({ type: "PRESS", key: "Escape" });

    expect(res.ok).toBe(true);
    expect(down).toHaveBeenCalledTimes(1);
    expect(up).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false for an unknown action type", () => {
    const res = executeAction({ type: "NOPE" } as any);
    expect(res.ok).toBe(false);
  });
});