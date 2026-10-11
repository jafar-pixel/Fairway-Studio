export type CreativeMode = "chat" | "image" | "comment";
export function validateCreativePrompt(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000)
    throw Error("Write between 1 and 2,000 characters.");
  return value.trim();
}
export function creativeHistory(
  turns: { prompt: string; answer: string; mode: string; status: string }[],
) {
  return turns
    .filter((t) => t.status === "complete")
    .slice(-20)
    .flatMap((t) => [
      {
        role: "user" as const,
        content: t.mode === "image" ? `Image request: ${t.prompt}` : t.prompt,
      },
      ...(t.answer ? [{ role: "assistant" as const, content: t.answer }] : []),
    ]);
}
