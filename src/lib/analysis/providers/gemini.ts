import { ApiError, GoogleGenAI, ThinkingLevel, type GenerateContentConfig } from "@google/genai";
import { z } from "zod";
import { AnalysisError, type StructuredRequest, type StructuredResult } from "../llm";

let client: GoogleGenAI | undefined;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new AnalysisError("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/**
 * GEMINI_MODEL may list fallbacks, e.g. "gemini-3-flash-preview,gemini-3.5-flash-lite":
 * when a model is overloaded (503) the request moves to the next one instead of failing.
 */
function geminiModels(): string[] {
  const list = (process.env.GEMINI_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!list.length) throw new AnalysisError("GEMINI_MODEL is not set (copy the exact model ID from Google AI Studio)");
  return list;
}

/** Zod → the JSON Schema subset Gemini accepts (no $schema keyword). */
function toGeminiSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/** Some Gemini models take a thinking level, older ones don't; we fall back if it's rejected. */
let thinkingSupported = true;

/**
 * Request pacing. Free-tier keys allow only a few requests per minute per model, so requests
 * are spaced by 60s / GEMINI_RPM (default 5). Paid keys can raise GEMINI_RPM.
 */
const g = globalThis as unknown as { __geminiNext?: number };
async function pace() {
  const rpm = Math.max(1, Number(process.env.GEMINI_RPM ?? 5));
  const interval = Math.ceil(60_000 / rpm) + 250;
  const now = Date.now();
  const at = Math.max(now, g.__geminiNext ?? 0);
  g.__geminiNext = at + interval;
  if (at > now) await sleep(at - now);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds Google asks us to wait, from "Please retry in 49.01s" in a 429. */
function retryAfterMs(message: string): number | null {
  const m = /retry in ([\d.]+)s/i.exec(message);
  return m ? Math.ceil(Number(m[1]) * 1000) + 1000 : null;
}

/**
 * One Gemini structured-output request. Gemini constrains output to the JSON schema; we
 * still parse it with the same Zod schema so both providers are held to one contract.
 */
export async function geminiStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<StructuredResult<z.infer<S>>> {
  const started = Date.now();
  const models = geminiModels();
  let modelIndex = 0;
  let overloadedTries = 0;
  const baseConfig: GenerateContentConfig = {
    systemInstruction: req.system,
    responseMimeType: "application/json",
    responseJsonSchema: toGeminiSchema(req.schema),
    maxOutputTokens: req.maxTokens ?? 32000,
  };

  let lastError: unknown;
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = models[modelIndex];
    const config: GenerateContentConfig = thinkingSupported
      ? { ...baseConfig, thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } }
      : baseConfig;
    await pace();
    try {
      const res = await getClient().models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        config,
      });
      const candidate = res.candidates?.[0];
      const finish = candidate?.finishReason;
      if (finish === "SAFETY" || finish === "PROHIBITED_CONTENT" || finish === "BLOCKLIST") {
        throw new AnalysisError(`Model declined to analyze this call (${finish})`);
      }
      if (finish === "MAX_TOKENS") throw new AnalysisError("Analysis was cut off (max tokens)");
      const text = res.text;
      if (!text) throw new AnalysisError("Model returned no content");
      const parsed = req.schema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new AnalysisError(`Analysis did not match the expected format: ${parsed.error.message.slice(0, 200)}`);
      const u = res.usageMetadata;
      return {
        data: parsed.data,
        model: res.modelVersion ?? model,
        usage: {
          inputTokens: u?.promptTokenCount ?? 0,
          outputTokens: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
          durationMs: Date.now() - started,
        },
      };
    } catch (err) {
      lastError = err;
      if (err instanceof ApiError) {
        if (err.status === 400 && thinkingSupported && /thinking/i.test(err.message)) {
          thinkingSupported = false;
          continue;
        }
        if (err.status === 429 && /free_tier[^"]*limit: 0/.test(err.message)) {
          throw new AnalysisError(
            `This Gemini API key is on the free tier, which has no quota for ${model}. Turn on billing for the key's project in Google AI Studio (API keys → Set up billing).`,
          );
        }
        if (err.status === 429 && /PerDay/.test(err.message) && !/PerMinute/.test(err.message)) {
          if (modelIndex < models.length - 1) {
            // This model's daily quota is used up: continue on the next model in the list.
            modelIndex++;
            overloadedTries = 0;
            continue;
          }
          throw new AnalysisError(
            `Gemini's daily free-tier limit for ${model} is used up. It resets within 24 hours, or turn on billing for higher limits.`,
          );
        }
        if (err.status === 503 && modelIndex < models.length - 1 && ++overloadedTries >= 2) {
          // Overloaded twice: move to the next model in the list.
          modelIndex++;
          overloadedTries = 0;
          continue;
        }
        if (err.status === 429 || err.status >= 500) {
          // Rate limited or overloaded: wait as long as Google asks, else back off (5s, 10s, 20s… max 60s).
          await sleep(retryAfterMs(err.message) ?? Math.min(60_000, 5000 * 2 ** attempt));
          continue;
        }
        throw new AnalysisError(`Gemini ${err.status}: ${err.message.slice(0, 300)}`);
      }
      if (err instanceof AnalysisError && err.message.startsWith("Model declined")) throw err;
      // JSON / schema mismatch: retry
    }
  }
  throw lastError;
}
