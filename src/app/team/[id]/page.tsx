import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeft, CircleCheck, MessageSquareQuote, Target } from "lucide-react";
import { CallTypeBadge, OutcomeBadge, ScorePill } from "@/components/call-badges";
import { SparkBars } from "@/components/sparkbars";
import { Avatar, Card, CardHeader, Page, SectionTitle, Skeleton } from "@/components/ui";
import { SCORECARDS } from "@/lib/analysis/rubrics";
import { buildTeam } from "@/lib/insights";
import { completedCalls } from "@/lib/queries";
import { cn, formatDuration, formatPct, pctTone, plural } from "@/lib/utils";

export default function RepPage(props: PageProps<"/team/[id]">) {
  return (
    <Page>
      <Suspense fallback={<Skeleton className="h-[600px] rounded-2xl" />}>
        <Rep params={props.params} />
      </Suspense>
    </Page>
  );
}

const STANDARD = new Map(Object.values(SCORECARDS).flatMap((c) => c.items.map((i) => [i.id, i.standard] as const)));

async function Rep({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const calls = await completedCalls();
  const team = buildTeam(calls);
  const r = team.find((t) => t.id === id);
  if (!r) notFound();
  const mine = calls
    .filter((c) => (c.rep?.id ?? "unidentified") === id)
    .sort((a, b) => a.call.label.localeCompare(b.call.label, undefined, { numeric: true }));
  const rank = team.filter((t) => t.avgPct !== null).findIndex((t) => t.id === id) + 1;

  const plan = r.missed.slice(0, 3).map((m) => ({
    ...m,
    standard: STANDARD.get(m.itemId) ?? "",
    lines: r.coachingLines.filter((l) => l.itemId === m.itemId).slice(0, 2),
  }));

  return (
    <>
      <Link href="/team" className="inline-flex items-center gap-0.5 text-[13px] text-blue hover:underline">
        <ChevronLeft className="size-4" /> Coaching
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={r.name === "Unidentified" ? null : r.name} size={56} />
        <div>
          <h1 className="font-display text-[28px] font-semibold tracking-[-0.02em]">{r.name}</h1>
          <p className="text-[13.5px] text-ink-3 capitalize">
            {r.id === "unidentified" ? "Calls where the rep's name wasn't said" : r.role} · {plural(r.calls, "call")}
            {rank > 0 ? ` · #${rank} on the team` : ""}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-3">Average score</div>
          <div className={cn("mt-1 font-display text-[30px] font-semibold tabular", pctTone(r.avgPct))}>{formatPct(r.avgPct)}</div>
          <div className="mt-1 text-[12px] text-ink-3">{plural(r.graded, "graded call")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-3">Grades</div>
          <div className="mt-2 flex gap-1.5 text-[13px] font-semibold tabular">
            <span className="rounded-full bg-gold-soft px-2 py-0.5 text-gold-ink">{r.grades.gold} Gold</span>
            <span className="rounded-full bg-green-soft px-2 py-0.5 text-green-ink">{r.grades.green} Green</span>
            <span className="rounded-full bg-red-soft px-2 py-0.5 text-red-ink">{r.grades.below} Below</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-3">Results</div>
          <div className="mt-1.5 text-[14px] text-ink">
            {r.sales.calls ? <div>{r.sales.booked}/{r.sales.calls} new customers booked</div> : null}
            {r.retention.calls ? <div>{r.retention.saved}/{r.retention.calls} cancellations saved</div> : null}
            {!r.sales.calls && !r.retention.calls && <span className="text-ink-3">Service calls only</span>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[12.5px] font-medium text-ink-3">Score by call</div>
          <div className="mt-2">
            <SparkBars points={r.history} height={40} linked />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Coaching plan"
              subtitle="The steps to practice, in order, with lines written from this rep's own calls"
              icon={
                <span className="grid size-7 place-items-center rounded-[9px] bg-violet-soft text-violet">
                  <Target className="size-4" />
                </span>
              }
            />
            <div className="space-y-3 px-5 pb-5">
              {plan.length === 0 && <p className="text-[13.5px] text-green-ink">Hitting every scorecard step. Use their calls as examples for the team.</p>}
              {plan.map((p, i) => (
                <div key={p.itemId} className="rounded-[14px] border border-hairline p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold">{i + 1}</span>
                      <div>
                        <div className="text-[14.5px] font-semibold">{p.label}</div>
                        <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{p.standard}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[12.5px] font-medium text-red-ink tabular">
                      missed {p.missed}/{p.of}
                    </span>
                  </div>
                  {p.lines.map((l, j) => (
                    <Link key={j} href={`/calls/${l.callId}`} className="mt-3 ml-[34px] flex gap-2 rounded-[12px] bg-blue-soft/70 p-3 hover:bg-blue-soft">
                      <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-blue" />
                      <div>
                        <p className="text-[13px] leading-relaxed text-ink">“{l.tryThis}”</p>
                        <div className="mt-1 text-[11.5px] text-blue-ink">{l.callLabel} · {l.title} →</div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Calls" subtitle={plural(mine.length, "call")} />
            <ul className="divide-y divide-hairline/80 border-t border-hairline/80">
              {mine.map((c) => (
                <li key={c.call.id}>
                  <Link href={`/calls/${c.call.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sunken/60">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold">
                        {c.call.label}
                        {c.analysis.customerName ? <span className="font-normal text-ink-2"> · {c.analysis.customerName}</span> : null}
                      </div>
                      <div className="truncate text-[12.5px] text-ink-3">{c.analysis.outcome.headline}</div>
                    </div>
                    <CallTypeBadge type={c.analysis.callType} />
                    <OutcomeBadge outcome={c.analysis.outcome.result} />
                    <ScorePill value={c.analysis.scorecard} />
                    <span className="w-10 text-right text-[12.5px] text-ink-3 tabular">{formatDuration(c.call.durationSec)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader title="Strengths" subtitle="Steps hit on every call" />
          <div className="px-5 pb-5">
            {r.strengths.length === 0 ? (
              <p className="text-[13px] text-ink-3">No step hit on every call yet.</p>
            ) : (
              <ul className="space-y-2">
                {r.strengths.map((s) => (
                  <li key={s.itemId} className="flex items-center gap-2 text-[13.5px]">
                    <CircleCheck className="size-4 text-green" />
                    <span className="flex-1">{s.label}</span>
                    <span className="text-[12px] text-ink-3 tabular">
                      {s.met}/{s.of}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {r.missed.length > 3 && (
              <>
                <SectionTitle className="mt-5 mb-2">Also missed</SectionTitle>
                <ul className="space-y-1.5">
                  {r.missed.slice(3, 9).map((m) => (
                    <li key={m.itemId} className="flex justify-between text-[13px] text-ink-2">
                      <span>{m.label}</span>
                      <span className="text-ink-3 tabular">
                        {m.missed}/{m.of}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
