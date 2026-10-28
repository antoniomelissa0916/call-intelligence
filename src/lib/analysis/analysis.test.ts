import { describe, expect, it } from "vitest";
import type { Transcript } from "@/lib/transcription/types";
import { assemble, moneyFor } from "./analyze";
import { SCORECARDS, gradeFor } from "./rubrics";
import type { ScoringResult, Triage } from "./schemas";
import { containment, EvidenceVerifier } from "./verify";

const transcript: Transcript = {
  provider: "deepgram",
  model: "nova-3",
  durationSec: 120,
  speakers: [0, 1],
  confidence: 0.95,
  redactions: ["pci"],
  utterances: [
    { i: 0, speaker: 0, start: 0, end: 4, text: "Thanks for calling Noble Pest, this is Sarah. How can I help you today?", confidence: 0.98 },
    { i: 1, speaker: 1, start: 4, end: 10, text: "Hi, I've got ants all over my kitchen counters.", confidence: 0.97 },
    { i: 2, speaker: 0, start: 10, end: 16, text: "Oh no, I'm so sorry to hear about those ants in your kitchen. I can definitely take care of that for you.", confidence: 0.96 },
    { i: 3, speaker: 0, start: 16, end: 22, text: "That service is usually $299, but this week it's $199 to start and then $49 a month.", confidence: 0.95 },
    { i: 4, speaker: 1, start: 22, end: 26, text: "Okay, let's do it.", confidence: 0.95 },
  ],
};

const speakers: Triage["speakers"] = [
  { speaker: 0, role: "rep", name: "Sarah" },
  { speaker: 1, role: "customer", name: null },
];

function triage(overrides: Partial<Triage> = {}): Triage {
  return {
    speakers,
    repName: "Sarah",
    customerName: null,
    companyName: "Noble Pest",
    direction: "inbound",
    callType: "new_customer",
    callTypeConfidence: "high",
    callTypeReason: "New caller asking for ant service",
    callTypeEvidence: [{ u: 1, quote: "I've got ants all over my kitchen counters" }],
    notScoreableReason: "none",
    customerStatus: "new_prospect",
    summary: "Ant problem; booked.",
    outcome: { result: "booked", headline: "Booked ant service", evidence: [{ u: 4, quote: "let's do it" }] },
    details: {
      pests: ["ants"],
      serviceDiscussed: "General pest",
      property: null,
      appointment: null,
      pricing: { anchorPrice: 299, initialPrice: 199, recurringPrice: 49, recurringFrequency: "monthly", notes: null },
      cancellationReason: null,
      saveOffer: null,
      competitor: null,
    },
    objections: [],
    followUps: [],
    opportunities: [],
    risks: [],
    sentiment: { start: "negative", end: "positive", note: "" },
    ...overrides,
  };
}

function scoring(items: ScoringResult["items"]): ScoringResult {
  return { items, coaching: { headline: "h", strengths: [], improvements: [] } };
}

describe("evidence verification", () => {
  it("accepts exact and lightly mis-punctuated quotes", () => {
    expect(containment("so sorry to hear about those ants", transcript.utterances[2].text)).toBe(1);
    expect(containment("Im so sorry to hear about those ants!", transcript.utterances[2].text)).toBeGreaterThanOrEqual(0.8);
  });

  it("rejects paraphrases and invented lines", () => {
    expect(containment("I apologize for the insect problem you are experiencing", transcript.utterances[2].text)).toBeLessThan(0.8);
  });

  it("corrects an off-by-one utterance index and takes timestamps from the transcript", () => {
    const v = new EvidenceVerifier(transcript, speakers);
    const e = v.locate({ u: 3, quote: "I can definitely take care of that for you" });
    expect(e).toMatchObject({ u: 2, start: 10, role: "rep", verified: true });
  });

  it("searches the whole call when the index is wrong", () => {
    const v = new EvidenceVerifier(transcript, speakers);
    expect(v.locate({ u: 0, quote: "let's do it" })).toMatchObject({ u: 4, verified: true, role: "customer" });
  });

  it("matches a quote the transcriber split across several lines", () => {
    const split: Transcript = {
      ...transcript,
      utterances: [
        { i: 0, speaker: 0, start: 0, end: 1, text: "And then", confidence: 1 },
        { i: 1, speaker: 0, start: 1, end: 2, text: "where have you seen", confidence: 1 },
        { i: 2, speaker: 0, start: 2, end: 3, text: "the where have you seen the activity?", confidence: 1 },
        { i: 3, speaker: 1, start: 3, end: 6, text: "In the living room on the carpet.", confidence: 1 },
      ],
    };
    const v = new EvidenceVerifier(split, speakers);
    expect(v.locate({ u: 2, quote: "where have you seen the where have you seen the activity?" })).toMatchObject({ u: 1, start: 1, verified: true });
  });

  it("flags quotes that are not in the call", () => {
    const v = new EvidenceVerifier(transcript, speakers);
    expect(v.locate({ u: 2, quote: "we also have a great referral program" }).verified).toBe(false);
    expect(v.verified).toBe(0);
  });
});

describe("scoring rules", () => {
  const card = SCORECARDS.sales;
  const allMet: ScoringResult["items"] = Object.fromEntries(
    card.items.map((i) => [i.id, { status: "met" as const, reasoning: "ok", evidence: [{ u: 2, quote: "I can definitely take care of that for you" }] }]),
  );

  it("grade bands match the manuals", () => {
    expect(gradeFor(SCORECARDS.sales, 17)).toBe("gold");
    expect(gradeFor(SCORECARDS.sales, 14)).toBe("green");
    expect(gradeFor(SCORECARDS.sales, 13)).toBe("below");
    expect(gradeFor(SCORECARDS.service, 12)).toBe("gold");
    expect(gradeFor(SCORECARDS.service, 11)).toBe("green");
    expect(gradeFor(SCORECARDS.service, 10)).toBe("below");
    expect(SCORECARDS.sales.items).toHaveLength(17);
    expect(SCORECARDS.service.items).toHaveLength(12);
    expect(SCORECARDS.retention.items).toHaveLength(12);
  });

  it("auto-awards the 4 objection points when the customer raised no objection", () => {
    const items = { ...allMet };
    for (const id of ["obj_agree", "obj_restate", "obj_resolve", "obj_reclose"]) {
      items[id] = { status: "missed", reasoning: "no objection", evidence: [] };
    }
    const a = assemble(transcript, triage(), card, scoring(items), {}, { inputTokens: 0, outputTokens: 0, durationMs: 0 }, "m");
    expect(a.scorecard!.score).toBe(17);
    expect(a.scorecard!.items.filter((i) => i.status === "not_needed")).toHaveLength(4);
  });

  it("requires the objection steps when an objection was raised", () => {
    const items = { ...allMet, obj_agree: { status: "not_needed" as const, reasoning: "", evidence: [] } };
    const t = triage({
      objections: [{ type: "price", summary: "Too expensive", evidence: { u: 4, quote: "let's do it" }, handling: "resolved" }],
    });
    const a = assemble(transcript, t, card, scoring(items), {}, { inputTokens: 0, outputTokens: 0, durationMs: 0 }, "m");
    const agree = a.scorecard!.items.find((i) => i.id === "obj_agree")!;
    expect(agree.credited).toBe(false);
    expect(a.scorecard!.score).toBe(16);
  });

  it("withholds a point whose only evidence can't be found, and flags the call for review", () => {
    const items = { ...allMet, validate: { status: "met" as const, reasoning: "", evidence: [{ u: 2, quote: "totally made up sentence here" }] } };
    const a = assemble(transcript, triage(), card, scoring(items), {}, { inputTokens: 0, outputTokens: 0, durationMs: 0 }, "m");
    expect(a.scorecard!.items.find((i) => i.id === "validate")!.credited).toBe(false);
    expect(a.quality.needsReview).toBe(true);
  });

  it("applies manager overrides on top of the AI result", () => {
    const a = assemble(transcript, triage(), card, scoring(allMet), { items: { pricing: false } }, { inputTokens: 0, outputTokens: 0, durationMs: 0 }, "m");
    const pricing = a.scorecard!.items.find((i) => i.id === "pricing")!;
    expect(pricing).toMatchObject({ credited: false, overridden: true });
    expect(a.scorecard!.score).toBe(16);
    expect(a.scorecard!.grade).toBe("green");
  });

  it("only allows the retention teaser to be skipped when the customer was saved", () => {
    const ret = SCORECARDS.retention;
    const items = Object.fromEntries(
      ret.items.map((i) => [i.id, { status: "met" as const, reasoning: "", evidence: [{ u: 2, quote: "I can definitely take care of that for you" }] }]),
    ) as ScoringResult["items"];
    items.ret_teaser = { status: "not_needed", reasoning: "", evidence: [] };
    const cancelled = triage({ callType: "retention", outcome: { result: "cancelled", headline: "", evidence: [] } });
    const saved = triage({ callType: "retention", outcome: { result: "saved", headline: "", evidence: [] } });
    const usage = { inputTokens: 0, outputTokens: 0, durationMs: 0 };
    expect(assemble(transcript, cancelled, ret, scoring(items), {}, usage, "m").scorecard!.score).toBe(11);
    expect(assemble(transcript, saved, ret, scoring(items), {}, usage, "m").scorecard!.score).toBe(12);
  });
});

describe("revenue", () => {
  it("annualizes quoted prices for a booked sale", () => {
    expect(moneyFor(triage())).toEqual({ annualValue: 199 + 49 * 12, basis: "quoted", direction: "won" });
  });

  it("falls back to an estimate when no price was said", () => {
    const t = triage({
      outcome: { result: "lost", headline: "", evidence: [] },
      details: { ...triage().details, pricing: { anchorPrice: null, initialPrice: null, recurringPrice: null, recurringFrequency: null, notes: null } },
    });
    expect(moneyFor(t)).toMatchObject({ basis: "estimated", direction: "lost" });
  });

  it("has no revenue impact for routine service calls", () => {
    expect(moneyFor(triage({ callType: "scheduling", outcome: { result: "resolved", headline: "", evidence: [] } })).direction).toBeNull();
  });
});
