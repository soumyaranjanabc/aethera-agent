import { makeAadhaar } from "../../src/sanitizer/checksums";

export interface Sample {
  type: string;
  text: string;
  /** Substrings that MUST be fully covered by redaction. Empty = clean text. */
  pii: string[];
}

const sp = (a: string) => `${a.slice(0, 4)} ${a.slice(4, 8)} ${a.slice(8)}`;
const A1 = makeAadhaar("23456789012");
const A2 = makeAadhaar("45678901234");

export const CORPUS: Sample[] = [
  // ---- Aadhaar ----
  { type: "AADHAAR", text: `Aadhaar No: ${sp(A1)}`, pii: [sp(A1)] },
  { type: "AADHAAR", text: `UID ${A2} verified`, pii: [A2] },

  // ---- PAN ----
  { type: "PAN", text: "PAN: ABCPE1234F submitted", pii: ["ABCPE1234F"] },
  { type: "PAN", text: "Tax ID BNZPA2540A", pii: ["BNZPA2540A"] },

  // ---- Email ----
  { type: "EMAIL", text: "Reach me at ravi.kumar@isro.gov.in.", pii: ["ravi.kumar@isro.gov.in"] },
  { type: "EMAIL", text: "Mail: s.nair+alerts@vssc.gov.in", pii: ["s.nair+alerts@vssc.gov.in"] },

  // ---- Phone ----
  { type: "PHONE", text: "Call +91 98765 43210 now", pii: ["+91 98765 43210"] },
  { type: "PHONE", text: "Mobile 9876543210", pii: ["9876543210"] },
  { type: "PHONE", text: "Duty officer: +91-9812345678", pii: ["+91-9812345678"] },

  // ---- Coordinates ----
  { type: "GEO", text: "Lat/Lon: 13.0827, 80.2707", pii: ["13.0827, 80.2707"] },
  { type: "GEO", text: "Pad at 13.7199°N 80.2304°E", pii: ["13.7199°N 80.2304°E"] },
  { type: "GEO", text: `Orbit insertion burn at 13°43'11"N`, pii: [`13°43'11"N`] },
  { type: "GEO", text: "latitude: 28.6139 longitude: 77.2090", pii: ["latitude: 28.6139", "longitude: 77.2090"] },
  { type: "GEO", text: "Target 12.9716;77.5946", pii: ["12.9716;77.5946"] },

  // ---- Credentials ----
  { type: "CREDENTIAL", text: "Login password: Sup3rS3cret!", pii: ["password: Sup3rS3cret!"] },
  { type: "CREDENTIAL", text: "config api_key=sk_live_abcdef123456 set", pii: ["api_key=sk_live_abcdef123456"] },
  {
    type: "CREDENTIAL",
    text: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
    pii: ["Bearer abcdefghijklmnopqrstuvwxyz123456"],
  },
  { type: "CREDENTIAL", text: "aws key AKIAIOSFODNN7EXAMPLE", pii: ["AKIAIOSFODNN7EXAMPLE"] },
  {
    type: "CREDENTIAL",
    text: "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
    pii: ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop"],
  },
  { type: "CREDENTIAL", text: "-----BEGIN RSA PRIVATE KEY-----", pii: ["-----BEGIN RSA PRIVATE KEY-----"] },

  // ---- Cards / bank ----
  { type: "CARD", text: "Card 4111 1111 1111 1111 expires 12/28", pii: ["4111 1111 1111 1111"] },
  { type: "CARD", text: "Pay with 5555555555554444", pii: ["5555555555554444"] },
  { type: "IFSC", text: "IFSC SBIN0001234", pii: ["SBIN0001234"] },

  // ---- Network ----
  { type: "IP", text: "Ground station 10.20.30.40 reachable", pii: ["10.20.30.40"] },
  { type: "IP", text: "Gateway 192.168.1.25", pii: ["192.168.1.25"] },

  // ---- Names (label-driven) ----
  { type: "NAME", text: "Operator: Dr. Anil Sharma", pii: ["Dr. Anil Sharma"] },
  { type: "NAME", text: "Name: Priya Menon", pii: ["Priya Menon"] },
  { type: "NAME", text: "Mission Director - Rakesh Iyer", pii: ["Rakesh Iyer"] },

  // ---- Mixed ----
  { type: "MIXED", text: "Contact ravi@isro.gov.in or +91 98765 43210", pii: ["ravi@isro.gov.in", "+91 98765 43210"] },

  // ---- Clean text: must produce ZERO detections ----
  { type: "NONE", text: "Satellite pass over Sriharikota in 12 minutes", pii: [] },
  { type: "NONE", text: "Mission clock T-00:12:45 elapsed", pii: [] },
  { type: "NONE", text: "Altitude 35786 km, inclination 0.05 deg", pii: [] },
  { type: "NONE", text: "Orbit period 1436.07 minutes", pii: [] },
  { type: "NONE", text: "Software version 2.4.1 build 20241015", pii: [] },
  { type: "NONE", text: "Telemetry packets received: 1048576", pii: [] },
  { type: "NONE", text: "Battery 87%, panel temp 21.4C, bus voltage 28.5 V", pii: [] },
  { type: "NONE", text: "Click Submit to export the telemetry log", pii: [] },
  { type: "NONE", text: "Launch window opens 2026-03-14 at 09:30 IST", pii: [] },
  { type: "NONE", text: "Enter your password below", pii: [] },
  { type: "NONE", text: "Name Role Status Updated", pii: [] },
  { type: "NONE", text: "Reference ID 7F3A9C raised for review", pii: [] },
  { type: "NONE", text: "Total downlink 4.75 GB over 12 passes", pii: [] },
  { type: "NONE", text: "Sensor ID TMP-0042 reading nominal", pii: [] },
];