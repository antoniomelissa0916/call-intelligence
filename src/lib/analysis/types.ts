import type { Grade, Quadrant, ScorecardId } from "./rubrics";
import type { ScoringResult, Triage } from "./schemas";
import type { CallType, Outcome } from "./taxonomy";

export type SpeakerRole = "rep" | "customer" | "other";

/** Evidence after it has been checked against the transcript. */
export interface Evidence {
  u: number;
  quote: string;
  start: number;
  end: number;
  role: SpeakerRole;
  /** True when the quote was found in the transcript (fuzzy, punctuation-insensitive). */
  verified: boolean;
}

export type ItemStatus = "met" | "missed" | "not_needed";

export interface ScoredItem {
  id: string;
  quadrant: Quadrant;
  label: string;
  standard: string;
  example: string;
  status: ItemStatus;
  /** Whether the point is awarded after evidence checks, auto-credit rules and manager overrides. */
  credited: boolean;
  /** Why the point was (not) awarded when it differs from the AI's raw call. */
  creditNote: string | null;
  reasoning: string;
  evidence: Evidence[];
  overridden: boolean;
}

export interface ScorecardResult {
  id: ScorecardId;
  name: string;
  source: string;
  items: ScoredItem[];
  score: number;
  max: number;
  grade: Grade;
  bands: { gold: number; green: number };
}

export interface Coaching {
  headline: string;
  strengths: { title: string; detail: string; evidence: Evidence | null }[];
  improvements: {
    itemId: string | null;
    title: string;
    whatHappened: string;
    impact: string;
    tryThis: string;
    evidence: Evidence | null;
  }[];
}

export interface Money {
  /** Estimated first-year value of the customer relationship discussed on the call. */
  annualValue: number | null;
  basis: "quoted" | "estimated" | null;
  /** How this call moved revenue: won/saved is positive, lost/cancelled is at risk. */
  direction: "won" | "saved" | "lost" | "at_risk" | null;
}

export interface QualityReport {
  needsReview: boolean;
  reasons: string[];
  evidenceChecked: number;
  evidenceVerified: number;
  transcriptConfidence: number;
}

type Located<T> = Omit<T, "evidence"> & { evidence: Evidence };
type LocatedNullable<T> = Omit<T, "evidence"> & { evidence: Evidence | null };

export interface CallAnalysis {
  promptVersion: string;
  model: string;
  callType: CallType;
  callTypeConfidence: "high" | "medium" | "low";
  callTypeReason: string;
  callTypeEvidence: Evidence[];
  notScoreableReason: Triage["notScoreableReason"];
  speakers: Triage["speakers"];
  repName: string | null;
  customerName: string | null;
  companyName: string | null;
  direction: Triage["direction"];
  customerStatus: Triage["customerStatus"];
  summary: string;
  outcome: { result: Outcome; headline: string; evidence: Evidence[] };
  details: Triage["details"];
  objections: Located<Triage["objections"][number]>[];
  followUps: Located<Triage["followUps"][number]>[];
  opportunities: LocatedNullable<Triage["opportunities"][number]>[];
  risks: Located<Triage["risks"][number]>[];
  sentiment: Triage["sentiment"];
  scorecard: ScorecardResult | null;
  coaching: Coaching | null;
  money: Money;
  quality: QualityReport;
  usage: { inputTokens: number; outputTokens: number; durationMs: number };
  /** The model's raw structured output, kept for audit and for re-scoring without re-running triage. */
  raw: { triage: Triage; scoring: ScoringResult | null };
}
