/**
 * Loads the sample calls into a running app.
 *   npm run seed                                   # pre-analyzed run r1 → http://localhost:3100
 *   npm run seed -- --run=r2 --url=https://….vercel.app
 *       (production: needs ADMIN_TOKEN in .env.local, matching the deployment. Audio is uploaded through the
 *        app's /api/blob-upload route straight to private Blob storage, because Vercel limits request bodies to 4.5 MB)
 *   npm run seed -- --live                         # upload raw recordings and let the app process them
 */
import fs from "node:fs";
import path from "node:path";
import { uploadPresigned } from "@vercel/blob/client";
import { CACHE, RECORDINGS, callIdFromFile, readJson, recordings } from "./lib";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const base = (flag("url") ?? "http://localhost:3100").replace(/\/$/, "");
const run = flag("run") ?? "r1";
const live = args.includes("--live");
const remote = !/localhost|127\.0\.0\.1/.test(base);
const headers: Record<string, string> = process.env.ADMIN_TOKEN ? { "x-admin-token": process.env.ADMIN_TOKEN } : {};

if (remote && !live && !process.env.ADMIN_TOKEN) {
  console.error("Seeding a deployed app needs ADMIN_TOKEN in .env.local (the same value as on the deployment)");
  process.exit(1);
}

let ok = 0;
for (const file of recordings(args.filter((a) => !a.startsWith("--")))) {
  const id = callIdFromFile(file);
  const bytes = fs.readFileSync(path.join(RECORDINGS, file));
  let res: Response;

  if (live) {
    const form = new FormData();
    form.append("files", new File([bytes], file, { type: "audio/mpeg" }));
    res = await fetch(`${base}/api/calls`, { method: "POST", body: form, headers });
  } else {
    const transcript = readJson(path.join(CACHE, "transcripts", `${id}.json`));
    const analysis = readJson(path.join(CACHE, "analyses", run, `${id}.json`));
    if (!transcript || !analysis) {
      console.log(`${id}  skipped (no cached transcript/analysis for run ${run})`);
      continue;
    }
    if (remote) {
      const blob = await uploadPresigned(`calls/${file.replace(/\s+/g, "-")}`, new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), {
        access: "private",
        contentType: "audio/mpeg",
        handleUploadUrl: `${base}/api/blob-upload`,
      });
      res = await fetch(`${base}/api/admin/import`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ filename: file, audioUrl: blob.url, bytes: bytes.length, transcript, analysis }),
      });
    } else {
      const form = new FormData();
      form.append("file", new File([bytes], file, { type: "audio/mpeg" }));
      form.append("transcript", JSON.stringify(transcript));
      form.append("analysis", JSON.stringify(analysis));
      res = await fetch(`${base}/api/admin/import`, { method: "POST", body: form, headers });
    }
  }
  const body = await res.text();
  console.log(`${id}  ${res.status}  ${body.slice(0, 120)}`);
  if (res.ok) ok++;
}
console.log(`${ok} calls sent to ${base}${live ? " for processing" : ""}`);
