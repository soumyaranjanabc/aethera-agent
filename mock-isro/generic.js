import { makeRng, makeData } from "./data.js";

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get("seed") ?? "1", 10) || 1;
const rng = makeRng(Math.imul(seed, 2654435761) >>> 0);
const data = makeData(makeRng(seed + 99));

const r = (n) => Math.floor(rng() * n);
const P = (a) => a[r(a.length)];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = r(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- random style ---------- */
const dark = rng() < 0.5, hue = r(360);
const FONTS = ["system-ui, sans-serif", "Georgia, serif", "ui-monospace, monospace", "Helvetica, Arial, sans-serif"];
const css = `
:root{--bg:${dark ? "hsl(220 25% 10%)" : "hsl(210 30% 96%)"};--panel:${dark ? "hsl(220 25% 15%)" : "#fff"};
--text:${dark ? "#e6edf3" : "#14213d"};--muted:${dark ? "#8b949e" : "#5c6b86"};--border:${dark ? "#2f3b4d" : "#cfd8e6"};
--accent:hsl(${hue} 70% 50%);--r:${P([0, 4, 8, 14])}px;--pad:${P([6, 10, 16])}px}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:${P([12, 14, 16])}px/1.4 ${P(FONTS)}}
header{display:flex;align-items:center;gap:14px;padding:var(--pad) 18px;background:var(--panel);border-bottom:1px solid var(--border)}
.brand{font-weight:700;color:var(--accent)} .muted{color:var(--muted)}
nav.top{display:flex;gap:8px;margin-left:12px} nav.side{display:flex;flex-direction:column;gap:8px;padding:16px;min-width:160px;border-right:1px solid var(--border)}
.shell{display:flex}.shell.top{display:block} main{flex:1;padding:18px;display:grid;gap:14px;grid-template-columns:repeat(${P([1, 2, 2])},minmax(0,1fr));align-content:start}
.blk{background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:var(--pad)}
.blk.wide{grid-column:1/-1} h3{margin:0 0 8px} .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap} .grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
label{display:grid;gap:4px;margin-bottom:8px;color:var(--muted)} label.chk{display:flex;gap:8px;align-items:center}
button,input[type=text],input[type=password],select{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--border);border-radius:var(--r);padding:6px 10px}
button.primary,button.on{background:var(--accent);color:#fff;border-color:transparent} a{color:var(--accent)}
table{width:100%;border-collapse:collapse} th,td{text-align:left;padding:6px 10px;border-bottom:1px solid var(--border);white-space:nowrap} th{color:var(--muted)}
canvas{width:100%;height:auto;border-radius:var(--r);display:block}`;
document.head.appendChild(Object.assign(document.createElement("style"), { textContent: css }));

/* ---------- blocks ---------- */
function form() {
  const op = P(data.operators);
  const fields = shuffle([["Username", op.name, "NAME"], ["Email", op.email, "EMAIL"], ["Phone", op.phone, "PHONE"]]).slice(0, 2 + r(2));
  const rows = fields.map(([l, v, t]) => {
    const pre = rng() < 0.4;
    return `<label>${l}<input data-ui="input" type="text" placeholder="${l}"${pre ? ` value="${esc(v)}" data-pii="${t}"` : ""}></label>`;
  }).join("");
  const pw = rng() < 0.6 ? `<label>Password<input data-ui="input" type="password" placeholder="Password"></label>` : "";
  const sel = rng() < 0.5 ? `<label>Region<select data-ui="select">${["North", "South", "East", "West"].map((o) => `<option>${o}</option>`).join("")}</select></label>` : "";
  const chk = rng() < 0.6 ? `<label class="chk"><input data-ui="checkbox" type="checkbox"> ${P(["Remember me", "Send alerts", "I agree"])}</label>` : "";
  return `<section class="blk" data-ui="card"><h3>${P(["Sign in", "Contact details", "Request access", "Profile"])}</h3>${rows}${pw}${sel}${chk}
    <div class="row"><button data-ui="button" class="primary">${P(["Submit", "Continue", "Save", "Sign in"])}</button>
    <a data-ui="link" href="#">${P(["Forgot password?", "Need help?", "Cancel"])}</a></div></section>`;
}

function table() {
  const pool = [["Name", "name", "NAME"], ["Email", "email", "EMAIL"], ["Phone", "phone", "PHONE"], ["Role", "role", ""], ["Station", "station", ""], ["ID", "aadhaar", "AADHAAR"]];
  const cols = shuffle(pool).slice(0, 3 + r(3));
  if (!cols.includes(pool[0])) cols[0] = pool[0];
  const rows = data.operators.slice(0, 4 + r(5));
  return `<section class="blk wide"><table data-ui="table"><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((o) => `<tr>${cols.map((c) => `<td${c[2] ? ` data-pii="${c[2]}"` : ""}>${esc(o[c[1]])}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
}

function cards() {
  const sats = [...data.satellites, ...data.satellites].slice(0, 2 + r(3));
  return `<div class="grid blk wide">${sats.map((s) => `<article class="blk" data-ui="card"><h3>${s.name}</h3>
    <p>Battery ${s.battery}% \u00b7 ${s.altitude} km</p>
    ${rng() < 0.5 ? `<p>Position <b data-pii="GEO">${s.lat}\u00b0N ${s.lon}\u00b0E</b></p>` : ""}
    <button data-ui="button">${P(["Details", "Open", "Track"])}</button></article>`).join("")}</div>`;
}

function toolbar() {
  const btns = Array.from({ length: 1 + r(3) }, () => `<button data-ui="button"${rng() < 0.3 ? ' class="primary"' : ""}>${P(["Export", "Refresh", "Filter", "Add", "Reset"])}</button>`).join("");
  return `<div class="blk wide row"><input data-ui="input" type="text" placeholder="${P(["Search", "Filter logs", "Find operator"])}">
    <select data-ui="select"><option>All</option><option>Active</option><option>Archived</option></select>${btns}</div>`;
}

const chart = () => `<section class="blk"><h3>${P(["Throughput", "Usage", "Signal"])}</h3><canvas data-ui="canvas" width="520" height="220"></canvas></section>`;

function links() {
  return `<nav class="blk row">${shuffle(["Docs", "Support", "Status", "Privacy", "Terms", "Contact"]).slice(0, 3 + r(3)).map((l) => `<a data-ui="link" href="#">${l}</a>`).join("")}</nav>`;
}

function profile() {
  const d = data.dutyOfficer, e = data.operators[0].email;
  return `<section class="blk" data-ui="card"><h3>Duty contact</h3>
    <p>Name: <b data-pii="NAME">${esc(d.name)}</b></p><p>Phone: <b data-pii="PHONE">${esc(d.phone)}</b></p>
    <p>Email: <b data-pii="EMAIL">${esc(e)}</b></p></section>`;
}

/* ---------- compose page (every page is guaranteed some PII) ---------- */
const items = ["Overview", "Reports", "Settings", "Users", "Logs", "Help"].slice(0, 3 + r(3));
const side = rng() < 0.4, asTabs = rng() < 0.5, active = r(items.length);
const nav = items.map((t, i) => asTabs
  ? `<button data-ui="tab"${i === active ? ' class="on"' : ""}>${t}</button>`
  : `<a data-ui="link" href="#">${t}</a>`).join("");

const blocks = [P([table, profile]), ...shuffle([form, cards, toolbar, chart, links]).slice(0, 2 + r(3))];
const body = shuffle(blocks).map((b) => b()).join("");

document.getElementById("root").innerHTML = `
  <header><div class="brand">${P(["Orbit", "Nimbus", "Atlas", "Kepler", "Vega"])}</div>
    ${side ? "" : `<nav class="top">${nav}</nav>`}
    <span class="muted" style="margin-left:auto">${data.operators[1].role}</span>
    ${rng() < 0.6 ? `<button data-ui="button">Sign out</button>` : ""}</header>
  <div class="shell ${side ? "" : "top"}">${side ? `<nav class="side">${nav}</nav>` : ""}<main>${body}</main></div>`;

document.querySelectorAll("canvas").forEach((cv) => {
  const c = cv.getContext("2d"), w = cv.width, h = cv.height;
  c.fillStyle = dark ? "#0b1220" : "#eef3fb"; c.fillRect(0, 0, w, h);
  c.fillStyle = `hsl(${hue} 70% 50%)`;
  for (let i = 0; i < 8; i++) { const bh = 20 + rng() * (h - 60); c.fillRect(20 + i * 62, h - bh - 20, 40, bh); }
  c.fillStyle = dark ? "#e6edf3" : "#14213d"; c.font = "13px monospace";
  c.fillText("13.72N 80.23E", 16, 18);
});
document.body.dataset.ready = "1";

/* ---------- ground truth (same shape as the dashboard) ---------- */
window.__AETHERA_GROUND_TRUTH__ = function () {
  const ui = [], pii = [], vw = window.innerWidth, vh = window.innerHeight;
  document.querySelectorAll("[data-ui],[data-pii]").forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    const box = { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
    if (el.dataset.ui) ui.push({ cls: el.dataset.ui, ...box });
    if (el.dataset.pii) pii.push({ type: el.dataset.pii, ...box });
  });
  return { seed, view: "generic", viewport: { w: vw, h: vh, dpr: window.devicePixelRatio || 1 }, ui, pii };
};