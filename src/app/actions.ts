"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { CALL_TYPES, type CallType } from "@/lib/analysis/taxonomy";
import { getDb, schema } from "@/lib/db";
import { enqueue, newId, rescoreCall } from "@/lib/pipeline";

const { tasks, overrides, calls } = schema;

function refreshAll() {
  revalidatePath("/", "layout");
}

export async function assignTask(input: {
  sourceKey: string;
  kind: string;
  title: string;
  detail: string;
  assignee: string;
  priority: "high" | "medium" | "low";
  callId: string | null;
}) {
  const db = await getDb();
  await db
    .insert(tasks)
    .values({ id: newId(), ...input, assignee: input.assignee.trim() || "Unassigned" })
    .onConflictDoUpdate({ target: tasks.sourceKey, set: { assignee: input.assignee, status: "open", completedAt: null } });
  refreshAll();
}

export async function setTaskStatus(taskId: string, done: boolean) {
  const db = await getDb();
  await db
    .update(tasks)
    .set({ status: done ? "done" : "open", completedAt: done ? new Date() : null })
    .where(eq(tasks.id, taskId));
  refreshAll();
}

export async function deleteTask(taskId: string) {
  const db = await getDb();
  await db.delete(tasks).where(eq(tasks.id, taskId));
  refreshAll();
}

/** credit: true = award, false = withhold, null = back to the AI's judgement. */
export async function overrideItem(callId: string, itemId: string, credit: boolean | null) {
  const db = await getDb();
  const field = `item:${itemId}`;
  await db.delete(overrides).where(and(eq(overrides.callId, callId), eq(overrides.field, field)));
  if (credit !== null) {
    await db.insert(overrides).values({ id: newId(), callId, field, value: credit ? "credit" : "no_credit" });
  }
  await rescoreCall(callId);
  refreshAll();
}

export async function overrideCallType(callId: string, callType: CallType | null) {
  if (callType && !(CALL_TYPES as readonly string[]).includes(callType)) throw new Error("Unknown call type");
  const db = await getDb();
  await db.delete(overrides).where(and(eq(overrides.callId, callId), eq(overrides.field, "callType")));
  // Item overrides belong to the old scorecard.
  if (callType) {
    const rows = await db.select().from(overrides).where(eq(overrides.callId, callId));
    for (const r of rows) if (r.field.startsWith("item:")) await db.delete(overrides).where(eq(overrides.id, r.id));
    await db.insert(overrides).values({ id: newId(), callId, field: "callType", value: callType });
  }
  await rescoreCall(callId);
  refreshAll();
}

export async function reprocessCall(callId: string, retranscribe = false) {
  const db = await getDb();
  await db.update(calls).set({ status: "queued", error: null, stageStartedAt: new Date() }).where(eq(calls.id, callId));
  after(() => enqueue(callId, { retranscribe }));
  refreshAll();
}

export async function deleteCall(callId: string) {
  const db = await getDb();
  await db.delete(calls).where(eq(calls.id, callId));
  refreshAll();
}
