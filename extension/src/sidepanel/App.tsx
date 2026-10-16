import { useState } from "react";
import type { CSSProperties } from "react";
import type { Action, ActionResult } from "../shared/types";

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

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: "0 0 12px" }}>🛰️ Aethera AI · Action Console</h3>

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