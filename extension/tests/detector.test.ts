import { describe, it, expect } from "vitest";
import { detectPII, redactText, registerDetector } from "../src/sanitizer/detector";
import { makeAadhaar } from "../src/sanitizer/checksums";

const types = (t: string) => detectPII(t).map((m) => m.type);
const aad = makeAadhaar("23456789012");
const aadSpaced = `${aad.slice(0, 4)} ${aad.slice(4, 8)} ${aad.slice(8)}`;

describe("detectPII", () => {
  it("detects a checksum-valid Aadhaar (spaced and contiguous)", () => {
    expect(types(`Aadhaar ${aadSpaced}`)).toContain("AADHAAR");
    expect(types(`UID ${aad}`)).toContain("AADHAAR");
  });

  it("rejects a 12-digit number with a bad Verhoeff checksum", () => {
    const bad = aad.slice(0, 11) + String((Number(aad[11]) + 1) % 10);
    expect(types(`ref ${bad}`)).not.toContain("AADHAAR");
  });

  it("detects a valid PAN", () => {
    expect(types("PAN ABCPE1234F")).toContain("PAN");
  });

  it("rejects a PAN with an invalid 4th letter", () => {
    expect(types("code ABCDE1234F")).not.toContain("PAN");
  });

  it("detects emails", () => {
    expect(types("mail ravi.kumar@isro.gov.in now")).toContain("EMAIL");
  });

  it("detects Indian phone numbers in several formats", () => {
    expect(types("Call +91 98765 43210")).toContain("PHONE");
    expect(types("Mobile 9876543210")).toContain("PHONE");
    expect(types("Tel +91-9812345678")).toContain("PHONE");
  });

  it("does not flag 10-digit numbers that cannot be Indian mobiles", () => {
    expect(types("serial 1234567890")).not.toContain("PHONE");
  });

  it("detects decimal lat/long pairs", () => {
    expect(types("pad 13.0827, 80.2707")).toContain("GEO");
    expect(types("pad 12.9716;77.5946")).toContain("GEO");
  });

  it("rejects out-of-range coordinate pairs", () => {
    expect(types("vals 95.1234, 190.5678")).not.toContain("GEO");
  });

  it("detects DMS coordinates", () => {
    expect(types(`burn at 13°43'11"N`)).toContain("GEO");
  });

  it("detects labeled coordinates", () => {
    expect(types("latitude: 28.6139")).toContain("GEO");
    expect(types("lon=77.2090")).toContain("GEO");
  });

  it("detects credentials: key-value, Bearer, AWS, JWT", () => {
    expect(types("password: Sup3rS3cret!")).toContain("CREDENTIAL");
    expect(types("Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456")).toContain("CREDENTIAL");
    expect(types("AKIAIOSFODNN7EXAMPLE")).toContain("CREDENTIAL");
    expect(
      types("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop")
    ).toContain("CREDENTIAL");
  });

  it("detects Luhn-valid cards and rejects invalid ones", () => {
    expect(types("Card 4111 1111 1111 1111")).toContain("CARD");
    expect(types("Card 4111 1111 1111 1112")).not.toContain("CARD");
  });

  it("detects IFSC and IPv4", () => {
    expect(types("IFSC SBIN0001234")).toContain("IFSC");
    expect(types("host 192.168.1.25 up")).toContain("IP");
  });

  it("detects labeled names and masks only the name", () => {
    const t = "Operator: Dr. Anil Sharma";
    const m = detectPII(t).find((x) => x.type === "NAME")!;
    expect(t.slice(m.start, m.end)).toBe("Dr. Anil Sharma");
  });

  it("merges overlapping matches into one union span", () => {
    const t = "password: 9876543210";
    const ms = detectPII(t);
    expect(ms).toHaveLength(1);
    expect(ms[0].start).toBe(0);
    expect(ms[0].end).toBe(t.length);
    expect(ms[0].type).toBe("CREDENTIAL");
  });

  it("redactText replaces spans with [TYPE] tokens", () => {
    expect(redactText("Mail ravi@isro.gov.in now").text).toBe("Mail [EMAIL] now");
  });

  it("returns nothing for clean text", () => {
    expect(detectPII("Satellite pass over Sriharikota in 12 minutes")).toEqual([]);
  });
  it("does not let one credential keyword swallow another", () => {
    const t = "Token: password: Sup3rS3cret!";
    const ms = detectPII(t);
    const covered = ms.some((m) => m.start <= t.indexOf("Sup3rS3cret") && m.end >= t.length);
    expect(covered).toBe(true);
    expect(redactText(t).text).not.toContain("Sup3rS3cret");
  });

  it("supports custom (ML) detectors via registerDetector", () => {
    const off = registerDetector((t) => {
      const i = t.indexOf("Zorblax");
      return i < 0 ? [] : [{ type: "NAME", start: i, end: i + 7, confidence: 0.9 }];
    });
    expect(redactText("hello Zorblax here").text).toBe("hello [NAME] here");
    off();
    expect(redactText("hello Zorblax here").text).toBe("hello Zorblax here");
  });
});