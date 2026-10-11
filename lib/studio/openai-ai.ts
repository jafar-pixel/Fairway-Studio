import { createOpenAI } from "@ai-sdk/openai";
import { StudioError } from "./contracts";

// Server-only provider configuration. Never accept a model, endpoint, or key from a request.
export const OPENAI_TEXT_MODEL = "gpt-5.4-mini";
export const OPENAI_IMAGE_MODEL = "gpt-image-2.5-flare";
export function openaiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
export function studioOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new StudioError(
    "OpenAI is not connected yet. The project owner must add OPENAI_API_KEY to the server environment and redeploy.",
    "AI_SETUP_REQUIRED", 503,
  );
  return createOpenAI({ apiKey });
}
