import { after } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { createCall, enqueue, mimeFor } from "@/lib/pipeline";
import { blobEnabled } from "@/lib/storage";

export const maxDuration = 300;

function isBlobUrl(url: string) {
  try {
    return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

const MAX_BYTES = 60 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|wav|m4a|mp4|ogg|webm|flac)$/i;

/**
 * Add calls for processing.
 * - multipart/form-data with one or more `files` (local/dev, small files), or
 * - JSON { uploads: [{ url, filename }] } for recordings already uploaded to Blob storage
 *   (production: the browser uploads straight to Blob, bypassing the 4.5 MB function body limit).
 */
export async function POST(request: Request) {
  const ids: string[] = [];
  const errors: string[] = [];
  const type = request.headers.get("content-type") ?? "";

  if (type.includes("multipart/form-data")) {
    const form = await request.formData();
    for (const entry of form.getAll("files")) {
      if (!(entry instanceof File)) continue;
      if (!AUDIO_EXT.test(entry.name)) {
        errors.push(`${entry.name}: not an audio file`);
        continue;
      }
      if (entry.size > MAX_BYTES) {
        errors.push(`${entry.name}: larger than 60 MB`);
        continue;
      }
      ids.push(await createCall({ filename: entry.name, data: Buffer.from(await entry.arrayBuffer()), mime: entry.type }));
    }
  } else {
    const body = (await request.json().catch(() => null)) as {
      uploads?: { url: string; filename: string; size: number }[];
    } | null;
    for (const u of body?.uploads ?? []) {
      if (!blobEnabled() || !isBlobUrl(u.url) || !AUDIO_EXT.test(u.filename)) {
        errors.push(`${u.filename}: invalid upload`);
        continue;
      }
      ids.push(await createCall({ filename: u.filename, storedKey: u.url, bytes: u.size, mime: mimeFor(u.filename) }));
    }
  }

  if (!ids.length) {
    return Response.json({ ids, errors: errors.length ? errors : ["No audio files received"] }, { status: 400 });
  }
  after(() => Promise.all(ids.map((id) => enqueue(id))));
  return Response.json({ ids, errors }, { status: 202 });
}

/** Lightweight status poll: GET /api/calls?ids=a,b,c */
export async function GET(request: Request) {
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 100);
  if (!ids.length) return Response.json({ calls: [] });
  const db = await getDb();
  const rows = await db
    .select({ id: schema.calls.id, label: schema.calls.label, status: schema.calls.status, error: schema.calls.error })
    .from(schema.calls)
    .where(inArray(schema.calls.id, ids));
  return Response.json({ calls: rows }, { headers: { "cache-control": "no-store" } });
}
