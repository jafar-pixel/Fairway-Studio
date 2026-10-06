# Starter collection implementation and import

## Applied data

The reviewed, insert-only import was applied once to Supabase project `xljhxmyigtxhjtxxzuwk`, existing workspace `754ccd24-80be-4298-9f64-737d031ed9fd`, on October 2, 2026.

The workspace now contains 6 ideas, 4 projects, 32 immutable source/concept versions, 21 canvas nodes, 12 new task suggestions, 5 conversation threads, 5 explicitly illustrative how-to messages, and saved idea/project/asset relationships. The 4 existing tasks and 20 existing references remain unchanged. Checksums also confirmed the workspace, owner membership, profile, and 2 existing rooms were unchanged: 29 original rows total.

No members, invitations, review rounds, reviews, decisions, approvals, or published kits were created. All 12 new tasks are open and unassigned. The sole existing owner is recorded as the importer; illustrative dialogue explicitly says the named founders did not send those messages.

Verification: `verification/starter-import-2026-10-02.json`. Applied SQL SHA256: `174c215213bbd29735ab4ec6df6bdf4c26d15321fb71331aa49a8638a73d369f`.

## Sources and privacy

- 19 standalone recreated image assets provide the requested mockup compositions. Their public paths and SHA256 values are allowlisted. They are reusable exploratory starter artwork, with no founder approval or previous in-app generation claimed.
- 8 user-supplied original posters/moodboards are preserved byte-for-byte outside `public/`. Original creation history is unverified. They are saved as separate source versions, shown full-frame with `contain`, and served only by the authenticated, workspace-bound, version-ID endpoint.
- Public demo data contains the recreated examples only. Original source descriptions/import metadata are in an import-only JSON file, not the demo catalog. The client allowlist contains logical filenames and SHA256 values, never original Library identifiers or local disk paths.
- Proposed typography and guideline copy are explicitly labeled implementation suggestions, because their contents were not visible in the supplied mockup tabs.

## Stable editing and relationships

The importer uses workspace-scoped deterministic IDs and insert-only natural-key deduplication. It never overwrites user changes, deletes data, resets settings, or fabricates workflow history. Naturally matched preexisting ideas keep their existing relationship graph and revision untouched.

Imported task previews and attachments are related through immutable version provenance containing task IDs, not editable task text. Renaming a task or replacing its details keeps the associations intact. Saved idea links, project relationships, and canvas nodes are real persisted records.

The pure `hydrateImportedContent` adapter derives presentation fields from those persisted records. It clears previews if a path/hash no longer matches. Private originals become version-bound API URLs only. Repeated server/client hydration is tested.

## Deployment and canonical Library files

The data import is complete. The new app and bundled asset files still need deployment before production can render this collection.

After deployment, prepare the six public canonical editable Library files with:

    node scripts/prepare-starter-library-files.mjs --origin https://sports-brand-collaboration-setup.vercel.app

This command is read-only against the deployed site. It requires each PNG to return successfully with the expected content type and exact SHA256, then writes stage-two SQL for review. It does not execute SQL or upload anything. Canonical file nodes link each file to its unchanged immutable source version; the UI deduplicates those cards.

The eight private original canonical files remain a separate pending step until the deployed authenticated endpoint is verified for authorized access and anonymous denial. Do not turn private originals into public URLs or claim they were uploaded to Supabase Storage.

Bundled assets can be viewed, compared, linked, and reviewed. Image editing/generation that requires an owned Storage upload still needs a genuine uploaded copy; the import does not invent a storage handle or bypass source ownership checks.

## Reproducible tests

    pnpm typecheck
    node --test tests/imported-content.test.mjs
    PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/mockup-import-runtime.mjs

The isolated runtime test compiles all three existing migrations, imports the collection, checks preservation of original rows/settings, verifies exact counts and absent approvals, repeats the import after user edits, tests wrong-owner rollback, and compiles/repeats the six-file stage-two SQL without any remote connection.
