import fs from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { analyzeTranscript, type Overrides } from "@/lib/analysis/analyze";
import { CALL_TYPES, type CallType } from "@/lib/analysis/taxonomy";
import type { CallAnalysis } from "@/lib/analysis/types";
import { getDb, schema } from "@/lib/db";
import type { CallStatus } from "@/lib/db/schema";
import { getRoster } from "@/lib/roster";
import { readAudio, saveAudio } from "@/lib/storage";
import { transcribeAudio } from "@/lib/transcription/deepgram";
import type { Transcript } from "@/lib/transcription/types";

const { calls, transcripts, analyses, reps, overrides } = schema;
export const newId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

/** A stage that hasn't progressed in this long is treated as failed (e.g. the server restarted mid-job). */
export const STALL_MS = 15 * 60 * 1000;

const AUDIO_MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",
  ".ogg": "audio/ogg",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
};

export function mimeFor(filename: string, fallback?: string) {
  return AUDIO_MIME[path.extname(filename).toLowerCase()] ?? fallback ?? "application/octet-stream";
}

/** "CALL 007.mp3" -> "CALL-007"; anything else keeps its file name. */
export function labelFor(filename: string) {
  const base = path.basename(filename, path.extname(filename)).trim();
  const m = /^call[\s_-]*(\d+)$/i.exec(base);
  return m ? `CALL-${m[1].padStart(3, "0")}` : base;
}

/** Register a recording. Pass `data` to store it, or `storedKey` when it is already in Blob storage. */
export async function createCall(
  input: { filename: string; mime?: string } & ({ data: Buffer } | { storedKey: string; bytes: number }),
) {
  const db = await getDb();
  const id = newId();
  const mime = mimeFor(input.filename, input.mime);
  const audioKey =
    "data" in input
      ? await saveAudio(`${id}${path.extname(input.filename).toLowerCase() || ".mp3"}`, input.data, mime)
      : input.storedKey;
  await db.insert(calls).values({
    id,
    label: labelFor(input.filename),
    sourceFilename: input.filename,
    audioKey,
    audioMime: mime,
    audioBytes: "data" in input ? input.data.length : input.bytes,
    status: "queued",
    stageStartedAt: new Date(),
  });
  return id;
}

async function setStage(id: string, status: CallStatus, extra: Partial<typeof calls.$inferInsert> = {}) {
  const db = await getDb();
  await db
    .update(calls)
    .set({ status, stageStartedAt: new Date(), ...extra })
    .where(eq(calls.id, id));
}

/**
 * Pre-transcribed copies of the 20 sample recordings (made with the same Deepgram settings by
 * `npm run transcribe`) are reused in development so re-seeding doesn't pay for transcription again.
 */
async function cachedTranscript(label: string): Promise<Transcript | null> {
  if (process.env.NODE_ENV === "production") return null;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", "cache", "transcripts", `${label}.json`), "utf8");
    return JSON.parse(raw) as Transcript;
  } catch {
    return null;
  }
}

export async function loadOverrides(callId: string): Promise<Overrides> {
  const db = await getDb();
  const rows = await db.select().from(overrides).where(eq(overrides.callId, callId));
  const result: Overrides = {};
  for (const r of rows) {
    if (r.field === "callType" && (CALL_TYPES as readonly string[]).includes(r.value)) {
      result.callType = r.value as CallType;
    } else if (r.field.startsWith("item:")) {
      (result.items ??= {})[r.field.slice(5)] = r.value === "credit";
    }
  }
  return result;
}

/** Transcribe (if needed) and analyze a call, recording progress on the call row. */
export async function processCall(id: string, opts: { retranscribe?: boolean } = {}) {
  const db = await getDb();
  const [call] = await db.select().from(calls).where(eq(calls.id, id));
  if (!call) throw new Error(`Call ${id} not found`);

  try {
    let transcript: Transcript | undefined;
    if (!opts.retranscribe) {
      const [row] = await db.select().from(transcripts).where(eq(transcripts.callId, id));
      transcript = row?.data;
    }
    if (!transcript) {
      await setStage(id, "transcribing", { error: null });
      const cached = opts.retranscribe ? null : await cachedTranscript(call.label);
      transcript = cached ?? (await transcribeAudio(await readAudio(call.audioKey), call.audioMime, await getRoster()));
      await db.delete(transcripts).where(eq(transcripts.callId, id));
      await db.insert(transcripts).values({
        callId: id,
        provider: transcript.provider,
        model: transcript.model,
        data: transcript,
      });
      await db
        .update(calls)
        .set({ durationSec: transcript.durationSec, transcriptSource: cached ? "cache" : "deepgram" })
        .where(eq(calls.id, id));
    }

    await setStage(id, "analyzing", { error: null });
    const result = await analyzeTranscript(transcript, await loadOverrides(id));
    if (result.transcript !== transcript) {
      // Speaker labels were repaired; keep the corrected transcript so the UI matches the analysis.
      await db.update(transcripts).set({ data: result.transcript }).where(eq(transcripts.callId, id));
    }
    await saveAnalysis(id, result.analysis);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] call ${id} failed:`, err);
    await setStage(id, "failed", { error: message.slice(0, 500) });
  }
}

/**
 * Re-apply manager overrides. Item overrides only re-total the score; a call type change
 * re-runs the scoring pass against the new scorecard (triage is reused).
 */
export async function rescoreCall(id: string) {
  const db = await getDb();
  const [[t], [current]] = await Promise.all([
    db.select().from(transcripts).where(eq(transcripts.callId, id)),
    db.select().from(analyses).where(and(eq(analyses.callId, id), eq(analyses.isCurrent, true))),
  ]);
  if (!t || !current) throw new Error("Call has not been analyzed yet");
  const ov = await loadOverrides(id);
  const sameType = !ov.callType || ov.callType === current.data.raw.triage.callType;
  const { analysis } = await analyzeTranscript(t.data, ov, {
    triage: current.data.raw.triage,
    scoring: sameType ? current.data.raw.scoring : undefined,
  });
  // Keep the original model + usage figures when nothing was re-generated.
  if (!analysis.model) {
    analysis.model = current.data.model;
    analysis.usage = current.data.usage;
  }
  await saveAnalysis(id, analysis);
}

/**
 * Register a call that was already transcribed and analyzed by the same engine offline
 * (`npm run transcribe` + `npm run analyze`), so seeding the demo doesn't pay for it twice.
 */
export async function importAnalyzedCall(
  input: { filename: string; transcript: Transcript; analysis: CallAnalysis } & (
    | { data: Buffer }
    | { stored: { key: string; bytes: number } }
  ),
) {
  const db = await getDb();
  const id = await createCall(
    "data" in input
      ? { filename: input.filename, data: input.data }
      : { filename: input.filename, storedKey: input.stored.key, bytes: input.stored.bytes },
  );
  await db.insert(transcripts).values({
    callId: id,
    provider: input.transcript.provider,
    model: input.transcript.model,
    data: input.transcript,
  });
  await db
    .update(calls)
    .set({ durationSec: input.transcript.durationSec, transcriptSource: "deepgram" })
    .where(eq(calls.id, id));
  await saveAnalysis(id, input.analysis);
  return id;
}

async function saveAnalysis(id: string, analysis: CallAnalysis) {
  const db = await getDb();
  const repId = analysis.repName ? await upsertRep(analysis.repName, analysis.callType) : null;
  await db.update(analyses).set({ isCurrent: false }).where(eq(analyses.callId, id));
  await db.insert(analyses).values({
    id: newId(),
    callId: id,
    isCurrent: true,
    model: analysis.model,
    promptVersion: analysis.promptVersion,
    callType: analysis.callType,
    scorecardId: analysis.scorecard?.id ?? null,
    score: analysis.scorecard?.score ?? null,
    maxScore: analysis.scorecard?.max ?? null,
    grade: analysis.scorecard?.grade ?? null,
    outcome: analysis.outcome.result,
    needsReview: analysis.quality.needsReview,
    data: analysis,
    inputTokens: analysis.usage.inputTokens,
    outputTokens: analysis.usage.outputTokens,
    durationMs: analysis.usage.durationMs,
  });
  await db
    .update(calls)
    .set({
      status: "complete",
      error: null,
      repId,
      direction: analysis.direction,
      processedAt: new Date(),
      stageStartedAt: null,
    })
    .where(eq(calls.id, id));
}

async function upsertRep(name: string, callType: CallType) {
  const db = await getDb();
  const clean = name.trim().split(/\s+/)[0];
  const display = clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
  const id = display.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const role = callType === "new_customer" ? "sales" : "office";
  await db.insert(reps).values({ id, name: display, role }).onConflictDoNothing();
  return id;
}

// ---- background queue -------------------------------------------------------------

type QueueState = { running: number; waiting: (() => void)[] };
const g = globalThis as unknown as { __pestlaunchQueue?: QueueState };
const queue = (g.__pestlaunchQueue ??= { running: 0, waiting: [] });
const CONCURRENCY = 3;

/**
 * Process calls in the background, a few at a time so a bulk upload doesn't hit rate limits.
 * Returns a promise that settles when this call is done (used with `after()` on serverless).
 */
export function enqueue(id: string, opts?: { retranscribe?: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const run = async () => {
      queue.running++;
      try {
        await processCall(id, opts);
      } finally {
        queue.running--;
        resolve();
        queue.waiting.shift()?.();
      }
    };
    if (queue.running < CONCURRENCY) void run();
    else queue.waiting.push(() => void run());
  });
}
