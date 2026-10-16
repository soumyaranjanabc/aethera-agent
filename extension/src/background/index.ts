import type { ActionResult, Msg, PreviewResult, SanitizedSnapshot } from "../shared/types";
import { blobToDataUrl, redactImageBlob } from "../sanitizer/canvasMasker";

// Clicking the toolbar icon opens the side panel.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error("[AETHERA] sidePanel behavior error", e));
});

type TabResult = { tab: chrome.tabs.Tab & { id: number } } | { error: string };

async function getAutomatableTab(): Promise<TabResult> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { error: "No active tab found" };
  const url = tab.url ?? "";
  if (/^(chrome|chrome-extension|edge|about):/.test(url) || url.includes("chromewebstore.google.com")) {
    return { error: `Cannot automate restricted page: ${url}` };
  }
  return { tab: tab as chrome.tabs.Tab & { id: number } };
}

async function routeToActiveTab(payload: Msg): Promise<ActionResult> {
  const res = await getAutomatableTab();
  if ("error" in res) return { ok: false, detail: res.error };
  try {
    return (await chrome.tabs.sendMessage(res.tab.id, payload)) as ActionResult;
  } catch {
    return { ok: false, detail: "Content script not reachable. Refresh the target tab and try again." };
  }
}

/**
 * Privacy pipeline: snapshot DOM -> capture screenshot -> black out masks (offscreen, locally)
 * -> return ONLY the redacted image. Any failure returns ok:false and NO image (fail closed).
 */
async function getSanitizedPreview(): Promise<PreviewResult> {
  const res = await getAutomatableTab();
  if ("error" in res) return { ok: false, detail: res.error };

  let snapshot: SanitizedSnapshot;
  try {
    const r = await chrome.tabs.sendMessage(res.tab.id, { type: "SNAPSHOT" });
    if (!r?.ok) return { ok: false, detail: r?.detail ?? "Snapshot failed" };
    snapshot = r.snapshot as SanitizedSnapshot;
  } catch {
    return { ok: false, detail: "Content script not reachable. Refresh the target tab and try again." };
  }

  if (!snapshot.stats.complete) {
    return { ok: false, detail: "Page too complex to scan completely. Refusing to produce a preview (fail closed)." };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(res.tab.windowId, { format: "png" });
    const raw = await (await fetch(dataUrl)).blob();
    const redacted = await redactImageBlob(raw, snapshot.maskRects, snapshot.viewport);
    return {
      ok: true,
      detail: `Masked ${snapshot.stats.maskedRegions} region(s), ${snapshot.stats.redactedSpans} PII span(s)`,
      imageDataUrl: await blobToDataUrl(redacted),
      snapshot,
    };
  } catch (err) {
    return { ok: false, detail: `Redaction failed, no image released: ${(err as Error).message}` };
  }
}

chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (msg.type === "RUN_ACTION") {
    routeToActiveTab({ type: "EXECUTE_ACTION", action: msg.action }).then(sendResponse);
    return true;
  }
  if (msg.type === "PING_ACTIVE_TAB") {
    routeToActiveTab({ type: "PING" }).then(sendResponse);
    return true;
  }
  if (msg.type === "GET_SANITIZED_PREVIEW") {
    getSanitizedPreview().then(sendResponse);
    return true;
  }
});