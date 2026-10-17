import { describe, it, expect, beforeEach } from "vitest";
import { collectSnapshot } from "../src/sanitizer/domSanitizer";
import { makeAadhaar } from "../src/sanitizer/checksums";

const RECT = { left: 10, top: 10, width: 120, height: 24, right: 130, bottom: 34, x: 10, y: 10 };

beforeEach(() => {
  document.body.innerHTML = "";
  document.title = "";
  (Element.prototype as any).getBoundingClientRect = () => RECT;
  (Range.prototype as any).getClientRects = () => [RECT];
  (Range.prototype as any).getBoundingClientRect = () => RECT;
});

const A = makeAadhaar("23456789012");
const A_SP = `${A.slice(0, 4)} ${A.slice(4, 8)} ${A.slice(8)}`;

interface Leak {
  name: string;
  build: () => void;
  secrets: string[];
  keep?: string[];
  mask?: boolean; // default true
}

const html = (s: string) => () => { document.body.innerHTML = s; };

const LEAKS: Leak[] = [
  {
    name: "email inside a link",
    build: html(`<p>Contact <a href="#">ravi.kumar@mock-isro.example</a></p>`),
    secrets: ["ravi.kumar@mock-isro.example"],
  },
  {
    name: "name under a Name column header",
    build: html(`<table><tr><th>Name</th><th>Role</th></tr><tr><td>Priya Menon</td><td>Flight Director</td></tr></table>`),
    secrets: ["Priya Menon"],
    keep: ["Flight Director"],
  },
  {
    name: "name under an 'Acknowledged by' header",
    build: html(`<table><tr><th>Message</th><th>Acknowledged by</th></tr><tr><td>Bus voltage low</td><td>Rakesh Iyer</td></tr></table>`),
    secrets: ["Rakesh Iyer"],
    keep: ["Bus voltage low"],
  },
  {
    name: "name whose label sits in a sibling text node",
    build: html(`<div>Operator: <b>Dr. Anil Sharma</b></div>`),
    secrets: ["Anil Sharma"],
  },
  {
    name: "credential nested in a styled child",
    build: html(`<div>Token: <b>password: Sup3rS3cret!</b></div>`),
    secrets: ["Sup3rS3cret"],
  },
  {
    name: "email typed into a text input",
    build: html(`<input type="text" value="s.nair@mock-isro.example">`),
    secrets: ["s.nair@mock-isro.example"],
  },
  {
    name: "Aadhaar inside a textarea",
    build: html(`<textarea>Aadhaar ${A_SP}</textarea>`),
    secrets: [A_SP, A],
  },
  {
    name: "phone number in an aria-label",
    build: html(`<button aria-label="Call 9876543210">Call</button>`),
    secrets: ["9876543210"],
    mask: false, // aria-label is not visible, so no pixel mask is expected
  },
  {
    name: "IP address in a table cell",
    build: html(`<table><tr><th>Parameter</th><th>Value</th></tr><tr><td>Ground link host</td><td>10.20.30.40</td></tr></table>`),
    secrets: ["10.20.30.40"],
    keep: ["Ground link host"],
  },
  {
    name: "label and name inside a shadow root",
    build: () => {
      const host = document.createElement("div");
      document.body.appendChild(host);
      host.attachShadow({ mode: "open" }).innerHTML = `<div>Duty officer: <b>Rakesh Iyer</b></div>`;
    },
    secrets: ["Rakesh Iyer"],
  },
];

describe("PII benchmark (DOM-shaped fixtures)", () => {
  for (const f of LEAKS) {
    it(`no leak: ${f.name}`, () => {
      f.build();
      const snap = collectSnapshot();
      const json = JSON.stringify(snap);
      for (const s of f.secrets) expect(json).not.toContain(s);
      for (const k of f.keep ?? []) expect(json).toContain(k);
      if (f.mask !== false) expect(snap.maskRects.length).toBeGreaterThanOrEqual(1);
    });
  }

  const CLEAN: Array<[string, string]> = [
    ["telemetry table", `<table><tr><th>Parameter</th><th>Value</th><th>Status</th></tr><tr><td>Bus voltage</td><td>28.53 V</td><td>NOMINAL</td></tr><tr><td>Downlink rate</td><td>12.40 Mbps</td><td>WARN</td></tr></table>`],
    ["mission clock and build", `<div>UTC 12:03:44</div><div>Build 2.4.1 \u00b7 Synthetic data only</div>`],
    ["satellite card values", `<dl><dt>Altitude</dt><dd>35786 km</dd><dt>Battery</dt><dd>87%</dd><dt>Temp</dt><dd>21.4 C</dd></dl>`],
    ["status sentence", `<p>Operators online: 4. Ground station handover pending on MOCKSAT-2.</p>`],
  ];
  for (const [name, markup] of CLEAN) {
    it(`no false positive: ${name}`, () => {
      document.body.innerHTML = markup;
      const snap = collectSnapshot();
      expect(snap.stats.redactedSpans).toBe(0);
      expect(snap.maskRects.length).toBe(0);
    });
  }

  // Known gap, tracked for Phase 10: PII split across several inline elements.
  it.todo("PII split across inline elements: Lat <b>13.7199</b>\u00b0N, Lon <b>80.2304</b>\u00b0E");
});