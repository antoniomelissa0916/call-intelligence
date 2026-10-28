import {
  ArrowRight,
  BadgeCheck,
  CircleCheck,
  CircleMinus,
  CircleX,
  Flag,
  Lightbulb,
  MessageSquareQuote,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { GRADE_LABEL } from "@/lib/analysis/rubrics";
import { CALL_TYPE_LABEL } from "@/lib/analysis/taxonomy";
import type { CallAnalysis, ScoredItem } from "@/lib/analysis/types";
import type { TaskRow } from "@/lib/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { AssignButton } from "../assign";
import { CallTypeBadge, GRADE_STYLE, OutcomeBadge, ScoreRing } from "../call-badges";
import { Badge, Card, CardHeader, SectionTitle } from "../ui";
import { ItemOverride } from "./controls";
import { EvidenceQuote, JumpTo } from "./evidence";

const NOT_SCOREABLE_TEXT: Record<string, string> = {
  voicemail: "This was a voicemail, so there is no conversation to grade.",
  wrong_number: "Wrong number — no customer conversation to grade.",
  spam_or_solicitation: "Spam or solicitation — not a customer call.",
  internal_or_vendor: "Internal or vendor call — not graded against customer scorecards.",
  dropped_or_too_short: "The call ended before the customer's need was discussed.",
  none: "This call isn't graded.",
};

const SENTIMENT = { positive: "😊 Positive", neutral: "😐 Neutral", negative: "😟 Negative" } as const;

export function Hero({ a }: { a: CallAnalysis }) {
  const sc = a.scorecard;
  const money = a.money;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start md:p-6">
        {sc ? (
          <div className="flex shrink-0 items-center gap-4 sm:w-[190px] sm:flex-col sm:items-start sm:gap-3">
            <ScoreRing score={sc.score} max={sc.max} grade={sc.grade} size={92} />
            <div>
              <div className={cn("text-[15px] font-semibold", GRADE_STYLE[sc.grade].text)}>{GRADE_LABEL[sc.grade]}</div>
              <div className="text-[12.5px] text-ink-3">{sc.name.replace(" (All Calls)", "")}</div>
              <div className="mt-1 text-[11.5px] text-ink-4">
                Gold {sc.bands.gold}/{sc.max} · Green {sc.bands.green}+
              </div>
            </div>
          </div>
        ) : (
          <div className="grid size-[92px] shrink-0 place-items-center rounded-full bg-sunken text-center text-[12px] font-medium text-ink-3">
            Not
            <br />
            graded
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeBadge outcome={a.outcome.result} />
            <CallTypeBadge type={a.callType} />
            {a.customerStatus === "new_prospect" && <Badge tone="neutral">New prospect</Badge>}
            {a.customerStatus === "existing_customer" && <Badge tone="neutral">Existing customer</Badge>}
          </div>
          <h2 className="mt-3 font-display text-[21px] leading-snug font-semibold tracking-[-0.01em] text-ink">{a.outcome.headline}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{a.summary}</p>
          {!sc && <p className="mt-2 text-[13px] text-ink-3">{NOT_SCOREABLE_TEXT[a.notScoreableReason] ?? NOT_SCOREABLE_TEXT.none}</p>}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
            {money.direction && money.annualValue != null && (
              <span className={cn("font-medium", money.direction === "won" || money.direction === "saved" ? "text-green-ink" : "text-red-ink")}>
                {money.direction === "won" ? "Won" : money.direction === "saved" ? "Saved" : money.direction === "lost" ? "Lost" : "At risk"}{" "}
                {formatMoney(money.annualValue)}/yr
                <span className="font-normal text-ink-4"> · {money.basis === "quoted" ? "from prices quoted" : "estimate"}</span>
              </span>
            )}
            <span>
              Sentiment {SENTIMENT[a.sentiment.start]} <ArrowRight className="inline size-3" /> {SENTIMENT[a.sentiment.end]}
            </span>
            {a.outcome.evidence[0] && <JumpTo e={a.outcome.evidence[0]} label="Hear the outcome" />}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function TrustBar({ a, typeOverridden }: { a: CallAnalysis; typeOverridden: boolean }) {
  const q = a.quality;
  return (
    <div className="space-y-2">
      {q.needsReview && (
        <div className="flex items-start gap-2.5 rounded-[14px] border border-orange/30 bg-orange-soft px-4 py-3 text-[13px] text-orange-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            <span className="font-semibold">Worth a quick human check. </span>
            {q.reasons.join(" · ")}. Use <span className="font-medium">Review</span> to correct anything.
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-[12.5px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-green" />
          {q.evidenceVerified} of {q.evidenceChecked} cited quotes verified against the transcript
          <Link href="/scoring" className="ml-1 font-medium text-blue hover:underline">
            How scoring works
          </Link>
        </span>
        <span className="inline-flex items-center gap-1.5" title={a.callTypeReason}>
          <BadgeCheck className="size-3.5 text-blue" />
          {typeOverridden ? "Call type set by a manager" : `${CALL_TYPE_LABEL[a.callType]} · ${a.callTypeConfidence} confidence`}
          <span className="hidden text-ink-4 md:inline">— {a.callTypeReason}</span>
        </span>
      </div>
    </div>
  );
}

export function CoachingCard({ a }: { a: CallAnalysis }) {
  const c = a.coaching;
  if (!c) return null;
  return (
    <Card>
      <CardHeader
        title="Coaching"
        subtitle={a.repName ? `For ${a.repName}, from this call` : "From this call"}
        icon={
          <span className="grid size-7 place-items-center rounded-[9px] bg-violet-soft text-violet">
            <Sparkles className="size-4" />
          </span>
        }
      />
      <div className="px-5 pb-5">
        <div className="rounded-[14px] bg-gradient-to-br from-violet-soft to-blue-soft/60 px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <Target className="mt-0.5 size-4 shrink-0 text-violet" />
            <p className="text-[14.5px] leading-snug font-medium text-ink">{c.headline}</p>
          </div>
        </div>

        {c.improvements.length > 0 && (
          <div className="mt-5">
            <SectionTitle>Do this next time</SectionTitle>
            <ol className="mt-2.5 space-y-3">
              {c.improvements.map((imp, i) => (
                <li key={i} className="rounded-[14px] border border-hairline p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold text-ink-2">
                        {i + 1}
                      </span>
                      <div className="text-[14px] font-semibold text-ink">{imp.title}</div>
                    </div>
                    {imp.evidence && <JumpTo e={imp.evidence} />}
                  </div>
                  <div className="mt-2 space-y-1.5 pl-[34px] text-[13px] leading-relaxed text-ink-2">
                    <p>
                      <span className="text-ink-4">What happened · </span>
                      {imp.whatHappened}
                    </p>
                    <p>
                      <span className="text-ink-4">Why it matters · </span>
                      {imp.impact}
                    </p>
                  </div>
                  <div className="mt-3 ml-[34px] flex items-start gap-2 rounded-[12px] bg-blue-soft/70 px-3 py-2.5">
                    <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-blue" />
                    <div>
                      <div className="text-[11px] font-semibold tracking-wide text-blue-ink uppercase">Try saying</div>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-ink">“{imp.tryThis}”</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {c.strengths.length > 0 && (
          <div className="mt-5">
            <SectionTitle>What went well</SectionTitle>
            <ul className="mt-2.5 grid gap-2.5 md:grid-cols-2">
              {c.strengths.map((s, i) => (
                <li key={i} className="rounded-[14px] bg-green-soft/60 p-3.5">
                  <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-green-ink">
                    <CircleCheck className="size-4" />
                    {s.title}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{s.detail}</p>
                  {s.evidence && <EvidenceQuote e={s.evidence} className="mt-2 bg-surface/80" tone="good" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

export function ScorecardCard({ a, callId }: { a: CallAnalysis; callId: string }) {
  const sc = a.scorecard;
  if (!sc) return null;
  const quadrants = [...new Set(sc.items.map((i) => i.quadrant))];
  return (
    <Card>
      <CardHeader
        title="Scorecard"
        subtitle={`${sc.name} · from the ${sc.source}. Click any quote to hear it.`}
        action={
          <span className={cn("rounded-full px-2.5 py-1 text-[13px] font-semibold tabular", GRADE_STYLE[sc.grade].bg, GRADE_STYLE[sc.grade].text)}>
            {sc.score}/{sc.max}
          </span>
        }
      />
      <div className="space-y-5 px-5 pb-5">
        {quadrants.map((q) => {
          const items = sc.items.filter((i) => i.quadrant === q);
          const got = items.filter((i) => i.credited).length;
          return (
            <section key={q}>
              <div className="mb-1.5 flex items-center justify-between">
                <SectionTitle>{q}</SectionTitle>
                <span className="text-[12px] font-medium text-ink-3 tabular">
                  {got}/{items.length}
                </span>
              </div>
              <ul className="divide-y divide-hairline/70 rounded-[14px] border border-hairline">
                {items.map((it) => (
                  <ScoreItem key={it.id} it={it} callId={callId} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Card>
  );
}

function ScoreItem({ it, callId }: { it: ScoredItem; callId: string }) {
  const Icon = it.status === "not_needed" && it.credited ? CircleMinus : it.credited ? CircleCheck : CircleX;
  const color = it.status === "not_needed" && it.credited ? "text-ink-4" : it.credited ? "text-green" : "text-red";
  return (
    <li className="group px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 size-[18px] shrink-0", color)} strokeWidth={2.2} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13.5px] font-semibold text-ink">{it.label}</span>
              {it.status === "not_needed" && it.credited && <Badge tone="muted">Not needed · credited</Badge>}
              {it.overridden && <Badge tone="blue">Manager adjusted</Badge>}
            </div>
            <ItemOverride callId={callId} itemId={it.id} credited={it.credited} overridden={it.overridden} />
          </div>
          {it.status === "not_needed" && it.credited ? (
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{it.creditNote}</p>
          ) : (
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{it.reasoning}</p>
          )}
          {it.creditNote && !(it.status === "not_needed" && it.credited) && (
            <p className="mt-1 text-[12px] leading-relaxed text-orange-ink">{it.creditNote}</p>
          )}
          {it.evidence.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {it.evidence.slice(0, 2).map((e, i) => (
                <EvidenceQuote key={i} e={e} tone={it.credited ? "good" : "bad"} />
              ))}
            </div>
          )}
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[12px] text-ink-4 hover:text-ink-2">Standard &amp; example</summary>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{it.standard}</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3 italic">“{it.example}”</p>
          </details>
        </div>
      </div>
    </li>
  );
}

const RISK_LABEL: Record<string, string> = {
  churn: "Churn risk",
  complaint: "Complaint",
  technician_issue: "Technician issue",
  billing_dispute: "Billing dispute",
  damage_claim: "Damage claim",
  safety_concern: "Safety concern",
  bad_review_threat: "Bad review threat",
  escalation: "Escalation",
};
const OPP_LABEL: Record<string, string> = {
  upsell: "Upsell",
  cross_sell: "Add-on service",
  referral: "Referral",
  review: "Review request",
  booking: "Booking",
  save: "Save",
  prepay: "Annual prepay",
};

export function NextSteps({
  a,
  callId,
  callLabel,
  tasks,
  people,
}: {
  a: CallAnalysis;
  callId: string;
  callLabel: string;
  tasks: TaskRow[];
  people: string[];
}) {
  const followUps = a.followUps;
  const hasAny = followUps.length || a.risks.length || a.opportunities.length || a.objections.length;
  if (!hasAny) return null;
  const taskFor = (key: string) => tasks.find((t) => t.sourceKey === key) ?? null;
  const rep = a.repName ?? "Office team";
  return (
    <Card>
      <CardHeader title="Follow-ups & signals" subtitle="Promises made, risks and opportunities on this call" />
      <div className="space-y-5 px-5 pb-5">
        {followUps.length > 0 && (
          <section>
            <SectionTitle className="mb-2">Promised follow-ups</SectionTitle>
            <ul className="space-y-2">
              {followUps.map((f, i) => {
                const key = `promise:${callId}:${a.followUps.filter((x) => x.owner === "company").indexOf(f)}`;
                return (
                  <li key={i} className="flex items-start gap-3 rounded-[12px] border border-hairline p-3">
                    <Flag className={cn("mt-0.5 size-4 shrink-0", f.owner === "company" ? "text-orange" : "text-ink-4")} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-medium text-ink">{f.action}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                        <span>{f.owner === "company" ? "Company owes this" : "Customer will do this"}</span>
                        {f.due && <span>· {f.due}</span>}
                        <JumpTo e={f.evidence} />
                      </div>
                    </div>
                    {f.owner === "company" && (
                      <AssignButton
                        size="sm"
                        people={people}
                        task={taskFor(key)}
                        payload={{
                          sourceKey: key,
                          kind: "promise",
                          title: f.action,
                          detail: `Promised on ${callLabel}${f.due ? ` · due ${f.due}` : ""}`,
                          priority: "medium",
                          callId,
                          suggested: rep,
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {a.risks.length > 0 && (
          <section>
            <SectionTitle className="mb-2">Risks</SectionTitle>
            <ul className="space-y-2">
              {a.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-3 rounded-[12px] bg-red-soft/50 p-3">
                  <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", r.severity === "high" ? "text-red" : "text-orange")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium text-ink">{RISK_LABEL[r.type] ?? r.type}</span>
                      <Badge tone={r.severity === "high" ? "red" : r.severity === "medium" ? "orange" : "muted"}>{r.severity}</Badge>
                    </div>
                    <p className="mt-0.5 text-[13px] text-ink-2">{r.description}</p>
                    <EvidenceQuote e={r.evidence} className="mt-2 bg-surface/80" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {a.opportunities.length > 0 && (
          <section>
            <SectionTitle className="mb-2">Opportunities</SectionTitle>
            <ul className="grid gap-2 md:grid-cols-2">
              {a.opportunities.map((o, i) => (
                <li key={i} className={cn("rounded-[12px] p-3", o.captured ? "bg-green-soft/50" : "bg-sunken")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                      <Lightbulb className={cn("size-3.5", o.captured ? "text-green" : "text-orange")} />
                      {OPP_LABEL[o.type] ?? o.type}
                    </span>
                    <Badge tone={o.captured ? "green" : "orange"}>{o.captured ? "Captured" : "Missed"}</Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{o.description}</p>
                  {o.evidence && <div className="mt-1.5"><JumpTo e={o.evidence} /></div>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {a.objections.length > 0 && (
          <section>
            <SectionTitle className="mb-2">Objections</SectionTitle>
            <ul className="space-y-2">
              {a.objections.map((o, i) => (
                <li key={i} className="rounded-[12px] border border-hairline p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-medium text-ink capitalize">{o.type.replaceAll("_", " ")}</span>
                    <Badge tone={o.handling === "resolved" ? "green" : o.handling === "partially" ? "orange" : "red"}>
                      {o.handling === "resolved" ? "Handled" : o.handling === "partially" ? "Partly handled" : "Not addressed"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[13px] text-ink-2">{o.summary}</p>
                  <EvidenceQuote e={o.evidence} className="mt-2" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Card>
  );
}

export function DetailsCard({ a }: { a: CallAnalysis }) {
  const d = a.details;
  const p = d.pricing;
  const price = [
    p.anchorPrice != null && `Anchor ${formatMoney(p.anchorPrice)}`,
    p.initialPrice != null && `Initial ${formatMoney(p.initialPrice)}`,
    p.recurringPrice != null && `${formatMoney(p.recurringPrice)} ${p.recurringFrequency ?? ""}`.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const rows: [string, string | null][] = [
    ["Customer", a.customerName],
    ["Rep", a.repName],
    ["Company", a.companyName],
    ["Pests", d.pests.length ? d.pests.join(", ") : null],
    ["Service", d.serviceDiscussed],
    ["Property", d.property],
    ["Appointment", d.appointment],
    ["Pricing", price || p.notes],
    ["Cancel reason", d.cancellationReason],
    ["Save offer", d.saveOffer],
    ["Competitor", d.competitor],
    ["Direction", a.direction === "unknown" ? null : a.direction === "inbound" ? "Inbound" : "Outbound"],
  ];
  const shown = rows.filter(([, v]) => v);
  return (
    <Card>
      <CardHeader title="Call details" subtitle="Extracted from the conversation" />
      <dl className="grid grid-cols-1 gap-x-6 px-5 pb-5 sm:grid-cols-2">
        {shown.map(([k, v]) => (
          <div key={k} className="border-t border-hairline/70 py-2.5">
            <dt className="text-[11.5px] font-medium text-ink-4 uppercase tracking-wide">{k}</dt>
            <dd className="mt-0.5 text-[13.5px] text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
