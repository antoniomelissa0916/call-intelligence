import type { z } from "zod";

/**
 * Provider-neutral structured output. The analysis engine only ever asks for "JSON matching
 * this schema"; which model answers is configuration (ANALYSIS_PROVIDER = claude | gemini).
 * Either way the result is validated against the same Zod schema before it is used.
 */

export class AnalysisError extends Error {}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  user: string;
  schema: S;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: Usage;
  model: string;
}

export type Provider = "claude" | "gemini";

export function analysisProvider(): Provider {
  const p = process.env.ANALYSIS_PROVIDER?.trim().toLowerCase();
  if (p === "gemini") return "gemini";
  if (p === "claude" || p === "anthropic") return "claude";
  // No explicit choice: use whichever key is configured.
  return !process.env.ANTHROPIC_API_KEY && process.env.GEMINI_API_KEY ? "gemini" : "claude";
}

export async function structuredCall<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
  if (analysisProvider() === "gemini") {
    const { geminiStructured } = await import("./providers/gemini");
    return geminiStructured(req);
  }
  const { claudeStructured } = await import("./providers/claude");
  return claudeStructured(req);
}
