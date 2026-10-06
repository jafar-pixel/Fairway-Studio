# Fairway Studio

This is an extension of the supplied `sports-brand-collaboration-setup.zip`, not a new application. It preserves the installed Next.js 16.3.3 / React / Supabase architecture, existing authentication and ten legacy tables. Development branch: `build/fairway-studio`.

## Run

1. Install the exact lockfile: `pnpm install --frozen-lockfile`.
2. Configure the existing Supabase project using `.env.example`. Never use a service-role key in a public variable. The app rejects another project's hostname.
3. Start: `pnpm dev`. Sign in through the existing account flow.
4. `/demo` is a clearly labeled interactive fixture workspace. It never sends mutations to Supabase. Changes are stored in that browser tab's session storage and can be reset; sample founder reviews are not real approvals.
5. `pnpm typecheck`, `pnpm test`, and `pnpm build` run the release checks. Type errors are not ignored.

## Routes

`/w/[workspaceId]` contains Home, Ideas, Projects, Library, Conversations, Tasks, Brand Kit and Team & Settings. Projects have Overview, Canvas, Reviews, Decisions and Files routes. Collections support linked item drawers. Phone navigation retains all destinations through More.

## Data and migration

`supabase/pending-schema.sql` is the additive collaboration schema reviewed against project `xljhxmyigtxhjtxxzuwk`. Consult `VERIFICATION.md` for whether it was applied during this build. Never run it blindly against another project. It preserves legacy records and status values, adds transactional domain mutations, and narrows unsafe legacy access. It is not a database reset or seed.

All shared mutations use authenticated identity, workspace membership, idempotency keys and canonical returned revisions. An unavailable schema is reported instead of silently storing shared data locally. Ratings are independent of founder dispositions. New versions need new reviews; kit publication requires separate name, logo and palette evidence.

`supabase/pending-ai-jobs.sql`, if present, is a separate image-job migration requiring its own review. Provider credentials and a worker configuration are deployment prerequisites. `supabase/pending-workflows.sql` adds idea reuse/attachments, notification preferences and immutable rejection/deferral/supersession workflows and requires its own review. No provider is simulated.

## Assets and external services

The two original export images are preserved. Nineteen standalone exploratory artworks recreate the supplied mockup imagery; eight additional user-supplied original posters/moodboards are retained byte-for-byte under `assets/originals/`. Their complete provenance is in `asset-manifest.md`. No app screen is flattened into an image.

Original business artwork is private: `/api/studio/starter-asset?versionId=...` requires verified sign-in, exact owning workspace membership, a saved version, and matching byte/hash metadata. It is never served from `public/`, and responses prohibit browser/shared CDN caching. The Next build traces all eight originals into that server route. Existing internal uploaded image versions retain their source snapshots; bundled examples do not masquerade as Storage uploads.

The reviewed starter import is applied to the existing Fairway workspace. See `STARTER-CONTENT.md` for counts and preservation checks. Editable canonical Library file records are a separate post-deployment step requiring verified deployed URLs; the saved concept versions and their project/idea relationships already exist.

Pinterest links use official widgets with a source-preserving fallback. An embed is not permission to send its imagery to an image provider. External Proton/HTTPS file links remain supported. Sessions open configured existing meeting links; an in-app video provider is not invented.

Studio AI text uses the existing Vercel AI SDK/Gateway architecture, honors visible context selections, and requests real record-ID citations. It cannot mutate votes, membership, or kit approvals.

## Mobile and offline

See `PWA.md`. Manifest, neutral icons, install guidance, static-only service worker, scoped IndexedDB drafts, explicit sync/conflicts and update guards are included. Approvals and publishing require online confirmation. Native app-store packaging is a separate deliverable. Real iOS/Android installation checks remain distinct from route/HTTP tests.

## Delivery safety

Only a verified Fairway deployment destination may be used. No unrelated Vercel project should be overwritten. Environment files, dependencies, `.next`, and local git metadata must not be included in the delivered source ZIP.

## Reproduce isolated SQL checks

Install `@electric-sql/pglite@0.3.14` in a separate tools directory (not into production dependencies), then set `PGLITE_MODULE` to that installation's `dist/index.js` and run `node tests/studio-sql-runtime.mjs`, `node tests/generation-sql-runtime.mjs`, `node tests/workflow-sql-runtime.mjs`, and `node tests/mockup-import-runtime.mjs`. These scripts construct isolated fixture databases; they never connect to the real Supabase project. The HTTP smoke script likewise performs no real workspace mutations.
