/**
 * Accuracy + consistency report for the analysis engine.
 *   npm run analyze -- --run=r1 && npm run analyze -- --run=r2 && npm run analyze -- --run=r3
 *   npm run eval -- r1 r2 r3
 *
 * Accuracy: call type, outcome and rep name vs. hand labels (data/eval/labels.json).
 * Consistency: across runs, how often type/outcome/each scorecard step agree, and score spread.
 * Writes data/eval/report.md.
 */
import fs from "node:fs";
import path from "node:path";
import type { CallAnalysis } from "../src/lib/analysis/types";
import { CACHE, ROOT, readJson } from "./lib";

type Label = { type: string[]; outcome: string[]; rep: string };
const labels = readJson<{ calls: Record<string, Label> }>(path.join(ROOT, "data", "eval", "labels.json"))!.calls;
const runs = process.argv.slice(2).length ? process.argv.slice(2) : ["r1"];

const byRun = runs.map((r) => {
  const dir = path.join(CACHE, "analyses", r);
  const out: Record<string, CallAnalysis> = {};
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) out[f.replace(".json", "")] = readJson<CallAnalysis>(path.join(dir, f))!;
  return out;
});
const ids = Object.keys(labels).filter((id) => byRun.every((r) => r[id]));

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
let typeOk = 0, outcomeOk = 0, repOk = 0, total = 0, quotes = 0, verified = 0;
const rows: string[] = [];
const misses: string[] = [];

for (const id of ids) {
  const l = labels[id];
  for (const [ri, run] of byRun.entries()) {
    const a = run[id];
    total++;
    const t = l.type.includes(a.callType);
    const o = l.outcome.includes(a.outcome.result);
    const r = (a.repName ?? "").toLowerCase().startsWith(l.rep.toLowerCase());
    typeOk += +t;
    outcomeOk += +o;
    repOk += +r;
    quotes += a.quality.evidenceChecked;
    verified += a.quality.evidenceVerified;
    if (!t || !o || !r)
      misses.push(
        `- ${id} (${runs[ri]}): ${!t ? `type ${a.callType} (expected ${l.type.join("/")}) ` : ""}${!o ? `outcome ${a.outcome.result} (expected ${l.outcome.join("/")}) ` : ""}${!r ? `rep ${a.repName} (expected ${l.rep})` : ""}`,
      );
  }
  const a0 = byRun[0][id];
  const scores = byRun.map((r) => (r[id].scorecard ? `${r[id].scorecard!.score}/${r[id].scorecard!.max}` : "—"));
  rows.push(`| ${id} | ${a0.callType} | ${a0.outcome.result} | ${a0.repName ?? "?"} | ${scores.join(", ")} | ${a0.quality.evidenceVerified}/${a0.quality.evidenceChecked} |`);
}

// Consistency across runs
let typeAgree = 0, outcomeAgree = 0, itemAgree = 0, itemTotal = 0, spreadSum = 0, spreadMax = 0, graded = 0;
if (byRun.length > 1) {
  for (const id of ids) {
    const as = byRun.map((r) => r[id]);
    typeAgree += +as.every((a) => a.callType === as[0].callType);
    outcomeAgree += +as.every((a) => a.outcome.result === as[0].outcome.result);
    if (as.every((a) => a.scorecard && a.scorecard.id === as[0].scorecard?.id)) {
      graded++;
      const s = as.map((a) => a.scorecard!.score);
      const spread = Math.max(...s) - Math.min(...s);
      spreadSum += spread;
      spreadMax = Math.max(spreadMax, spread);
      for (const item of as[0].scorecard!.items) {
        itemTotal++;
        itemAgree += +as.every((a) => a.scorecard!.items.find((i) => i.id === item.id)?.credited === item.credited);
      }
    }
  }
}

const report = `# Analysis evaluation

Runs: ${runs.join(", ")} · ${ids.length} calls · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC

## Accuracy vs. hand labels
| Metric | Result |
|---|---|
| Call type | ${pct(typeOk, total)} (${typeOk}/${total}) |
| Outcome | ${pct(outcomeOk, total)} (${outcomeOk}/${total}) |
| Rep identified | ${pct(repOk, total)} (${repOk}/${total}) |
| Cited quotes found in transcript | ${pct(verified, quotes)} (${verified}/${quotes}) |
${byRun.length > 1 ? `
## Consistency across ${byRun.length} runs
| Metric | Result |
|---|---|
| Same call type every run | ${pct(typeAgree, ids.length)} |
| Same outcome every run | ${pct(outcomeAgree, ids.length)} |
| Same credit on each scorecard step | ${pct(itemAgree, itemTotal)} (${itemAgree}/${itemTotal} steps) |
| Score spread between runs | avg ${(spreadSum / Math.max(1, graded)).toFixed(2)} pts, max ${spreadMax} pts |
` : ""}
## Disagreements
${misses.length ? misses.join("\n") : "None."}

## Per call (first run)
| Call | Type | Outcome | Rep | Score per run | Quotes verified |
|---|---|---|---|---|---|
${rows.join("\n")}
`;

fs.writeFileSync(path.join(ROOT, "data", "eval", "report.md"), report);
// Machine-readable summary shown on the app's "How scoring works" page.
const models = [...new Set(byRun.flatMap((r) => ids.map((id) => r[id].model)))];
fs.writeFileSync(
  path.join(ROOT, "data", "eval", "summary.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      runs: runs.length,
      calls: ids.length,
      models,
      promptVersions: [...new Set(byRun.flatMap((r) => ids.map((id) => r[id].promptVersion)))],
      accuracy: {
        callType: { ok: typeOk, of: total },
        outcome: { ok: outcomeOk, of: total },
        rep: { ok: repOk, of: total },
        quotesVerified: { ok: verified, of: quotes },
      },
      consistency:
        byRun.length > 1
          ? {
              callType: { ok: typeAgree, of: ids.length },
              outcome: { ok: outcomeAgree, of: ids.length },
              steps: { ok: itemAgree, of: itemTotal },
              scoreSpreadAvg: Number((spreadSum / Math.max(1, graded)).toFixed(2)),
              scoreSpreadMax: spreadMax,
            }
          : null,
    },
    null,
    2,
  ),
);
console.log(report);
