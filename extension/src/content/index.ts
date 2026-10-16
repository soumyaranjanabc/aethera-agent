import type { Msg } from "../shared/types";
import { executeAction } from "./actionSynthesizer";
import { collectSnapshot } from "../sanitizer/domSanitizer";

// Guard against double-injection (e.g., extension reloaded while tab open)
const FLAG = "__aethera_content_loaded__";
if (!(window as any)[FLAG]) {
  (window as any)[FLAG] = true;

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    if (msg.type === "PING") {
      sendResponse({ ok: true, detail: `Content script alive on ${location.href}` });
      return;
    }
    if (msg.type === "EXECUTE_ACTION") {
      sendResponse(executeAction(msg.action));
      return;
    }
    if (msg.type === "SNAPSHOT") {
      try {
        sendResponse({ ok: true, snapshot: collectSnapshot() });
      } catch (err) {
        sendResponse({ ok: false, detail: `Snapshot failed: ${(err as Error).message}` });
      }
      return;
    }
  });

  console.log("[AETHERA] content script ready");
}