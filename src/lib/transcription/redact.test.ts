import { describe, expect, it } from "vitest";
import { redactReadback } from "./deepgram";
import type { Utterance } from "./types";

const u = (i: number, text: string): Utterance => ({ i, speaker: i % 2, start: i, end: i + 1, text, confidence: 1 });

describe("redactReadback", () => {
  it("masks a security code the rep reads back after a redacted one", () => {
    const out = redactReadback([u(0, "And three digit code?"), u(1, "[CVV_1]."), u(2, "950."), u(3, "Is the best number to reach you this one?")]);
    expect(out[2].text).toBe("[REDACTED].");
    expect(out[3].text).toBe("Is the best number to reach you this one?");
  });

  it("leaves numbers alone when no card details were said", () => {
    const out = redactReadback([u(0, "It's 1209 Little Street."), u(1, "Got it, 1209.")]);
    expect(out.map((x) => x.text)).toEqual(["It's 1209 Little Street.", "Got it, 1209."]);
  });
});
