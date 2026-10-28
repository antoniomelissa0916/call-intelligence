import type { Grade } from "@/lib/analysis/rubrics";
import type { CallType, Outcome } from "@/lib/analysis/taxonomy";
import type { CallStatus } from "@/lib/db/schema";
import { PROMISE_VERB } from "@/lib/insights";
import type { CallListItem } from "@/lib/queries";

/** The slice of a call the list UI needs (keeps transcripts and raw model output off the client). */
export interface CallRowView {
  id: string;
  label: string;
  status: CallStatus;
  stalled: boolean;
  error: string | null;
  createdAt: string;
  durationSec: number | null;
  repName: string | null;
  customerName: string | null;
  callType: CallType | null;
  outcome: Outcome | null;
  headline: string | null;
  summary: string | null;
  score: { score: number; max: number; grade: Grade } | null;
  scorecardId: string | null;
  needsReview: boolean;
  risks: number;
  highRisk: boolean;
  followUps: number;
  money: { value: number | null; direction: string | null; basis: string | null };
  coachingHeadline: string | null;
}

export function toRowView({ call, rep, analysis: a, stalled }: CallListItem): CallRowView {
  return {
    id: call.id,
    label: call.label,
    status: call.status,
    stalled,
    error: call.error,
    createdAt: call.createdAt.toISOString(),
    durationSec: call.durationSec,
    repName: rep?.name ?? a?.repName ?? null,
    customerName: a?.customerName ?? null,
    callType: a?.callType ?? null,
    outcome: a?.outcome.result ?? null,
    headline: a?.outcome.headline ?? null,
    summary: a?.summary ?? null,
    score: a?.scorecard ? { score: a.scorecard.score, max: a.scorecard.max, grade: a.scorecard.grade } : null,
    scorecardId: a?.scorecard?.id ?? null,
    needsReview: a?.quality.needsReview ?? false,
    risks: a?.risks.length ?? 0,
    highRisk: a?.risks.some((r) => r.severity === "high") ?? false,
    followUps: a?.followUps.filter((f) => f.owner === "company" && PROMISE_VERB.test(f.action)).length ?? 0,
    money: { value: a?.money.annualValue ?? null, direction: a?.money.direction ?? null, basis: a?.money.basis ?? null },
    coachingHeadline: a?.coaching?.headline ?? null,
  };
}
