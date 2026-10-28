import { buildTeam, stepRates, type AnalyzedCall, type Insight } from "@/lib/insights";
import { formatMoney } from "@/lib/utils";

export interface BriefLine {
  tone: "good" | "bad" | "neutral";
  text: string;
  href?: string;
}

/**
 * The owner's three-line read of the period, written from the numbers (not by the AI),
 * so every sentence is traceable to calls in the list.
 */
export function buildBrief(calls: AnalyzedCall[], insights: Insight[]): BriefLine[] {
  const lines: BriefLine[] = [];
  const sales = calls.filter((c) => c.analysis.callType === "new_customer");
  if (sales.length) {
    const booked = sales.filter((c) => c.analysis.outcome.result === "booked");
    const open = sales.filter((c) => c.analysis.money.direction === "lost" || c.analysis.money.direction === "at_risk");
    const openValue = open.reduce((s, c) => s + (c.analysis.money.annualValue ?? 0), 0);
    lines.push({
      tone: open.length > booked.length ? "bad" : "good",
      text:
        `Booked ${booked.length} of ${sales.length} new-customer calls` +
        (open.length
          ? `. ${open.length} didn't book — about ${formatMoney(openValue)}/yr is still winnable with a same-day callback.`
          : "."),
      href: "/calls?view=sales",
    });
  }

  const retention = calls.filter((c) => c.analysis.callType === "retention");
  if (retention.length) {
    const saved = retention.filter((c) => c.analysis.outcome.result === "saved");
    const lost = retention.filter((c) => c.analysis.outcome.result === "cancelled");
    const noOffer = lost.filter((c) => !c.analysis.details.saveOffer);
    lines.push({
      tone: saved.length >= lost.length ? "good" : "bad",
      text:
        `Saved ${saved.length} of ${retention.length} customers who called to cancel` +
        (noOffer.length ? `; ${noOffer.length} cancelled without being offered a save option.` : "."),
      href: "/calls?view=retention",
    });
  }

  const graded = calls.filter((c) => c.analysis.scorecard);

  // Referrals + "one-stop shop" are free revenue the Sales Manual asks for on every sales call.
  const finalInfo = stepRates(graded, "sales").find((s) => s.itemId === "final_info");
  const referralGap = finalInfo && finalInfo.of >= 3 && finalInfo.met / finalInfo.of < 0.5 ? finalInfo : null;
  if (referralGap) {
    lines.push({
      tone: "bad",
      text: `The referral program and "we handle every pest" weren't mentioned on ${referralGap.of - referralGap.met} of ${referralGap.of} sales calls. It's the cheapest revenue on the table: a one-line script change.`,
      href: "/team",
    });
  }

  const cards = ["service", "sales", "retention"] as const;
  let worst: { label: string; missed: number; of: number } | null = null;
  for (const id of cards) {
    for (const s of stepRates(graded, id)) {
      if (s.of < 3 || (referralGap && id === "sales" && s.itemId === "final_info")) continue;
      const missed = s.of - s.met;
      const rate = missed / s.of;
      const worstRate = worst ? worst.missed / worst.of : -1;
      // Ties go to the step seen on more calls.
      if (!worst || rate > worstRate || (rate === worstRate && s.of > worst.of)) worst = { label: s.label, missed, of: s.of };
    }
  }
  if (worst && worst.missed > 0) {
    lines.push({
      tone: "neutral",
      text: `Biggest process gap: “${worst.label}” was missed on ${worst.missed} of ${worst.of} graded calls. Make it the focus of the next call review.`,
      href: "/team",
    });
  }

  const promises = insights.filter((i) => i.kind === "promise" && i.priority !== "low" && !i.task);
  const risks = insights.filter((i) => i.kind === "risk" && i.priority === "high" && !i.task);
  if (promises.length || risks.length) {
    lines.push({
      tone: risks.length ? "bad" : "neutral",
      text: [
        promises.length ? `${promises.length} promised follow-up${promises.length > 1 ? "s" : ""} not yet assigned` : null,
        risks.length ? `${risks.length} high-risk call${risks.length > 1 ? "s" : ""} need a manager` : null,
      ]
        .filter(Boolean)
        .join(" and ")
        .concat("."),
    });
  }

  const team = buildTeam(calls).filter((r) => r.graded >= 2 && r.avgPct !== null);
  if (team.length >= 2) {
    const top = team[0];
    lines.push({
      tone: "good",
      text: `${top.name} leads the team at ${Math.round(top.avgPct! * 100)}% of steps hit across ${top.graded} graded calls.`,
      href: `/team/${top.id}`,
    });
  }
  return lines.slice(0, 4);
}
