/**
 * Turns individual call analyses into decisions for the owner: what needs action now,
 * who needs coaching on what, and where calls are breaking down across the team.
 * Everything here is deterministic arithmetic over the stored analyses.
 */
import { SCORECARDS, type Quadrant, type ScorecardId } from "@/lib/analysis/rubrics";
import { CALL_TYPE_LABEL } from "@/lib/analysis/taxonomy";
import type { CallAnalysis, Evidence } from "@/lib/analysis/types";
import type { CallRow, RepRow, TaskRow } from "@/lib/db/schema";

export interface AnalyzedCall {
  call: CallRow;
  rep: RepRow | null;
  analysis: CallAnalysis;
}

export type Priority = "high" | "medium" | "low";
export type InsightKind = "sales" | "winback" | "promise" | "risk" | "coaching" | "pattern" | "review";

export interface Insight {
  key: string;
  kind: InsightKind;
  priority: Priority;
  title: string;
  detail: string;
  /** Suggested owner of the task. */
  assignee: string;
  value: number | null;
  valueBasis: "quoted" | "estimated" | null;
  callId: string | null;
  callLabel: string | null;
  evidence: Evidence | null;
  task: TaskRow | null;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Follow-ups that someone has to actively do and can forget (vs. routine notes on the account). */
export const PROMISE_VERB =
  /\b(call (the )?(customer|them|her|him|back)|call back|callback|reach (back )?out|speak (with|to)|talk (to|with)|check with|let .{1,30} know|follow up with|send (over )?(the |a )?(service agreement|agreement|quote|estimate|invoice|preparation|prep|info|information|link|pricing|proof)|waive|refund|credit (the|their|back)|look into|move .{1,30} (up|sooner)|earlier (slot|availability|opening|appointment))/i;

const RISK_LABEL: Record<string, string> = {
  churn: "Churn risk",
  complaint: "Complaint",
  technician_issue: "Technician issue",
  billing_dispute: "Billing dispute",
  damage_claim: "Damage claim",
  safety_concern: "Safety concern",
  bad_review_threat: "Bad review threat",
  escalation: "Escalation requested",
};

const OPPORTUNITY_LABEL: Record<string, string> = {
  upsell: "Upsell",
  cross_sell: "Add-on service",
  referral: "Referral ask",
  review: "Review request",
  booking: "Booking",
  save: "Save",
  prepay: "Annual prepay",
};

function who(c: AnalyzedCall) {
  return c.analysis.customerName ?? "the caller";
}
function repName(c: AnalyzedCall) {
  return c.rep?.name ?? c.analysis.repName ?? "Office team";
}

export function buildInsights(calls: AnalyzedCall[], tasks: TaskRow[]): Insight[] {
  const taskByKey = new Map(tasks.map((t) => [t.sourceKey, t]));
  const out: Omit<Insight, "task">[] = [];

  for (const c of calls) {
    const a = c.analysis;
    const base = { callId: c.call.id, callLabel: c.call.label };
    const pests = a.details.pests.length ? a.details.pests.join(", ") : null;

    if (a.callType === "new_customer" && (a.money.direction === "lost" || a.money.direction === "at_risk")) {
      const objection = a.objections.find((o) => o.handling !== "resolved") ?? a.objections[0];
      out.push({
        ...base,
        key: `sales:${c.call.id}`,
        kind: "sales",
        priority: (a.money.annualValue ?? 0) >= 400 ? "high" : "medium",
        title: `Call back ${who(c)} — ${pests ? `${pests} quote` : "quote"} didn't book`,
        detail: objection
          ? `Stalled on ${objection.type.replaceAll("_", " ")}: ${objection.summary}`
          : a.outcome.headline,
        assignee: repName(c),
        value: a.money.annualValue,
        valueBasis: a.money.basis,
        evidence: objection?.evidence ?? a.outcome.evidence[0] ?? null,
      });
    }

    if (a.callType === "retention" || a.outcome.result === "cancelled") {
      if (a.outcome.result === "cancelled") {
        out.push({
          ...base,
          key: `winback:${c.call.id}`,
          kind: "winback",
          priority: "high",
          title: `Win back ${who(c)}, who cancelled`,
          detail: [
            a.details.cancellationReason ? `Reason: ${lower(a.details.cancellationReason)}.` : null,
            a.details.saveOffer ? `Offered: ${lower(a.details.saveOffer)}.` : "No save offer was made on the call.",
          ]
            .filter(Boolean)
            .join(" "),
          assignee: "Office Manager",
          value: a.money.annualValue,
          valueBasis: a.money.basis,
          evidence: a.outcome.evidence[0] ?? null,
        });
      } else if (a.money.direction === "at_risk") {
        out.push({
          ...base,
          key: `winback:${c.call.id}`,
          kind: "winback",
          priority: "high",
          title: `Finish the save with ${who(c)}`,
          detail: a.outcome.headline,
          assignee: repName(c),
          value: a.money.annualValue,
          valueBasis: a.money.basis,
          evidence: a.outcome.evidence[0] ?? null,
        });
      }
    }

    // Only commitments someone could forget reach the owner; routine visit/account notes stay on the call page.
    // (Keys keep the index among company follow-ups so they match the Assign buttons on the call page.)
    a.followUps
      .filter((f) => f.owner === "company")
      .forEach((f, i) => {
        if (!PROMISE_VERB.test(f.action)) return;
        out.push({
          ...base,
          key: `promise:${c.call.id}:${i}`,
          kind: "promise",
          priority: a.risks.some((r) => r.severity === "high") ? "high" : "medium",
          title: cap(f.action),
          detail: `Promised to ${who(c)} on ${c.call.label}${f.due ? ` · due ${f.due}` : ""}`,
          assignee: repName(c),
          value: null,
          valueBasis: null,
          evidence: f.evidence,
        });
      });

    a.risks
      .filter((r) => r.severity !== "low" && r.type !== "churn")
      .forEach((r, i) =>
        out.push({
          ...base,
          key: `risk:${c.call.id}:${i}`,
          kind: "risk",
          priority: r.severity === "high" ? "high" : "medium",
          title: `${RISK_LABEL[r.type] ?? "Risk"}: ${r.description}`,
          detail: `${CALL_TYPE_LABEL[a.callType]} call with ${who(c)}`,
          assignee: "Office Manager",
          value: null,
          valueBasis: null,
          evidence: r.evidence,
        }),
      );

    if (a.quality.needsReview) {
      out.push({
        ...base,
        key: `review:${c.call.id}`,
        kind: "review",
        priority: "low",
        title: `Double-check the AI result for ${c.call.label}`,
        detail: a.quality.reasons.join(" · "),
        assignee: "Office Manager",
        value: null,
        valueBasis: null,
        evidence: null,
      });
    }
  }

  // Coaching: each rep's most-missed step, when it's a real pattern.
  for (const rep of buildTeam(calls)) {
    const top = rep.missed[0];
    if (!top || rep.graded < 2 || top.missed / top.of < 0.5) continue;
    const latest = rep.coachingLines.find((l) => l.itemId === top.itemId);
    out.push({
      key: `coach:${rep.id}:${top.itemId}`,
      kind: "coaching",
      priority: rep.avgPct !== null && rep.avgPct < 0.8 ? "medium" : "low",
      title: `Coach ${rep.name} on “${top.label}”`,
      detail: `Missed on ${top.missed} of ${top.of} graded calls.${latest ? ` Try: “${latest.tryThis}”` : ""}`,
      assignee: "Manager",
      value: null,
      valueBasis: null,
      callId: latest?.callId ?? null,
      callLabel: latest?.callLabel ?? null,
      evidence: null,
    });
  }

  // Team-wide missed opportunity patterns.
  const opp = new Map<string, { missed: number; of: number }>();
  for (const c of calls) {
    for (const o of c.analysis.opportunities) {
      const s = opp.get(o.type) ?? { missed: 0, of: 0 };
      s.of++;
      if (!o.captured) s.missed++;
      opp.set(o.type, s);
    }
  }
  for (const [type, s] of opp) {
    if (s.missed < 2) continue;
    out.push({
      key: `pattern:${type}`,
      kind: "pattern",
      priority: s.missed >= 4 ? "medium" : "low",
      title: `${OPPORTUNITY_LABEL[type] ?? type} missed on ${s.missed} of ${s.of} calls where it fit`,
      detail: "Make it part of next team meeting's call review.",
      assignee: "Manager",
      value: null,
      valueBasis: null,
      callId: null,
      callLabel: null,
      evidence: null,
    });
  }

  return out
    .map((i) => ({ ...i, task: taskByKey.get(i.key) ?? null }))
    .sort(
      (x, y) =>
        Number(x.task?.status === "done") - Number(y.task?.status === "done") ||
        PRIORITY_RANK[x.priority] - PRIORITY_RANK[y.priority] ||
        (y.value ?? 0) - (x.value ?? 0),
    );
}

// ---- team ------------------------------------------------------------------------

export interface RepStats {
  id: string;
  name: string;
  role: string;
  calls: number;
  graded: number;
  avgPct: number | null;
  grades: { gold: number; green: number; below: number };
  sales: { calls: number; booked: number };
  retention: { calls: number; saved: number };
  missed: { itemId: string; label: string; missed: number; of: number }[];
  strengths: { itemId: string; label: string; met: number; of: number }[];
  /** Score % of each graded call, oldest first. */
  history: { callId: string; label: string; pct: number }[];
  coachingLines: { itemId: string | null; tryThis: string; title: string; callId: string; callLabel: string }[];
}

export function pct(c: CallAnalysis) {
  return c.scorecard ? c.scorecard.score / c.scorecard.max : null;
}

export function buildTeam(calls: AnalyzedCall[]): RepStats[] {
  const byRep = new Map<string, AnalyzedCall[]>();
  for (const c of calls) {
    const id = c.rep?.id ?? "unidentified";
    byRep.set(id, [...(byRep.get(id) ?? []), c]);
  }
  const reps: RepStats[] = [];
  for (const [id, list] of byRep) {
    const ordered = [...list].sort((a, b) => a.call.label.localeCompare(b.call.label));
    const graded = ordered.filter((c) => c.analysis.scorecard);
    const items = new Map<string, { label: string; met: number; of: number }>();
    for (const c of graded) {
      for (const it of c.analysis.scorecard!.items) {
        if (it.status === "not_needed") continue;
        const s = items.get(it.id) ?? { label: it.label, met: 0, of: 0 };
        s.of++;
        if (it.credited) s.met++;
        items.set(it.id, s);
      }
    }
    const entries = [...items.entries()];
    const first = ordered[0];
    reps.push({
      id,
      name: first.rep?.name ?? "Unidentified",
      role: first.rep?.role ?? "office",
      calls: ordered.length,
      graded: graded.length,
      avgPct: graded.length ? graded.reduce((s, c) => s + pct(c.analysis)!, 0) / graded.length : null,
      grades: {
        gold: graded.filter((c) => c.analysis.scorecard!.grade === "gold").length,
        green: graded.filter((c) => c.analysis.scorecard!.grade === "green").length,
        below: graded.filter((c) => c.analysis.scorecard!.grade === "below").length,
      },
      sales: {
        calls: ordered.filter((c) => c.analysis.callType === "new_customer").length,
        booked: ordered.filter((c) => c.analysis.callType === "new_customer" && c.analysis.outcome.result === "booked").length,
      },
      retention: {
        calls: ordered.filter((c) => c.analysis.callType === "retention").length,
        saved: ordered.filter((c) => c.analysis.callType === "retention" && c.analysis.outcome.result === "saved").length,
      },
      missed: entries
        .map(([itemId, s]) => ({ itemId, label: s.label, missed: s.of - s.met, of: s.of }))
        .filter((s) => s.missed > 0)
        .sort((a, b) => b.missed / b.of - a.missed / a.of || b.missed - a.missed),
      strengths: entries
        .map(([itemId, s]) => ({ itemId, label: s.label, met: s.met, of: s.of }))
        .filter((s) => s.met === s.of && s.of >= 2)
        .sort((a, b) => b.of - a.of),
      history: graded.map((c) => ({ callId: c.call.id, label: c.call.label, pct: pct(c.analysis)! })),
      coachingLines: ordered
        .slice()
        .reverse()
        .flatMap((c) =>
          (c.analysis.coaching?.improvements ?? []).map((i) => ({
            itemId: i.itemId,
            tryThis: i.tryThis,
            title: i.title,
            callId: c.call.id,
            callLabel: c.call.label,
          })),
        ),
    });
  }
  return reps.sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1) || b.calls - a.calls);
}

// ---- where calls break down ------------------------------------------------------

export interface StepRate {
  itemId: string;
  label: string;
  quadrant: Quadrant;
  met: number;
  of: number;
}

export function stepRates(calls: AnalyzedCall[], scorecard: ScorecardId): StepRate[] {
  const card = SCORECARDS[scorecard];
  return card.items.map((item) => {
    let met = 0;
    let of = 0;
    for (const c of calls) {
      const sc = c.analysis.scorecard;
      if (sc?.id !== scorecard) continue;
      const it = sc.items.find((i) => i.id === item.id);
      if (!it || it.status === "not_needed") continue;
      of++;
      if (it.credited) met++;
    }
    return { itemId: item.id, label: item.label, quadrant: item.quadrant, met, of };
  });
}

// ---- headline numbers ------------------------------------------------------------

export function overviewStats(calls: AnalyzedCall[]) {
  const graded = calls.filter((c) => c.analysis.scorecard);
  const sales = calls.filter((c) => c.analysis.callType === "new_customer");
  const retention = calls.filter((c) => c.analysis.callType === "retention");
  const sum = (list: AnalyzedCall[], dir: string) =>
    list.filter((c) => c.analysis.money.direction === dir).reduce((s, c) => s + (c.analysis.money.annualValue ?? 0), 0);
  return {
    calls: calls.length,
    talkSeconds: calls.reduce((s, c) => s + (c.call.durationSec ?? 0), 0),
    graded: graded.length,
    avgPct: graded.length ? graded.reduce((s, c) => s + pct(c.analysis)!, 0) / graded.length : null,
    grades: {
      gold: graded.filter((c) => c.analysis.scorecard!.grade === "gold").length,
      green: graded.filter((c) => c.analysis.scorecard!.grade === "green").length,
      below: graded.filter((c) => c.analysis.scorecard!.grade === "below").length,
    },
    sales: { calls: sales.length, booked: sales.filter((c) => c.analysis.outcome.result === "booked").length },
    retention: { calls: retention.length, saved: retention.filter((c) => c.analysis.outcome.result === "saved").length },
    revenue: {
      won: sum(calls, "won"),
      saved: sum(calls, "saved"),
      lost: sum(calls, "lost"),
      atRisk: sum(calls, "at_risk"),
      anyEstimated: calls.some((c) => c.analysis.money.basis === "estimated"),
    },
    types: Object.entries(
      calls.reduce<Record<string, number>>((m, c) => ((m[c.analysis.callType] = (m[c.analysis.callType] ?? 0) + 1), m), {}),
    ).sort((a, b) => b[1] - a[1]),
    needsReview: calls.filter((c) => c.analysis.quality.needsReview).length,
  };
}

function lower(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, "");
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
