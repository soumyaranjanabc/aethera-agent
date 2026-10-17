import { describe, it, expect } from "vitest";
import { planCommand } from "../src/sidepanel/localPlanner";

const acts = (s: string) => {
  const p = planCommand(s);
  if (!p.ok) throw new Error(p.error);
  return p.actions;
};

describe("planCommand", () => {
  it("search for X", () => {
    expect(acts("search for bus")).toEqual([{ type: "TYPE_INTO", target: "search", text: "bus", clear: true }]);
  });
  it("search X in Y", () => {
    expect(acts("search bus in telemetry")).toEqual([{ type: "TYPE_INTO", target: "telemetry", text: "bus", clear: true }]);
  });
  it("type X in Y", () => {
    expect(acts("type admin in username")).toEqual([{ type: "TYPE_INTO", target: "username", text: "admin" }]);
  });
  it("open a tab", () => {
    expect(acts("open operators tab")).toEqual([{ type: "CLICK_TARGET", target: "operators" }]);
  });
  it("export keeps its verb in the target", () => {
    expect(acts("export telemetry log")).toEqual([{ type: "CLICK_TARGET", target: "export telemetry log" }]);
  });
  it("scroll and press enter", () => {
    expect(acts("scroll down")).toEqual([{ type: "SCROLL", dy: 500 }]);
    expect(acts("press enter")).toEqual([{ type: "PRESS", key: "Enter" }]);
  });
  it("chains steps with then", () => {
    expect(acts("open telemetry then search bus")).toHaveLength(2);
  });
  it("rejects gibberish", () => {
    expect(planCommand("asdf qwer").ok).toBe(false);
  });
});