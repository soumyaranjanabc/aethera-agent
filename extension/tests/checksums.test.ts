import { describe, it, expect } from "vitest";
import {
  verhoeffCheckDigit,
  verhoeffValid,
  makeAadhaar,
  isValidAadhaar,
  luhnValid,
} from "../src/sanitizer/checksums";

describe("checksums", () => {
  it("Verhoeff: matches the published known answer and validates generated numbers", () => {
    expect(verhoeffCheckDigit("236")).toBe("3"); // classic reference example: 2363
    for (const p of ["236", "23456789012", "98765432101", "5555"]) {
      expect(verhoeffValid(p + verhoeffCheckDigit(p))).toBe(true);
    }
  });

  it("Verhoeff: detects any single-digit error", () => {
    const good = makeAadhaar("23456789012");
    const bad = good.slice(0, 11) + String((Number(good[11]) + 1) % 10);
    expect(verhoeffValid(bad)).toBe(false);
  });

  it("Aadhaar: enforces first digit 2-9, length 12, checksum, allows separators", () => {
    const good = makeAadhaar("23456789012");
    expect(isValidAadhaar(good)).toBe(true);
    expect(isValidAadhaar(`${good.slice(0, 4)} ${good.slice(4, 8)} ${good.slice(8)}`)).toBe(true);
    expect(isValidAadhaar(makeAadhaar("03456789012"))).toBe(false); // starts with 0
    expect(isValidAadhaar(good.slice(0, 11))).toBe(false); // too short
  });

  it("Luhn: accepts known test cards, rejects altered ones", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("5555555555554444")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    expect(luhnValid("12345")).toBe(false);
  });
});