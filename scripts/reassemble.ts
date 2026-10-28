/**
 * Recompute stored analyses from the model's raw output, without calling any AI model.
 * Use after changing scoring rules, evidence matching or revenue logic.
 *   npm run reassemble -- --run=r2
 */
import fs from "node:fs";
import path from "node:path";
import { assemble } from "../src/lib/analysis/analyze";
import { SCORECARDS } from "../src/lib/analysis/rubrics";
import { scorecardFor } from "../src/lib/analysis/taxonomy";
import type { CallAnalysis } from "../src/lib/analysis/types";
import type { Transcript } from "../src/lib/transcription/types";
import { CACHE, readJson, writeJson } from "./lib";

const run = process.argv.slice(2).find((a) => a.startsWith("--run="))?.slice(6) ?? "r1";
const dir = path.join(CACHE, "analyses", run);
for (const f of fs.readdirSync(dir).sort()) {
  const old = readJson<CallAnalysis>(path.join(dir, f))!;
  const t = readJson<Transcript>(path.join(CACHE, "transcripts", f))!;
  const id = scorecardFor(old.raw.triage.callType);
  const a = assemble(t, old.raw.triage, id ? SCORECARDS[id] : null, old.raw.scoring, {}, old.usage, old.model);
  a.promptVersion = old.promptVersion;
  writeJson(path.join(dir, f), a);
  const before = old.scorecard ? `${old.scorecard.score}/${old.scorecard.max}` : "—";
  const after = a.scorecard ? `${a.scorecard.score}/${a.scorecard.max}` : "—";
  console.log(`${f.replace(".json", "")}  ${before} → ${after}  quotes ${old.quality.evidenceVerified}/${old.quality.evidenceChecked} → ${a.quality.evidenceVerified}/${a.quality.evidenceChecked}`);
}
