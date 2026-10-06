import { inferMediaType, isMediaPath, MAX_MEDIA_BYTES, type MediaJob } from "@/lib/studio/media";

export type MediaWorkerStatus = {
  available: boolean;
  automatic: boolean;
  code: string | null;
  message: string | null;
};

export type RegisteredMedia = { id: string; job: MediaJob | null; worker: MediaWorkerStatus };
export type MediaOrigin = "manual" | "ai" | "reference";
export type UploadMetadata = {
  title: string;
  contextNote: string;
  creatorName: string;
  sourceUrl: string;
  sourceKind: MediaOrigin;
  tags: string[];
};
export type UploadState = "staged" | "uploading" | "registering" | "saved" | "linking" | "attached" | "canceled" | "error";
export type StagedMedia = {
  id: string;
  file: File;
  type: string;
  path: string;
  metadata: UploadMetadata;
  state: UploadState;
  progress: number;
  uploaded: boolean;
  registered: RegisteredMedia | null;
  attached: boolean;
  error: string | null;
};
export type UploadSnapshot = { items: readonly StagedMedia[]; busy: boolean; selectionErrors: readonly string[] };
export type UploadBatchOptions = {
  /** Called serially, exactly once after each successful callback, including link retries.
   * Keep the saved idea ID and current revision in a ref; advance with each returned revision.
   * The callback itself should reconcile an already-existing canonical link after uncertain errors.
   */
  onRegistered?: (file: RegisteredMedia, item: StagedMedia) => Promise<void>;
};
export type UploadBatchResult = { complete: boolean; saved: RegisteredMedia[]; failures: { id: string; message: string }[] };
export type RegistrationInput = { workspaceId: string; path: string; title: string; contextNote: string; tags: string[] };
export type UploadTransport = {
  uploadOriginal: (item: StagedMedia, signal: AbortSignal, onProgress: (percentage: number) => void) => Promise<void>;
  register: (input: RegistrationInput, signal: AbortSignal) => Promise<RegisteredMedia>;
};

const origins: Record<MediaOrigin, string> = { manual: "Manual", ai: "AI-assisted", reference: "Reference" };

/** Provenance uses the existing canonical context_note field; no unsupported columns are sent. */
export function mediaContextNote(metadata: UploadMetadata): string {
  const creator = metadata.creatorName.trim();
  const source = metadata.sourceUrl.trim();
  if (!Object.prototype.hasOwnProperty.call(origins, metadata.sourceKind)) throw new Error("Choose Manual, AI-assisted or Reference for the origin.");
  if (/[\r\n]/.test(source)) throw new Error("Keep the source URL on one line.");
  if (source) {
    let url: URL;
    try { url = new URL(source); } catch { throw new Error("Enter a complete HTTPS source URL."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an HTTPS source URL without sign-in information.");
  }
  if (/[\r\n]/.test(creator)) throw new Error("Keep the creator name on one line.");
  const note = [
    `Origin: ${origins[metadata.sourceKind]}`,
    creator && `Source creator / credit: ${creator}`,
    source && `Source URL: ${source}`,
    metadata.contextNote.trim() && `\n${metadata.contextNote.trim()}`,
  ].filter(Boolean).join("\n");
  if (note.length > 500) throw new Error("Keep the notes and provenance together under 500 characters.");
  return note;
}

export function validateUploadMetadata(metadata: UploadMetadata): string {
  if (metadata.title.trim().length > 160) throw new Error("Keep the title to 160 characters or fewer.");
  if (metadata.tags.length > 10 || metadata.tags.some((tag) => tag.length > 40)) throw new Error("Use up to 10 tags, with 40 characters or fewer per tag.");
  return mediaContextNote(metadata);
}

export function validateSelectedMedia(file: Pick<File, "name" | "type" | "size">): string {
  if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("Empty files cannot be uploaded.");
  if (file.size > MAX_MEDIA_BYTES) throw new Error("Each file must be 100 MB (100,000,000 bytes) or smaller.");
  const type = inferMediaType(file.name, file.type);
  if (!type) throw new Error("Choose a JPG, PNG, GIF, WebP, AVIF, HEIC, HEIF, MP3, MP4, MOV or MKV with a matching file type.");
  return type;
}

export function mediaBytes(bytes: number): string {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1_000))} KB`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "This file could not be saved. Retry to continue.";
}

/** Framework-independent queue; successful storage/registration/link stages survive partial failure. */
export class MediaUploadController {
  private snapshot: UploadSnapshot = { items: [], busy: false, selectionErrors: [] };
  private listeners = new Set<() => void>();
  private running: Promise<UploadBatchResult> | null = null;
  private active: { id: string; abort: AbortController } | null = null;
  private disposed = false;
  private lastOptions: UploadBatchOptions = {};
  constructor(private readonly options: UploadTransport & { workspaceId: string; userId: string; randomId?: () => string; disabled?: boolean }) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(next: Partial<UploadSnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    this.listeners.forEach((listener) => listener());
  }
  private update(id: string, patch: Partial<StagedMedia>) {
    this.emit({ items: this.snapshot.items.map((item) => item.id === id ? { ...item, ...patch } : item) });
  }
  private item(id: string) { return this.snapshot.items.find((item) => item.id === id); }
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; this.active?.abort.abort(); }
  addFiles(files: Iterable<File>) {
    if (this.snapshot.busy) return;
    const added: StagedMedia[] = [];
    const errors: string[] = [];
    if (this.options.disabled) { this.emit({ selectionErrors: ["Uploads need a signed-in workspace. Demo files are not stored."] }); return; }
    for (const file of files) {
      try {
        const type = validateSelectedMedia(file);
        const id = this.options.randomId?.() ?? crypto.randomUUID();
        const extension = file.name.split(".").pop()!.toLowerCase();
        const path = `${this.options.workspaceId}/${this.options.userId}/${id}.${extension}`;
        if (!isMediaPath(path, this.options.workspaceId, this.options.userId)) throw new Error("Sign in to a valid workspace before uploading.");
        added.push({ id, file, type, path, metadata: { title: file.name.slice(0, 160), contextNote: "", creatorName: "", sourceUrl: "", sourceKind: "manual", tags: [] }, state: "staged", progress: 0, uploaded: false, registered: null, attached: false, error: null });
      } catch (error) { errors.push(`${file.name}: ${errorMessage(error)}`); }
    }
    this.emit({ items: [...this.snapshot.items, ...added], selectionErrors: errors });
  }
  clearSelectionErrors() { this.emit({ selectionErrors: [] }); }
  updateMetadata(id: string, metadata: Partial<UploadMetadata>) {
    const item = this.item(id);
    if (!item || this.snapshot.busy || item.registered) return;
    this.update(id, { metadata: { ...item.metadata, ...metadata }, error: null });
  }
  remove(id: string) {
    if (this.snapshot.busy) return;
    // Removing a selection never deletes an original, canonical Library record, or idea link.
    this.emit({ items: this.snapshot.items.filter((item) => item.id !== id) });
  }
  cancel(id: string) {
    const item = this.item(id);
    if (!item || item.state === "linking" || item.attached || item.registered) return;
    if (this.active?.id === id) this.active.abort.abort();
    else this.update(id, { state: "canceled", error: "Upload canceled. Retry to continue." });
  }
  retry(id: string, options = this.lastOptions) {
    if (this.running) return this.running;
    const item = this.item(id);
    if (!item) return Promise.resolve({ complete: true, saved: [], failures: [] });
    this.update(id, { state: item.registered ? "saved" : "staged", error: null });
    return this.run([id], options);
  }
  uploadAll = (options: UploadBatchOptions = {}): Promise<UploadBatchResult> => {
    if (this.running) return this.running;
    return this.run(this.snapshot.items.map((item) => item.id), options);
  };
  private run(ids: string[], options: UploadBatchOptions): Promise<UploadBatchResult> {
    this.lastOptions = options;
    this.emit({ busy: true });
    // Defer work so the promise is stored before any synchronous/fast completion.
    this.running = Promise.resolve().then(async () => {
      const failures: UploadBatchResult["failures"] = [];
      for (const id of ids) {
        if (this.disposed) break;
        let item = this.item(id);
        if (!item) continue;
        if (item.state === "canceled") { failures.push({ id, message: "Retry or remove this canceled file before finishing." }); continue; }
        if (item.attached || (item.registered && !options.onRegistered)) continue;
        const abort = new AbortController();
        this.active = { id, abort };
        try {
          if (!item.registered) {
            // Check all user-editable metadata before transferring bytes.
            const contextNote = validateUploadMetadata(item.metadata);
            if (!item.uploaded) {
              this.update(id, { state: "uploading", error: null });
              await this.options.uploadOriginal(item, abort.signal, (progress) => this.update(id, { progress: Math.max(0, Math.min(100, progress)) }));
              this.update(id, { uploaded: true, progress: 100 });
            }
            abort.signal.throwIfAborted();
            this.update(id, { state: "registering", error: null });
            const registered = await this.options.register({ workspaceId: this.options.workspaceId, path: item.path, title: item.metadata.title.trim() || item.file.name.slice(0, 160), contextNote, tags: item.metadata.tags }, abort.signal);
            if (!registered.id) throw new Error("The original uploaded but its Library ID was not returned. Retry to recover the same upload.");
            this.update(id, { registered, state: "saved", error: null });
          }
          item = this.item(id)!;
          if (this.disposed) break;
          if (options.onRegistered && !item.attached) {
            this.update(id, { state: "linking" });
            await options.onRegistered(item.registered!, item);
            this.update(id, { state: "attached", attached: true, error: null });
          }
        } catch (error) {
          const message = abort.signal.aborted ? "Upload canceled. Retry to continue." : errorMessage(error);
          this.update(id, { state: abort.signal.aborted ? "canceled" : "error", error: message });
          failures.push({ id, message });
        } finally { this.active = null; }
      }
      const items = ids.map((id) => this.item(id)).filter((item): item is StagedMedia => Boolean(item));
      return { complete: !this.disposed && !failures.length && items.every((item) => options.onRegistered ? item.attached : Boolean(item.registered)), saved: items.flatMap((item) => item.registered ? [item.registered] : []), failures };
    }).finally(() => { this.running = null; this.emit({ busy: false }); });
    return this.running;
  }
}
