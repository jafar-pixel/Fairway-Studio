"use client";
import { useEffect, useRef, useState } from "react";
import type { DraftFields } from "./editor";
import styles from "./social.module.css";
export function SocialAssistant({
  workspaceId,
  fields,
  disabled,
  onApply,
  onDirty,
}: {
  workspaceId: string;
  fields: DraftFields;
  disabled: boolean;
  onApply: (caption: string) => void;
  onDirty: () => void;
}) {
  const [instruction, setInstruction] = useState(""),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [issue, setIssue] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function ask() {
    if (busy || disabled || !instruction.trim()) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setIssue("");
    try {
      const { title, purpose, audience, channel, format, caption } = fields;
      const response = await fetch("/api/studio/social/assist", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          workspaceId,
          instruction,
          context: {
            title,
            purpose,
            audience,
            channel,
            format,
            caption: answer || caption,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || "The writing assistant is unavailable.",
        );
      if (typeof result.caption !== "string" || !result.caption.trim())
        throw new Error("No usable caption was returned.");
      if (!abort.signal.aborted) {
        setAnswer(result.caption);
        onDirty();
      }
    } catch (cause) {
      if (!abort.signal.aborted)
        setIssue(
          cause instanceof Error
            ? cause.message
            : "The assistant could not connect.",
        );
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className={styles.assistant} aria-label="AI writing partner">
      <div className={styles.spread}>
        <div>
          <p className={styles.eyebrow}>Creative partner · OpenAI</p>
          <h3>What do you want to say?</h3>
        </div>
        <span className={styles.badge}>Suggestions, then your approval</span>
      </div>
      <p className={styles.muted}>
        Describe your own idea, ask for a new angle, or refine the suggestion.
        Uses this draft’s title, brief, audience and caption; it does not
        inspect the image.
      </p>
      <label className={styles.field}>
        Your direction
        <textarea
          maxLength={2000}
          disabled={disabled || busy}
          value={instruction}
          placeholder="Tell the story in your own words. Ask for the tone, message or audience you want."
          onChange={(e) => {
            setInstruction(e.target.value);
            onDirty();
          }}
        />
      </label>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.primary}
          disabled={disabled || busy || !instruction.trim()}
          onClick={() => void ask()}
        >
          {busy ? "Writing…" : answer ? "Refine suggestion" : "Draft with AI"}
        </button>
        {busy ? (
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            Stop
          </button>
        ) : null}
      </div>
      {issue ? (
        <p className={styles.error} role="alert">
          {issue}
        </p>
      ) : null}
      {answer ? (
        <>
          <label className={styles.field}>
            Proposed caption
            <textarea
              rows={6}
              maxLength={10000}
              disabled={disabled || busy}
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                onDirty();
              }}
            />
          </label>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.button}
              disabled={disabled || busy || !answer.trim()}
              onClick={() => {
                onApply(answer);
                setAnswer("");
                setIssue("");
              }}
            >
              Use as working caption
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={disabled || busy}
              onClick={() => setAnswer("")}
            >
              Discard suggestion
            </button>
          </div>
          <p className={styles.small}>
            Applying replaces the working caption. Save the draft to keep it.
            Founder approval is a separate step.
          </p>
        </>
      ) : null}
    </section>
  );
}
