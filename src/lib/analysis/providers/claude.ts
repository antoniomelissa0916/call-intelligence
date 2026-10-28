import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { AnalysisError, type StructuredRequest, type StructuredResult } from "../llm";

export const DEFAULT_CLAUDE_MODEL = "claude-opus-5-5";

let client: Anthropic | undefined;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new AnalysisError("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ maxRetries: 3, timeout: 10 * 60 * 1000 });
  return client;
}

/**
 * One Claude structured-output request. The SDK validates the response against the schema;
 * a malformed or truncated response is retried once.
 */
export async function claudeStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
  const started = Date.now();
  const model = process.env.ANALYSIS_MODEL?.trim() || DEFAULT_CLAUDE_MODEL;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient().beta.messages.parse({
        model,
        max_tokens: req.maxTokens ?? 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // The system prompt is identical for every call, so it is cached across calls.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: req.user }],
        output_config: { effort: "high", format: betaZodOutputFormat(req.schema) },
      });
      if (res.stop_reason === "refusal") {
        throw new AnalysisError(`Model declined to analyze this call (${res.stop_details?.category ?? "unknown"})`);
      }
      if (res.stop_reason === "max_tokens") throw new AnalysisError("Analysis was cut off (max_tokens)");
      if (!res.parsed_output) throw new AnalysisError("Analysis did not match the expected format");
      return {
        data: res.parsed_output as z.infer<S>,
        model: res.model,
        usage: {
          inputTokens:
            res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0),
          outputTokens: res.usage.output_tokens,
          durationMs: Date.now() - started,
        },
      };
    } catch (err) {
      lastError = err;
      // Auth / bad request errors won't fix themselves; transient ones are retried by the SDK.
      if (err instanceof Anthropic.APIError) throw err;
      if (err instanceof AnalysisError && err.message.startsWith("Model declined")) throw err;
    }
  }
  throw lastError;
}
