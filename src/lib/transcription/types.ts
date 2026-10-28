export interface Utterance {
  /** Position in the transcript; the analysis cites evidence by this index. */
  i: number;
  /** Diarized speaker number from the provider (0, 1, 2…). */
  speaker: number;
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface Transcript {
  provider: "deepgram";
  model: string;
  durationSec: number;
  speakers: number[];
  utterances: Utterance[];
  /** Mean word confidence, 0–1. Low values usually mean poor audio. */
  confidence: number;
  redactions: string[];
  /**
   * "diarization": speaker numbers come from the audio. "ai": diarization found a single
   * voice on a two-person call, so each line was attributed to rep/customer from context.
   */
  speakerSource?: "diarization" | "ai";
}
