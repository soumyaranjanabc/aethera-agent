import type { PIIType } from "../shared/types";
import { isValidAadhaar, luhnValid } from "./checksums";

export interface Rule {
  type: PIIType;
  /** Must have the "g" flag. Rules using `group` must also have the "d" flag. */
  regex: RegExp;
  /** If set, only this capture group is the sensitive span (e.g. the name after "Operator:"). */
  group?: number;
  confidence: number;
  validate?: (value: string) => boolean;
}

const PAN_4TH = "ABCFGHLJPT"; // valid holder-type letters

function validGeoPair(v: string): boolean {
  const nums = v.match(/[-+]?\d+\.\d+/g);
  if (!nums || nums.length < 2) return false;
  return Math.abs(parseFloat(nums[0])) <= 90 && Math.abs(parseFloat(nums[1])) <= 180;
}

export const RULES: Rule[] = [
  // ---- Contact ----
  {
    type: "EMAIL",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    confidence: 0.95,
  },
  {
    type: "PHONE",
    regex: /(?<![\d.])(?:(?:\+91|91|0)[ \t-]?)?[6-9]\d{4}[ \t-]?\d{5}(?!\d)/g,
    confidence: 0.85,
  },

  // ---- Indian government / financial IDs ----
  {
    type: "AADHAAR",
    regex: /(?<!\d)[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g,
    confidence: 0.95,
    validate: isValidAadhaar,
  },
  {
    type: "PAN",
    regex: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    confidence: 0.9,
    validate: (v) => PAN_4TH.includes(v[3]),
  },
  {
    type: "IFSC",
    regex: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    confidence: 0.85,
  },
  {
    type: "CARD",
    regex: /(?<!\d)\d(?:[\s-]?\d){12,18}(?!\d)/g,
    confidence: 0.9,
    validate: (v) => luhnValid(v.replace(/\D/g, "")),
  },

  // ---- Coordinates (satellite / ground-station locations) ----
  {
    // 13.0827, 80.2707   |   13.7199°N 80.2304°E   |   12.9716;77.5946
    type: "GEO",
    regex:
      /(?<![\d.])[-+]?\d{1,2}\.\d{3,}\s*°?\s*[NS]?\s*(?:[,;]\s*|\s+)[-+]?\d{1,3}\.\d{3,}\s*°?\s*[EW]?(?!\d|\.\d)/g,
    confidence: 0.9,
    validate: validGeoPair,
  },
  {
    // 13°43'11"N
    type: "GEO",
    regex: /(?<!\d)\d{1,3}°\s*\d{1,2}['′]\s*(?:\d{1,2}(?:\.\d+)?["″]\s*)?[NSEW]\b/g,
    confidence: 0.85,
  },
  {
    // latitude: 28.6139   lon=77.2090
    type: "GEO",
    regex: /\b(?:[Ll]at(?:itude)?|[Ll]on(?:g|gitude)?|[Ll]ng)\s*[:=]\s*[-+]?\d{1,3}(?:\.\d+)?/g,
    confidence: 0.85,
  },

  // ---- Credentials & secrets ----
  {
    type: "CREDENTIAL",
    // The (?!...) stops a keyword from swallowing another keyword as its "value"
    // (e.g. "Token: password: X" must match "password: X", not "Token: password:").
    regex:
      /\b(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?key|authorization)[ \t]*[:=][ \t]*(?!(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|access[_-]?key|authorization)[ \t]*[:=])\S+/gi,
    confidence: 0.9,
  },
  { type: "CREDENTIAL", regex: /\bBearer[ \t]+[A-Za-z0-9\-._~+/]{16,}=*/g, confidence: 0.95 },
  { type: "CREDENTIAL", regex: /\bAKIA[0-9A-Z]{16}\b/g, confidence: 0.95 },
  { type: "CREDENTIAL", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, confidence: 0.95 },
  {
    type: "CREDENTIAL",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    confidence: 0.95,
  },
  {
    type: "CREDENTIAL",
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    confidence: 0.99,
  },

  // ---- Network (infrastructure) ----
  {
    type: "IP",
    regex: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g,
    confidence: 0.7,
  },

  // ---- Names (label-driven heuristic; the ML model in Phase 6 does the real work) ----
  {
    type: "NAME",
    regex:
      /\b(?:[Ff]ull[ \t]+[Nn]ame|[Nn]ame|[Oo]perator|[Oo]fficer|[Ss]cientist|[Ee]ngineer|[Dd]irector|[Uu]ser)[ \t]*[:\-][ \t]*((?:(?:Dr|Mr|Mrs|Ms|Shri|Smt)\.?[ \t]+)?[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,3})/gd,
    group: 1,
    confidence: 0.6,
  },
];