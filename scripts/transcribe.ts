/**
 * Transcribe the recordings in data/recordings into data/cache/transcripts (skips cached ones).
 *   npm run transcribe            # all
 *   npm run transcribe -- 003 007 # some
 *   npm run transcribe -- --force
 */
import fs from "node:fs";
import path from "node:path";
import { envRoster } from "../src/lib/roster";
import { transcribeAudio } from "../src/lib/transcription/deepgram";
import { CACHE, RECORDINGS, callIdFromFile, pool, recordings, writeJson } from "./lib";

const args = process.argv.slice(2);
const force = args.includes("--force");
const files = recordings(args.filter((a) => !a.startsWith("--")));

await pool(files, 4, async (file) => {
  const id = callIdFromFile(file);
  const out = path.join(CACHE, "transcripts", `${id}.json`);
  if (!force && fs.existsSync(out)) return console.log(`${id}  cached`);
  const started = Date.now();
  const t = await transcribeAudio(fs.readFileSync(path.join(RECORDINGS, file)), "audio/mpeg", envRoster());
  writeJson(out, t);
  console.log(
    `${id}  ${t.durationSec.toFixed(0)}s  ${t.utterances.length} utterances  speakers=${t.speakers.join(",")}  conf=${t.confidence}  (${Date.now() - started}ms)`,
  );
});
