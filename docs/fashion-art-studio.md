# Fashion Art Studio — connected foundation

A founder starts from their own Home, names a project, and enters the project's persisted artboard. Samples, references, AI design tools, manual editing and team review live beside that board. Verification projects and the two verification cap files are excluded from everyday creative navigation without deleting their canonical records.

## Shipped workflow

- Navigation: Home, Projects, Art Studio, Library, Founders Studio, Settings. Legacy deep links remain accessible so saved records are preserved.
- Home separates projects the current founder created or leads from shared team projects. Start a design opens a project starter; Continue opens its artboard.
- Artboards persist objects and layouts using existing canvas nodes and immutable design versions.
- Sixteen original vector garment shells cover hats, bags, shirts, polos, pants, shorts, jackets and shoes. Eight illustrative fabric references and twelve colors are supplied. Shells and fabrics become owned PNG uploads in Library and project versions when used.
- Library offers designs/samples/references and stored ideas/moodboards. Historical idea whiteboards remain accessible; new creative work begins on project artboards.
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
- Region masks/inpainting and editable garment/vector layers; current AI editing selects a complete saved image, and manual edits export a flattened child PNG.
- Live cursor presence and richer simultaneous collaboration; current reservations and polling do not supply real-time cursors.
- A larger curated, sourced material and construction-detail catalogue. Supplied textures are illustrative, not verified supplier fabrics.
- Structured product specifications, supplier sourcing and purchasing records beyond the existing business planning/finance modules.
- Business profile fields and module/form configuration beyond existing settings.
- Founder-specific live UI verification, account provisioning where missing, and Windows runtime verification.
