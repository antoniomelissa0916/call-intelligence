import { z } from "zod";
import { SCORECARDS, type ScorecardId } from "./rubrics";
import { CALL_TYPES, NOT_SCOREABLE_REASONS, OUTCOMES } from "./taxonomy";

/** A pointer into the transcript. Times are looked up from the utterance, never trusted from the model. */
export const EvidenceSchema = z.object({
  u: z.number().int().describe("Utterance index, the number after 'u' in the transcript line"),
  quote: z.string().describe("Exact words copied from that utterance (max ~25 words). Never paraphrase."),
});
export type EvidenceRef = z.infer<typeof EvidenceSchema>;

const Confidence = z.enum(["high", "medium", "low"]);

export const TriageSchema = z.object({
  speakers: z
    .array(
      z.object({
        speaker: z.number().int(),
        role: z.enum(["rep", "customer", "other"]),
        name: z.string().nullable(),
      }),
    )
    .describe("Every speaker number in the transcript and who they are. 'other' = IVR, hold message, technician, 3rd party."),
  repName: z.string().nullable().describe("The company employee's first name as said on the call, else null"),
  customerName: z.string().nullable(),
  companyName: z.string().nullable().describe("The pest control company the rep works for, as said on the call"),
  direction: z.enum(["inbound", "outbound", "unknown"]),
  callType: z.enum(CALL_TYPES),
  callTypeConfidence: Confidence,
  callTypeReason: z.string().describe("One sentence on why this type, citing what was said"),
  callTypeEvidence: z.array(EvidenceSchema),
  notScoreableReason: z.enum(NOT_SCOREABLE_REASONS),
  customerStatus: z.enum(["new_prospect", "existing_customer", "unknown"]),
  summary: z.string().describe("2–3 plain sentences: why they called, what happened, how it ended"),
  outcome: z.object({
    result: z.enum(OUTCOMES),
    headline: z.string().describe("Owner-facing one-liner, e.g. 'Booked quarterly plan, first visit Tue 9am'"),
    evidence: z.array(EvidenceSchema),
  }),
  details: z.object({
    pests: z.array(z.string()),
    serviceDiscussed: z.string().nullable(),
    property: z.string().nullable().describe("Home size, location/city, pets, kids, access notes if mentioned"),
    appointment: z.string().nullable().describe("Date/time booked or changed, as said"),
    pricing: z.object({
      anchorPrice: z.number().nullable(),
      initialPrice: z.number().nullable(),
      recurringPrice: z.number().nullable(),
      recurringFrequency: z
        .enum(["monthly", "bi-monthly", "quarterly", "annual", "one-time"])
        .nullable()
        .describe(
          "How often the customer PAYS recurringPrice (not how often the technician visits): a bi-monthly or quarterly service billed as a monthly subscription is 'monthly'",
        ),
      notes: z.string().nullable(),
    }),
    cancellationReason: z.string().nullable(),
    saveOffer: z.string().nullable().describe("What the rep offered to keep a cancelling customer"),
    competitor: z.string().nullable(),
  }),
  objections: z.array(
    z.object({
      type: z.enum(["price", "need_to_ask_spouse", "shopping_around", "timing", "trust", "not_needed", "contract", "other"]),
      summary: z.string(),
      evidence: EvidenceSchema,
      handling: z.enum(["resolved", "partially", "not_addressed"]),
    }),
  ).describe("Only real objections/concerns raised by the CUSTOMER that pushed back on buying or staying. Questions are not objections."),
  followUps: z.array(
    z.object({
      owner: z.enum(["company", "customer"]),
      action: z.string(),
      due: z.string().nullable(),
      evidence: EvidenceSchema,
    }),
  ).describe("Concrete commitments made on the call that someone must act on after it"),
  opportunities: z.array(
    z.object({
      type: z.enum(["upsell", "cross_sell", "referral", "review", "booking", "save", "prepay"]),
      description: z.string(),
      captured: z.boolean(),
      evidence: EvidenceSchema.nullable(),
    }),
  ).describe("Revenue/relationship opportunities present on this call and whether the rep captured them"),
  risks: z.array(
    z.object({
      type: z.enum([
        "churn",
        "complaint",
        "technician_issue",
        "billing_dispute",
        "damage_claim",
        "safety_concern",
        "bad_review_threat",
        "escalation",
      ]),
      severity: Confidence,
      description: z.string(),
      evidence: EvidenceSchema,
    }),
  ),
  sentiment: z.object({
    start: z.enum(["positive", "neutral", "negative"]),
    end: z.enum(["positive", "neutral", "negative"]),
    note: z.string(),
  }),
});
export type Triage = z.infer<typeof TriageSchema>;

const ItemJudgement = z.object({
  status: z.enum(["met", "missed"]),
  reasoning: z.string().describe("1–2 sentences, specific to this call"),
  evidence: z
    .array(EvidenceSchema)
    .describe("met: the rep's line(s) that satisfy the standard. missed: the moment it should have happened, if any"),
});

const ItemJudgementWithNotNeeded = ItemJudgement.extend({
  status: z.enum(["met", "missed", "not_needed"]),
});

export function scoringSchemaFor(id: ScorecardId) {
  const card = SCORECARDS[id];
  const shape: Record<string, typeof ItemJudgement | typeof ItemJudgementWithNotNeeded> = {};
  for (const item of card.items) {
    shape[item.id] = item.creditWhenNotNeeded ? ItemJudgementWithNotNeeded : ItemJudgement;
  }
  const itemIds = card.items.map((i) => i.id) as [string, ...string[]];
  return z.object({
    items: z.object(shape),
    coaching: z.object({
      headline: z.string().describe("The single most valuable change for this rep on this call, one sentence"),
      strengths: z.array(
        z.object({ title: z.string(), detail: z.string(), evidence: EvidenceSchema }),
      ),
      improvements: z.array(
        z.object({
          itemId: z.enum(itemIds).nullable(),
          title: z.string(),
          whatHappened: z.string(),
          impact: z.string().describe("Why it matters for the customer or the business on THIS call"),
          tryThis: z.string().describe("A word-for-word line the rep could have said, in the manual's style, using this call's details"),
          evidence: EvidenceSchema.nullable(),
        }),
      ),
    }),
  });
}

export type ScoringResult = {
  items: Record<string, { status: "met" | "missed" | "not_needed"; reasoning: string; evidence: EvidenceRef[] }>;
  coaching: {
    headline: string;
    strengths: { title: string; detail: string; evidence: EvidenceRef }[];
    improvements: {
      itemId: string | null;
      title: string;
      whatHappened: string;
      impact: string;
      tryThis: string;
      evidence: EvidenceRef | null;
    }[];
  };
};
