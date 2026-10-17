import { makeRng, makeData, pick, STATIONS } from "./data.js";

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get("seed") ?? "7", 10) || 7;
const train = params.get("mode") === "train";
const autologin = train || params.get("autologin") === "1";
const data = makeData(makeRng(seed));

/* ---------- layout variant (randomised only in train mode) ---------- */
function makeVariant() {
  const base = { theme: params.get("theme") || "dark", density: "comfortable", hue: 210,
    tabs: ["overview", "telemetry", "operators", "alerts"], shuffleCols: false };
  if (!train) return base;
  const r = makeRng(seed * 7919 + 13);
  const tabs = [...base.tabs];
  for (let i = tabs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [tabs[i], tabs[j]] = [tabs[j], tabs[i]]; }
  return { theme: pick(r, ["dark", "light", "slate"]), density: pick(r, ["compact", "comfortable"]),
    hue: Math.floor(r() * 360), tabs, shuffleCols: true };
}
const variant = makeVariant();
document.documentElement.dataset.theme = variant.theme;
document.documentElement.dataset.density = variant.density;
document.documentElement.style.setProperty("--accent-h", String(variant.hue));

/* ---------- helpers ---------- */
const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TAB_LABEL = { overview: "Overview", telemetry: "Telemetry", operators: "Operators", alerts: "Alerts" };

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2500);
}

function orderedCols(cols, key) {
  if (!variant.shuffleCols) return cols;
  const r = makeRng(seed * 31 + key.length * 7);
  const a = [...cols];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const bodyHTML = (cols, rows) =>
  rows.map((r) => `<tr>${cols.map((c) => `<td${c.pii ? ` data-pii="${c.pii}"` : ""}>${esc(r[c.k])}</td>`).join("")}</tr>`).join("");
const tableHTML = (id, cols, rows) => {
  const c = orderedCols(cols, id);
  return `<div class="tablewrap"><table data-ui="table" id="${id}"><thead><tr>${c.map((x) => `<th>${esc(x.l)}</th>`).join("")}</tr></thead><tbody>${bodyHTML(c, rows)}</tbody></table></div>`;
};

const TCOLS = [{ k: "time", l: "Time (UTC)" }, { k: "sat", l: "Satellite" }, { k: "sub", l: "Subsystem" },
  { k: "param", l: "Parameter" }, { k: "value", l: "Value" }, { k: "status", l: "Status" }];
const OCOLS = [{ k: "name", l: "Name", pii: "NAME" }, { k: "role", l: "Role" }, { k: "station", l: "Station" },
  { k: "email", l: "Email", pii: "EMAIL" }, { k: "phone", l: "Phone", pii: "PHONE" }, { k: "aadhaar", l: "ID (Aadhaar)", pii: "AADHAAR" }];
const ACOLS = [{ k: "time", l: "Time" }, { k: "sev", l: "Severity" }, { k: "message", l: "Message" },
  { k: "ack", l: "Acknowledged by", pii: "NAME" }];

/* ---------- state ---------- */
let view = autologin ? "dash" : "login";
let tab = params.get("tab") || variant.tabs[0];
const filter = { q: "", sub: "" };

/* ---------- shadow DOM widget ---------- */
if (!customElements.get("alert-panel")) {
  customElements.define("alert-panel", class extends HTMLElement {
    constructor() { super(); this.root = this.attachShadow({ mode: "open" }); this._alerts = []; this._duty = null; this._acked = false; }
    set alerts(v) { this._alerts = v; this.render(); }
    set duty(v) { this._duty = v; this.render(); }
    connectedCallback() { this.render(); }
    render() {
      const rows = this._alerts.map((a) =>
        `<div class="row"><span class="sev ${a.sev}">${esc(a.sev)}</span> <span>${esc(a.message)}</span></div>`).join("");
      const d = this._duty;
      this.root.innerHTML = `
        <style>
          .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px; color: var(--text); font: inherit; }
          h3 { margin: 0 0 8px; } .row { padding: 4px 0; border-bottom: 1px solid var(--border); }
          .sev { display: inline-block; min-width: 42px; font-size: 11px; font-weight: 700; }
          .CRIT { color: var(--crit); } .WARN { color: var(--warn); } .INFO { color: var(--muted); }
          .duty { margin: 10px 0; color: var(--muted); }
          button { font: inherit; color: #fff; background: var(--accent); border: 0; border-radius: 6px; padding: 7px 12px; cursor: pointer; }
        </style>
        <div class="panel" data-ui="card">
          <h3>Live alerts (shadow DOM)</h3>${rows}
          ${d ? `<div class="duty">Duty officer: <b data-pii="NAME">${esc(d.name)}</b></div>
                 <div class="duty">On-call phone: <b data-pii="PHONE">${esc(d.phone)}</b></div>` : ""}
          <button data-ui="button" id="ack">${this._acked ? "Acknowledged" : "Acknowledge all"}</button>
        </div>`;
      this.root.getElementById("ack").addEventListener("click", () => { this._acked = true; this.render(); toast("All alerts acknowledged"); });
    }
  });
}

/* ---------- views ---------- */
function loginHTML() {
  return `<main class="login"><section class="card" data-ui="card">
    <h1>MOCK Mission Control</h1>
    <p class="muted">Synthetic demo environment. All data is fake. Enter any username and password.</p>
    <label>Username <input data-ui="input" id="username" type="text" autocomplete="off" placeholder="Operator ID" /></label>
    <label>Password <input data-ui="input" id="password" type="password" autocomplete="off" placeholder="Password" /></label>
    <label>Ground station <select data-ui="select" id="station">${STATIONS.map((s) => `<option>${esc(s.label)} (${s.code})</option>`).join("")}</select></label>
    <label class="chk"><input data-ui="checkbox" type="checkbox" id="remember" /> Remember this station</label>
    <button data-ui="button" id="signin" class="primary">Sign in</button>
    <a data-ui="link" href="#" id="forgot">Forgot password?</a>
    <div id="err" class="err" role="alert"></div>
  </section></main>`;
}

function satCard(s) {
  return `<article class="card sat" data-ui="card"><h3>${esc(s.name)}</h3>
    <span class="badge ${s.status === "WARN" ? "warn" : ""}">${esc(s.status)}</span>
    <dl><dt>Altitude</dt><dd>${s.altitude} km</dd><dt>Battery</dt><dd>${s.battery}%</dd><dt>Temp</dt><dd>${s.temp} C</dd></dl>
    <p>Sub-satellite point: <b data-pii="GEO">${s.lat}\u00b0N ${s.lon}\u00b0E</b></p></article>`;
}

function panelHTML() {
  if (tab === "overview") {
    return `<section class="grid">
      <div class="cards">${data.satellites.map(satCard).join("")}</div>
      <div class="card" data-ui="card"><h3>Ground track</h3>
        <canvas id="track" data-ui="canvas" width="640" height="320"></canvas></div>
      <alert-panel></alert-panel></section>`;
  }
  if (tab === "telemetry") {
    const subs = [...new Set(data.telemetry.map((r) => r.sub))];
    return `<div class="toolbar">
      <input data-ui="input" id="search" type="text" placeholder="Search telemetry" />
      <select data-ui="select" id="sub"><option value="">All subsystems</option>${subs.map((s) => `<option value="${s}">${s}</option>`).join("")}</select>
      <button data-ui="button" id="export" class="primary">Export telemetry log</button></div>
      ${tableHTML("ttable", TCOLS, filteredTelemetry())}
      <p class="muted" id="count">${filteredTelemetry().length} rows</p>`;
  }
  if (tab === "operators") return `<h3>Operators</h3>${tableHTML("otable", OCOLS, data.operators)}`;
  return `<h3>Alert history</h3>${tableHTML("atable", ACOLS, data.alerts)}`;
}

function dashHTML() {
  return `<header class="top"><div class="brand">MOCK MISSION CONTROL</div>
    <div class="clock" id="clock">UTC --:--:--</div>
    <span class="user">User: ${esc(data.currentUser)}</span>
    <button data-ui="button" id="signout">Sign out</button></header>
    <nav class="tabs" role="tablist">${variant.tabs.map((t) =>
      `<button data-ui="tab" role="tab" data-tab="${t}" class="tab ${t === tab ? "active" : ""}">${TAB_LABEL[t]}</button>`).join("")}</nav>
    <main id="panel">${panelHTML()}</main>
    <footer>Build 2.4.1 \u00b7 Synthetic data only</footer>`;
}

/* ---------- telemetry ---------- */
function filteredTelemetry() {
  const q = filter.q.toLowerCase();
  return data.telemetry.filter((r) => (!filter.sub || r.sub === filter.sub) && (!q || Object.values(r).join(" ").toLowerCase().includes(q)));
}
function refreshTelemetry() {
  const rows = filteredTelemetry();
  document.querySelector("#ttable tbody").innerHTML = bodyHTML(orderedCols(TCOLS, "ttable"), rows);
  document.getElementById("count").textContent = `${rows.length} rows`;
}
function exportCsv() {
  const rows = filteredTelemetry();
  const csv = ["time,satellite,subsystem,parameter,value,status",
    ...rows.map((r) => [r.time, r.sat, r.sub, r.param, r.value, r.status].join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "telemetry_log.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`Exported ${rows.length} rows`);
}

/* ---------- canvas ground track (text is drawn as PIXELS, invisible to the DOM) ---------- */
const LON0 = 60, LON1 = 100, LAT0 = 5, LAT1 = 35;
const INDIA = [[68.2,23.7],[70.5,20.8],[72.8,19.0],[73.9,15.5],[76.3,9.9],[77.5,8.1],[80.2,10.3],[80.3,15.8],[86.9,21.5],[89.0,22.0],[92.0,25.0],[89.0,27.0],[80.0,30.5],[77.5,35.0],[74.0,34.5],[71.0,27.5]];
function drawTrack(canvas, t) {
  const ctx = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
  const X = (lon) => ((lon - LON0) / (LON1 - LON0)) * w, Y = (lat) => h - ((lat - LAT0) / (LAT1 - LAT0)) * h;
  ctx.fillStyle = "#06101f"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#16314f"; ctx.lineWidth = 1;
  for (let lon = 60; lon <= 100; lon += 10) { ctx.beginPath(); ctx.moveTo(X(lon), 0); ctx.lineTo(X(lon), h); ctx.stroke(); }
  for (let lat = 5; lat <= 35; lat += 10) { ctx.beginPath(); ctx.moveTo(0, Y(lat)); ctx.lineTo(w, Y(lat)); ctx.stroke(); }
  ctx.fillStyle = "#12304d"; ctx.beginPath();
  INDIA.forEach(([lo, la], i) => (i ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la))));
  ctx.closePath(); ctx.fill();
  ctx.font = "13px monospace";
  STATIONS.forEach((s) => {
    ctx.fillStyle = "#f0b429"; ctx.fillRect(X(s.lon) - 3, Y(s.lat) - 3, 6, 6);
    ctx.fillText(`${s.code} ${s.lat.toFixed(2)}N ${s.lon.toFixed(2)}E`, X(s.lon) + 8, Y(s.lat) + 4);
  });
  data.satellites.forEach((s, i) => {
    const pos = (k) => { const lon = 62 + ((k * 0.2 + i * 13) % 36); return [lon, 20 + 13 * Math.sin(((lon - 60) / 40) * Math.PI * 2 + i)]; };
    ctx.strokeStyle = "#3fb950"; ctx.beginPath();
    for (let k = t - 60; k <= t; k += 4) { const [lo, la] = pos(k); k === t - 60 ? ctx.moveTo(X(lo), Y(la)) : ctx.lineTo(X(lo), Y(la)); }
    ctx.stroke();
    const [lo, la] = pos(t);
    ctx.fillStyle = "#3fb950"; ctx.beginPath(); ctx.arc(X(lo), Y(la), 5, 0, 7); ctx.fill();
    ctx.fillText(`${s.name}  ${la.toFixed(2)}N ${lo.toFixed(2)}E`, X(lo) + 9, Y(la) - 6);
  });
}

/* ---------- bindings ---------- */
function bindLogin() {
  const go = () => {
    const u = document.getElementById("username").value.trim();
    const p = document.getElementById("password").value;
    if (!u || !p) { document.getElementById("err").textContent = "Enter username and password."; return; }
    view = "dash"; render();
  };
  document.getElementById("signin").addEventListener("click", go);
  ["username", "password"].forEach((id) => document.getElementById(id).addEventListener("keydown", (e) => e.key === "Enter" && go()));
  document.getElementById("forgot").addEventListener("click", (e) => { e.preventDefault(); toast("Contact your station administrator"); });
}

function bindDash() {
  document.getElementById("signout").addEventListener("click", () => { view = "login"; render(); });
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; render(); }));
  if (tab === "overview") {
    const ap = document.querySelector("alert-panel");
    ap.alerts = data.alerts.slice(0, 4);
    ap.duty = data.dutyOfficer;
    drawTrack(document.getElementById("track"), train ? seed * 10 : Date.now() / 1000);
  }
  if (tab === "telemetry") {
    const s = document.getElementById("search"), sel = document.getElementById("sub");
    s.value = filter.q; sel.value = filter.sub;
    s.addEventListener("input", (e) => { filter.q = e.target.value; refreshTelemetry(); });
    sel.addEventListener("change", (e) => { filter.sub = e.target.value; refreshTelemetry(); });
    document.getElementById("export").addEventListener("click", exportCsv);
  }
}

function render() {
  app.innerHTML = view === "login" ? loginHTML() : dashHTML();
  view === "login" ? bindLogin() : bindDash();
}
render();

if (!train) {
  setInterval(() => {
    const c = document.getElementById("clock");
    if (c) c.textContent = "UTC " + new Date().toISOString().slice(11, 19);
    const cv = document.getElementById("track");
    if (cv) drawTrack(cv, Date.now() / 1000);
  }, 1000);
}

/* ---------- ground truth for Phase 4 (auto-labelling) ---------- */
window.__AETHERA_GROUND_TRUTH__ = function () {
  const ui = [], pii = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  const walk = (root) => {
    root.querySelectorAll("[data-ui],[data-pii]").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const box = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
        inView: r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh };
      if (el.dataset.ui) ui.push({ cls: el.dataset.ui, ...box });
      if (el.dataset.pii) pii.push({ type: el.dataset.pii, ...box });
    });
    root.querySelectorAll("*").forEach((el) => el.shadowRoot && walk(el.shadowRoot));
  };
  walk(document);
  return { seed, variant, view, tab, viewport: { w: vw, h: vh, dpr: window.devicePixelRatio || 1 }, ui, pii };
};