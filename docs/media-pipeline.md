> Deployment update: the tested existing-Vercel packaged adapter is documented in [vercel-media-adapter.md](vercel-media-adapter.md). The guide below describes the earlier native-daemon option; a separate hosted worker is not inherently required. The original preservation, permissions and live acceptance gates still apply.

# Private shared media pipeline (review and deployment guide)

## State of this implementation

Code and local tests are complete; this document does not certify deployment. The additive SQL has NOT been applied to the live project. No paid service, plan change, credential creation, scheduler, or deployment was performed.

Supported original uploads: JPEG, PNG, GIF, WebP, AVIF, HEIC/HEIF, MP3, MP4, MOV, MKV, each nonempty and at most **100,000,000 bytes**. Client MIME aliases normalize to canonical types. Server verifies Storage metadata and bounded file signatures before idempotent registration. The durable worker downloads to an isolated temporary file, verifies complete native decoding and hashes originals without changing them.

Photos already supported by browsers and valid MP3 stay byte-for-byte original. HEIC/HEIF becomes an oriented, sRGB JPEG without private metadata. Videos become private H.264/yuv420p + AAC MP4 with faststart; silent sources stay silent. A synthesized PQ HDR sample passes explicit SDR tone-mapping. This is not a claim of validation against all iPhone HDR/Dolby Vision/48 MP files; those remain acceptance tests.

## Contract

- `lib/studio/media.ts`: `MAX_MEDIA_BYTES`, `MEDIA_ACCEPT`, `inferMediaType(name, supplied)`, `mediaKind(type)`, `MediaJob`, `mediaPreviewUrl`, `mediaOriginalUrl`.
- `PATCH /api/studio/media`: `{workspaceId,path,title,contextNote,tags}` -> `{id,job,worker}`. The request is bounded metadata only; originals go directly from browser to authenticated Supabase TUS. This route never proxies a 100 MB upload.
- `GET /api/studio/media?id=...&variant=preview|original`: authenticated current canonical-file/version authorization then a **60-second private signed Storage 307 redirect**. Preview is the default; `download=1` requests the unchanged original and an attachment filename. Storage handles HTTP Range/seeking. A queued/failed preview returns a real status rather than an original masquerading as a compatible preview.
- `GET /api/studio/media/jobs?workspaceId=...&fileIds=id,id`: `{jobs,worker,legacyFileIds}`. IDs and row access are independently checked.
- `POST /api/studio/media/jobs`: `{workspaceId,jobId,action:'retry'}` -> `{job,worker}`. Only the current uploading member can retry a failed/blocked job within the three-attempt budget.
- Worker state is `{available,automatic,code,message}`. `automatic` is true only for a recently heartbeating daemon that first passed actual HEIC, HEVC, MKV, silent-video and HDR conversion self-tests. It remains false when the worker connection or runtime is missing. Merely installing the API route does not activate automatic jobs.

## Persistence and access

`supabase/pending-media.sql` is an additive, review-only migration, following the existing pending-schema convention. It updates the existing private bucket's limit/MIME allowlist and the existing three-segment ownership helper; broadens the canonical storage URL constraint; adds RLS-protected job/health tables; adds a separate private derivative bucket; preserves existing original delete/visibility restrictions; and permits job completion/claim only with service privileges.

Authenticated users cannot forge completed jobs or write derivative objects. Private derivative reads require the exact current canonical original, current workspace membership and original permission scope. Removed members and restricted-file outsiders fail those checks. Original URLs/workspace/uploader become immutable once registered. Version serving keeps the exact snapshot source and never substitutes another source's preview.

Registration is idempotent per immutable object/recipe. A per-uploader transaction lock enforces a queue limit of 20 concurrent pending items. Jobs use `FOR UPDATE SKIP LOCKED`, independent random lease tokens, a 10-minute crash-recovery lease, three total attempts, transient retry backoff, and compare-and-swap completion. Expired leases recover automatically while the daemon is running. Reclaimed jobs remove only their uncommitted private preview objects; completion cannot replace the original. Temporary files are removed on completion and old abandoned worker directories are swept on daemon startup.

## Approved Linux native runtime required

The app/Next.js deployment does **not** magically contain these OS tools. The inspected local machine has:

- FFmpeg / ffprobe 7.1.5-0+deb13u1, native HEVC + H.264 decoders, libx264/AAC encoders, MOV/Matroska/MP3 demuxers, MP4 muxer, zscale/tonemap filters
- ImageMagick 7.1.1-43 Q16, libheif 1.19.8 with HEIC read support
- Linux `prlimit`

The worker checks actual advertised capabilities and runs codec self-tests under the same resource limits before claiming health. Use maintained official OS packages, and re-run checks on the exact deployed binaries after updates. No npm transcode service dependency or new API account is required. The daemon's build runner uses the app's existing pinned TypeScript dependency; install development dependencies for this runner.

Server-only environment:

- Existing `NEXT_PUBLIC_SUPABASE_URL` must equal the approved project URL.
- Existing, separately authorized `SUPABASE_SERVICE_ROLE_KEY` is required by the daemon and app's privileged retry/health actions. No key is created or included in this deliverable.
- `STUDIO_MEDIA_FFMPEG_PATH`, `STUDIO_MEDIA_FFPROBE_PATH`, `STUDIO_MEDIA_MAGICK_PATH`, `STUDIO_MEDIA_PRLIMIT_PATH` optionally override their absolute `/usr/bin/...` defaults.
- `STUDIO_MEDIA_HEIC_TEST_PATH` must be an absolute path to a reviewed HEIC decoder fixture, at most 1 MB. No asset is fetched on daemon startup.
- Optional `STUDIO_MEDIA_WORKER_SECRET` protects the POST worker route if an already approved external scheduler is used. This route is not a scheduler. No secret is generated or configured here; the continuous daemon is the implemented unattended driver.

A verified existing Linux execution environment and an approved restart supervisor are needed to run `node scripts/media-worker.mjs` independently of a browser tab. Use one sequential daemon per allocated resource budget. The optional API invocation has `maxDuration=240`, but native packaging, actual function plan/runtime limits and retries still require verification; the daemon avoids relying on a phone tab or one Vercel response staying alive. No background scheduling is installed by the SQL.

Resource bounds: 2 GiB native address space per subprocess, two native threads, 155 CPU seconds, a 150-second cumulative conversion wall budget, 100 MB maximum output file, 64 descriptors, no core dump; 50 MP/frame images and 100 MP cumulative image frames, at most 256 frames; video <=4096 px per dimension, <=8,847,360 px/frame, <=120 fps input, <=10 minutes; audio <=30 minutes and <=8 channels. Output is <=1280x720 at 30 fps and bounded bitrate. Allocate at least 3 GB RAM and 512 MB temporary storage to the single worker; verify these against the chosen platform before deployment. Inputs beyond budgets preserve their original and report a specific complexity failure. Size alone cannot guarantee convertibility of arbitrary 100 MB input.

Native subprocesses receive no app credentials, accept no user flags or URLs, use fixed argv/no shell and local input files, and restrict FFmpeg input protocols/demuxers. ImageMagick has an explicit coder/delegate/resource policy. Keep native packages patched and run the worker in a dedicated restricted runtime.

## Reproduce checks

1. `node node_modules/typescript/bin/tsc --noEmit`
2. `node --test tests/*.test.mjs lib/studio/domain.test.mjs`
3. `node scripts/generate-media-fixtures.mjs` (synthetic local fixtures only)
4. `MEDIA_HEIC_FIXTURE=/absolute/reviewed.heic node tests/media-native-runtime.mjs`
5. `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/media-sql-runtime.mjs` (isolated PostgreSQL/WASM; tested with 0.3.14; no live DB connection)
6. `STUDIO_MEDIA_HEIC_TEST_PATH=/absolute/reviewed.heic node scripts/media-worker.mjs --check` (no database connection)
7. `node node_modules/next/dist/bin/next build --webpack`

The isolated copy's Turbopack default build refuses its externally symlinked node_modules; the webpack production build passes. Do not treat that sandbox-only symlink error as a deployed application failure, but re-run the normal build after integration with real dependencies.

HEIC test source used locally: https://github.com/strukturag/libheif/blob/master/examples/example.heic (official libheif example; not redistributed in this patch). Tested SHA-256: `7f8b363e4936c0666a25f64f3a92fda10bd8e5453be4592530b65a55dd98f3f2`, 718,114 bytes. Retrieve from that source, verify the hash and review licensing before retaining it in deployment. Synthetic owned fixtures are included and regenerated by the fixture script.

## Remaining live acceptance gates

- Review/apply the additive migration with appropriate authorization; verify actual bucket settings, the global upload cap and restrictive Storage policy interactions on the real project.
- Confirm the existing service connection, approved durable native execution environment/supervisor, exact deployed decoder/encoder self-test and live heartbeat. Do not create credentials or a paid worker service without approval.
- Real direct TUS uploads above 50 MB and near/exactly 100,000,000 bytes; expired JWT, offline/resume, cancel/retry, and +1 rejection.
- New Idea multi-attachment flow, idempotent create/link/retry, across refresh and a second authorized account/device; close the uploading tab after registration and verify the independent worker reaches ready.
- Real browser image/video/audio playback and seek/Range behavior through signed redirects; removed-member/restricted-original access tests; actual iPhone HEIC/HEIF, HEVC MOV, orientation and audio sync, HDR/color samples and high-resolution near-limit files.

Primary implementation references: https://supabase.com/docs/guides/storage/uploads/resumable-uploads ; https://supabase.com/docs/guides/storage/serving/downloads ; https://ffmpeg.org/ffmpeg.html ; https://ffmpeg.org/ffmpeg-filters.html ; https://imagemagick.org/security-policy/ . Supabase's current changelog was checked; the September PostgreSQL extension changes do not affect these functions (no ltree/pgcrypto-encrypted values/btree_gist/custom operators are introduced).
