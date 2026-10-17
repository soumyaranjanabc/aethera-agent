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

/** Find an input by its label/placeholder, then type into it. */
export type TypeIntoAction = { type: "TYPE_INTO"; target: string; text: string; clear?: boolean };

/** Find a button/link/tab by its visible label, then click it. */
export type ClickTargetAction = { type: "CLICK_TARGET"; target: string };

export type Action =
  | ClickAction
  | TypeAction
  | ScrollAction
  | PressAction
  | TypeIntoAction
  | ClickTargetAction;

export type ActionResult = { ok: boolean; detail: string };

/* ---------- Phase 2: privacy types ---------- */

export type PIIType =
  | "AADHAAR"
  | "PAN"
  | "EMAIL"
  | "PHONE"
  | "GEO"
  | "CREDENTIAL"
  | "CARD"
  | "IFSC"
  | "IP"
  | "NAME";

export type Rect = { x: number; y: number; w: number; h: number };

/** One UI element in the sanitized layout. Contains NO raw PII and NO input values. */
export type LayoutNode = {
  id: number;
  tag: string;
  role: string;
  inputType?: string;
  /** Redacted label/text (PII replaced by [TYPE] tokens). */
  text: string;
  /** Viewport CSS pixels. */
  rect: Rect;
  interactive: boolean;
  sensitive: boolean;
  redactions: number;
};

export type SanitizedSnapshot = {
  page: { origin: string; path: string; title: string };
  viewport: { w: number; h: number; dpr: number };
  nodes: LayoutNode[];
  /** Regions (viewport CSS px) that must be blacked out in any screenshot. */
  maskRects: Rect[];
  stats: {
    nodes: number;
    redactedSpans: number;
    maskedRegions: number;
    byType: Record<string, number>;
    nodesTruncated: boolean;
    /** false = the DOM scan hit its safety cap; callers MUST NOT trust masks (fail closed). */
    complete: boolean;
  };
};

export type PreviewResult = {
  ok: boolean;
  detail: string;
  /** Already-redacted PNG data URL. The raw screenshot is never returned. */
  imageDataUrl?: string;
  snapshot?: SanitizedSnapshot;
};

/** Messages: side panel -> background */
export type RunActionMsg = { type: "RUN_ACTION"; action: Action };
export type PingMsg = { type: "PING_ACTIVE_TAB" };
export type PreviewMsg = { type: "GET_SANITIZED_PREVIEW" };

/** Messages: background -> content script */
export type ExecuteActionMsg = { type: "EXECUTE_ACTION"; action: Action };
export type ContentPingMsg = { type: "PING" };
export type SnapshotMsg = { type: "SNAPSHOT" };

export type Msg =
  | RunActionMsg
  | PingMsg
  | PreviewMsg
  | ExecuteActionMsg
  | ContentPingMsg
  | SnapshotMsg;