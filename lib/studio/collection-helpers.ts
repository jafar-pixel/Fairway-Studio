export function canonicalPinUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Paste a full HTTPS Pinterest Pin URL.");
  }
  if (
    url.protocol !== "https:" ||
    !["pinterest.com", "www.pinterest.com"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new Error(
      "Use a full https://www.pinterest.com/pin/123456789/ URL. Open short links in Pinterest first.",
    );
  const match = url.pathname.match(/^\/pin\/(\d+)\/?$/);
  if (!match)
    throw new Error("This must be a Pin URL, not a profile or board.");
  return `https://www.pinterest.com/pin/${match[1]}/`;
}
export function safeExternalUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
export function normalizedTags(value: string | string[] | undefined): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : (value || "").split(","))
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}
export function matchesCollectionQuery(
  item: Record<string, any>,
  query: string,
): boolean {
  const text = [
    item.title,
    item.name,
    item.body,
    item.details,
    item.note,
    item.context_note,
    item.source,
    item.category,
    ...(item.tags || []),
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}
export function taskStatus(value: string): string {
  return value === "todo" || value === "to_do" ? "open" : value;
}
export function isTaskOverdue(
  task: { due_date?: string | null; status?: string },
  today: string,
): boolean {
  return Boolean(
    task.due_date &&
      task.status !== "done" &&
      task.due_date.slice(0, 10) < today,
  );
}
export function localDate(timezone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)?.value)
    .join("-");
}
export function collectionItemId(
  pathname: string,
  query: string,
  section: string,
): string {
  const parts = pathname.split("/");
  const index = parts.indexOf(section);
  return (
    new URLSearchParams(query).get("item") ||
    (index >= 0 ? parts[index + 1] : "") ||
    ""
  );
}
export function collectionDetailUrl(
  href: string,
  section: string,
  id?: string,
): string {
  const url = new URL(href);
  const parts = url.pathname.split("/");
  const index = parts.indexOf(section);
  if (index >= 0) url.pathname = parts.slice(0, index + 1).join("/");
  if (id) url.searchParams.set("item", id);
  else url.searchParams.delete("item");
  return url.toString();
}

export type IdeaAssetChoice = {
  key: string;
  target: 'reference_id' | 'file_id' | 'version_id';
  kind: 'Reference' | 'File' | 'Concept version';
  row: Record<string, any>;
};
export function ideaAssetChoices(data: Record<string, any>): IdeaAssetChoice[] {
  const groups: Array<[string, IdeaAssetChoice['target'], IdeaAssetChoice['kind']]> = [
    ['references', 'reference_id', 'Reference'],
    ['files', 'file_id', 'File'],
    ['versions', 'version_id', 'Concept version'],
  ];
  const seen = new Set<string>();
  const result: IdeaAssetChoice[] = [];
  for (const [collection, target, kind] of groups) {
    for (const row of data[collection] || []) {
      if (!row.id || row.archived_at || (target === 'file_id' && row.permission_scope && row.permission_scope !== 'workspace')) continue;
      const key = `${target}:${row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({key, target, kind, row});
    }
  }
  return result;
}
export function ideaAssetLinkKey(link: Record<string, any>): string {
  const targets = ['reference_id', 'file_id', 'version_id'].filter(key => Boolean(link[key]));
  return targets.length === 1 ? `${targets[0]}:${link[targets[0]]}` : '';
}
