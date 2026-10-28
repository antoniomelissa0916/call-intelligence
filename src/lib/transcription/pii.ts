/**
 * Masks customer contact details (names, phone numbers, emails, street addresses, ZIPs)
 * in the transcript, using the entities Deepgram detects. The employee's own name from the
 * greeting ("…this is Kristen") is kept so calls can still be attributed to the right rep.
 * Runs before anything is stored or sent to an AI model.
 */

export interface DgWord {
  word?: string;
  punctuated_word?: string;
  start?: number;
  end?: number;
}

export interface DgEntity {
  label?: string;
  value?: string;
  start_word?: number;
  end_word?: number;
}

const PLACEHOLDER: Record<string, string> = {
  NAME: "[NAME]",
  NAME_GIVEN: "[NAME]",
  NAME_FAMILY: "[NAME]",
  NAME_MEDICAL_PROFESSIONAL: "[NAME]",
  PHONE_NUMBER: "[PHONE]",
  EMAIL_ADDRESS: "[EMAIL]",
  LOCATION_ADDRESS: "[ADDRESS]",
  LOCATION_ADDRESS_STREET: "[ADDRESS]",
  LOCATION_ZIP: "[ZIP]",
  USERNAME: "[EMAIL]",
};

const NAME_LABELS = new Set(["NAME", "NAME_GIVEN", "NAME_FAMILY"]);

/**
 * Employee names said in a company greeting: "Thank you for calling Bug Bully, this is Griffin",
 * "Endeavor Pest Management. This is Elijah speaking", "This is Kevin from Bug Bully".
 */
export function employeeNames(texts: string[]): Set<string> {
  const names = new Set<string>();
  const patterns = [
    /thank you for calling[^.?!]*?[.,]?\s*this is ([A-Z][a-z]+)/i,
    /\b[Tt]his is ([A-Z][a-z]+)(?: speaking| from| with)\b/,
    /\b([A-Z][a-z]+) speaking\b/,
    /\b(?:it's|this is) ([A-Z][a-z]+) from\b/i,
    /\b([A-Z][a-z]+) from (?:bug|endeavor|noble|abc)/i,
  ];
  for (const t of texts.slice(0, 8)) {
    for (const p of patterns) {
      const m = p.exec(t);
      if (m && !["the", "this", "calling"].includes(m[1].toLowerCase())) names.add(m[1].toLowerCase());
    }
  }
  return names;
}

const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const PHONE_RE = /(?:\(\d{3}\)\s?|\b\d{3}[-.\s])\d{3}[-.\s]\d{4}\b/g;

/** Backstop for anything entity detection missed. */
export function maskPatterns(text: string): string {
  return text.replace(EMAIL_RE, "[EMAIL]").replace(PHONE_RE, "[PHONE]");
}

/**
 * Mask words of each utterance that fall inside a detected PII entity.
 * `allWords`/`entities` are the channel-level arrays (entities index into allWords);
 * utterances carry their own word lists with timings.
 */
export function maskUtterance(
  uttWords: DgWord[],
  fallbackText: string,
  spans: { start: number; end: number; tag: string }[],
): string {
  if (!uttWords.length) return maskPatterns(fallbackText);
  const out: string[] = [];
  let lastTag: string | null = null;
  for (const w of uttWords) {
    const t = w.start ?? 0;
    // A word belongs to a span if it starts inside it. The next word often starts at the exact
    // moment the entity ends, so the end bound is exclusive.
    const span = spans.find((s) => t >= s.start - 0.01 && t < s.end - 0.005);
    const text = w.punctuated_word ?? w.word ?? "";
    if (span) {
      if (lastTag !== span.tag) {
        // keep trailing punctuation of the masked word so sentences still read naturally
        const punct = /[.,!?]$/.exec(text)?.[0] ?? "";
        out.push(span.tag + punct);
      } else if (/[.,!?]$/.test(text)) {
        out[out.length - 1] = out[out.length - 1].replace(/[.,!?]?$/, text.slice(-1));
      }
      lastTag = span.tag;
    } else {
      out.push(text);
      lastTag = null;
    }
  }
  return maskPatterns(out.join(" "));
}

export function piiSpans(allWords: DgWord[], entities: DgEntity[], keepNames: Set<string>) {
  const spans: { start: number; end: number; tag: string }[] = [];
  for (const e of entities) {
    const tag = PLACEHOLDER[e.label ?? ""];
    if (!tag || e.start_word == null || e.end_word == null) continue;
    if (NAME_LABELS.has(e.label!) && (e.value ?? "").split(/\s+/).every((p) => keepNames.has(p.toLowerCase()))) continue;
    const first = allWords[e.start_word];
    const last = allWords[Math.max(e.start_word, e.end_word - 1)];
    if (!first || !last) continue;
    spans.push({ start: first.start ?? 0, end: last.end ?? first.end ?? 0, tag });
  }
  return spans;
}
