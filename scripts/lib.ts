import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";

config({ path: ".env.local", quiet: true });

export const ROOT = process.cwd();
export const RECORDINGS = path.join(ROOT, "data", "recordings");
export const CACHE = path.join(ROOT, "data", "cache");

/** "CALL 007.mp3" -> "CALL-007" */
export function callIdFromFile(file: string) {
  return path.basename(file, path.extname(file)).trim().replace(/\s+/g, "-").toUpperCase();
}

export function recordings(filter?: string[]) {
  const files = fs
    .readdirSync(RECORDINGS)
    .filter((f) => /\.(mp3|wav|m4a|ogg|webm)$/i.test(f))
    .sort();
  if (!filter?.length) return files;
  const wanted = new Set(filter.map((f) => f.toUpperCase()));
  return files.filter((f) => wanted.has(callIdFromFile(f)) || wanted.has(callIdFromFile(f).replace("CALL-", "")));
}

export function readJson<T>(file: string): T | null {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : null;
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(size, queue.length) }, async () => {
      for (let item = queue.shift(); item !== undefined; item = queue.shift()) await fn(item);
    }),
  );
}
