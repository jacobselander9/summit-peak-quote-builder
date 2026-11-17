// Sends the tech's notes to Claude and returns a validated Interpretation.
// Server-only: the API key never reaches the browser.
import Anthropic from "@anthropic-ai/sdk";
import type { Dataset } from "@/lib/data";
import { CLAUDE_EFFORT, CLAUDE_MODEL } from "@/lib/config";
import { buildQuote } from "@/lib/pricing";
import { PricingError } from "@/lib/pricing/types";
import { buildCatalog } from "./catalog";
import { TOOL_DESCRIPTION, buildSystemPrompt, buildUserMessage } from "./prompt";
import { TOOL_NAME, buildToolInputSchema, buildToolInputZod } from "./schema";
import { toInterpretation, type Interpretation } from "./to-spec";

/** A failure we can show the tech in plain words. */
export class InterpretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InterpretError";
  }
}

/** The one SDK method we use, so tests can pass a fake. */
export type MessagesClient = {
  beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } };
};

const MAX_ATTEMPTS = 2; // retry once if the model answers without calling the tool

export async function interpretNotes(
  notes: string,
  data: Dataset,
  client: MessagesClient = new Anthropic(),
): Promise<Interpretation> {
  const catalog = buildCatalog(data);
  const zodSchema = buildToolInputZod(catalog);

  const request = {
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: CLAUDE_EFFORT },
    // If a safety check declines the request, the API retries on a fallback model.
    betas: ["server-side-fallback-2026-07-01" as const],
    fallbacks: "default" as const,
    // The system prompt is the same every call (built from /data), so it caches.
    system: [
      { type: "text" as const, text: buildSystemPrompt(data, catalog), cache_control: { type: "ephemeral" as const } },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        strict: true, // the API enforces the schema, including the enums from /data
        input_schema: buildToolInputSchema(catalog) as Anthropic.Beta.BetaTool.InputSchema,
      },
    ],
    messages: [{ role: "user" as const, content: buildUserMessage(notes) }],
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await client.beta.messages.create(request);

    if (response.stop_reason === "refusal") {
      throw new InterpretError("The AI declined to read these notes. Try rewording them.");
    }
    if (response.stop_reason === "max_tokens") {
      throw new InterpretError("The AI's answer was cut off. Try shorter notes.");
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME,
    );
    if (!toolUse) continue; // answered in text instead of calling the tool; ask again

    const parsed = zodSchema.safeParse(toolUse.input);
    if (!parsed.success) {
      if (attempt < MAX_ATTEMPTS) continue;
      throw new InterpretError("The AI's answer didn't match the expected format. Please try again.");
    }

    const result = toInterpretation(data, catalog, notes, parsed.data);
    return checkPriceable(data, result);
  }
  throw new InterpretError("The AI didn't return a job spec. Please try again.");
}

/** If the engine can't price the spec, turn its error into a question instead. */
function checkPriceable(data: Dataset, result: Interpretation): Interpretation {
  if (!result.spec) return result;
  try {
    buildQuote(data, result.spec);
    return result;
  } catch (err) {
    if (err instanceof PricingError) {
      return { ...result, spec: null, questions: [...result.questions, err.message] };
    }
    throw err;
  }
}

/** Plain-language message for an API failure. */
export function friendlyApiError(err: unknown): string {
  if (err instanceof InterpretError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) {
    return "The Claude API key is missing or invalid. Check ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.RateLimitError) return "Too many requests right now. Wait a moment and try again.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check the internet connection.";
  if (err instanceof Anthropic.APIError) return `The Claude API had a problem (${err.status}). Please try again.`;
  if (err instanceof Error && /api key|apiKey|ANTHROPIC_API_KEY|authentication/i.test(err.message)) {
    return "The Claude API key is missing. Set ANTHROPIC_API_KEY in .env.local.";
  }
  return "Something went wrong reading the notes. Please try again.";
}
