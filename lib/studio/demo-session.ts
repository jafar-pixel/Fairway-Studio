/** Tab-local demo data only. Never reads or writes authenticated workspace state. */
export const DEMO_SESSION_KEY = "fairway-demo-session-v3";
export const LEGACY_DEMO_SESSION_KEY = "fairway-demo-session-v2";
const VERSION = 3;
type Row = Record<string, any>;
type StorageProvider = () => Pick<Storage, "getItem" | "setItem">;
const object = (value: unknown): value is Row => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** Keep the current seed schema, fill newly introduced collections, and reject live-workspace rows. */
export function normalizeDemoSession(value: unknown, seed: Row): Row | null {
  if (!object(value) || !object(value.workspace) || value.workspace.id !== "demo" || seed.workspace?.id !== "demo") return null;
  const result: Row = { ...seed };
  for (const [key, fallback] of Object.entries(seed)) {
    const saved = value[key];
    if (Array.isArray(fallback)) {
      if (!Array.isArray(saved)) continue;
      if (key === "missingSchema") { result[key] = saved.filter((entry) => typeof entry === "string"); continue; }
      result[key] = saved.filter((entry) => object(entry) && typeof entry[key === "members" ? "user_id" : "id"] === "string" && (!entry.workspace_id || entry.workspace_id === "demo")).map((entry) => {
        const row = { ...entry };
        for (const field of ["title", "body", "details", "name", "note", "context_note"]) if (field in row && typeof row[field] !== "string") row[field] = "";
        for (const field of ["tags", "contributor_ids", "attachment_ids", "reviewer_ids", "reviewers"]) if (field in row) row[field] = Array.isArray(row[field]) ? row[field].filter((item: unknown) => typeof item === "string") : [];
        if ("checklist" in row && !Array.isArray(row.checklist)) row.checklist = [];
        return row;
      });
    } else if (key === "workspace") {
      result.workspace = { ...fallback, ...saved, id: "demo", name: typeof saved?.name === "string" ? saved.name : fallback.name };
    } else if (key === "notificationPreferences" && object(saved)) {
      result[key] = { ...fallback, ...saved, events: object(saved.events) ? { ...fallback.events, ...saved.events } : fallback.events };
    }
    // User identity, role and capabilities are always taken from the isolated demo seed.
  }
  return result;
}

/** Loading has no write side effects, including Strict Mode's repeated mount effects. */
export function loadDemoSession(storage: StorageProvider, seed: Row): { data: Row; restored: boolean; persistenceAvailable: boolean } {
  try {
    const store = storage();
    for (const key of [DEMO_SESSION_KEY, LEGACY_DEMO_SESSION_KEY]) {
      const raw = store.getItem(key);
      if (!raw) continue;
      try {
        const decoded = JSON.parse(raw);
        const candidate = key === DEMO_SESSION_KEY ? (decoded?.version === VERSION && decoded?.scope === "fairway-demo" ? decoded.data : null) : decoded;
        const data = normalizeDemoSession(candidate, seed);
        if (data) return { data, restored: true, persistenceAvailable: true };
      } catch { /* A corrupt or older payload never replaces the current seed. */ }
    }
    return { data: seed, restored: false, persistenceAvailable: true };
  } catch {
    return { data: seed, restored: false, persistenceAvailable: false };
  }
}

/** Commit synchronously before navigation can unmount the route. Storage failure is non-fatal. */
export function saveDemoSession(storage: StorageProvider, data: Row): boolean {
  if (data.workspace?.id !== "demo") return false;
  try {
    storage().setItem(DEMO_SESSION_KEY, JSON.stringify({ version: VERSION, scope: "fairway-demo", data }));
    return true;
  } catch { return false; }
}
