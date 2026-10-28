/** Verifies the configured API keys with one tiny request each.  npm run check:keys */
import { z } from "zod";
import { analysisProvider, structuredCall } from "../src/lib/analysis/llm";
import "./lib";

const provider = analysisProvider();
console.log(`Analysis provider: ${provider}${provider === "gemini" ? ` (${process.env.GEMINI_MODEL || "GEMINI_MODEL not set"})` : ""}`);

try {
  const res = await structuredCall({
    system: "Reply with the requested JSON only.",
    user: "Is a German cockroach an insect? Answer in the JSON field `answer` as yes or no.",
    schema: z.object({ answer: z.enum(["yes", "no"]) }),
    maxTokens: 2000,
  });
  console.log(`✓ ${provider} works · model ${res.model} · answered "${res.data.answer}" · ${res.usage.durationMs} ms`);
} catch (err) {
  console.error(`✗ ${provider} failed:`, err instanceof Error ? err.message : err);
  process.exitCode = 1;
}

if (process.env.DEEPGRAM_API_KEY) {
  const r = await fetch("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` } });
  console.log(r.ok ? "✓ Deepgram key works" : `✗ Deepgram key rejected (${r.status})`);
} else {
  console.log("✗ DEEPGRAM_API_KEY not set");
}
