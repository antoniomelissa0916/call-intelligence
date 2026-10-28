import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, MessageSquareQuote, Users } from "lucide-react";
import { SparkBars } from "@/components/sparkbars";
import { Avatar, Card, CardHeader, EmptyState, Page, PageHeader, Skeleton } from "@/components/ui";
import { SCORECARDS } from "@/lib/analysis/rubrics";
import { buildTeam, stepRates } from "@/lib/insights";
import { completedCalls } from "@/lib/queries";
import { cn, formatPct, pctTone, plural } from "@/lib/utils";

export const metadata: Metadata = { title: "Coaching" };

const EXAMPLE = new Map(Object.values(SCORECARDS).flatMap((c) => c.items.map((i) => [i.id, i.example] as const)));

export default function TeamPage() {
  return (
    <Page>
      <PageHeader title="Coaching" subtitle="Who's following your call process, and the one thing each person should work on next." />
      <Suspense fallback={<Skeleton className="h-[480px] rounded-2xl" />}>
        <Team />
      </Suspense>
    </Page>
  );
}

async function Team() {
  await connection();
  const calls = await completedCalls();
  const team = buildTeam(calls);
  if (!team.length) {
    return (
      <Card>
        <EmptyState icon={<Users className="size-5" />} title="No graded calls yet">
          Once calls are processed, each rep&apos;s scores and coaching plan show up here.
        </EmptyState>
      </Card>
    );
  }

  // Team-wide weakest steps, with the best coaching line written for each.
  const gaps = (["service", "sales", "retention"] as const)
    .flatMap((id) => stepRates(calls, id).map((s) => ({ ...s, card: id })))
    .filter((s) => s.of >= 2 && s.met < s.of)
    .sort((a, b) => a.met / a.of - b.met / b.of)
    .slice(0, 3)
    .map((g) => {
      const line = calls
        .flatMap((c) => (c.analysis.coaching?.improvements ?? []).map((i) => ({ ...i, callId: c.call.id, label: c.call.label })))
        .find((i) => i.itemId === g.itemId);
      return { ...g, line };
    });

  return (
    <div className="space-y-5">
      <Card>
        <div className="hidden grid-cols-[minmax(0,1.3fr)_70px_90px_150px_110px_minmax(0,1.2fr)_120px_20px] gap-4 border-b border-hairline px-5 py-2.5 text-[11.5px] font-medium tracking-wide text-ink-4 uppercase lg:grid">
          <span>Rep</span>
          <span>Calls</span>
          <span>Score</span>
          <span>Gold · Green · Below</span>
          <span>Sales / saves</span>
          <span>Work on next</span>
          <span>Recent calls</span>
          <span />
        </div>
        <ul className="divide-y divide-hairline/80">
          {team.map((r, idx) => (
            <li key={r.id}>
              <Link
                href={`/team/${r.id}`}
                className="grid items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-sunken/60 lg:grid-cols-[minmax(0,1.3fr)_70px_90px_150px_110px_minmax(0,1.2fr)_120px_20px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-4 text-[12px] text-ink-4 tabular">{idx + 1}</span>
                  <Avatar name={r.name === "Unidentified" ? null : r.name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold">{r.name}</div>
                    <div className="text-[12px] text-ink-3 capitalize">{r.id === "unidentified" ? "Name not said on call" : r.role}</div>
                  </div>
                </div>
                <div className="text-[13.5px] text-ink-2 tabular">{r.calls}</div>
                <div className={cn("text-[17px] font-semibold tabular", pctTone(r.avgPct))}>{formatPct(r.avgPct)}</div>
                <div className="flex gap-1.5 text-[12px] font-medium tabular">
                  <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-gold-ink">{r.grades.gold} Gold</span>
                  <span className="rounded-full bg-green-soft px-1.5 py-0.5 text-green-ink">{r.grades.green}</span>
                  <span className="rounded-full bg-red-soft px-1.5 py-0.5 text-red-ink">{r.grades.below}</span>
                </div>
                <div className="text-[12.5px] text-ink-2">
                  {r.sales.calls ? `${r.sales.booked}/${r.sales.calls} booked` : null}
                  {r.sales.calls && r.retention.calls ? <br /> : null}
                  {r.retention.calls ? `${r.retention.saved}/${r.retention.calls} saved` : null}
                  {!r.sales.calls && !r.retention.calls ? <span className="text-ink-4">—</span> : null}
                </div>
                <div className="min-w-0 text-[13px]">
                  {r.missed[0] ? (
                    <>
                      <span className="font-medium text-ink">{r.missed[0].label}</span>
                      <span className="text-ink-3"> · missed {r.missed[0].missed}/{r.missed[0].of}</span>
                    </>
                  ) : (
                    <span className="text-green-ink">Hitting every step</span>
                  )}
                </div>
                <SparkBars points={r.history.slice(-12)} />
                <ChevronRight className="hidden size-4 text-ink-4 lg:block" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {gaps.length > 0 && (
        <Card>
          <CardHeader title="Team focus for the next call review" subtitle="The steps missed most often across everyone's graded calls" />
          <div className="grid gap-3 px-5 pb-5 md:grid-cols-3">
            {gaps.map((g) => (
              <div key={`${g.card}-${g.itemId}`} className="rounded-[14px] border border-hairline p-4">
                <div className="text-[12px] text-ink-3 capitalize">{g.card === "service" ? "All calls" : g.card} scorecard</div>
                <div className="mt-0.5 text-[15px] font-semibold">{g.label}</div>
                <div className="mt-1 text-[13px] text-red-ink">
                  Missed on {g.of - g.met} of {plural(g.of, "call")}
                </div>
                {g.line ? (
                  <Link href={`/calls/${g.line.callId}`} className="mt-3 flex gap-2 rounded-[12px] bg-blue-soft/70 p-3 hover:bg-blue-soft">
                    <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-blue" />
                    <div>
                      <p className="text-[13px] leading-relaxed text-ink">“{g.line.tryThis}”</p>
                      <div className="mt-1 text-[11.5px] text-blue-ink">From {g.line.label} →</div>
                    </div>
                  </Link>
                ) : (
                  <div className="mt-3 flex gap-2 rounded-[12px] bg-sunken p-3">
                    <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    <div>
                      <p className="text-[13px] leading-relaxed text-ink">“{EXAMPLE.get(g.itemId)}”</p>
                      <div className="mt-1 text-[11.5px] text-ink-3">Example from the call manual</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
