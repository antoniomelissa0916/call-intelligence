import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AudioLines, ChevronLeft, CircleAlert, Clock, Loader2 } from "lucide-react";
import { AutoRefresh, CallActions, RetryCall } from "@/components/call/controls";
import { PlayerProvider } from "@/components/call/player-context";
import { CoachingCard, DetailsCard, Hero, NextSteps, ScorecardCard, TrustBar } from "@/components/call/sections";
import { TranscriptPanel, type Marker } from "@/components/call/transcript-panel";
import { Avatar, Card, Page, Skeleton } from "@/components/ui";
import type { CallAnalysis } from "@/lib/analysis/types";
import { getCall, listReps } from "@/lib/queries";
import { formatDuration } from "@/lib/utils";

export default function CallPage(props: PageProps<"/calls/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <CallDetail params={props.params} />
    </Suspense>
  );
}

async function CallDetail({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [d, reps] = await Promise.all([getCall(id), listReps()]);
  if (!d) notFound();
  const { call, analysis: a, transcript } = d;
  const working = (call.status === "queued" || call.status === "transcribing" || call.status === "analyzing") && !d.stalled;
  const typeOverridden = !!a && a.callType !== a.raw.triage.callType;
  const people = reps.map((r) => r.name);

  const header = (
    <div className="mb-5">
      <Link href="/calls" className="inline-flex items-center gap-0.5 text-[13px] text-blue hover:underline">
        <ChevronLeft className="size-4" /> Calls
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] md:text-[30px]">
            {call.label}
            {a?.customerName && <span className="text-ink-3"> · {a.customerName}</span>}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
            {(d.rep?.name ?? a?.repName) && (
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={d.rep?.name ?? a?.repName} size={20} />
                {d.rep ? (
                  <Link href={`/team/${d.rep.id}`} className="hover:text-blue">
                    {d.rep.name}
                  </Link>
                ) : (
                  a?.repName
                )}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {formatDuration(call.durationSec)}
            </span>
            <span className="inline-flex items-center gap-1">
              <AudioLines className="size-3.5" /> {call.sourceFilename}
            </span>
          </div>
        </div>
        {a && <CallActions callId={call.id} callType={a.callType} typeOverridden={typeOverridden} />}
      </div>
    </div>
  );

  if (!a || !transcript) {
    return (
      <Page>
        <AutoRefresh active={working} />
        {header}
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          {working ? (
            <>
              <Loader2 className="size-7 animate-spin text-blue" />
              <div className="mt-4 text-[16px] font-semibold">
                {call.status === "queued" ? "Waiting to start…" : call.status === "transcribing" ? "Transcribing the recording…" : "Scoring the call and writing coaching…"}
              </div>
              <p className="mt-1 max-w-sm text-[13.5px] text-ink-3">
                Usually under two minutes. This page updates by itself.
              </p>
              <Steps status={call.status} />
            </>
          ) : (
            <>
              <CircleAlert className="size-7 text-red" />
              <div className="mt-4 text-[16px] font-semibold">{d.stalled ? "Processing stalled" : "We couldn't process this call"}</div>
              <p className="mt-1 max-w-md text-[13.5px] text-ink-3">{call.error ?? "The job stopped before finishing."}</p>
              <div className="mt-5">
                <RetryCall callId={call.id} />
              </div>
            </>
          )}
        </Card>
      </Page>
    );
  }

  const markers = buildMarkers(a);

  return (
    <PlayerProvider src={`/api/calls/${call.id}/audio`} initialDuration={call.durationSec ?? 0}>
      <AutoRefresh active={working} />
      <Page className="max-w-[1400px]">
        {header}
        {working && (
          <div className="mb-4 flex items-center gap-2 rounded-[12px] bg-blue-soft px-4 py-2.5 text-[13px] text-blue-ink">
            <Loader2 className="size-4 animate-spin" /> Re-analyzing… the results below will update when it finishes.
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="min-w-0 space-y-5">
            <Hero a={a} />
            <TrustBar a={a} typeOverridden={typeOverridden} />
            <div className="lg:hidden">
              <Card className="h-[70vh] overflow-hidden">
                <TranscriptPanel utterances={transcript.utterances} speakers={a.speakers} markers={markers} />
              </Card>
            </div>
            <CoachingCard a={a} />
            <ScorecardCard a={a} callId={call.id} />
            <NextSteps a={a} callId={call.id} callLabel={call.label} tasks={d.tasks} people={people} />
            <DetailsCard a={a} />
            <p className="px-1 pb-4 text-[11.5px] text-ink-4">
              Analyzed by {a.model} · prompt {a.promptVersion} · transcript {transcript.model}
              {call.transcriptSource === "cache" ? " (pre-transcribed sample)" : ""} · card numbers redacted
              {d.previousCount > 0 ? ` · ${d.previousCount} earlier version${d.previousCount > 1 ? "s" : ""} kept` : ""}
            </p>
          </div>
          <div className="hidden lg:block">
            <Card className="sticky top-6 h-[calc(100vh-48px)] overflow-hidden">
              <TranscriptPanel utterances={transcript.utterances} speakers={a.speakers} markers={markers} />
            </Card>
          </div>
        </div>
      </Page>
    </PlayerProvider>
  );
}

function buildMarkers(a: CallAnalysis): Marker[] {
  const out: Marker[] = [];
  for (const it of a.scorecard?.items ?? []) {
    if (it.status === "not_needed") continue;
    const e = it.evidence.find((x) => x.verified);
    if (e) out.push({ u: e.u, start: e.start, kind: it.credited ? "met" : "missed", label: `${it.label}: ${it.credited ? "done" : "missed"}` });
  }
  for (const r of a.risks) if (r.evidence.verified) out.push({ u: r.evidence.u, start: r.evidence.start, kind: "risk", label: r.description });
  const o = a.outcome.evidence.find((x) => x.verified);
  if (o) out.push({ u: o.u, start: o.start, kind: "moment", label: "Outcome" });
  return out;
}

function Steps({ status }: { status: string }) {
  const steps = [
    { id: "transcribing", label: "Transcribe" },
    { id: "analyzing", label: "Classify, score & coach" },
  ];
  const at = steps.findIndex((s) => s.id === status);
  return (
    <ol className="mt-6 flex items-center gap-3 text-[12.5px]">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className={
              i < at ? "grid size-5 place-items-center rounded-full bg-green text-white" : i === at ? "grid size-5 place-items-center rounded-full bg-blue text-white" : "grid size-5 place-items-center rounded-full bg-sunken text-ink-3"
            }
          >
            {i + 1}
          </span>
          <span className={i === at ? "font-medium text-ink" : "text-ink-3"}>{s.label}</span>
          {i < steps.length - 1 && <span className="h-px w-8 bg-hairline-strong" />}
        </li>
      ))}
    </ol>
  );
}

function DetailSkeleton() {
  return (
    <Page className="max-w-[1400px]">
      <Skeleton className="mb-3 h-4 w-16" />
      <Skeleton className="mb-6 h-8 w-72" />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
        <Skeleton className="hidden h-[70vh] rounded-2xl lg:block" />
      </div>
    </Page>
  );
}
