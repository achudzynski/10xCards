import { z } from "zod";
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import type { GeneratedCard } from "@/types";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CARDS = 10;

export class GenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerationError";
  }
}

const CARD_MAX_LEN = 100;

const flashcardsSchema = z.object({
  cards: z.array(z.object({ front: z.string(), back: z.string() })),
});

const savableCardSchema = z.object({
  front: z.string().trim().min(1).max(CARD_MAX_LEN),
  back: z.string().trim().min(1).max(CARD_MAX_LEN),
});

const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          front: { type: "string" },
          back: { type: "string" },
        },
        required: ["front", "back"],
        additionalProperties: false,
      },
    },
  },
  required: ["cards"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  "You are a flashcard generator. Given a block of source text, produce up to 10 concise, " +
  "self-contained flashcards grounded strictly in the provided text. Each card has a 'front' " +
  "(a question or prompt) and a 'back' (the answer). Do not invent facts not present in the text. " +
  "If the text contains no learnable concepts, return an empty cards array.";

function mockCards(): GeneratedCard[] {
  return [
    { front: "What is the capital of France?", back: "Paris" },
    { front: "What does HTTP stand for?", back: "HyperText Transfer Protocol" },
    { front: "What is 2 + 2?", back: "4" },
  ];
}

export async function generateCards(text: string): Promise<GeneratedCard[]> {
  if (!OPENROUTER_API_KEY) {
    return mockCards();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OPENROUTER_MODEL ?? DEFAULT_MODEL,
        provider: { require_parameters: true },
        response_format: {
          type: "json_schema",
          json_schema: { name: "flashcards", strict: true, schema: RESPONSE_JSON_SCHEMA },
        },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
  } catch (cause) {
    throw new GenerationError("Failed to reach the generation provider", { cause });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GenerationError(`Generation provider returned status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await (response.json() as Promise<unknown>);
  } catch (cause) {
    throw new GenerationError("Generation provider returned malformed JSON", { cause });
  }

  const content = (payload as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new GenerationError("Generation provider returned an unexpected response shape");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new GenerationError("Generation provider returned non-JSON card content", { cause });
  }

  const result = flashcardsSchema.safeParse(parsed);
  if (!result.success) {
    throw new GenerationError("Generation provider returned cards in an invalid shape");
  }

  return result.data.cards
    .flatMap((card) => {
      const parsed = savableCardSchema.safeParse(card);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, MAX_CARDS);
}
