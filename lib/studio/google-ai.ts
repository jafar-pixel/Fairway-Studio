import { createGoogle } from "@ai-sdk/google";
import { StudioError } from "./contracts";

// Server-only provider configuration. Never accept a model, endpoint, or key from a request.
export const GOOGLE_TEXT_MODEL = "gemini-3.8-flash";
export const GOOGLE_IMAGE_MODEL = "gemini-nano-banana-2.1";
export function googleConfigured() {
  return Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
}
export function studioGoogle() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) throw new StudioError(
    "Google AI is not connected yet. The project owner must add GEMINI_API_KEY to the server environment and redeploy.",
    "AI_SETUP_REQUIRED", 503,
  );
  return createGoogle({ apiKey });
}
