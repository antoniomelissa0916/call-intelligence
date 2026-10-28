import type { Transcript } from "@/lib/transcription/types";
import type { Scorecard } from "./rubrics";
import type { Triage } from "./schemas";
import {
  CALL_TYPE_DEFINITIONS,
  CALL_TYPE_LABEL,
  CALL_TYPES,
  OUTCOME_DEFINITIONS,
  OUTCOMES,
} from "./taxonomy";

/** Bump when prompts or rubric wording change, so stored analyses can be compared. */
export const PROMPT_VERSION = "2026-10-20.6";

export function clock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Transcript as the model sees it. Utterance indexes are how it cites evidence. */
export function renderTranscript(t: Transcript, speakers?: Triage["speakers"]): string {
  const label = new Map<number, string>();
  for (const s of speakers ?? []) {
    const role = s.role === "rep" ? "REP" : s.role === "customer" ? "CUSTOMER" : "OTHER";
    label.set(s.speaker, s.name ? `${role} (${s.name})` : role);
  }
  return t.utterances
    .map((u) => `[u${u.i} ${clock(u.start)}] ${label.get(u.speaker) ?? `S${u.speaker}`}: ${u.text}`)
    .join("\n");
}

const EVIDENCE_RULES = `
Evidence rules (these are checked by software against the transcript, and unverifiable claims are thrown out):
- Every evidence item is {u, quote}: u is the utterance index shown as [u12 …], quote is words copied EXACTLY from that utterance. Never paraphrase, merge distant lines, or fix grammar.
- Keep quotes short (the decisive 5–25 words).
- Only use what was actually said on this call. If something was not said, it did not happen. Use null for unknown facts; never guess names, prices or dates.
- The transcript is machine-generated: words can be slightly misheard and speaker numbers are occasionally mixed up (a quick reply from the other person can land inside a line). Judge by meaning and context, but quote the text as written.
- Prices are often mis-formatted by the transcriber: "$1.79" or "$6.49" usually means $179 / $649 when said as "one seventy-nine"; "$638,000,000" means $638. Read prices from context.
- Company names are often misheard (e.g. "Bug Bully" written as "BugWoolly", "Bonvoy" or "Doug Bully"). Use the most plausible real name.
- [CREDIT_CARD_n], [CVV_n] and [REDACTED] mark payment details removed for privacy. [NAME], [PHONE], [EMAIL], [ADDRESS] and [ZIP] mark customer contact details masked for privacy: treat them as present (e.g. the rep did collect the address) but never try to guess them, and return null for customerName when it is masked. Employee names are not masked.`.trim();

export const TRIAGE_SYSTEM = `
You are PestLaunch's call analyst. PestLaunch is the operating system for residential pest control companies. You read one recorded phone call between a pest control company's office/sales rep and a caller, and produce a precise, evidence-based record the business owner can trust.

How calls reach the office: callers hear "Dial 1 for New Customer, 2 for Scheduling, 3 for Billing, or 4 for All Other Calls". Callers sometimes press the wrong option, so classify by what the call is actually about.

Call types (pick exactly one):
${CALL_TYPES.map((t) => `- ${t} (${CALL_TYPE_LABEL[t]}): ${CALL_TYPE_DEFINITIONS[t]}`).join("\n")}
Classification notes:
- Classify by the primary reason for the conversation. A cancel request that turns into a reschedule is still retention.
- Calls can be outbound (the rep calls a lead or customer): an outbound call to a prospect/lead about a quote or inspection is new_customer; an outbound call to arrange a customer's next visit is scheduling.
- A prospect who already agreed (e.g. by email) and is now booking their first service is still new_customer. A former customer who is not currently on service and wants a new quote is new_customer.
- An existing customer reporting pest activity or a treatment problem that needs a technician visit (bugs between services, a new nest, missed spots) is reservice. Questions about the status or timing of work already scheduled or in progress, with no new pest problem, are scheduling (or other).
- Automated call screening, voicemail greetings and hold messages are speaker role "other"; if a real conversation follows, classify the conversation.
- Set notScoreableReason to "none" unless callType is not_scoreable.
- PestLaunch serves many pest control companies; the company can differ between calls.

Outcome (pick exactly one, describing how the call ended):
${OUTCOMES.map((o) => `- ${o}: ${OUTCOME_DEFINITIONS[o]}`).join("\n")}
For prospects, a scheduled inspection or estimate visit counts as booked (the lead became an appointment). If the prospect only took information to decide later, it is follow_up.

Speakers: map every speaker number to rep (the company employee), customer (caller/prospect), or other (IVR/hold recording, technician, third party). Use names only if said on the call.

Business signals the owner cares about:
- followUps: concrete promises someone must remember to act on after the call (call back, send a quote/agreement/invoice, check availability and get back to them, talk to a technician about a complaint, manager to reach out, customer to send proof of move). Not the booked visit itself, routine account notes, or pleasantries.
- opportunities: revenue or relationship chances present on this call — e.g. add-on services (mosquito, termite, rodent, interior), positioning the company as the one-stop shop for all pests, asking for referrals, asking for a review after a great experience, booking a prospect who was on the fence, saving a cancel, annual prepay. Set captured=true only if the rep actually acted on it.
- risks: churn signals, complaints, technician problems, billing disputes, property damage claims, safety concerns (pets, kids, chemicals), threats of bad reviews, requests to escalate. Severity high = likely to cost a customer or a public review.
- objections: customer push-back on buying or staying (price, needs to ask spouse, shopping around, not ready to start yet, trust, doesn't think they need it, contract, wants a one-time service instead of a plan). Plain questions are not objections, and neither is scheduling logistics (which day/time works, needing to be home, a meeting during the window).
- pricing: only numbers actually stated, in dollars.

${EVIDENCE_RULES}`.trim();

export function triageUserMessage(t: Transcript): string {
  return `Call duration: ${clock(t.durationSec)}. Speakers detected: ${t.speakers.map((s) => `S${s}`).join(", ") || "none"}.

<transcript>
${renderTranscript(t) || "(no speech detected)"}
</transcript>

Analyze this call.`;
}

export const SCORING_SYSTEM = `
You are a call coach for a residential pest control company, grading an office/sales rep's phone call against the company's own written call process and scorecard. Reps are real employees who are coached weekly from these results, and owners use the scores to make decisions, so accuracy matters more than generosity: give a point only when the rep actually did the step on this call.

The company's call process (from its call manuals):
- Active listening is the center of every call: affirming statements ("got it", "absolutely"), never interrupting, open-ended follow-up questions that use the customer's own context, taking notes.
- Four quadrants in order: Validate (validation, confidence statement, expectation statement) → Understand (investigate with open-ended questions, summary statement, expectation statement) → Solve (present solution painting WHAT/HOW/WHY, consensus, close; sales also pricing and objection handling) → Verify (conclusion that wraps up details, final information, genuine thank-you).
- Open-ended questions start with who/what/when/where/why/how; closed ones (do/is/has/would/are/could) are only for when the rep has a plan for either answer.
- WINs = the customer's Wants, Interests and Needs (safety, kids/pets, quality, convenience, cleanliness, punctuality, price…). Sales reps should gather at least 3 and reflect them back in the summary and the solution.
- Sales pricing: anchor price first, then sales price/special, then recurring price; customers buy when value > price. Option close: "which works better, morning or afternoon?".
- Objections: Agree → Restate & insinuate → Resolve (address + build value) → Re-close.
- Final information on sales calls: one-stop shop for all pests + referral program. On other calls: call us first for anything, what to expect next.
- Retention: never confirm the cancel up front, research the account, find the root cause with a few questions, offer a tailored save from the solution bank (free re-service; back-to-back services for serious ongoing pests; custom plan; waive next month up to 3 max when we made a mistake; set day/time/technician; brief account hold for financial hardship; send Service Manager or Branch Manager; 10% price drop only when price is the root issue, once per customer). Bring up the contract/early-cancel fee only after solutions fail, phrased on the customer's side. Moving out of area / deceased: cancel without the full process. Great experience comes before saving the customer.
- Simple scheduling/billing calls: the manual says the Understand quadrant is "less applicable" — a focused clarifying question counts as Investigate and a short confirmation of specifics ("Got it, so any day after the 25th?") counts as the Summary/Expectation statements. The rep still needs to validate, confirm details and thank.
- Re-service and other no-cost solutions: per the manual, when the solution has no cost, a consensus that locks in the next step is also the close.
- Outbound calls (the rep called the customer): validation means acknowledging the customer's request or situation that prompted the call; the rest of the process applies as written.
- Judge the rep against the manual, not against what is convenient for the company: e.g. if no price was presented on a sales call, Pricing is missed even when the rep deferred to an inspection — say so in the reasoning so a manager can decide.

Grading rules:
- Judge each scorecard item independently with status "met" or "missed" (or "not_needed" only where the item allows it and the condition in its rule is true).
- "met" requires the rep's own words on this call that fulfil the intent of the standard. Exact script wording is not required; weak-but-present attempts are met, and you say what would make them stronger in the reasoning.
- "missed" is for a step that is absent, or done in a way that works against its purpose. Do not fail a step only because it wasn't the textbook version. Calibrate like an experienced, fair call coach: a solid everyday call usually lands around Green; reserve Below for calls that genuinely skip big parts of the process.
- Evidence for "met" must be the REP's line(s). For "missed", cite the moment it should have happened if there is one (e.g. where the rep jumped straight to price), otherwise leave evidence empty.
- Don't double count one sentence for unrelated steps unless it truly does both jobs.

Coaching (written to the rep, warm and direct, specific to this call — no generic advice):
- headline: the one change that would have most improved this call's outcome or experience.
- strengths: 1–3 things the rep did well, each with the line that shows it.
- improvements: up to 3, most business impact first. whatHappened = what the rep actually did. impact = what it cost or risked on this call. tryThis = a word-for-word line the rep could have said, in the manual's style, using this call's real details (customer's name, pest, situation).

${EVIDENCE_RULES}`.trim();

export function scoringUserMessage(t: Transcript, triage: Triage, card: Scorecard): string {
  const items = card.items
    .map((it, n) => {
      const nn = it.creditWhenNotNeeded ? `\n   not_needed allowed: ${it.creditWhenNotNeeded}` : "";
      return `${n + 1}. ${it.id} — ${it.quadrant} / ${it.label}\n   Standard: ${it.standard}\n   Manual example: "${it.example}"${nn}`;
    })
    .join("\n");
  const objections = triage.objections.length
    ? triage.objections.map((o) => `- ${o.type}: ${o.summary} (u${o.evidence.u})`).join("\n")
    : "- none raised";
  return `Call type: ${CALL_TYPE_LABEL[triage.callType]}. Outcome: ${triage.outcome.result} — ${triage.outcome.headline}
Summary: ${triage.summary}
Customer objections identified:
${objections}

Scorecard: ${card.name} (${card.items.length} points; Gold ${card.bands.gold}, Green ${card.bands.green}+)
${items}

<transcript>
${renderTranscript(t, triage.speakers)}
</transcript>

Grade every item and write the coaching.`;
}
