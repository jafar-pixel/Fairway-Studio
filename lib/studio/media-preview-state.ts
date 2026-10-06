import { mediaKind, type MediaJob } from "@/lib/studio/media";
import type { MediaWorkerStatus } from "./media-upload-controller";

export function mediaPresentation(job: MediaJob | null, worker: MediaWorkerStatus | null, legacy = false, fallbackType = "image/jpeg") {
  const type = job?.preview_type || job?.source_type || fallbackType;
  const ready = legacy || Boolean(job?.status === "ready" && (job.preview_path || job.original_ready));
  const kind = mediaKind(type);
  if (ready) return { ready, kind, type, label: "Preview ready", detail: "Available to authorized teammates in this workspace." };
  if (!job) return { ready, kind, type, label: "Checking preview", detail: "Retrieving the saved media status." };
  if (job.status === "failed") return { ready, kind, type, label: "Preview failed", detail: job.error_message || "Preview processing could not finish. The original is preserved." };
  if (job.status === "blocked" || (job.status === "queued" && worker?.automatic === false)) return { ready, kind, type, label: "Preview waiting for setup", detail: job.error_message || worker?.message || "Automatic preview processing is waiting for the workspace worker. The original is preserved." };
  if (job.status === "processing") return { ready, kind, type, label: "Processing preview", detail: "The original is saved. A shared in-app preview is being prepared." };
  if (job.status === "ready") return { ready, kind, type, label: "Preview unavailable", detail: "The job completed without a playable preview. The original is preserved." };
  return { ready, kind, type, label: "Preview queued", detail: "The original is saved and waiting for automatic processing." };
}
