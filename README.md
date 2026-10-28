# PestLaunch Call Intelligence

Every customer call a pest control company records becomes a transcript, a call type, an outcome,
a PestLaunch scorecard grade, coaching for the rep and a short list of things the owner should do
next. It is built to sit inside PestLaunch OS (same navigation, look and "Assign" pattern).

## What it does

| For the owner | For managers | For reps |
|---|---|---|
| A plain-language read of the calls (bookings, saves, revenue at risk) | Team leaderboard and the steps the team skips most | Coaching on every call with a "try saying" line in the manual's style |
| **Needs attention**: lost sales to call back, unsaved cancellations, promised follow-ups, risks, ranked by value, one click to assign | Per-rep coaching plan built from their own calls | Every scorecard point linked to the exact moment in the call |
| Where calls break down across the call process | Override any step or the call type; the score re-totals | |

### Pipeline

```
upload ─▶ Deepgram Nova-3 ─▶ mask contact details ─▶ (speaker repair) ─▶ triage ─▶ score + coach ─▶ verify ─▶ store
          diarizer v2,          names, phones, emails,    AI labels lines      type, outcome,   Sales 17 /       every quote
          PCI redaction         addresses, ZIPs;          when diarization     details, risks,  All Calls 12 /   matched to the
                                employee names kept       hears one voice      follow-ups       Retention 12     transcript
```

* **Transcription:** Deepgram Nova-3 with the v2 diarizer, pest-control key terms and PCI redaction.
  Card details that reps read back aloud are masked as well.
* **Privacy:** customer names, phone numbers, emails, street addresses and ZIP codes are replaced with
  placeholders *before* anything is stored or sent to an AI model (Deepgram entity detection plus a
  regex backstop). Employee names come from greetings and `TEAM_ROSTER`, so calls stay attributed.
* **Analysis:** two structured-output passes with schemas enforced by the model API and validated
  again in code:
  1. *Triage*: speaker roles, call type, outcome, details (pests, prices, appointment), objections,
     follow-ups, opportunities, risks, sentiment.
  2. *Scoring & coaching* against the scorecard for that call type. The schema has one field per
     rubric step, so every step is judged and "not needed" is only possible where the manual allows it.
* **Provider:** Gemini (`ANALYSIS_PROVIDER=gemini`) or Claude (`claude`), behind one interface.

## Why the results can be trusted

* **The rubric is code** (`src/lib/analysis/rubrics.ts`), transcribed from the Office Call Manual
  (All Calls + Retention) and the Sales Call Manual. Point totals, Gold/Green/Below bands and the
  rule that awards the 4 objection points when the customer raised none are computed in code.
* **Evidence or no point.** The model must cite the utterance and exact words for each step.
  `verify.ts` finds each quote in the transcript (in-order word match, tolerant of punctuation);
  timestamps always come from the transcript, never from the model. A step marked "met" whose quote
  can't be found is *not* credited and the call is flagged for review.
* **Contradictions are caught in code**: objection steps can't be skipped when an objection was
  raised; the retention "teaser" can't be skipped when the customer cancelled.
* **Uncertainty is visible**: low-confidence call types, unverified evidence, speaker mix-ups and poor
  audio put a "worth a quick human check" banner on the call. Managers can correct the call type or any
  step; corrections survive re-analysis.
* **Measured:** `data/eval/labels.json` holds hand labels for all 20 sample calls (written by reading
  every transcript). `npm run eval` reports accuracy and run-to-run consistency (`data/eval/report.md`,
  also shown in the app under **How scoring works**). Latest, two full runs on `gemini-3.5-flash-lite`:

  | Call type | Outcome | Rep | Quotes verified | Same step credit across runs | Score spread |
  |---|---|---|---|---|---|
  | 100% (40/40) | 100% (40/40) | 100% (40/40) | 100% (665/667) | 89% (268/300) | avg 0.9 pts |

## Running locally

Requires Node 20.9+.

```bash
npm install
cp .env.example .env.local   # add DEEPGRAM_API_KEY and GEMINI_API_KEY (or ANTHROPIC_API_KEY)
npm run dev                  # http://localhost:3000
```

No database setup is needed locally: without `DATABASE_URL` an embedded Postgres (PGlite) is created
in `./data/pglite` and migrated on first use. Audio is stored in `./data/uploads`.

### Working with the sample calls

```bash
npm run check:keys            # verify the API keys with one tiny request each
npm run transcribe            # data/recordings/*.mp3 → data/cache/transcripts
npm run analyze -- --run=r1   # → data/cache/analyses/r1
npm run eval -- r1 r2 r3      # accuracy + consistency report
npm run seed                  # load run r1 into the running app (or --live to upload raw audio)
npm test                      # unit tests: evidence matching, scoring rules, revenue, masking
```

## Deploying

Vercel + Neon Postgres + private Vercel Blob. Set `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, the API
keys and `ADMIN_TOKEN` (protects the seed import endpoint). Browser uploads go straight to Blob, so the
4.5 MB function body limit doesn't apply.

## Project layout

```
src/lib/analysis      rubrics, taxonomy, prompts, schemas, analyze (assembly + rules), verify, providers
src/lib/transcription Deepgram client, contact-detail masking, card read-back redaction
src/lib/pipeline.ts   processing queue, stage tracking, overrides, re-scoring
src/lib/insights.ts   needs-attention ranking, team stats, step rates (deterministic)
src/app               overview, calls, call detail, coaching, tasks, API routes, server actions
scripts               transcribe, analyze, eval, seed, check-keys
```

## Known limits (V1)

* No authentication or multi-tenant isolation yet; PestLaunch OS would provide both.
* Call date, rep and direction aren't in the sample data, so the rep comes from the conversation and
  trends use call order.
* Revenue uses prices said on the call; otherwise an estimated first-year customer value
  (`DEFAULT_ANNUAL_VALUE`, marked "est.").
