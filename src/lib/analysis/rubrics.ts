/**
 * PestLaunch call scorecards, transcribed from the company's Office Call Manual
 * (All Calls + Retention scorecards) and Sales Call Manual (Sales scorecard).
 *
 * Point totals, grade bands and the "auto-award" rules live here, in code, so the
 * AI never decides how many points a call is worth: it only judges each step,
 * with evidence, and the score is computed from those judgements.
 */

export type ScorecardId = "sales" | "service" | "retention";
export type Quadrant = "Validate" | "Understand" | "Solve" | "Overcome Objections" | "Verify";

export interface RubricItem {
  id: string;
  quadrant: Quadrant;
  label: string;
  /** What the rep has to do to earn the point. Shown to the AI and in the UI. */
  standard: string;
  /** An example line from the manual. */
  example: string;
  /**
   * When the step was not needed on this call, the manual awards the point anyway.
   * The AI may only return "not_needed" for items that have this set.
   */
  creditWhenNotNeeded?: string;
}

export interface Scorecard {
  id: ScorecardId;
  name: string;
  source: string;
  items: RubricItem[];
  bands: { gold: number; green: number };
}

const validate: RubricItem = {
  id: "validate",
  quadrant: "Validate",
  label: "Validate",
  standard:
    "Right after the greeting, validate the caller's reason for calling with SPECIFIC details of their situation and genuine empathy (side with them). Vague, generic lines (\"okay\", \"sure\", \"no problem\") do not count.",
  example: "I am so sorry to hear about your ant activity in your kitchen. If that was my kitchen, I would absolutely be going crazy.",
};

const confidence: RubricItem = {
  id: "confidence",
  quadrant: "Validate",
  label: "Confidence statement",
  standard:
    "Clearly and enthusiastically tell the customer you can help and are on their team, putting them at ease and taking control of the call.",
  example: "I am glad you called in today about those ants, I can definitely take care of this for you.",
};

const expectation1: RubricItem = {
  id: "expectation_1",
  quadrant: "Validate",
  label: "Expectation statement (before questions)",
  standard:
    "Before investigating, tell the customer what happens next (e.g. that you will ask a few questions and why), so they know the roadmap.",
  example: "I'm just going to ask you a few questions about that ant activity, so I can make sure we get you the quote you are looking for.",
};

const investigate: RubricItem = {
  id: "investigate",
  quadrant: "Understand",
  label: "Investigate",
  standard:
    "Ask mainly open-ended questions (who/what/when/where/why/how) to understand the situation and root cause (what they're seeing, where, how long, what they've tried). Met when the rep genuinely investigates; surfacing at least 3 WINs (wants, interests, needs) is the gold standard, so note it in the reasoning when fewer were found rather than failing the step. On simple scheduling/billing calls a focused clarifying question about the specifics counts.",
  example: "When did you start seeing ants in the kitchen?",
};

const summary: RubricItem = {
  id: "summary",
  quadrant: "Understand",
  label: "Summary statement",
  standard:
    "Repeat the customer's situation / WINs back to them and get agreement (\"does that sound right?\"). A short confirmation of the specifics counts on simple scheduling/billing calls.",
  example:
    "From what we've discussed so far, it sounds like you are looking for an affordable and thorough solution for the ant and spider activity, that is also people and pet-friendly. Does that sound right?",
};

const expectation2: RubricItem = {
  id: "expectation_2",
  quadrant: "Understand",
  label: "Expectation statement (before solution)",
  standard:
    "Before presenting the solution, prime the customer for what comes next (e.g. walking through the service, then price, then scheduling).",
  example:
    "I'm going to walk you through our service from start to finish… I'll check in with you at the end to see if you have any questions before we talk about the price.",
};

const presentSolution: RubricItem = {
  id: "present_solution",
  quadrant: "Solve",
  label: "Present solution",
  standard:
    "Paint a picture of the solution tailored to this customer: WHAT will be done, HOW it is done and WHY it matters for their situation, in chronological order. Just stating an outcome (\"you're all set\") is a weak solution unless the call is a simple scheduling/billing change.",
  example:
    "Your technician will power treat the entire foundation of your home. This is a protective layer that will flush out the cracks and crevices, and protect your home from any pests trying to come inside.",
};

const consensus: RubricItem = {
  id: "consensus",
  quadrant: "Solve",
  label: "Consensus",
  standard: "Check that the customer agrees with / understands the solution before moving on (buy-in).",
  example: "That's our service in a nutshell. Do you have any questions about anything I just covered, before we talk about the price?",
};

const close: RubricItem = {
  id: "close",
  quadrant: "Solve",
  label: "Close",
  standard:
    "Ask for the commitment: get it scheduled / confirmed, ideally with an option close (\"morning or afternoon?\"). Per the manual, when the solution has no cost (e.g. a re-service), a successful consensus that locks in the next step is the close.",
  example: "I'm assuming you'd like to get this started as soon as possible. Which time of day usually works better for you: morning or afternoon?",
};

const conclusion: RubricItem = {
  id: "conclusion",
  quadrant: "Verify",
  label: "Provide a conclusion",
  standard:
    "Wrap up loose ends and set expectations going forward: confirm details such as name, address, email, date/time, notes for the technician, pets, gate codes.",
  example: "Perfect. You'll get a reminder text a couple days before we come out for you.",
};

const thank: RubricItem = {
  id: "thank",
  quadrant: "Verify",
  label: "Thank the customer",
  standard: "Genuinely thank the customer at the end of the call (a rushed \"thanks, bye\" is weak but counts).",
  example:
    "One last thing John, I just want to thank you for calling in and working with me today. As a local family-owned company, business from customers like you makes all the difference.",
};

const finalInfoService: RubricItem = {
  id: "final_info",
  quadrant: "Verify",
  label: "Offer final information",
  standard:
    "Offer final information: invite them to call first for any other pest need (one-stop shop) or give the useful next-step info for this call (what to expect, reminders, how to reach us).",
  example: "Don't hesitate to reach back out if you need anything. It's common for it to take a couple treatments before those ants really start going away.",
};

const finalInfoSales: RubricItem = {
  id: "final_info",
  quadrant: "Verify",
  label: "Offer final information",
  standard:
    "Position the company as the one-stop shop for ALL pest needs (termites, rodents, mosquitoes…) AND mention the referral program.",
  example:
    "We are a one-stop shop for all pest control needs… Also, we have an amazing referral program. If someone you refer signs up, you will get your next month FREE.",
};

const objectionNote =
  "Customer raised no objection. Per the Sales Manual the rep automatically earns the 4 objection points.";

export const SCORECARDS: Record<ScorecardId, Scorecard> = {
  sales: {
    id: "sales",
    name: "Sales Call Scorecard",
    source: "Sales Call Manual",
    bands: { gold: 17, green: 14 },
    items: [
      validate,
      confidence,
      expectation1,
      investigate,
      summary,
      expectation2,
      presentSolution,
      consensus,
      {
        ...close,
        standard:
          "Ask for the commitment: propose a specific appointment (\"I can get him out Thursday between 1 and 4, does that work?\") and get a yes. The manual's option close (\"which works better, morning or afternoon?\") is the gold standard; an open \"do you want to go ahead?\" or letting the customer decide later without asking does not count.",
      },
      {
        id: "pricing",
        quadrant: "Solve",
        label: "Pricing",
        standard:
          "Present price the manual's way: anchor price first, then the sales price / special (anchor minus discount), then the recurring price and frequency. Price given before value was built, or price with no anchor, does not earn the point.",
        example:
          "That initial inside and outside service is usually $299 for a home your size. But we're doing a special this week… so it's just going to be $199 for the initial treatment, and then just $49 per month after that.",
      },
      {
        id: "obj_agree",
        quadrant: "Overcome Objections",
        label: "Agree",
        standard: "When an objection comes up, first agree with the customer's point of view; no tension or debate.",
        example: "Yes, I totally understand. There are lots of great companies out there, and I think it's smart to consider your options first.",
        creditWhenNotNeeded: objectionNote,
      },
      {
        id: "obj_restate",
        quadrant: "Overcome Objections",
        label: "Restate & insinuate",
        standard: "Restate the objection in your own words and insinuate a possible reason, to isolate the real concern.",
        example: "If I'm understanding you right, you just want to make sure you're getting the most comprehensive service possible?",
        creditWhenNotNeeded: objectionNote,
      },
      {
        id: "obj_resolve",
        quadrant: "Overcome Objections",
        label: "Resolve",
        standard: "Resolve the concern: address it, give a solution, and build more value.",
        example: "The biggest reason people use us is because we do a FULL property treatment every time…",
        creditWhenNotNeeded: objectionNote,
      },
      {
        id: "obj_reclose",
        quadrant: "Overcome Objections",
        label: "Re-close",
        standard: "Confidently go back in with another low-pressure close after resolving the objection.",
        example: "Would you prefer to be home for the service, or does any time of day work for you?",
        creditWhenNotNeeded: objectionNote,
      },
      conclusion,
      finalInfoSales,
      thank,
    ],
  },

  service: {
    id: "service",
    name: "Call Process Scorecard (All Calls)",
    source: "Office Call Manual",
    bands: { gold: 12, green: 11 },
    items: [
      validate,
      confidence,
      expectation1,
      investigate,
      summary,
      expectation2,
      presentSolution,
      consensus,
      close,
      conclusion,
      thank,
      finalInfoService,
    ],
  },

  retention: {
    id: "retention",
    name: "Retention Call Scorecard",
    source: "Office Call Manual — Retention Call Process",
    bands: { gold: 12, green: 11 },
    items: [
      {
        id: "ret_validate_confidence",
        quadrant: "Validate",
        label: "Validate & confidence statement",
        standard:
          "Validate the customer and assure them you can help, WITHOUT confirming the cancellation (never \"yes, I can cancel that for you\"). Don't bring up the contract yet.",
        example: "Got it. Thank you for calling in, I can absolutely take a look at things for you.",
      },
      {
        id: "ret_transition",
        quadrant: "Validate",
        label: "Transition statement",
        standard: "Prime the customer for the next step, e.g. ask for the account address and say you'll take a quick look.",
        example: "What's the address for the account? … Awesome. Let me just take a quick look here.",
      },
      {
        id: "ret_research",
        quadrant: "Validate",
        label: "Do your research",
        standard:
          "Look into the account and use what you find (tenure, contract status, re-services, last service, past issues). Evidence is the rep referencing account facts.",
        example: "I see here you've been a customer for over 3 years, thank you!",
      },
      {
        id: "ret_investigate",
        quadrant: "Understand",
        label: "Investigate",
        standard:
          "Ask a few open-ended questions to find the ROOT reason for cancelling. Helpful, not interrogating; don't offer solutions yet.",
        example: "If you don't mind, what's the reason you're unhappy with the service?",
      },
      {
        id: "ret_validate_summary",
        quadrant: "Understand",
        label: "Validate & summary statement",
        standard: "Keep validating and repeat back your understanding of the reason to confirm the full scope.",
        example: "Got it, that makes sense. So overall the service has been pretty good, but just the last couple months you've been noticing more ants than normal?",
      },
      {
        id: "ret_validate_expectation",
        quadrant: "Understand",
        label: "Validate & expectation statement",
        standard: "Stay on their team and prime them for options (\"let me give a couple of suggestions…\").",
        example:
          "Since we are a small family-owned company, we truly value you as a customer of ours and I want to make this right for you. Let me give a couple of suggestions…",
      },
      {
        id: "ret_present_solution",
        quadrant: "Solve",
        label: "Present solution",
        standard:
          "Offer a specific, tailored save solution from the solution bank (free re-service, back-to-back services, custom plan, waive a month, set day/tech, account hold, manager visit, 10% price drop as last resort), building value.",
        example:
          "What I can do is, I'll send out my head technician to come do a free re-service for you… Does that work for you?",
      },
      {
        id: "ret_consensus",
        quadrant: "Solve",
        label: "Consensus",
        standard: "Get buy-in on the offer (\"does that work for you?\", \"how does that sound?\").",
        example: "How does that sound?",
      },
      {
        id: "ret_repeat",
        quadrant: "Solve",
        label: "Repeat (when necessary)",
        standard:
          "If the first offer is declined, circle back: ask more open-ended questions and offer a new solution (contract/fee only after solutions fail, phrased on their side).",
        example: "I understand. Well, the reason I was offering those different options is because you're still within the initial 12 month period…",
        creditWhenNotNeeded: "The first solution was accepted, so repeating was not necessary.",
      },
      {
        id: "ret_conclusion",
        quadrant: "Verify",
        label: "Provide a conclusion",
        standard: "Wrap up loose ends and confirm what happens next (dates, notes, technician, fee/waiver details).",
        example: "Perfect, I got that in. Your technician will be there Thursday morning.",
      },
      {
        id: "ret_thank",
        quadrant: "Verify",
        label: "Thank the customer",
        standard: "Genuinely thank the customer.",
        example: "I just want to thank you for calling in and working with me today.",
      },
      {
        id: "ret_teaser",
        quadrant: "Verify",
        label: "Leave a teaser",
        standard: "When the cancel goes through, end on a high note with an incentive to come back (e.g. a free initial service noted on the account).",
        example: "If you ever want to try us again… I'm going to give you a FREE initial service. I'll put that in the notes in your account.",
        creditWhenNotNeeded: "The customer was saved, so no teaser was needed.",
      },
    ],
  },
};

export type Grade = "gold" | "green" | "below";

export function gradeFor(scorecard: Scorecard, score: number): Grade {
  if (score >= scorecard.bands.gold) return "gold";
  if (score >= scorecard.bands.green) return "green";
  return "below";
}

export const GRADE_LABEL: Record<Grade, string> = {
  gold: "Gold Standard",
  green: "Green Standard",
  below: "Below Standard",
};

/** Refresh step names/standards on a stored scorecard from the current rubric (wording fixes apply without re-scoring). */
export function withCurrentRubric<T extends { id: ScorecardId; items: { id: string; label: string; standard: string; example: string }[] }>(
  scorecard: T | null,
): T | null {
  if (!scorecard) return scorecard;
  const card = SCORECARDS[scorecard.id];
  if (!card) return scorecard;
  const byId = new Map(card.items.map((i) => [i.id, i]));
  return {
    ...scorecard,
    name: card.name,
    items: scorecard.items.map((it) => {
      const r = byId.get(it.id);
      return r ? { ...it, label: r.label, standard: r.standard, example: r.example } : it;
    }),
  };
}
