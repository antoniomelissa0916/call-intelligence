/**
 * Analyze cached transcripts into data/cache/analyses/<run>/ and print a one-line result per call.
 *   npm run analyze -- 003 007
 *   npm run analyze -- --run=r2   # write a separate run (for consistency checks)
 */
import fs from "node:fs";
import path from "node:path";
import { analyzeTranscript } from "../src/lib/analysis/analyze";
import { clock } from "../src/lib/analysis/prompts";
import type { Transcript } from "../src/lib/transcription/types";
import { CACHE, callIdFromFile, pool, readJson, recordings, writeJson } from "./lib";

const args = process.argv.slice(2);
const run = args.find((a) => a.startsWith("--run="))?.slice(6) ?? "r1";
const force = args.includes("--force");
const files = recordings(args.filter((a) => !a.startsWith("--")));

await pool(files, 3, async (file) => {
  const id = callIdFromFile(file);
  const t = readJson<Transcript>(path.join(CACHE, "transcripts", `${id}.json`));
  if (!t) return console.log(`${id}  no transcript (run npm run transcribe)`);
  const out = path.join(CACHE, "analyses", run, `${id}.json`);
  if (!force && fs.existsSync(out)) return console.log(`${id}  cached`);
  try {
    const { analysis: a } = await analyzeTranscript(t);
    writeJson(out, a);
    const sc = a.scorecard ? `${a.scorecard.score}/${a.scorecard.max} ${a.scorecard.grade}` : "not graded";
    const q = `${a.quality.evidenceVerified}/${a.quality.evidenceChecked} quotes verified`;
    console.log(
      `${id} ${clock(t.durationSec).padStart(6)}  ${a.callType.padEnd(13)} ${a.outcome.result.padEnd(15)} ${sc.padEnd(14)} rep=${a.repName ?? "?"}  ${q}${a.quality.needsReview ? "  REVIEW: " + a.quality.reasons.join("; ") : ""}  (${(a.usage.durationMs / 1000).toFixed(0)}s, ${a.usage.inputTokens}+${a.usage.outputTokens} tok)`,
    );
  } catch (err) {
    console.error(`${id}  FAILED`, err);
  }
});
