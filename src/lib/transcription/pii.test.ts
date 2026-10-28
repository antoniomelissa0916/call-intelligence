import { describe, expect, it } from "vitest";
import { employeeNames, maskPatterns, maskUtterance, piiSpans, type DgWord } from "./pii";

const words = (text: string, t0 = 0): DgWord[] =>
  text.split(" ").map((w, i) => ({ word: w.toLowerCase(), punctuated_word: w, start: t0 + i * 0.5, end: t0 + i * 0.5 + 0.5 }));

describe("contact detail masking", () => {
  it("finds the employee's name in company greetings", () => {
    expect(employeeNames(["Thank you for calling Bug Bully. This is Kristen."])).toEqual(new Set(["kristen"]));
    expect(employeeNames(["Endeavor Pest Management. This is Elijah speaking."])).toEqual(new Set(["elijah"]));
    expect(employeeNames(["This is Elijah with Endeavor Pest Management."])).toEqual(new Set(["elijah"]));
  });

  it("masks a customer's name but keeps the next word", () => {
    const w = words("Nina. And how do you spell the last name?");
    const spans = piiSpans(w, [{ label: "NAME_GIVEN", value: "Nina", start_word: 0, end_word: 1 }], new Set());
    expect(maskUtterance(w, "", spans)).toBe("[NAME]. And how do you spell the last name?");
  });

  it("collapses a multi-word address into one placeholder", () => {
    const w = words("It's at 38 Birch Hill Road.");
    const spans = piiSpans(w, [{ label: "LOCATION_ADDRESS", value: "38 Birch Hill Road", start_word: 2, end_word: 6 }], new Set());
    expect(maskUtterance(w, "", spans)).toBe("It's at [ADDRESS].");
  });

  it("never masks roster names", () => {
    const w = words("Good morning, Griffin.");
    const spans = piiSpans(w, [{ label: "NAME_GIVEN", value: "Griffin", start_word: 2, end_word: 3 }], new Set(["griffin"]));
    expect(maskUtterance(w, "", spans)).toBe("Good morning, Griffin.");
  });

  it("catches emails and phone numbers entity detection missed", () => {
    expect(maskPatterns("Text me at (508) 329-8030 or jo.smith@gmail.com")).toBe("Text me at [PHONE] or [EMAIL]");
  });
});
