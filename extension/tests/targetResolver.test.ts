import { describe, it, expect } from "vitest";
import { findTarget, scoreLabel } from "../src/content/targetResolver";
import type { LayoutNode } from "../src/shared/types";

const node = (o: Partial<LayoutNode>): LayoutNode => ({
  id: 1, tag: "input", role: "textbox", inputType: "text", text: "",
  rect: { x: 100, y: 200, w: 200, h: 40 },
  interactive: true, sensitive: false, redactions: 0, ...o,
});

describe("scoreLabel", () => {
  it("ranks exact > prefix > contains > nothing", () => {
    expect(scoreLabel("Search telemetry", "search telemetry")).toBe(100);
    expect(scoreLabel("Search telemetry", "search")).toBe(85);
    expect(scoreLabel("Export telemetry log", "telemetry")).toBe(70);
    expect(scoreLabel("Sign out", "operators")).toBe(0);
  });
});

describe("findTarget", () => {
  const nodes = [
    node({ id: 1, text: "Search telemetry" }),
    node({ id: 2, tag: "button", role: "button", inputType: undefined, text: "Export telemetry log", rect: { x: 400, y: 200, w: 100, h: 40 } }),
    node({ id: 3, text: "Password", inputType: "password" }),
  ];

  it("finds the input, not the button, when an input is wanted", () => {
    expect(findTarget(nodes, "telemetry", "input")?.node.id).toBe(1);
  });
  it("finds the button when a clickable is wanted", () => {
    expect(findTarget(nodes, "export", "clickable")?.node.id).toBe(2);
  });
  it("never auto-targets password fields", () => {
    expect(findTarget(nodes, "password", "input")).toBeNull();
  });
  it("returns null when nothing matches", () => {
    expect(findTarget(nodes, "zzzz", "input")).toBeNull();
  });
});