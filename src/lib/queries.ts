import { and, desc, eq } from "drizzle-orm";
import { withCurrentRubric } from "@/lib/analysis/rubrics";
import type { CallAnalysis } from "@/lib/analysis/types";
import { getDb, schema } from "@/lib/db";
import type { CallRow, RepRow, TaskRow } from "@/lib/db/schema";
import { STALL_MS } from "@/lib/pipeline";
import type { Transcript } from "@/lib/transcription/types";

const { calls, analyses, reps, transcripts, tasks, overrides } = schema;

/** Stored analysis with step names/standards from the current rubric. */
function current(a: CallAnalysis | null | undefined): CallAnalysis | null {
  return a ? { ...a, scorecard: withCurrentRubric(a.scorecard) } : null;
}

export interface CallListItem {
  call: CallRow;
  rep: RepRow | null;
  analysis: CallAnalysis | null;
  stalled: boolean;
}

function isStalled(c: CallRow) {
  return (
    (c.status === "queued" || c.status === "transcribing" || c.status === "analyzing") &&
    !!c.stageStartedAt &&
    Date.now() - c.stageStartedAt.getTime() > STALL_MS
  );
}

/** Every call with its current analysis, newest first. Filtering happens in the UI (small data). */
export async function listCalls(): Promise<CallListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({ call: calls, rep: reps, analysis: analyses.data })
    .from(calls)
    .leftJoin(reps, eq(calls.repId, reps.id))
    .leftJoin(analyses, and(eq(analyses.callId, calls.id), eq(analyses.isCurrent, true)))
    .orderBy(desc(calls.createdAt), desc(calls.label));
  return rows.map((r) => ({ call: r.call, rep: r.rep, analysis: current(r.analysis), stalled: isStalled(r.call) }));
}

export async function completedCalls() {
  const all = await listCalls();
  return all.filter((c): c is CallListItem & { analysis: CallAnalysis } => c.analysis !== null);
}

export interface CallDetail extends CallListItem {
  transcript: Transcript | null;
  tasks: TaskRow[];
  overrideCount: number;
  previousCount: number;
}

export async function getCall(id: string): Promise<CallDetail | null> {
  const db = await getDb();
  const [row] = await db
    .select({ call: calls, rep: reps })
    .from(calls)
    .leftJoin(reps, eq(calls.repId, reps.id))
    .where(eq(calls.id, id));
  if (!row) return null;
  const [allAnalyses, [t], callTasks, ov] = await Promise.all([
    db.select().from(analyses).where(eq(analyses.callId, id)).orderBy(desc(analyses.createdAt)),
    db.select().from(transcripts).where(eq(transcripts.callId, id)),
    db.select().from(tasks).where(eq(tasks.callId, id)).orderBy(desc(tasks.createdAt)),
    db.select().from(overrides).where(eq(overrides.callId, id)),
  ]);
  const currentRow = allAnalyses.find((a) => a.isCurrent);
  return {
    call: row.call,
    rep: row.rep,
    analysis: current(currentRow?.data),
    stalled: isStalled(row.call),
    transcript: t?.data ?? null,
    tasks: callTasks,
    overrideCount: ov.length,
    previousCount: allAnalyses.length - (currentRow ? 1 : 0),
  };
}

export async function listTasks() {
  const db = await getDb();
  return db
    .select({ task: tasks, callLabel: calls.label })
    .from(tasks)
    .leftJoin(calls, eq(tasks.callId, calls.id))
    .orderBy(desc(tasks.createdAt));
}

export async function listReps() {
  const db = await getDb();
  return db.select().from(reps);
}
