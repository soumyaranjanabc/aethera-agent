/* Deterministic synthetic data. NOTHING here is real. */

export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pad = (n) => String(n).padStart(2, "0");

/* ---- Verhoeff (so generated Aadhaar-format numbers are checksum-valid) ---- */
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
const INV = [0,4,3,2,1,5,6,7,8,9];
function verhoeffCheck(payload) {
  let c = 0;
  [...payload].reverse().forEach((d, i) => { c = D[c][P[(i + 1) % 8][+d]]; });
  return INV[c];
}
function fakeAadhaar(rng) {
  let p = String(int(rng, 2, 9));
  for (let i = 0; i < 10; i++) p += int(rng, 0, 9);
  const a = p + verhoeffCheck(p);
  return `${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)}`;
}

const FIRST = ["Anil","Priya","Rakesh","Meera","Suresh","Kavita","Arjun","Divya","Vikram","Nandini","Rohan","Lakshmi"];
const LAST  = ["Sharma","Menon","Iyer","Nair","Reddy","Patel","Das","Kulkarni","Singh","Pillai","Bose","Rao"];
const ROLES = ["Flight Director","Mission Operator","Telemetry Engineer","Ground Station Lead","Orbit Analyst","Payload Scientist"];

export const STATIONS = [
  { code: "SHAR", label: "Sriharikota", lat: 13.7199, lon: 80.2304 },
  { code: "BLR",  label: "Bengaluru",   lat: 12.9716, lon: 77.5946 },
  { code: "PBL",  label: "Port Blair",  lat: 11.6234, lon: 92.7265 },
  { code: "LKO",  label: "Lucknow",     lat: 26.8467, lon: 80.9462 },
];

const SUBS = {
  EPS:     [["Bus voltage", "V", 26, 30], ["Battery temp", "C", 15, 30], ["Solar current", "A", 2, 8]],
  ADCS:    [["Wheel speed", "rpm", 1000, 4000], ["Pointing error", "deg", 0.01, 0.2]],
  TCS:     [["Panel temp", "C", -10, 45], ["Radiator temp", "C", -20, 20]],
  COMMS:   [["Downlink rate", "Mbps", 1, 50], ["Signal margin", "dB", 3, 12]],
  PAYLOAD: [["Detector temp", "C", -30, -5], ["Frames captured", "", 100, 9000]],
};
const ALERT_MSGS = [
  "Bus voltage below threshold", "Star tracker briefly blinded", "Downlink margin reduced",
  "Wheel speed drift detected", "Ground station handover pending",
];

export function makeData(rng) {
  const name = () => `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
  const phone = () => `+91 ${pick(rng, [9, 8, 7, 6])}${int(rng, 1000, 9999)} ${int(rng, 10000, 99999)}`;
  const emailFor = (n) => n.toLowerCase().replace(" ", ".") + "@mock-isro.example";

  const satellites = ["MOCKSAT-1", "MOCKSAT-2", "DEMOSAT-3"].map((n, i) => ({
    name: n,
    status: rng() < 0.7 ? "NOMINAL" : "WARN",
    altitude: pick(rng, [35786, 820, 36000]),
    battery: int(rng, 62, 100),
    temp: (15 + rng() * 12).toFixed(1),
    lat: (10 + rng() * 20).toFixed(4),
    lon: (65 + rng() * 25).toFixed(4),
    idx: i,
  }));

  const operators = Array.from({ length: 8 }, () => {
    const n = name();
    return {
      name: n, role: pick(rng, ROLES), station: pick(rng, STATIONS).code,
      email: emailFor(n), phone: phone(), aadhaar: fakeAadhaar(rng),
    };
  });

  const telemetry = [];
  const subKeys = Object.keys(SUBS);
  for (let i = 0; i < 24; i++) {
    const sub = pick(rng, subKeys);
    const [param, unit, lo, hi] = pick(rng, SUBS[sub]);
    const v = lo + rng() * (hi - lo);
    const value = hi > 500 ? String(Math.round(v)) : v.toFixed(2);
    telemetry.push({
      time: `2026-10-16 09:${pad(Math.floor(i * 45 / 60))}:${pad((i * 45) % 60)}`,
      sat: pick(rng, satellites).name, sub, param,
      value: unit ? `${value} ${unit}` : value,
      status: rng() < 0.85 ? "NOMINAL" : "WARN",
    });
  }
  telemetry.splice(7, 0, {
    time: "2026-10-16 09:05:15", sat: satellites[0].name, sub: "COMMS", param: "Ground link host",
    value: `10.${int(rng, 1, 250)}.${int(rng, 1, 250)}.${int(rng, 2, 250)}`, status: "NOMINAL",
  });

  const alerts = Array.from({ length: 5 }, (_, i) => ({
    time: `09:${pad(10 + i * 7)}:00`,
    sev: pick(rng, ["INFO", "WARN", "CRIT"]),
    message: `${ALERT_MSGS[i]} on ${pick(rng, satellites).name}`,
    ack: rng() < 0.5 ? name() : "\u2014",
  }));

  return {
    satellites, operators, telemetry, alerts,
    currentUser: `Dr. ${name()}`,
    dutyOfficer: { name: name(), phone: phone() },
  };
}