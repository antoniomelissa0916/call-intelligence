import type { ScorecardId } from "./rubrics";

export const CALL_TYPES = [
  "new_customer",
  "scheduling",
  "billing",
  "reservice",
  "retention",
  "other",
  "not_scoreable",
] as const;
export type CallType = (typeof CALL_TYPES)[number];

export const CALL_TYPE_LABEL: Record<CallType, string> = {
  new_customer: "New Customer",
  scheduling: "Scheduling",
  billing: "Billing",
  reservice: "Re-service",
  retention: "Retention",
  other: "Other",
  not_scoreable: "Not scoreable",
};

/** Definitions given to the AI, paraphrased from the Office Call Manual "Call Types" section. */
export const CALL_TYPE_DEFINITIONS: Record<CallType, string> = {
  new_customer:
    "Someone who is NOT yet a customer asking about service: an inbound sales opportunity (quote, pricing, first service). Also outbound sales follow-ups to prospects. Recently signed-up customers calling about scheduling/billing are NOT this type.",
  scheduling:
    "An existing customer scheduling, confirming or changing the date/time of a regular service appointment, or giving notes for an upcoming visit (gate codes, pets, not home).",
  billing:
    "An existing customer calling about an invoice, payment, upcoming charge, balance, declined card or updating the payment method on file, including calls prompted by collection notices.",
  reservice:
    "An existing customer reporting pests between scheduled services or a problem with a past treatment (missed spots, still seeing bugs) and needing a re-service.",
  retention:
    "An existing customer who wants to cancel (or is threatening to), or the company calling a customer back after a cancel request by text/email. Scored on the Retention scorecard.",
  other:
    "Any other real customer conversation: changing service address, feedback about a technician, asking for an invoice to be re-sent, general questions.",
  not_scoreable:
    "No real two-way customer conversation with a rep: voicemail, wrong number, spam/solicitation, a vendor/internal call, or a call that drops before the customer's need is discussed.",
};

export const NOT_SCOREABLE_REASONS = [
  "voicemail",
  "wrong_number",
  "spam_or_solicitation",
  "internal_or_vendor",
  "dropped_or_too_short",
  "none",
] as const;

export function scorecardFor(type: CallType): ScorecardId | null {
  switch (type) {
    case "new_customer":
      return "sales";
    case "retention":
      return "retention";
    case "not_scoreable":
      return null;
    default:
      return "service";
  }
}

export const OUTCOMES = [
  "booked",
  "saved",
  "resolved",
  "follow_up",
  "lost",
  "cancelled",
  "unresolved",
  "no_conversation",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_DEFINITIONS: Record<Outcome, string> = {
  booked: "A prospect bought / scheduled their first service (sales win).",
  saved: "A customer who wanted to cancel agreed to stay (retention win).",
  resolved: "The existing customer's request was fully handled on the call (rescheduled, card updated, re-service booked, question answered).",
  follow_up: "Nothing final yet: a callback, quote, manager follow-up or customer decision is still pending.",
  lost: "A prospect did not buy and no follow-up was set.",
  cancelled: "The customer's service was cancelled.",
  unresolved: "The customer's issue was not handled and no clear next step was set.",
  no_conversation: "No real conversation took place (voicemail, wrong number, dropped call).",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  booked: "Booked",
  saved: "Saved",
  resolved: "Resolved",
  follow_up: "Follow-up needed",
  lost: "Lost",
  cancelled: "Cancelled",
  unresolved: "Unresolved",
  no_conversation: "No conversation",
};

export type OutcomeTone = "positive" | "neutral" | "negative" | "muted";
export const OUTCOME_TONE: Record<Outcome, OutcomeTone> = {
  booked: "positive",
  saved: "positive",
  resolved: "positive",
  follow_up: "neutral",
  lost: "negative",
  cancelled: "negative",
  unresolved: "negative",
  no_conversation: "muted",
};
