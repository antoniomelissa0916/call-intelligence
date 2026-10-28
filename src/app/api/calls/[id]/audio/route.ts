import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { readAudio } from "@/lib/storage";

/** Streams a recording with HTTP Range support so the player can seek. */
export async function GET(request: Request, ctx: RouteContext<"/api/calls/[id]/audio">) {
  const { id } = await ctx.params;
  const db = await getDb();
  const [call] = await db.select().from(schema.calls).where(eq(schema.calls.id, id));
  if (!call) return new Response("Not found", { status: 404 });

  const data = await readAudio(call.audioKey);
  const size = data.length;
  const headers = {
    "content-type": call.audioMime,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  };

  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get("range") ?? "");
  if (!range) {
    return new Response(new Uint8Array(data), { headers: { ...headers, "content-length": String(size) } });
  }
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  return new Response(new Uint8Array(data.subarray(start, end + 1)), {
    status: 206,
    headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
  });
}
