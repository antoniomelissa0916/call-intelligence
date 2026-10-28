import type { Transcript } from "@/lib/transcription/types";
import type { EvidenceRef } from "./schemas";
import type { Evidence, SpeakerRole } from "./types";

/** Share of the quote's words that must appear, in order, in the transcript. */
const MATCH_THRESHOLD = 0.8;

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9$%\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Longest common subsequence length of two word lists. */
function lcs(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  let prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * How well `quote` is contained in `text`, from 0 to 1. Uses an in-order word match,
 * so small transcription/punctuation differences don't fail a genuine quote, but a
 * paraphrase or invented line does.
 */
export function containment(quote: string, text: string): number {
  const q = normalizeWords(quote);
  if (!q.length) return 0;
  const t = normalizeWords(text);
  return lcs(q, t) / q.length;
}

export class EvidenceVerifier {
  private roleBySpeaker: Map<number, SpeakerRole>;
  checked = 0;
  verified = 0;

  constructor(
    private transcript: Transcript,
    speakers: { speaker: number; role: SpeakerRole }[],
  ) {
    this.roleBySpeaker = new Map(speakers.map((s) => [s.speaker, s.role]));
  }

  roleOf(u: number): SpeakerRole {
    const utt = this.transcript.utterances[u];
    return utt ? (this.roleBySpeaker.get(utt.speaker) ?? "other") : "other";
  }

  /**
   * Resolve a model citation to a real place in the transcript. Checks the cited utterance
   * and its neighbours first (models are sometimes off by one), then the whole call.
   */
  locate(ref: EvidenceRef): Evidence {
    this.checked++;
    const utts = this.transcript.utterances;
    const quote = ref.quote.trim();
    const quoteWords = normalizeWords(quote).length;
    let best = { u: -1, score: 0 };

    // Score the quote against utterances [s, e]. Multi-line windows exist because the transcriber
    // often splits one sentence into fragments; they are capped in size so a long window of common
    // words can't "contain" an invented quote by accident.
    const tryWindow = (s: number, e: number) => {
      if (s < 0 || e >= utts.length) return;
      const text = utts.slice(s, e + 1).map((x) => x.text).join(" ");
      if (e > s && normalizeWords(text).length > quoteWords * 3 + 10) return;
      let score = containment(quote, text);
      if (score <= best.score) return;
      // Start the evidence at the first line the quote actually uses.
      while (s < e && containment(quote, utts.slice(s + 1, e + 1).map((x) => x.text).join(" ")) >= score) s++;
      score = Math.max(score, containment(quote, utts.slice(s, e + 1).map((x) => x.text).join(" ")));
      best = { u: s, score };
    };

    for (let s = ref.u - 2; s <= ref.u + 1; s++) {
      for (let len = 0; len < 5; len++) tryWindow(s, s + len);
    }
    if (best.score < MATCH_THRESHOLD) {
      // The model cited the wrong line: search the whole call.
      for (let s = 0; s < utts.length; s++) {
        for (let len = 0; len < 3; len++) tryWindow(s, s + len);
      }
    }

    const verified = best.score >= MATCH_THRESHOLD;
    if (verified) this.verified++;
    const u = verified ? best.u : clamp(ref.u, 0, utts.length - 1);
    const utt = utts[u];
    return {
      u,
      quote,
      start: utt?.start ?? 0,
      end: utt?.end ?? 0,
      role: this.roleOf(u),
      verified,
    };
  }

  locateAll(refs: EvidenceRef[]): Evidence[] {
    return refs.filter((r) => r.quote.trim()).map((r) => this.locate(r));
  }

  locateMaybe(ref: EvidenceRef | null): Evidence | null {
    return ref && ref.quote.trim() ? this.locate(ref) : null;
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
