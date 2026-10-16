/** Coordinates are viewport CSS pixels (same as MouseEvent.clientX/Y). */
export type ClickAction = { type: "CLICK"; x: number; y: number };

export type TypeAction = {
  type: "TYPE";
  text: string;
  /** Optional target point. If omitted, the currently focused element is used. */
  x?: number;
  y?: number;
};

export type ScrollAction = { type: "SCROLL"; dy: number; dx?: number };

export type PressAction = { type: "PRESS"; key: string };

export type Action = ClickAction | TypeAction | ScrollAction | PressAction;

export type ActionResult = { ok: boolean; detail: string };

/** Messages: side panel -> background */
export type RunActionMsg = { type: "RUN_ACTION"; action: Action };
export type PingMsg = { type: "PING_ACTIVE_TAB" };

/** Messages: background -> content script */
export type ExecuteActionMsg = { type: "EXECUTE_ACTION"; action: Action };
export type ContentPingMsg = { type: "PING" };

export type Msg = RunActionMsg | PingMsg | ExecuteActionMsg | ContentPingMsg;