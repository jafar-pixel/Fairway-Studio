"use client";
import { useState } from "react";
import styles from "./social.module.css";
export function MediaPreview({
  versionId,
  title,
}: {
  versionId: string | null;
  title: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!versionId)
    return (
      <div className={styles.mediaPlaceholder}>
        Choose a saved design to preview your story
      </div>
    );
  if (failed === versionId)
    return (
      <div className={styles.mediaPlaceholder}>
        Preview unavailable. The original remains available in its project.
      </div>
    );
  return (
    <img
      className={styles.mediaPreview}
      src={`/api/studio/media?versionId=${encodeURIComponent(versionId)}`}
      alt={title}
      loading="lazy"
      onError={() => setFailed(versionId)}
    />
  );
}
