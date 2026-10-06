/** Canonical creator-flow persistence. No attribution is supplied as an actor field. */
type Row = Record<string, any>;
type Mutate = (operation: string, input: Record<string, unknown>) => Promise<unknown>;
export const CREATOR_SOURCES = ["Manual idea", "Pinterest / reference", "Photo", "Sketch", "Thought", "AI-assisted"] as const;
export function creatorBody(body: string, origin: string, credit: string, story: string): string {
  const context = [origin && `Origin: ${origin}`, credit.trim() && `Source creator / credit: ${credit.trim()}`, story.trim() && `Story / team context: ${story.trim()}`].filter(Boolean).join("\n");
  const result = context ? `${body}${body ? "\n\n" : ""}Creative context\n${context}` : body;
  if (result.length > 3000) throw new Error("Keep the description and creative context within 3,000 characters.");
  return result;
}
export function creatorTags(value: string): string[] {
  const tags = [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 20 || tags.some((tag) => tag.length > 48)) throw new Error("Use up to 20 tags, with at most 48 characters each.");
  return tags;
}
export function sourceContext(note: string, credit: string): string {
  const result = [note.trim(), credit.trim() && `Source creator / credit: ${credit.trim()}`].filter(Boolean).join("\n");
  if (result.length > 500) throw new Error("Source notes and creator credit must fit within 500 characters.");
  return result;
}
export function normalizeIdeaCategory(category: string): string {
  return ({ brand_identity: "Brand identity", product: "Product", apparel: "Apparel", campaign: "Campaign", material: "Material", general: "General" } as Record<string, string>)[category] || category || "General";
}
const matches = (row: Row, draft: Row) => Object.keys(draft).every((key) => JSON.stringify(row[key] ?? (key === "tags" ? [] : "")) === JSON.stringify(draft[key]));

/** One session per mounted editor. Frozen requests reuse app mutation idempotency keys after lost responses. */
export class IdeaSaveSession {
  idea: Row | null;
  private saving: Promise<Row> | null = null;
  private pendingCreate: Row | null = null;
  private pendingUpdate: Row | null = null;
  private links = new Set<string>();
  private pendingSource: { operation: "importPin" | "createExternalFile"; input: Row; key: string } | null = null;
  private sources = new Map<string, { target: "file_id" | "reference_id"; id: string }>();
  constructor(private workspaceId: string, idea: Row | null, private mutate: Mutate, private getData: () => Row) { this.idea = idea; }
  private accept(row: Row) {
    if (!row?.id || (row.workspace_id && row.workspace_id !== this.workspaceId)) throw new Error("The saved idea could not be verified in this workspace. Keep this draft open and retry.");
    this.idea = row;
    return row;
  }
  sync(data: Row) {
    if (!this.idea) return;
    const row = (data.ideas || []).find((item: Row) => item.id === this.idea!.id && (!item.workspace_id || item.workspace_id === this.workspaceId));
    if (row && Number(row.revision) >= Number(this.idea.revision || 0)) this.idea = row;
    for (const link of data.ideaAssets || []) {
      if (link.idea_id === this.idea!.id && (!link.workspace_id || link.workspace_id === this.workspaceId)) {
        for (const target of ["file_id", "reference_id", "version_id"]) if (link[target]) this.links.add(`${target}:${link[target]}`);
      }
    }
  }
  async refresh() {
    const fresh = await this.mutate("refresh", {}) as Row | null;
    const data = fresh || this.getData();
    this.sync(data);
    return data;
  }
  save(draft: Row): Promise<Row> {
    if (this.saving) return this.saving;
    this.saving = Promise.resolve().then(() => this.performSave(draft)).finally(() => { this.saving = null; });
    return this.saving;
  }
  private async performSave(draft: Row) {
    if (!this.idea) {
      this.pendingCreate ||= { ...draft };
      const result = await this.mutate("createIdea", this.pendingCreate) as Row;
      this.accept(result);
      this.pendingCreate = null;
    }
    // A response lost during update must be reconciled before applying later edits.
    if (this.pendingUpdate) {
      try { await this.refresh(); } catch { /* Retry the same idempotent mutation below. */ }
      const { id, expected_revision, ...wanted } = this.pendingUpdate;
      if (!matches(this.idea!, wanted)) this.accept(await this.mutate("updateIdea", this.pendingUpdate) as Row);
      this.pendingUpdate = null;
    }
    if (!matches(this.idea!, draft)) {
      this.pendingUpdate = { id: this.idea!.id, expected_revision: this.idea!.revision, ...draft };
      this.accept(await this.mutate("updateIdea", this.pendingUpdate) as Row);
      this.pendingUpdate = null;
    }
    return this.idea!;
  }
  async link(target: "file_id" | "reference_id" | "version_id", id: string) {
    if (!this.idea) throw new Error("Save the idea before attaching media.");
    this.sync(this.getData());
    const key = `${target}:${id}`;
    if (this.links.has(key)) return;
    const input = { idea_id: this.idea.id, expected_revision: this.idea.revision, [target]: id };
    try {
      const result = await this.mutate("linkIdeaAsset", input) as Row;
      this.links.add(key);
      if (Number.isInteger(result?.idea_revision)) this.idea = { ...this.idea, revision: result.idea_revision };
      else { // The isolated demo returns a link rather than the server envelope.
        this.idea = { ...this.idea, revision: Number(this.idea.revision || 0) + 1 };
      }
    } catch (error) {
      try { await this.refresh(); } catch { /* Preserve the saved ID and original failure. */ }
      if (!this.links.has(key)) throw error;
    }
  }
  async saveSource(operation: "importPin" | "createExternalFile", input: Row) {
    const key = JSON.stringify([operation, input.url]);
    // Resolve an uncertain earlier request with exactly its original input first.
    if (this.pendingSource && this.pendingSource.key !== key) await this.saveSource(this.pendingSource.operation, this.pendingSource.input);
    let source = this.sources.get(key);
    if (!source) {
      const target = operation === "importPin" ? "reference_id" : "file_id";
      const rows = this.getData()[operation === "importPin" ? "references" : "files"] || [];
      const existing = rows.find((row: Row) => row.url === input.url && !row.archived_at && (!row.workspace_id || row.workspace_id === this.workspaceId));
      this.pendingSource ||= { operation, input: { ...input }, key };
      const row = existing || await this.mutate(operation, this.pendingSource.input) as Row;
      if (!row?.id || (row.workspace_id && row.workspace_id !== this.workspaceId)) throw new Error("The source could not be verified in this workspace. Keep this draft open and retry.");
      source = { target, id: row.id };
      this.sources.set(key, source);
      this.pendingSource = null;
    }
    await this.link(source.target, source.id);
    return source;
  }
}
