import type { Transcript } from "@/lib/transcription/types";
import { structuredCall, type Usage } from "./llm";
import { PROMPT_VERSION, SCORING_SYSTEM, TRIAGE_SYSTEM, scoringUserMessage, triageUserMessage } from "./prompts";
import { SCORECARDS, gradeFor, type Scorecard } from "./rubrics";
import { TriageSchema, scoringSchemaFor, type ScoringResult, type Triage } from "./schemas";
import { scorecardFor, type CallType, type Outcome } from "./taxonomy";
import { needsSpeakerRepair, repairSpeakers } from "./speakers";
import type { CallAnalysis, Money, ScoredItem, ScorecardResult } from "./types";
import { EvidenceVerifier } from "./verify";

export interface Overrides {
  callType?: CallType;
  /** itemId -> true (award the point) / false (withhold it) */
  items?: Record<string, boolean>;
}

const OBJECTION_ITEMS = new Set(["obj_agree", "obj_restate", "obj_resolve", "obj_reclose"]);

/** Typical first-year value of a residential pest customer, used only when no price is said on the call. */
const DEFAULT_ANNUAL_VALUE = Number(process.env.DEFAULT_ANNUAL_VALUE ?? 650);

/**
 * Full analysis of one call: (repair speakers if needed) → classify + extract → score + coach
 * against the right scorecard. Returns the transcript too, since speaker repair may change it.
 */
export async function analyzeTranscript(
  input: Transcript,
  overrides: Overrides = {},
  cached?: { triage?: Triage; scoring?: ScoringResult | null },
): Promise<{ analysis: CallAnalysis; transcript: Transcript }> {
  const usage: Usage = { inputTokens: 0, outputTokens: 0, durationMs: 0 };
  let model = "";

  let transcript = input;
  if (!cached?.triage && needsSpeakerRepair(transcript)) {
    const res = await repairSpeakers(transcript);
    transcript = res.transcript;
    add(usage, res.usage);
  }

  let triage = cached?.triage;
  if (!triage) {
    if (transcript.utterances.length === 0) {
      triage = emptyTriage();
    } else {
      const res = await structuredCall({
        system: TRIAGE_SYSTEM,
        user: triageUserMessage(transcript),
        schema: TriageSchema,
      });
      triage = res.data;
      model = res.model;
      add(usage, res.usage);
    }
  }
  if (overrides.callType && overrides.callType !== triage.callType) {
    triage = { ...triage, callType: overrides.callType };
  }

  const scorecardId = scorecardFor(triage.callType);
  const card = scorecardId ? SCORECARDS[scorecardId] : null;

  let scoring: ScoringResult | null = null;
  if (card) {
    const reuse = cached?.scoring && Object.keys(cached.scoring.items).every((id) => card.items.some((i) => i.id === id));
    if (reuse) {
      scoring = cached!.scoring!;
    } else {
      const res = await structuredCall({
        system: SCORING_SYSTEM,
        user: scoringUserMessage(transcript, triage, card),
        schema: scoringSchemaFor(card.id),
      });
      scoring = res.data as ScoringResult;
      model = res.model;
      add(usage, res.usage);
    }
  }

  const analysis = assemble(transcript, triage, card, scoring, overrides, usage, model);
  return { analysis, transcript };
}

export function assemble(
  transcript: Transcript,
  triage: Triage,
  card: Scorecard | null,
  scoring: ScoringResult | null,
  overrides: Overrides,
  usage: Usage,
  model: string,
): CallAnalysis {
  const v = new EvidenceVerifier(transcript, triage.speakers);
  const reasons: string[] = [];

  const callTypeEvidence = v.locateAll(triage.callTypeEvidence);
  const outcomeEvidence = v.locateAll(triage.outcome.evidence);

  let scorecard: ScorecardResult | null = null;
  if (card && scoring) {
    const items: ScoredItem[] = card.items.map((rubric) => {
      const j = scoring.items[rubric.id] ?? { status: "missed" as const, reasoning: "Not assessed.", evidence: [] };
      const evidence = v.locateAll(j.evidence);
      let status = j.status;
      let credited = false;
      let creditNote: string | null = null;

      if (OBJECTION_ITEMS.has(rubric.id) && triage.objections.length === 0) {
        // Sales manual: no objections means the rep automatically gets the 4 objection points.
        status = "not_needed";
        credited = true;
        creditNote = rubric.creditWhenNotNeeded ?? null;
      } else if (status === "not_needed") {
        const contradiction =
          (OBJECTION_ITEMS.has(rubric.id) && triage.objections.length > 0) ||
          (rubric.id === "ret_teaser" && triage.outcome.result === "cancelled");
        if (contradiction || !rubric.creditWhenNotNeeded) {
          status = "missed";
          creditNote = "This step was required on this call.";
        } else {
          credited = true;
          creditNote = rubric.creditWhenNotNeeded;
        }
      } else if (status === "met") {
        const verified = evidence.filter((e) => e.verified);
        if (verified.length === 0) {
          creditNote = "Marked as done, but the quoted line could not be found in the transcript, so the point is withheld until a manager confirms.";
          reasons.push(`“${rubric.label}” evidence could not be verified`);
        } else {
          credited = true;
          if (!verified.some((e) => e.role === "rep")) {
            reasons.push(`“${rubric.label}” evidence is attributed to the customer (possible speaker mix-up)`);
          }
        }
      }

      const override = overrides.items?.[rubric.id];
      const overridden = override !== undefined && override !== credited;
      if (override !== undefined) {
        credited = override;
        if (overridden) creditNote = "Adjusted by a manager.";
      }

      return {
        id: rubric.id,
        quadrant: rubric.quadrant,
        label: rubric.label,
        standard: rubric.standard,
        example: rubric.example,
        status,
        credited,
        creditNote,
        reasoning: j.reasoning,
        evidence,
        overridden,
      };
    });
    const score = items.filter((i) => i.credited).length;
    scorecard = {
      id: card.id,
      name: card.name,
      source: card.source,
      items,
      score,
      max: card.items.length,
      grade: gradeFor(card, score),
      bands: card.bands,
    };
  }

  const coaching = scoring
    ? {
        headline: scoring.coaching.headline,
        strengths: scoring.coaching.strengths.map((s) => ({ ...s, evidence: v.locateMaybe(s.evidence) })),
        improvements: scoring.coaching.improvements.map((s) => ({ ...s, evidence: v.locateMaybe(s.evidence) })),
      }
    : null;

  const objections = triage.objections.map((o) => ({ ...o, evidence: v.locate(o.evidence) }));
  const followUps = triage.followUps.map((f) => ({ ...f, evidence: v.locate(f.evidence) }));
  const opportunities = triage.opportunities.map((o) => ({ ...o, evidence: v.locateMaybe(o.evidence) }));
  const risks = triage.risks.map((r) => ({ ...r, evidence: v.locate(r.evidence) }));

  if (triage.callTypeConfidence === "low") reasons.push("Call type is uncertain");
  if (outcomeEvidence.length > 0 && !outcomeEvidence.some((e) => e.verified)) reasons.push("Outcome evidence could not be verified");
  if (card && !triage.speakers.some((s) => s.role === "rep")) reasons.push("No company rep identified on the call");
  if (transcript.utterances.length > 0 && transcript.confidence < 0.75) reasons.push("Low audio/transcription quality");

  return {
    promptVersion: PROMPT_VERSION,
    model,
    callType: triage.callType,
    callTypeConfidence: triage.callTypeConfidence,
    callTypeReason: triage.callTypeReason,
    callTypeEvidence,
    notScoreableReason: triage.notScoreableReason,
    speakers: triage.speakers,
    repName: unmasked(triage.repName),
    customerName: unmasked(triage.customerName),
    companyName: triage.companyName,
    direction: triage.direction,
    customerStatus: triage.customerStatus,
    summary: triage.summary,
    outcome: { ...triage.outcome, evidence: outcomeEvidence },
    details: triage.details,
    objections,
    followUps,
    opportunities,
    risks,
    sentiment: triage.sentiment,
    scorecard,
    coaching,
    money: moneyFor(triage),
    quality: {
      needsReview: reasons.length > 0,
      reasons: [...new Set(reasons)],
      evidenceChecked: v.checked,
      evidenceVerified: v.verified,
      transcriptConfidence: transcript.confidence,
    },
    usage,
    raw: { triage, scoring },
  };
}

const PERIODS_PER_YEAR = { monthly: 12, "bi-monthly": 6, quarterly: 4, annual: 1, "one-time": 0 } as const;

export function moneyFor(triage: Pick<Triage, "callType" | "outcome" | "details">): Money {
  const direction = moneyDirection(triage.callType, triage.outcome.result);
  if (!direction) return { annualValue: null, basis: null, direction: null };

  const p = triage.details.pricing;
  let quoted: number | null = null;
  if (p.recurringPrice && p.recurringFrequency) {
    const recurring = p.recurringPrice * PERIODS_PER_YEAR[p.recurringFrequency];
    quoted = recurring + (triage.callType === "new_customer" ? (p.initialPrice ?? 0) : 0);
  } else if (p.initialPrice && triage.callType === "new_customer") {
    quoted = p.initialPrice;
  }
  if (quoted && quoted > 0) return { annualValue: Math.round(quoted), basis: "quoted", direction };
  return { annualValue: DEFAULT_ANNUAL_VALUE, basis: "estimated", direction };
}

function moneyDirection(type: CallType, result: Outcome): Money["direction"] {
  if (type === "new_customer") {
    if (result === "booked") return "won";
    if (result === "lost") return "lost";
    if (result === "follow_up" || result === "unresolved") return "at_risk";
  }
  if (type === "retention" || result === "cancelled") {
    if (result === "saved") return "saved";
    if (result === "cancelled") return "lost";
    if (result === "follow_up" || result === "unresolved") return "at_risk";
  }
  return null;
}

function emptyTriage(): Triage {
  return {
    speakers: [],
    repName: null,
    customerName: null,
    companyName: null,
    direction: "unknown",
    callType: "not_scoreable",
    callTypeConfidence: "high",
    callTypeReason: "No speech was detected in the recording.",
    callTypeEvidence: [],
    notScoreableReason: "dropped_or_too_short",
    customerStatus: "unknown",
    summary: "The recording contains no detectable speech.",
    outcome: { result: "no_conversation", headline: "No speech in recording", evidence: [] },
    details: {
      pests: [],
      serviceDiscussed: null,
      property: null,
      appointment: null,
      pricing: { anchorPrice: null, initialPrice: null, recurringPrice: null, recurringFrequency: null, notes: null },
      cancellationReason: null,
      saveOffer: null,
      competitor: null,
    },
    objections: [],
    followUps: [],
    opportunities: [],
    risks: [],
    sentiment: { start: "neutral", end: "neutral", note: "" },
  };
}

/** Masked placeholders like "[NAME]" are not names. */
function unmasked(name: string | null) {
  return name && !/\[[A-Z_]+\]/.test(name) ? name : null;
}

function add(a: Usage, b: Usage) {
  a.inputTokens += b.inputTokens;
  a.outputTokens += b.outputTokens;
  a.durationMs += b.durationMs;
}

export { PROMPT_VERSION };
