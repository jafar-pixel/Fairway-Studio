"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  Check,
  Download,
  FileImage,
  History,
  Layers,
  Palette,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";

type Row = Record<string, any>;
type Props = {
  data: any;
  workspaceId: string;
  onNavigate: (path: string) => void;
  onMutate: (operation: string, input: Record<string, unknown>) => Promise<any>;
};
const scopes = [
  "name",
  "wordmark",
  "monogram",
  "palette",
  "typography",
  "guidelines",
] as const;
const labels: Record<string, string> = {
  name: "Brand name",
  wordmark: "Primary wordmark",
  monogram: "Monogram",
  palette: "Color palette",
  typography: "Typography",
  guidelines: "Guidelines",
};
const field =
  "min-h-11 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm";
const rows = (data: any, name: string): Row[] =>
  Array.isArray(data?.[name]) ? data[name] : [];
const idText = (id: string) => String(id || "").slice(0, 8);
const stamp = (value: string) =>
  value ? new Date(value).toLocaleDateString() : "Date unavailable";
const safeName = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "fairway-kit";

export function resolveKitComponent(
  data: any,
  kit: Row | undefined,
  scope: string,
) {
  const decisionId = kit?.components?.[scope];
  const decision = rows(data, "decisions").find(
    (d) =>
      d.id === decisionId &&
      d.scope === scope &&
      d.outcome === "approved" &&
      d.workspace_id === data.workspace?.id,
  );
  const version =
    decision &&
    rows(data, "versions").find(
      (v) =>
        v.id === decision.version_id && v.workspace_id === data.workspace?.id,
    );
  return { decision, version };
}
export function ownedKitFiles(data: any, kit: Row | undefined) {
  const found: Array<{
    scope: string;
    decision: Row;
    version: Row;
    file: Row;
  }> = [];
  for (const scope of scopes) {
    const { decision, version } = resolveKitComponent(data, kit, scope);
    if (!decision || !version) continue;
    const ids = [version.file_id].filter(Boolean);
    for (const id of ids) {
      const file = rows(data, "files").find(
        (f) =>
          f.id === id &&
          f.workspace_id === data.workspace?.id &&
          f.permission_scope === "workspace" &&
          String(version.source_url || "").startsWith("supabase-storage://") &&
          !f.archived_at,
      );
      if (file && !found.some((item) => item.file.id === file.id))
        found.push({ scope, decision, version, file });
    }
  }
  return found;
}
export function kitManifest(data: any, kit: Row) {
  return {
    schema: "fairway-brand-kit-v1",
    kit_id: kit.id,
    title: kit.title,
    created_at: kit.created_at,
    usage_note: kit.usage_note,
    components: scopes.flatMap((scope) => {
      const { decision, version } = resolveKitComponent(data, kit, scope);
      return decision && version
        ? [
            {
              scope,
              decision_id: decision.id,
              version_id: version.id,
              title: version.title,
              rationale: decision.rationale || "",
              specification: version.body || "",
            },
          ]
        : [];
    }),
    owned_assets: ownedKitFiles(data, kit).map(
      ({ scope, decision, version, file }) => ({
        scope,
        file_id: file.id,
        title: file.title,
        version_id: version.id,
        decision_id: decision.id,
      }),
    ),
    exclusions:
      "External references, unapproved components, and unverified asset ownership are excluded.",
  };
}
export function kitDifference(previous: Row | undefined, next: Row) {
  return scopes
    .filter(
      (scope) => previous?.components?.[scope] !== next.components?.[scope],
    )
    .map((scope) => ({
      scope,
      previous: previous?.components?.[scope] || null,
      next: next.components?.[scope] || null,
    }));
}
function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 px-5 py-10 text-center">
      <Layers size={26} className="mx-auto mb-3 text-stone-400" />
      <h3 className="font-semibold">{title}</h3>
      <div className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-stone-500">
        {children}
      </div>
    </div>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="fs-dialog"
    >
      <header>
        <h2>{title}</h2>
        <button className="fs-icon" onClick={close} aria-label="Close">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Uncompressed ZIP using standard CRC32/local/central records; no third-party bundling dependency. */
export function kitZip(files: Array<{ name: string; bytes: Uint8Array }>) {
  const encoder = new TextEncoder(),
    local: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    let crc = 0xffffffff;
    for (const byte of file.bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, file.bytes.length, true);
    h.setUint32(22, file.bytes.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const directory = new Uint8Array(46 + name.length),
      d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, file.bytes.length, true);
    d.setUint32(24, file.bytes.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    directory.set(name, 46);
    local.push(header, file.bytes);
    central.push(directory);
    offset += header.length + file.bytes.length;
  }
  const end = new Uint8Array(22),
    view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(
    12,
    central.reduce((n, part) => n + part.length, 0),
    true,
  );
  view.setUint32(16, offset, true);
  return new Blob([...local, ...central, end], { type: "application/zip" });
}

export function BrandKitView({
  data,
  workspaceId,
  onNavigate,
  onMutate,
}: Props) {
  const [tab, setTab] = useState("Overview"),
    [selected, setSelected] = useState(""),
    [publish, setPublish] = useState(false),
    [use, setUse] = useState(false),
    [projectId, setProjectId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [kitTitle, setKitTitle] = useState(""),
    [usage, setUsage] = useState(""),
    [chosen, setChosen] = useState<Record<string, string>>({});
  const kits = rows(data, "kits"),
    active = kits.find((k) => k.id === data.workspace?.active_kit_id),
    kit = kits.find((k) => k.id === selected) || active;
  const decisions = rows(data, "decisions").filter(
    (d) =>
      d.outcome === "approved" &&
      d.workspace_id === workspaceId &&
      scopes.includes(d.scope),
  );
  const nameDecision = decisions.find((d) => d.scope === "name"),
    nameVersion = rows(data, "versions").find(
      (v) => v.id === nameDecision?.version_id,
    );
  const preview = {
    components: Object.fromEntries(
      scopes
        .map((scope) => [scope, decisions.find((d) => d.scope === scope)?.id])
        .filter(([, id]) => !!id),
    ),
  };
  const displayed = kit || preview;
  const proposed = (scope: string) =>
    !kit
      ? rows(data, "versions").find(
          (v) =>
            v.provenance?.component_scope === scope &&
            v.provenance?.proposed_kit,
        )
      : undefined;
  const proposalName = proposed("name");
  const logo =
    resolveKitComponent(data, displayed, "wordmark").version ||
    resolveKitComponent(data, displayed, "monogram").version ||
    proposed("wordmark") ||
    proposed("monogram");
  const palette =
    resolveKitComponent(data, displayed, "palette").version ||
    proposed("palette");
  const typography =
    resolveKitComponent(data, displayed, "typography").version ||
    proposed("typography");
  const guidelines =
    resolveKitComponent(data, displayed, "guidelines").version ||
    proposed("guidelines");
  const assets = ownedKitFiles(data, kit);
  const brandApplicationKeys = [
    "application-polo",
    "application-bag",
    "application-blue-cap",
  ];
  const brandApplications = rows(data, "versions")
    .filter(
      (v) =>
        v.image_url &&
        (brandApplicationKeys.includes(v.provenance?.import_key) ||
          (!v.provenance?.mockup_import && v.provenance?.application_preview)),
    )
    .sort(
      (a, b) =>
        brandApplicationKeys.indexOf(a.provenance?.import_key) -
        brandApplicationKeys.indexOf(b.provenance?.import_key),
    );
  const logoAsset = ownedKitFiles(data, displayed).find((a) =>
    ["wordmark", "monogram"].includes(a.scope),
  );
  const colorData = palette?.provenance?.palette || palette?.provenance?.colors;
  const colors: Row[] = Array.isArray(colorData)
    ? colorData.filter(
        (c) => typeof c?.hex === "string" && /^#[\da-f]{6}$/i.test(c.hex),
      )
    : [];
  const fontData = typography?.provenance?.typography;
  const fonts: Row[] = Array.isArray(fontData)
    ? fontData
    : fontData?.family
      ? [fontData]
      : [];
  const allowed = ["owner", "admin"].includes(data.role);
  const project = rows(data, "projects").find((p) => p.id === projectId);
  const oldKit = kits.find((k) => k.id === project?.kit_id);
  const base = `/w/${workspaceId}`;
  useEffect(() => {
    if (!publish && !use) return;
    const block = (event: Event) => event.preventDefault();
    window.addEventListener("fairway-before-update", block);
    return () => window.removeEventListener("fairway-before-update", block);
  }, [publish, use]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function openPublish() {
    setKitTitle(nameVersion?.title || kit?.title || "");
    setUsage(kit?.usage_note || "");
    setChosen({ ...(kit?.components || preview.components) });
    setError("");
    setPublish(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const components = Object.fromEntries(
        Object.entries(chosen).filter(([, id]) => !!id),
      );
      if (
        !components.name ||
        !components.palette ||
        !(components.wordmark || components.monogram)
      )
        throw new Error(
          "Select a recorded name, primary logo, and palette approval.",
        );
      for (const [scope, id] of Object.entries(components))
        if (!decisions.some((d) => d.id === id && d.scope === scope))
          throw new Error(
            "A selected decision is unavailable. Refresh and review it.",
          );
      const result = await onMutate("publishKit", {
        title: kitTitle.trim(),
        components,
        usage_note: usage.trim(),
      });
      if (result?.id) setSelected(result.id);
      setPublish(false);
      setNotice(
        "Published a new immutable kit version. Existing project pins are unchanged.",
      );
    });
  }
  async function exportKit() {
    if (!kit) return;
    await run(async () => {
      const files: Array<{ name: string; bytes: Uint8Array }> = [],
        manifest = kitManifest(data, kit);
      for (const asset of assets) {
        const response = await fetch(
          `/api/studio/media?versionId=${encodeURIComponent(asset.version.id)}`,
          { cache: "no-store", credentials: "same-origin" },
        );
        if (!response.ok)
          throw new Error(
            `Could not download ${asset.file.title}. No partial archive was created.`,
          );
        const type = response.headers.get("content-type")?.split(";")[0] || "",
          ext = (
            {
              "image/png": "png",
              "image/jpeg": "jpg",
              "image/webp": "webp",
              "image/gif": "gif",
              "image/avif": "avif",
            } as Record<string, string>
          )[type];
        if (!ext)
          throw new Error(
            "An asset returned an unsupported format. Open the Library to inspect it.",
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > 10 * 1024 * 1024)
          throw new Error("An asset exceeds the 10 MB export limit.");
        files.push({
          name: `${asset.scope}-v${idText(asset.version.id)}-${idText(asset.file.id)}.${ext}`,
          bytes,
        });
      }
      files.push({
        name: "manifest.json",
        bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
      });
      saveFile(kitZip(files), `${safeName(kit.title)}-v${idText(kit.id)}.zip`);
      setNotice(
        `Exported ${assets.length} owned approved asset(s) and the version manifest. External references were excluded.`,
      );
    });
  }
  function decisionLink(scope: string) {
    const decision = resolveKitComponent(data, displayed, scope).decision;
    return (
      decision && (
        <button
          className="mt-3 text-xs font-medium text-[#760d24]"
          onClick={() =>
            onNavigate(
              `${base}/projects/${decision.project_id}/decisions?decision=${decision.id}`,
            )
          }
        >
          View recorded decision <ArrowRight className="inline" size={12} />
        </button>
      )
    );
  }
  const logoPanel = (
    <section className="fs-card">
      <h2 className="mb-4 font-semibold">
        {kit ||
        resolveKitComponent(data, displayed, "monogram").decision ||
        resolveKitComponent(data, displayed, "wordmark").decision
          ? "Approved logo components"
          : "Proposed logo"}
      </h2>
      {logo ? (
        <>
          <div className="grid min-h-64 place-items-center overflow-hidden rounded-xl bg-[#f4ede1] p-6">
            {logoAsset ? (
              <img
                className="max-h-64 max-w-full object-contain"
                src={`/api/studio/media?versionId=${encodeURIComponent(logoAsset.version.id)}`}
                alt={logo.title || "Approved logo"}
              />
            ) : logo.image_url ? (
              <img
                className="max-h-64 w-full object-contain"
                src={logo.image_url}
                alt={`${logo.title} · proposed, not approved`}
              />
            ) : (
              <div className="text-center">
                <FileImage size={38} className="mx-auto mb-3 text-stone-400" />
                <p className="font-medium">{logo.title}</p>
                <p className="mt-2 text-xs text-stone-500">
                  No owned production asset is linked to this approved version.
                </p>
              </div>
            )}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-stone-500">
            {logo.body ||
              "Clear space, backgrounds, and minimum sizes have not been specified."}
          </p>
          {["wordmark", "monogram"].map((scope) => (
            <div key={scope}>{decisionLink(scope)}</div>
          ))}
        </>
      ) : (
        <Empty title="Your logo is still taking shape">
          A name approval does not approve a logo. Record a wordmark or monogram
          decision in an identity project.
        </Empty>
      )}
    </section>
  );
  const colorsPanel = (
    <section className="fs-card">
      <h2 className="mb-4 font-semibold">Color palette</h2>
      {palette ? (
        <>
          {colors.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {colors.map((c, index) => (
                <div key={index}>
                  <div
                    className="h-20 rounded-lg border border-black/10"
                    style={{ backgroundColor: c.hex }}
                  />
                  <p className="mt-2 font-mono text-xs">{c.hex}</p>
                  <p className="mt-1 text-sm">
                    {typeof c.name === "string"
                      ? c.name
                      : `Color ${index + 1}`}{" "}
                  </p>
                  <p className="text-xs text-stone-500">
                    {typeof c.role === "string"
                      ? c.role
                      : "Usage role not specified"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Palette decision recorded. Structured color tokens have not been
              supplied; use the approved specification below.
            </p>
          )}
          <p className="mt-4 whitespace-pre-wrap text-sm">
            {palette.body || "No additional palette specification recorded."}
          </p>
          {decisionLink("palette")}
        </>
      ) : (
        <Empty title="No approved palette yet">
          The Studio’s interface colors are not your brand palette. Record a
          separate palette decision before production use.
        </Empty>
      )}
    </section>
  );
  return (
    <div className="space-y-5">
      <div className="fs-heading">
        <div>
          <h1>One identity. Shared by the whole studio.</h1>
          <p>
            {kit
              ? `${kit.title} · immutable kit ${idText(kit.id)}`
              : proposalName
                ? "Preview of the proposed identity. Each component needs its own approval."
                : "Bring your recorded identity decisions into one reusable kit."}
          </p>
        </div>
        <span
          className={`rounded-full px-4 py-2 text-xs font-semibold ${kit ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}
        >
          {kit
            ? kit.id === active?.id
              ? "PUBLISHED · ACTIVE"
              : "PUBLISHED · HISTORICAL"
            : "DRAFT PREVIEW · NOT APPROVED AS A KIT"}
        </span>
      </div>
      {error && (
        <div role="alert" className="fs-alert error">
          {error}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-green-50 p-3 text-sm text-green-800"
        >
          {notice}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {!kit && logo && (
          <button
            className="fs-button"
            onClick={() =>
              onNavigate(`${base}/projects/${logo.project_id}/reviews`)
            }
          >
            Review proposed kit <ArrowRight size={16} />
          </button>
        )}
        <button
          className="fs-button"
          disabled={!allowed || busy}
          onClick={openPublish}
        >
          <Plus size={16} />
          Publish new kit version
        </button>
        <button
          className="fs-button secondary"
          onClick={() => setTab("Versions")}
        >
          <History size={16} />
          Decision & version history
        </button>
        {kit && (
          <>
            <button
              className="fs-button secondary"
              disabled={busy}
              onClick={() => {
                setError("");
                setUse(true);
              }}
            >
              Use in project
            </button>
            <button
              className="fs-button secondary"
              disabled={busy}
              onClick={exportKit}
            >
              <Download size={16} />
              {busy ? "Preparing…" : `Export kit (${assets.length} assets)`}
            </button>
          </>
        )}
      </div>
      {!allowed && (
        <p className="text-xs text-stone-500">
          An owner or admin can publish recorded approvals as a kit.
        </p>
      )}
      <div className="fs-tabs" role="tablist" aria-label="Brand kit sections">
        {[
          "Overview",
          "Logos",
          "Colors",
          "Typography",
          "Guidelines",
          "Versions",
        ].map((value) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              {logoPanel}
              {colorsPanel}
            </div>
            <section className="fs-card">
              <h2 className="font-semibold">
                {kit?.title ||
                  nameVersion?.title ||
                  (proposalName
                    ? `${proposalName.title} · proposed kit`
                    : "No active brand kit")}
              </h2>
              <p className="mt-2 text-xs text-stone-500">
                {kit
                  ? `Published ${stamp(kit.created_at)}`
                  : nameDecision
                    ? "Name approved. Remaining components are reviewed independently."
                    : proposalName
                      ? "Not approved. No kit is active until required decisions are recorded."
                      : "Start with an identity project and explicit component reviews."}
              </p>
              {proposalName && !kit && (
                <div className="mt-4 border-b pb-4 text-sm">
                  <div className="flex justify-between">
                    <span>Status</span>
                    <span className="fs-badge">Awaiting founder review</span>
                  </div>
                  <div className="mt-3 flex justify-between">
                    <span>Approved assets</span>
                    <strong>{assets.length}</strong>
                  </div>
                </div>
              )}
              <div className="mt-5 divide-y divide-stone-100">
                {scopes.map((scope) => {
                  const { decision, version } = resolveKitComponent(
                    data,
                    displayed,
                    scope,
                  );
                  return (
                    <div className="py-3" key={scope}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm">{labels[scope]}</span>
                        <span
                          className={`text-xs ${decision ? "text-green-700" : "text-amber-800"}`}
                        >
                          {decision ? "Recorded approval" : "Awaiting approval"}
                        </span>
                      </div>
                      {version && (
                        <p className="mt-1 text-xs text-stone-500">
                          {version.title} · v{idText(version.id)}
                        </p>
                      )}
                      {decisionLink(scope)}
                    </div>
                  );
                })}
              </div>
              <button
                className="fs-button secondary mt-5"
                onClick={() => onNavigate(`${base}/projects`)}
              >
                Open identity projects <ArrowRight size={15} />
              </button>
            </section>
          </div>
          <section className="fs-card">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Application previews</h2>
              <button
                className="fs-button secondary"
                onClick={() => onNavigate(`${base}/projects`)}
              >
                <Layers size={16} />
                Create variation
              </button>
            </div>
            <div className="fs-kit-applications">
              {brandApplications.slice(0, 3).map((v) => (
                <button
                  key={v.id}
                  onClick={() =>
                    onNavigate(`${base}/projects/${v.project_id}/canvas`)
                  }
                >
                  <img src={v.image_url} alt={v.title} />
                  <span>{v.title} · proposed</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-stone-500">
              Variations belong in draft project versions. Publishing never
              recolors existing concepts or changes their pinned kit.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows(data, "projects")
                .filter((p) => p.kit_id)
                .map((p) => (
                  <button
                    key={p.id}
                    className="rounded-xl border p-4 text-left"
                    onClick={() =>
                      onNavigate(`${base}/projects/${p.id}/overview`)
                    }
                  >
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-2 text-xs text-stone-500">
                      Pinned kit {idText(p.kit_id)}
                    </p>
                    {active && p.kit_id !== active.id && (
                      <span className="mt-2 inline-block text-xs text-amber-800">
                        Update available · review before applying
                      </span>
                    )}
                  </button>
                ))}
            </div>
            {!rows(data, "projects").some((p) => p.kit_id) && (
              <p className="mt-5 text-sm text-stone-500">
                No projects have pinned a published kit yet.
              </p>
            )}
          </section>
        </>
      )}
      {tab === "Logos" && (
        <div className="space-y-5">
          {logoPanel}
          <section className="fs-card">
            <h2 className="font-semibold">Owned production exports</h2>
            <p className="mt-2 text-sm text-stone-500">
              Only files linked through approved immutable versions are
              included. Raster files are never described as SVG.
            </p>
            {assets
              .filter((a) => ["wordmark", "monogram"].includes(a.scope))
              .map((a) => (
                <div
                  key={a.file.id}
                  className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{a.file.title}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {labels[a.scope]} · version {idText(a.version.id)} ·
                      original uploaded format
                    </p>
                  </div>
                  <button
                    className="fs-button secondary"
                    onClick={() =>
                      onNavigate(`${base}/library?item=${a.file.id}`)
                    }
                  >
                    Inspect file
                  </button>
                </div>
              ))}
            {!assets.some((a) =>
              ["wordmark", "monogram"].includes(a.scope),
            ) && (
              <p className="mt-5 text-sm text-stone-500">
                No verified owned logo exports are available in this kit.
              </p>
            )}
          </section>
        </div>
      )}
      {tab === "Colors" && colorsPanel}
      {tab === "Typography" && (
        <section className="fs-card">
          <h2 className="mb-4 font-semibold">Typography</h2>
          {typography ? (
            <>
              {fonts.map((font, index) => (
                <div className="mb-4 rounded-xl border p-5" key={index}>
                  <h3 className="text-xl font-semibold">
                    {String(font.family || "Unnamed family")}
                  </h3>
                  <p className="mt-2 text-sm">
                    Weights:{" "}
                    {Array.isArray(font.weights)
                      ? font.weights.map(String).join(", ")
                      : String(font.weights || "Not specified")}
                  </p>
                  <p className="mt-1 text-sm">
                    Role: {String(font.role || "Not specified")}
                  </p>
                  <p className="mt-3 text-xs text-stone-500">
                    Source/licensing:{" "}
                    {String(
                      font.license ||
                        font.source ||
                        "Not recorded; verify before production use.",
                    )}
                  </p>
                </div>
              ))}
              <p className="whitespace-pre-wrap text-sm">
                {typography.body ||
                  "No font family, weights or licensing notes have been supplied."}
              </p>
              {decisionLink("typography")}
            </>
          ) : (
            <Empty title="Typography awaits its own approval">
              No font is inferred from the Studio interface or a logo preview.
              Review families, weights, roles, and licensing in an identity
              project.
            </Empty>
          )}
        </section>
      )}
      {tab === "Guidelines" && (
        <section className="fs-card">
          <h2 className="mb-4 font-semibold">Practical usage</h2>
          {kit?.usage_note && (
            <div className="mb-5 rounded-xl bg-[#f4ede1] p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide">
                Published kit usage note
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {kit.usage_note}
              </p>
            </div>
          )}
          {guidelines ? (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {guidelines.body ||
                  "A guidelines decision exists but no written specification is attached."}
              </p>
              {decisionLink("guidelines")}
            </>
          ) : (
            <Empty title="Detailed guidelines are not approved yet">
              Agreed examples, restrictions, clear space, and production rules
              belong in a versioned guidelines decision.
            </Empty>
          )}
        </section>
      )}
      {tab === "Versions" && (
        <section className="fs-card">
          <h2 className="mb-4 font-semibold">Immutable kit history</h2>
          {kits.length ? (
            <div className="space-y-4">
              {kits.map((k) => (
                <article key={k.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{k.title}</h3>
                      <p className="mt-1 text-xs text-stone-500">
                        {stamp(k.created_at)} · kit {idText(k.id)}{" "}
                        {k.id === active?.id ? "· Active" : ""}
                      </p>
                    </div>
                    <button
                      className="fs-button secondary"
                      onClick={() => {
                        setSelected(k.id);
                        setTab("Overview");
                      }}
                    >
                      Inspect this snapshot
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(k.components || {}).map(([scope, id]) => (
                      <span
                        key={scope}
                        className="rounded-full bg-stone-100 px-3 py-1 text-xs"
                      >
                        {labels[scope] || scope} · decision {idText(String(id))}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="No published kit versions">
              Each publication will preserve its component decisions and version
              IDs here. Existing projects keep their prior pin.
            </Empty>
          )}
          <h3 className="mb-3 mt-7 font-semibold">
            Recorded identity decisions
          </h3>
          {decisions.length ? (
            decisions.map((d) => (
              <button
                key={d.id}
                className="flex min-h-11 w-full items-center justify-between border-t py-3 text-left text-sm"
                onClick={() =>
                  onNavigate(
                    `${base}/projects/${d.project_id}/decisions?decision=${d.id}`,
                  )
                }
              >
                <span>
                  {labels[d.scope]} ·{" "}
                  {rows(data, "versions").find((v) => v.id === d.version_id)
                    ?.title || idText(d.version_id)}
                </span>
                <ArrowRight size={15} />
              </button>
            ))
          ) : (
            <p className="text-sm text-stone-500">
              No identity approvals have been recorded.
            </p>
          )}
        </section>
      )}
      <p className="flex items-center gap-2 text-xs text-stone-500">
        <ShieldCheck size={15} />
        Name, logo, palette, and optional components are approved separately.
      </p>
      {publish && (
        <Modal
          title="Publish a new kit version"
          close={() => !busy && setPublish(false)}
        >
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-stone-500">
              Select recorded approvals. Name, a wordmark or monogram, palette,
              and a usage note are required. Existing kits and project pins
              remain unchanged.
            </p>
            <label className="grid gap-2 text-sm">
              Kit name
              <input
                className={field}
                required
                maxLength={240}
                value={kitTitle}
                onChange={(e) => setKitTitle(e.target.value)}
              />
            </label>
            {scopes.map((scope) => (
              <label key={scope} className="grid gap-2 text-sm">
                {labels[scope]}{" "}
                {["typography", "guidelines"].includes(scope)
                  ? "(optional)"
                  : ""}
                <select
                  className={field}
                  required={scope === "name" || scope === "palette"}
                  value={chosen[scope] || ""}
                  onChange={(e) =>
                    setChosen({ ...chosen, [scope]: e.target.value })
                  }
                >
                  <option value="">Exclude / no approval selected</option>
                  {decisions
                    .filter((d) => d.scope === scope)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {rows(data, "versions").find(
                          (v) => v.id === d.version_id,
                        )?.title || idText(d.version_id)}{" "}
                        · {idText(d.id)}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <label className="grid gap-2 text-sm">
              Usage note
              <textarea
                className={field}
                required
                rows={4}
                maxLength={10000}
                value={usage}
                onChange={(e) => setUsage(e.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              className="fs-button"
              disabled={
                busy ||
                !allowed ||
                !chosen.name ||
                !chosen.palette ||
                !(chosen.wordmark || chosen.monogram) ||
                !usage.trim()
              }
            >
              <Check size={16} />
              {busy ? "Verifying approvals…" : "Verify approvals & publish"}
            </button>
          </form>
        </Modal>
      )}
      {use && kit && (
        <Modal
          title="Pin this kit to a project"
          close={() => !busy && setUse(false)}
        >
          <div className="space-y-4">
            <label className="grid gap-2 text-sm">
              Project
              <select
                className={field}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">Choose a project</option>
                {rows(data, "projects").map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
            {project && (
              <>
                <p className="text-sm">
                  {oldKit
                    ? `Replace ${oldKit.title} (${idText(oldKit.id)})`
                    : "Add a kit pin"}{" "}
                  with {kit.title} ({idText(kit.id)}).
                </p>
                <ul className="space-y-2 rounded-xl bg-stone-50 p-4 text-xs">
                  {kitDifference(oldKit, kit).map((change) => (
                    <li key={change.scope}>
                      {labels[change.scope]}:{" "}
                      {change.previous
                        ? idText(change.previous)
                        : "not included"}{" "}
                      → {change.next ? idText(change.next) : "not included"}
                    </li>
                  ))}
                  {!kitDifference(oldKit, kit).length && (
                    <li>No component decision changes.</li>
                  )}
                </ul>
              </>
            )}
            <p className="text-sm text-stone-500">
              This changes the project’s pin for future work. Existing versions,
              images, and AI provenance stay unchanged.
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <button
              className="fs-button"
              disabled={busy || !project || project.kit_id === kit.id}
              onClick={() =>
                run(async () => {
                  if (!project) throw new Error("Choose a project first.");
                  await onMutate("updateProject", {
                    id: project.id,
                    expected_revision: project.revision,
                    kit_id: kit.id,
                  });
                  setUse(false);
                  setNotice(
                    "Project kit pin updated. Existing concept versions are unchanged.",
                  );
                })
              }
            >
              {busy ? "Applying…" : "Apply this kit version"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
