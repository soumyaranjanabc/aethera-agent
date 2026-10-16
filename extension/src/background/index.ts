import type { ActionResult, Msg } from "../shared/types";

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error("[AETHERA] sidePanel behavior error", e));
});

async function routeToActiveTab(payload: Msg): Promise<ActionResult> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false, detail: "No active tab found" };

  const url = tab.url ?? "";
  if (/^(chrome|chrome-extension|edge|about):/.test(url) || url.includes("chromewebstore.google.com")) {
    return { ok: false, detail: `Cannot automate restricted page: ${url}` };
  }

  try {
    return (await chrome.tabs.sendMessage(tab.id, payload)) as ActionResult;
  } catch {
    return {
      ok: false,
      detail: "Content script not reachable. Refresh the target tab and try again.",
    };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg.type === "RUN_ACTION") {
    routeToActiveTab({ type: "EXECUTE_ACTION", action: msg.action }).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (msg.type === "PING_ACTIVE_TAB") {
    routeToActiveTab({ type: "PING" }).then(sendResponse);
    return true;
  }
});