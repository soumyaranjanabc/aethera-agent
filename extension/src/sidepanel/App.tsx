import { useState } from "react";
import type { CSSProperties } from "react";
import type { Action, ActionResult, PreviewResult } from "../shared/types";

const SAMPLE: Action = { type: "CLICK", x: 200, y: 200 };

const box: CSSProperties = {
  background: "#0f1b2d", border: "1px solid #1f6feb55", borderRadius: 8, padding: 10, marginBottom: 12,
};
const btn: CSSProperties = {
  background: "#1f6feb", color: "#fff", border: 0, borderRadius: 6, padding: "6px 12px", cursor: "pointer", marginRight: 6,
};

export function App() {
  const [json, setJson] = useState(JSON.stringify(SAMPLE, null, 2));
  const [log, setLog] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);

  const push = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 50));

  const ping = async () => {
    const res: ActionResult = await chrome.runtime.sendMessage({ type: "PING_ACTIVE_TAB" });
    push(`PING -> ${res.ok ? "OK" : "FAIL"} ${res.detail}`);
  };

  const run = async () => {
    let action: Action;
    try {
      action = JSON.parse(json);
    } catch {
      push("FAIL Invalid JSON");
      return;
    }
    const res: ActionResult = await chrome.runtime.sendMessage({ type: "RUN_ACTION", action });
    push(`${action.type} -> ${res.ok ? "OK" : "FAIL"} ${res.detail}`);
  };

  const runPreview = async () => {
    setBusy(true);
    try {
      const res: PreviewResult = await chrome.runtime.sendMessage({ type: "GET_SANITIZED_PREVIEW" });
      setPreview(res);
      push(`PREVIEW -> ${res.ok ? "OK" : "FAIL"} ${res.detail}`);
    } finally {
      setBusy(false);
    }
  };

  const snap = preview?.snapshot;

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: "0 0 12px" }}>🛰️ Aethera AI · Console</h3>

      {/* ---------- Phase 2: sanitized preview ---------- */}
      <div style={box}>
        <div style={{ marginBottom: 6 }}>Privacy: Sanitized Preview</div>
        <button style={btn} onClick={runPreview} disabled={busy}>
          {busy ? "Working..." : "Preview sanitized view"}
        </button>

        {preview && !preview.ok && <div style={{ color: "#ff7b72", marginTop: 8 }}>{preview.detail}</div>}

        {preview?.ok && preview.imageDataUrl && snap && (
          <div style={{ marginTop: 10 }}>
            <img src={preview.imageDataUrl} alt="redacted view" style={{ width: "100%", border: "1px solid #234", borderRadius: 4 }} />
            <div style={{ fontSize: 12, marginTop: 6 }}>
              nodes: {snap.stats.nodes} · PII spans: {snap.stats.redactedSpans} · masked regions: {snap.stats.maskedRegions}
            </div>
            <div style={{ fontSize: 12 }}>by type: {JSON.stringify(snap.stats.byType)}</div>
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer" }}>Sanitized layout JSON (first 15 nodes)</summary>
              <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto" }}>
                {JSON.stringify(snap.nodes.slice(0, 15), null, 1)}
              </pre>
            </details>
          </div>
        )}
      </div>

      {/* ---------- Phase 1: action console ---------- */}
      <div style={box}>
        <button style={btn} onClick={ping}>Ping active tab</button>
      </div>

      <div style={box}>
        <div style={{ marginBottom: 6 }}>Action JSON</div>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={7}
          style={{ width: "100%", boxSizing: "border-box", background: "#07101c", color: "#9ef", border: "1px solid #234", fontFamily: "monospace" }}
        />
        <div style={{ marginTop: 8 }}>
          <button style={btn} onClick={run}>Execute</button>
          <button style={{ ...btn, background: "#30363d" }} onClick={() => setJson(JSON.stringify({ type: "TYPE", text: "hello", x: 200, y: 260 }, null, 2))}>TYPE sample</button>
          <button style={{ ...btn, background: "#30363d" }} onClick={() => setJson(JSON.stringify({ type: "SCROLL", dy: 400 }, null, 2))}>SCROLL sample</button>
        </div>
      </div>

      <div style={box}>
        <div style={{ marginBottom: 6 }}>Log</div>
        <pre style={{ margin: 0, fontSize: 12, whiteSpace: "pre-wrap" }}>{log.join("\n") || "-"}</pre>
      </div>
    </div>
  );
}