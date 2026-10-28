import type { Metadata } from "next";
import {
  AudioLines,
  CircleCheck,
  CircleMinus,
  FileSearch,
  ListChecks,
  LockKeyhole,
  Quote,
  ScanSearch,
  ShieldCheck,
  UserRoundCog,
} from "lucide-react";
import { Card, CardHeader, Page, PageHeader, SectionTitle } from "@/components/ui";
import { SCORECARDS } from "@/lib/analysis/rubrics";
import { cn } from "@/lib/utils";
import summary from "../../../data/eval/summary.json";

export const metadata: Metadata = { title: "How scoring works" };

const STEPS = [
  {
    icon: AudioLines,
    title: "Transcribe",
    body: "Deepgram Nova-3 separates the rep from the customer and timestamps every word. Card numbers are removed, including when a rep reads them back.",
  },
  {
    icon: LockKeyhole,
    title: "Protect customers",
    body: "Names, phone numbers, emails and street addresses are masked before anything is stored or sent to an AI model. Your team's names are kept.",
  },
  {
    icon: ScanSearch,
    title: "Understand the call",
    body: "The AI decides what kind of call it was, how it ended, and pulls out pests, prices, objections, promised follow-ups and risks.",
  },
  {
    icon: ListChecks,
    title: "Score against your scorecard",
    body: "Each step of the right scorecard is judged on its own, with the rep's exact words as evidence, and coaching is written in your manual's style.",
  },
  {
    icon: ShieldCheck,
    title: "Check the work",
    body: "Software matches every quoted line back to the transcript and applies the manual's point rules. Anything uncertain is flagged for a quick human check.",
  },
];

const POLICIES = [
  {
    icon: Quote,
    title: "Evidence or no point",
    body: "A step only earns its point when the rep's line is found in the transcript. If the AI says a step happened but its quote can't be matched, the point is withheld and the call is flagged.",
  },
  {
    icon: CircleMinus,
    title: "The manual's own credit rules",
    body: "If a sales customer raises no objection, the 4 objection points are awarded (Sales Call Manual). On retention calls, “Repeat” is credited when the first offer is accepted and the “teaser” when the customer is saved. These are enforced in code, not left to the AI.",
  },
  {
    icon: FileSearch,
    title: "The right scorecard for the call",
    body: "New-customer calls use the 17-point Sales scorecard, cancellations use the 12-point Retention scorecard, everything else uses the 12-point All Calls scorecard. Voicemails, wrong numbers and dropped calls aren't graded.",
  },
  {
    icon: UserRoundCog,
    title: "Managers have the last word",
    body: "Change the call type or award/remove any step from the call page. The score re-totals immediately and the correction is kept if the call is re-analyzed.",
  },
];

function pct(x: { ok: number; of: number }) {
  return x.of ? Math.round((x.ok / x.of) * 100) : 0;
}

export default function ScoringPage() {
  const c = summary.consistency;
  const metrics = [
    { label: "Call type matches a human reading", value: pct(summary.accuracy.callType), detail: `${summary.accuracy.callType.ok}/${summary.accuracy.callType.of} call analyses` },
    { label: "Outcome matches a human reading", value: pct(summary.accuracy.outcome), detail: `${summary.accuracy.outcome.ok}/${summary.accuracy.outcome.of}` },
    { label: "Rep identified correctly", value: pct(summary.accuracy.rep), detail: `${summary.accuracy.rep.ok}/${summary.accuracy.rep.of}` },
    { label: "Cited quotes found word-for-word", value: pct(summary.accuracy.quotesVerified), detail: `${summary.accuracy.quotesVerified.ok}/${summary.accuracy.quotesVerified.of} quotes` },
    ...(c
      ? [
          { label: "Same step credit when re-run", value: pct(c.steps), detail: `${c.steps.ok}/${c.steps.of} steps · avg ±${c.scoreSpreadAvg} pts` },
        ]
      : []),
  ];

  return (
    <Page className="max-w-[1100px]">
      <PageHeader
        title="How scoring works"
        subtitle="What happens to every call, the rules behind each point, and how accurate it is on real calls."
      />

      <Card className="mb-5">
        <CardHeader title="From recording to coaching" subtitle="About a minute per call" />
        <ol className="grid gap-3 px-5 pb-5 md:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[14px] bg-sunken/70 p-4">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-[9px] bg-surface text-blue shadow-sm">
                  <s.icon className="size-4" />
                </span>
                <span className="text-[11px] font-semibold text-ink-4">STEP {i + 1}</span>
              </div>
              <div className="mt-2.5 text-[14px] font-semibold">{s.title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{s.body}</p>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title="Measured on the 20 sample calls"
          subtitle={`Every call was read by a person and labeled by hand, then compared with ${summary.runs} independent AI runs (${summary.models.join(", ")}).`}
        />
        <div className="grid grid-cols-2 gap-3 px-5 pb-5 md:grid-cols-5">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-[14px] border border-hairline p-4">
              <div className={cn("font-display text-[30px] leading-none font-semibold tabular", m.value >= 95 ? "text-green-ink" : m.value >= 85 ? "text-orange-ink" : "text-red-ink")}>
                {m.value}%
              </div>
              <div className="mt-2 text-[12.5px] leading-snug font-medium text-ink-2">{m.label}</div>
              <div className="mt-1 text-[11.5px] text-ink-4">{m.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-5 grid gap-5 md:grid-cols-2">
        {POLICIES.map((p) => (
          <Card key={p.title} className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-blue-soft text-blue-ink">
                <p.icon className="size-4" />
              </span>
              <div>
                <div className="text-[14.5px] font-semibold">{p.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{p.body}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {Object.values(SCORECARDS).map((card) => {
          const quadrants = [...new Set(card.items.map((i) => i.quadrant))];
          return (
            <Card key={card.id} className="self-start">
              <CardHeader
                title={card.name.replace(" (All Calls)", "")}
                subtitle={`${card.items.length} points · Gold ${card.bands.gold} · Green ${card.bands.green}+ · from the ${card.source}`}
              />
              <div className="space-y-4 px-5 pb-5">
                {quadrants.map((q) => (
                  <div key={q}>
                    <SectionTitle className="mb-1.5">{q}</SectionTitle>
                    <ul className="space-y-1.5">
                      {card.items
                        .filter((i) => i.quadrant === q)
                        .map((i) => (
                          <li key={i.id} className="flex items-start gap-2 text-[13px] text-ink-2" title={i.standard}>
                            <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-ink-4" />
                            <span>
                              {i.label}
                              {i.creditWhenNotNeeded && <span className="text-ink-4"> · credited when not needed</span>}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="mt-5 px-1 text-[11.5px] text-ink-4">
        Measured {new Date(summary.generatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · prompt{" "}
        {summary.promptVersions.join(", ")} · run <code>npm run eval</code> to re-measure.
      </p>
    </Page>
  );
}
