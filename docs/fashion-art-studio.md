# Fashion Art Studio — connected foundation

A founder starts from their own Home, names a project, and enters the project's persisted artboard. Samples, references, AI design tools, manual editing and team review live beside that board. Verification projects and the two verification cap files are excluded from everyday creative navigation without deleting their canonical records.

## Shipped workflow

- Navigation: Home, Projects, Art Studio, Library, Founders Studio, Settings. Legacy deep links remain accessible so saved records are preserved.
- Home separates projects the current founder created or leads from shared team projects. Start a design opens a project starter; Continue opens its artboard.
- Artboards persist objects and layouts using existing canvas nodes and immutable design versions.
- Twenty original golf product shells each have front, back and construction-detail views (60 shell assets). Ten illustrative golf fabric references and twelve colors are supplied. On-course apparel, clubhouse layers, headwear, golf bags, towels, headcovers and footwear are covered. Shells and fabrics become owned PNG uploads in Library and project versions when used.
- Library offers designs/samples/references and stored ideas/moodboards. Historical idea whiteboards remain accessible; new creative work begins on project artboards.
- AI conversation and artwork generation share persistent Hunter & Heckard original golf collection context. Short collection requests develop a capsule, palette, material directions and construction details; they do not default to competitor shopping lists.
- Embedded AI uses direct existing OpenAI configuration. The selected version, up to three authorized visual reference versions, the active approved Brand Kit snapshot, and one or two output variations are sent to generation. Successful images are retained automatically on the project artboard.
- Curate moodboard generates a visual moodboard from selected references. Samples and uploads carry category/provenance tags. This does not automatically classify or reorganize the entire Library.
- Manual editing takes place in the artboard workspace, supports drawing, text, logo overlays, rotate, flip, crop and brightness, and saves a child PNG version.
- Shared AI sessions are scoped to a project. Human artboard discussion uses canonical project threads; messages identify the selected version.
- Editing reservations expire after thirty minutes. The API handles checkout/check-in, generation checks reservations before provider work, and a database trigger blocks child versions created by a different editor while the source is reserved. Original versions remain immutable.
- Review is of an exact saved version, using explicit chosen reviewers and unanimous votes. Existing owner/admin authority records approvals. A first approval promotes an idea to concept; a distinct review opened after concept approval is required for product approval.
- Product approval atomically creates one linked Business production-planning task. Retries do not create another task. Founders Studio shows task owners, dates, a monthly task calendar, and links to existing planning, restricted documents and finance.
- The shared business profile exposes the existing proprietary approved Brand Kit. No approvals authorize actual purchases, signatures or external publication.
- Desktop version 1.1.0 triggers the existing Windows installer release workflow and continues loading the live app.

## Verification

The focused release suite checks project-to-canvas navigation, samples uploading and becoming selected sources, fabrics staying references, canvas-to-AI selection, inline manual saves, variation/moodboard requests, authorization boundaries and existing business access isolation. Typecheck and production build are required before release.

Live database tests were run inside rolled-back transactions: checkout conflicts; check-in; exact version reviews; idea-to-concept; rejecting reuse of a concept approval for a product; fresh product review; linked production task; and stale-editor child-version rejection. No test designs, reviews or tasks from those checks remain in user lists.

The browser runtime cannot currently resume its credential state, so this release has not been visually exercised through the live UI under each founder's account. Windows installer CI can verify packaging, but no Windows interaction test has been performed.

## Remaining work from the larger redesign

- Multiple named artboards per project (the foundation currently has one persisted project canvas).
- Advanced cut-and-sew garment geometry, editable construction patterns, and full cloth simulation beyond the current cap/bag 3D previews.
- Live cursor presence and richer simultaneous collaboration; current reservations and polling do not supply real-time cursors.
- A larger curated, sourced material and construction-detail catalogue. Supplied textures are illustrative, not verified supplier fabrics.
- Structured product specifications, supplier sourcing and purchasing records beyond the existing business planning/finance modules.
- Business profile fields and module/form configuration beyond existing settings.
- Founder-specific live UI verification, account provisioning where missing, and Windows runtime verification.


## Editable product editor and visual production

The artboard toolbar opens Product editor for clothing, golf bags, caps and logos. Ten editable clothing templates share panel colors, procedural fabric textures, uploaded Library material/print imagery with repeat controls, seam/trim colors, front/back views, and artwork layers. Artwork layers persist canonical image IDs, position, scale, rotation, opacity, surface, text/font and optional near-white removal. Logos start blank; no placeholder is an approved brand mark.

Save exports a clean 800px PNG through canonical upload, then creates an immutable project version whose provenance also contains the validated editable document. A pending save freezes its snapshot and retries the same upload. Open saved editable design restores that document; Edit manually routes editable sources back to the product editor. Legacy raster versions remain raster sources. SVG exports retain scalable shapes; PNG and 2× PNG exports are rasterizations, not AI super-resolution. JSON design briefs retain editable parameters and source identity, not verified manufacturing specifications.

Caps and golf bags have actual procedural Three.js geometry with orbit, zoom, selectable panels, fabrics and artwork previews. 3D is lazy loaded, releases graphics resources, and gives a 2D fallback on unsupported devices. Clothing remains editable in 2D: no claim of simulated garment drape or CAD pattern correctness.

AI production saves the source before a provider job: realistic packshot, adult model/in-use presentation, campaign scene, logo exploration, or masked panel editing. Requests use the existing direct OpenAI provider and active Brand Kit snapshot. A mask is an owned PNG file, workspace-authorized, alpha-bearing, equal-sized to the saved source, and requires explicit SDK mask support. Failed mask uploads prevent provider requests. Internal mask assets are excluded from the everyday creative Library projection. Generated proposals become separate child versions; they do not automatically replace the editable document or grant approval.

Batch catalogue production chooses up to five saved sources and processes one durable job per source sequentially. Individual jobs can be refreshed, retried or retained using the existing generation API. Outputs are ordinary project versions ready for artboard comparison, team discussion, exact-version review and approved production handoff. In-progress selections do not imply simultaneous editing or live cursors.

## Full reference-studio requirements retained

| Capability | Current implementation | Further implementation required |
| --- | --- | --- |
| Collection catalogue | Golf shells, product types, fabrics, views, Library references | Larger curated and sourced catalogue; subsequent sports collections |
| 2D design | Editable panels, layers, logos, text, fabrics, prints, views, saved source | Freeform vector paths, richer sketch brushes, snapping, reusable user templates |
| 3D design | Rotatable cap and golf bag geometry, fabric and artwork preview | Garment meshes, fit/drape/cloth simulation, accessories, imported 3D assets |
| AI creation and editing | Prompt/reference-to-artwork, packshot, model/in-use, campaign, variations, masked panels | Dedicated sketch extraction, clothing extraction, automatic style fusion workflows |
| Curation | Library assets and references; generated moodboards | Automatic asset classification, searchable metadata and material sourcing |
| Catalogue production | Bounded durable batch jobs; project versions | Multi-angle automated shot sets, model/scene presets, catalogue sheet and ZIP export |
| Export and production | SVG, PNG, 2× raster, design brief; approved product planning tasks | True AI detail upscaling, technical packs, measured pattern/CAD exports, verified specs |
| Collaboration | Saved versions, project discussion, reservations, votes, approval stages, business tasks | Live cursor presence, region annotations, simultaneous merge/edit policy |

Competitor screenshots are capability targets. Third-party template libraries, models and proprietary features are not bundled or licensed by this update. Keep these requirements in scope rather than dropping them when implementing individual workflows.

Release verification: 38 focused checks passed, TypeScript check passed, and production build passed. The broader suite passed 685 of 695 checks; its ten previously identified guide/profile/legacy fixture failures remain. Product SVG previews were rendered and inspected locally. The signed-in browser and WebGL interactions remain unverified because the browser runtime cannot resume credential state. No QA designs were saved into founder projects.

## Focused concept workspace and database colorways

Opening a product canvas now defaults to one selected design instead of the overlapping exploration board. The design name and actual review stage are visible. Change colors, Edit with AI, and Review with the team are the primary focused actions. Main navigation collapses in Art Studio, tools open in a closable overlay drawer, and Full canvas uses native fullscreen where supported. Show project board restores the exploration layout; selected items can be hidden/restored in that mounted board without deleting files or versions. Every current project version is selectable in Samples & Library.

Color swatches on saved visuals directly create durable AI edits using the original design, existing logo and construction. There is no required chat-prompt step. The original remains immutable, the output is parent-linked, and failed/lost responses resume the same job. Scope is main-body or all textile/leather panels. AI color changes are visual proposals and may incur provider charges.

All twelve sample colors are stored in studio_sample_colors. Each existing and newly saved version gets studio_colorway_options for body and whole-product scopes. The private insert trigger seeds options, and only an exact succeeded job/output may populate a generated-version cache link. The authenticated palette endpoint scopes reads to the requested workspace/version. Existing saved colorways reopen without another generation call. Palette records and finished images are distinct; backfill adds options, not paid images. All founders with workspace access can reuse retained colorway versions. Simultaneous first requests by different founders can still generate duplicate proposals before the cache is populated.

Editable shells also have immediate color/fabric swatches, whole-shell application, uploadable fabric/print images, Library fabric thumbnails, validated JSON shell/design-brief import, and transparent backgrounds by default for new logo documents. Existing images retain their original pixels and require AI/manual image edits. This update does not claim automatic decomposition of a photorealistic bag into exact editable construction parts.

Focused canvas release validation: 48 focused checks, TypeScript and production build passed. Isolated Postgres verified legacy backfill, automatic palette seeding, canonical job/output cache links, named child versions, immutable sources, idempotent retention, forged-provenance rejection and workspace RLS. Live database check found 12 colors and zero existing workspace designs missing their 24 body/whole palette options. Security advisors reported no new palette-table/function findings. Signed-in browser/fullscreen interaction remains unverified due the existing browser runtime credential-state blocker.

The palette drawer can generate/reuse all sample colorways sequentially, skipping saved results. Usage charges apply only to new AI generation requests; existing cached images are reopened. App navigation is guarded during active saves/generation.

Legacy bundled concept previews are now selectable even without an original file_id. Before AI color, generic AI or manual editing, the app registers a same-origin image source through canonical upload and creates a linked source version. Registration retries keep the staged file and original remains intact. Original Concept A in Signature golf bag was verified to be such a bundled preview; the source-registration path is covered by the focused suite, now 49 passing checks.


## Creator-first redesign (October 2026, first pass)

The product flow begins at **Start a design → Canvas + AI Creative Assistant**.
Creating an image no longer requires entering a Samples & Library drawer. The AI
conversation is embedded directly beneath the current design; existing generation,
retention, and version services remain in use. A design can be refined from the
selected version or restarted with **Start new design**.

**Assets & tools** is optional. It contains Assets & templates, History, and Design
options. References attached for AI appear beside the conversation with individual
Remove controls; removing a reference detaches it from the current request, not
from the Library. The comparison board is available from Design options instead
of a competing top-level mode toggle.

**Scope limitation:** The underlying catalog is still golf-first, even though the
entry workflow and labels are now sport-neutral. Broader sports templates,
source/version provenance display, persisted reference selections, and a fully
unified scroll layout require separate implementation and validation.

### Acceptance checklist

- Start a new project named Pants 09 and reach the canvas with AI conversation.
- Generate an image without opening a tools drawer.
- Select a saved version from History and refine that same source.
- Attach and individually remove a visual reference without deleting its original.
- Reopen the project and verify saved versions and conversation history.
- Confirm personal studio work stays private until explicitly shared.
- Check narrow/mobile viewport, keyboard focus, and scroll behavior.
- Validate generation success, failure, retry, and usage consent in the deployed app.

The branch is for review. Do not publish without passing build/test checks and
verifying the existing non-Vercel hosting deployment procedure.

### Footer and setup-error follow-up

The site footer is now a compact utility row instead of a full-width black
banner. FAQ, onboarding replay, browser installation, and the Windows installer
link remain available. The embedded creator no longer repeats its own AI Studio
masthead, and the empty-design placeholder is shorter so the prompt is visible
sooner.

Generation setup errors now identify only the missing server setting. A failed
request is shown once after it is saved to conversation history. The October 13
preview had the Supabase server credential, but its OpenAI key and worker secret
were scoped to Production, not Preview; no key value was inspected or copied.

