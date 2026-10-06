import content from './mockup-content.json';
import assetHashes from './mockup-asset-hashes.json';

type Row = Record<string, any>;
const permittedAssets = new Set(Object.keys(assetHashes));
const hashes: Record<string, string> = assetHashes;
export const MOCKUP_IMPORT_BATCH = content.import_batch;

/** A pure presentation adapter. It never creates members, approvals, or stored rows. */
export function resolveImportedAsset(provenance: unknown, versionId?: string, workspaceId?: string): string | null {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return null;
  const p = provenance as Row;
  if (p.import_batch !== MOCKUP_IMPORT_BATCH || p.mockup_import !== true || !['bundled_exploratory', 'bundled_original'].includes(p.media_origin)) return null;
  if (typeof p.import_asset_path !== 'string' || !permittedAssets.has(p.import_asset_path)) return null;
  const original = p.import_asset_path.startsWith('/original-assets/');
  if (p.media_origin !== (original ? 'bundled_original' : 'bundled_exploratory')) return null;
  // A replaced file can never silently become the image of an old saved version.
  const expected = hashes[p.import_asset_path];
  if (!expected || typeof p.asset_sha256 !== 'string' || p.asset_sha256 !== expected) return null;
  if (original) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(versionId || '') || !uuid.test(workspaceId || '')) return null;
    return `/api/studio/starter-asset?versionId=${encodeURIComponent(versionId!)}`;
  }
  return p.import_asset_path;
}

const items = (data: Row, key: string): Row[] => Array.isArray(data[key]) ? data[key] : [];
export function hydrateImportedContent<T extends Row>(data: T): T {
  const versions: Row[] = items(data, 'versions').filter(v => !(data.workspace?.id === 'demo' && v.provenance?.media_origin === 'bundled_original')).map(v => {
    const p = v.provenance || {};
    if (p.import_batch !== MOCKUP_IMPORT_BATCH || p.mockup_import !== true) return v;
    const image = resolveImportedAsset(p, v.id, v.workspace_id === data.workspace?.id ? data.workspace?.id : undefined);
    return {
      ...v,
      image_url: image, preview_url: image,
      source_kind: p.media_origin === 'bundled_original' ? 'original' : 'mockup',
      media_origin: p.media_origin,
      source_label: p.media_origin === 'bundled_original' ? 'User-supplied original · starter collection' : 'Exploratory concept · starter collection',
      preview_fit: p.preview_fit || 'cover',
      import_order: content.versions.findIndex(v => v.key === p.import_key),
      is_tutorial: true,
      // No storage handle is invented. Editing requires a genuine uploaded copy.
      requires_upload_for_generation: true,
      import_asset_unavailable: Boolean(p.import_asset_path && !image),
      version_number: v.version_number || p.display_version_number || 1,
      review_title: p.review_title,
      tags: [...new Set([...(v.tags || []), ...(p.tags || []), 'Starter collection'])],
      library_description: p.library_description || v.body,
    };
  });
  const fileLinks = items(data, 'nodes').filter(n => n.file_id && n.version_id && items(data, 'files').some(f => f.id === n.file_id));
  const files = items(data, 'files').map(f => {
    const link = fileLinks.find(n => n.file_id === f.id);
    const concept = link && versions.find(v => v.id === link.version_id && v.is_tutorial);
    if (!concept) return f;
    return { ...f, concept_version_id: concept.id, image_url: f.image_url || concept.image_url, source_kind: concept.source_kind, source_label: concept.source_label, preview_fit: concept.preview_fit, provenance: { ...concept.provenance, ...(f.provenance || {}) }, is_starter: true };
  });
  const byVersion = new Map(versions.map(v => [v.id, v]));
  const applications = versions.filter(v => v.provenance?.application_preview && v.image_url);
  const versionViews = versions.map((v): Row => ({ ...v, canonical_file_id: fileLinks.find(n => n.version_id === v.id)?.file_id })).map(v => v.provenance?.review_title ? {
    ...v,
    application_previews: applications.filter(a => a.project_id === v.project_id).map(a => ({ id: a.id, title: a.title, image_url: a.image_url })),
  } : v);
  const projects = items(data, 'projects').map(p => {
    const cover = versions.find(v => v.project_id === p.id && v.provenance?.project_cover === true && v.image_url);
    const imported = versions.some(v => v.project_id === p.id && v.is_tutorial);
    return { ...p, ...(cover && !p.cover_url ? { cover_url: cover.image_url } : {}), ...(imported ? { contains_tutorial_content: true, import_order: content.projects.findIndex(def => versions.some(v => v.project_id === p.id && v.provenance?.project_key === def.key)) } : {}) };
  });
  const ideas = items(data, 'ideas').map(i => {
    const linked = items(data, 'ideaAssets').filter(a => a.idea_id === i.id).map(a => byVersion.get(a.version_id)).find(v => v?.image_url);
    // The project_id and import tag are persisted even before workflow links load.
    const keyed = i.tags?.find((tag: unknown) => typeof tag === 'string' && tag.startsWith('mockup-idea:'))?.slice('mockup-idea:'.length);
    const fallback = keyed && versions.find(v => v.project_id === i.project_id && v.provenance?.idea_cover_key === keyed && v.image_url);
    const cover = linked || fallback;
    const definition = content.ideas.find(def => def.key === keyed) as Row | undefined;
    return { ...i, ...(cover && !i.cover_url ? { cover_url: cover.image_url } : {}), ...(keyed ? { is_tutorial: true, import_order: content.ideas.findIndex(def => def.key === keyed), project_suggestion: definition?.project_suggestion === true, project_suggestion_order: definition?.project_suggestion_order } : {}) };
  });
  const tasks = items(data, 'tasks').map(t => {
    const assets = versions.filter(v => v.project_id === t.project_id && v.provenance?.task_ids?.includes(t.id) && v.image_url);
    // Stable saved version-to-task IDs survive edited titles/details and repeated hydration.
    if (!assets.length) return t;
    const cover = assets[0] || versions.find(v => v.project_id === t.project_id && v.provenance?.project_cover && v.image_url);
    return { ...t, details: String(t.details || '').replace(/\n\n\[Fairway (?:tutorial|starter)\][\s\S]*$/, ''), is_tutorial: true, is_starter: true, ...(cover ? { cover_url: t.cover_url || cover.image_url } : {}), attachment_ids: [...new Set([...(t.attachment_ids || []), ...assets.map(a => a.id)])] };
  });
  const ordered = (rows: Row[]) => [...rows].sort((a, b) => a.created_at === b.created_at && a.import_order >= 0 && b.import_order >= 0 ? a.import_order - b.import_order : 0);
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const actionLists = Object.fromEntries(['home_actions', 'nextActions', 'projectNextActions'].filter(key => Array.isArray(data[key])).map(key => [key, items(data, key).map(t => taskById.get(t.id) || t)]));
  return { ...data, ...actionLists, versions: ordered(versionViews), projects: ordered(projects), ideas: ordered(ideas), tasks, files } as T;
}
