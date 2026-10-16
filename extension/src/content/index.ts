import type { Msg } from "../shared/types";
import { executeAction } from "./actionSynthesizer";

// Guard against double-injection (e.g., extension reloaded while tab open)
const FLAG = "__aethera_content_loaded__";
if (!(window as any)[FLAG]) {
  (window as any)[FLAG] = true;

  chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
    if (msg.type === "PING") {
      sendResponse({ ok: true, detail: `Content script alive on ${location.href}` });
      return; // synchronous response
    }
    if (msg.type === "EXECUTE_ACTION") {
      sendResponse(executeAction(msg.action));
      return;
    }
  });

  console.log("[AETHERA] content script ready");
}