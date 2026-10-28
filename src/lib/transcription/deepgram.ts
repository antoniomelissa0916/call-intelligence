import { DeepgramClient, DeepgramError } from "@deepgram/sdk";
import { employeeNames, maskUtterance, piiSpans, type DgEntity } from "./pii";
import type { Transcript, Utterance } from "./types";

/** Customer contact details are masked unless MASK_CONTACT_DETAILS=off. */
export function maskPii() {
  return process.env.MASK_CONTACT_DETAILS?.trim().toLowerCase() !== "off";
}

export const TRANSCRIPTION_MODEL = "nova-3";

/** Vocabulary the model should not mishear on pest control calls. */
const KEY_TERMS = [
  "pest control",
  "re-service",
  "quarterly",
  "initial service",
  "scorpions",
  "German cockroaches",
  "termites",
  "rodents",
  "mosquito",
  "wasps",
  "earwigs",
  "silverfish",
  "bed bugs",
  "eaves",
  "cobwebs",
  "exclusion",
  "Bug Bully",
  "Endeavor Pest Management",
  "Noble Pest",
];

const PCI_TOKEN = /\[(CREDIT_CARD|CVV)[^\]]*\]/;

/**
 * Deepgram redacts the card details the customer says, but reps often read them back
 * ("And the three digit code?" … "950."). Mask short numeric read-backs that follow a
 * redacted card detail so they never reach storage or the AI.
 */
export function redactReadback(utterances: Utterance[]): Utterance[] {
  let window = 0;
  return utterances.map((u) => {
    if (PCI_TOKEN.test(u.text)) {
      window = 4;
      return u;
    }
    if (window > 0) {
      window--;
      const words = u.text.split(/\s+/).length;
      if (words <= 8 && /\b\d{3,4}\b/.test(u.text)) {
        return { ...u, text: u.text.replace(/\b\d{3,4}\b/g, "[REDACTED]") };
      }
    }
    return u;
  });
}

export class TranscriptionError extends Error {}

/**
 * @param roster employee first names (reps and technicians) that are never masked; in PestLaunch
 * this comes from the team list synced from the CRM.
 */
export async function transcribeAudio(audio: Buffer, mime: string, roster: string[] = []): Promise<Transcript> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new TranscriptionError("DEEPGRAM_API_KEY is not set");

  const client = new DeepgramClient({ apiKey });
  let response;
  try {
    response = await client.listen.v1.media.transcribeFile(
      new Blob([new Uint8Array(audio)], { type: mime }),
      {
        model: TRANSCRIPTION_MODEL,
        language: "en-US",
        // v2 is Deepgram's current batch diarizer; the old `diarize` flag uses v1.
        diarize_model: "v2",
        utterances: true,
        // Split on shorter pauses so quick back-and-forth turns don't merge into one utterance.
        utt_split: 0.6,
        punctuate: true,
        smart_format: true,
        // Card numbers read out on billing calls never reach storage or the AI.
        redact: "pci",
        // Entities let us mask customer names, phones, emails and addresses (see pii.ts).
        detect_entities: maskPii(),
        keyterm: KEY_TERMS,
      },
      { timeoutInSeconds: 300, maxRetries: 2 },
    );
  } catch (err) {
    if (err instanceof DeepgramError) {
      throw new TranscriptionError(`Deepgram ${err.statusCode}: ${err.message}`);
    }
    throw err;
  }

  if (!("results" in response)) {
    throw new TranscriptionError("Deepgram returned an async callback response");
  }
  const raw = (response.results.utterances ?? []).filter((u) => (u.transcript ?? "").trim().length > 0);
  const alt = response.results.channels?.[0]?.alternatives?.[0];
  const words = alt?.words ?? [];
  const masking = maskPii();
  const spans = masking
    ? piiSpans(words, (alt as { entities?: DgEntity[] } | undefined)?.entities ?? [], new Set([...employeeNames(raw.map((u) => u.transcript ?? "")), ...roster.map((n) => n.toLowerCase())]))
    : [];
  const utterances: Utterance[] = redactReadback(
    raw.map((u, i) => ({
      i,
      speaker: u.speaker ?? 0,
      start: round(u.start ?? 0),
      end: round(u.end ?? 0),
      text: masking ? maskUtterance(u.words ?? [], (u.transcript ?? "").trim(), spans) : (u.transcript ?? "").trim(),
      confidence: round(u.confidence ?? 0, 3),
    })),
  );

  const confidence = words.length
    ? words.reduce((s, w) => s + (w.confidence ?? 0), 0) / words.length
    : 0;

  return {
    provider: "deepgram",
    model: TRANSCRIPTION_MODEL,
    durationSec: round(response.metadata?.duration ?? utterances.at(-1)?.end ?? 0),
    speakers: [...new Set(utterances.map((u) => u.speaker))].sort((a, b) => a - b),
    utterances,
    confidence: round(confidence, 3),
    redactions: masking ? ["pci", "contact_details"] : ["pci"],
    speakerSource: "diarization",
  };
}

function round(n: number, digits = 2) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
