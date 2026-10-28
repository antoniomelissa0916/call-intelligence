import fs from "node:fs/promises";
import path from "node:path";

/**
 * Audio storage. Recordings contain customer details, so they are never public:
 * private Vercel Blob in production, ./data/uploads locally.
 * The browser always plays them through /api/calls/[id]/audio.
 */
const LOCAL_DIR = path.join(process.cwd(), "data", "uploads");
/**
 * Blob is configured either with a read-write token (older stores) or, for stores created
 * through the Vercel dashboard today, with BLOB_STORE_ID + the platform's automatic OIDC token.
 */
export function blobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}


export async function saveAudio(key: string, data: Buffer, mime: string): Promise<string> {
  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`calls/${key}`, data, {
      access: "private",
      contentType: mime,
      addRandomSuffix: true,
    });
    return blob.url;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, key), data);
  return `local:${key}`;
}

export async function readAudio(audioKey: string): Promise<Buffer> {
  if (audioKey.startsWith("local:")) {
    return fs.readFile(path.join(LOCAL_DIR, audioKey.slice("local:".length)));
  }
  const { get } = await import("@vercel/blob");
  const res = await get(audioKey, { access: "private" });
  if (!res || res.statusCode !== 200) throw new Error("Recording not found in storage");
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}
