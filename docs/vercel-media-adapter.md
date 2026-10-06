# Existing-Vercel media adapter

## Recommendation

Use the existing Vercel Node/Fluid deployment with the packaged converter in this overlay. A separately hosted Linux daemon is not inherently required. The original backend archive stays unchanged; this overlay applies after it and supplies actual request-triggered automatic conversion with explicit manual crash recovery.

The project’s existing service-role connection can be reused; no new credential, hosting account or subscription was created. No live migration, deployment, Vercel setting or VPS was changed during this work.

## Verified local evidence

- Month-end-pinned BtbN FFmpeg **n9.0.2-17-g2a571b6068, built 2026-09-30**, from the build distribution linked by FFmpeg’s official download page. Software HEVC/H.264 decoding, libx264/AAC encoding, required containers and HDR tone mapping work.
- `libheif-js` **1.23.2** embedded WASM decoder and `sharp` **0.35.5**: actual official HEIC fixture becomes a JPEG in a credential-free subprocess. No reliance on Sharp’s prebuilt HEIC decoder or system ImageMagick.
- A tiny bundled POSIX resource limiter applies hard 2 GiB address-space, 155 CPU-second, 100,000,000-byte output, 64-descriptor and zero-core limits. Node uses `--disable-wasm-trap-handler`, a 256 MiB JS heap, one libuv thread and bounded allocator arenas, allowing WASM + Sharp inside that hard address-space limit. No system prlimit is needed.
- All 13 earlier codec fixtures pass with original hash preservation, including HEVC MOV, VP9/Opus MKV, silent video, rotation and synthetic PQ HDR. Actual native processing also passes a byte-exact 100 MB valid padded MP4 and a 48 MP JPEG. The padded container is a byte-boundary test, not proof of arbitrary 100 MB complex-video throughput.
- Timeout kill, hard output cap, unapproved executable rejection and absent server credentials in native-child environment are tested.
- A production Next.js 16.3.3 test route returned 202 immediately; after the curl client exited, Next after() completed real HEIC-to-JPEG conversion and persisted a ready result. This is a local production server test, not a deployed-Vercel/tab-close certification.
- Full copied Fairway application: TypeScript, 103 unit/regression tests and webpack production build pass. Media route output-file traces are measured in `full-app-trace-measurement.json`, with no missing files. Final Vercel packaging remains a deployment check.
- Revised isolated PostgreSQL tests and an independent live-catalog-shaped review pass. Retry uses the same per-uploader transaction lock and <=20 pending quota as registration; current membership is row-locked and canonical uploader checked. Simultaneous application retry submissions at 19/20 capacity allow only one new pending item. PGlite serializes one DB session, so true multi-session contention is still a deployment/test-DB gate.

## Runtime/source choice and packaging

The familiar npm `ffmpeg-static@5.3.0` + `@ffprobe-installer/linux-x64@5.2.0` packages were measured and executed. They package ~159 MB together but contain FFmpeg 7.0.2 and a 2023 ffprobe respectively. They establish feasibility but are not the selected production converter. The adapter instead downloads a reviewed current FFmpeg shared build during **build time**, checks an exact SHA-256, retains only required runtime files, and never fetches executable code during a request.

Date-pinned upstream archive:
https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-09-30-13-08/ffmpeg-n9.0.2-17-g2a571b6068-linux64-gpl-shared-9.0.tar.xz

SHA-256: `01a9764d0b5364b66cfeb4617557c64321b0e232e172ec73f0a701c5f7694326`

This is the last September 2026 build. [BtbN’s retention policy](https://github.com/BtbN/FFmpeg-Builds#release-retention-policy) keeps month-end builds for two years; ordinary daily builds only retain the latest 14. Review and repin before September 2028, and sooner for relevant security updates. Retention is an upstream policy, not a permanent availability guarantee. The September pin passes all 13 codec fixtures and the resource-limit suite; the same single-core memory fixtures with a 512 MiB parent reserve peak at 1.457 GB combined RSS. Its 143 packaged runtime files total 224,504,887 bytes, 12,480 bytes less than the earlier October 1 daily build.

The compiler builds the small limiter from included source, using the build image’s existing gcc/glibc-devel. FFmpeg’s libraries require at most GLIBC 2.28; the locally built limiter requires GLIBC 2.34. Amazon Linux 2023 build/runtime compatibility must be verified in the preview deployment. If the dated upstream release is removed, the build fails closed until a replacement is reviewed and repinned. Preserve supplied GPL/license information and source provenance.

The build script resolves Sharp/libheif dependencies from their actual installed package roots, including pnpm's isolated store, and stages a self-contained image worker under vendor/media-runtime/image. All runtime files are traced with a single vendor/media-runtime/** glob; it does not rely on npm-style hoisting of @img native packages.

Only `libheif-js:1.23.2` and `sharp:0.35.5` are required new npm dependencies. Follow `integration-patches/package.fragment.json` and regenerate the app’s existing pnpm lockfile. The research workspace’s package manifest contains exploration dependencies and must not replace the application manifest. Add the exact tracing fragment for the three media routes, retaining existing starter-asset tracing. The artifact intentionally does not contain a 200 MB checked-in binary or the local test API; the verified build script prepares binaries.

## Truthful automatic processing and recovery

`worker` response additions: `mode:'after_response'`, `recovery:'manual'`. `automatic:true` means runtime/schema are available and registration/retry is wired to real Next after() callbacks. It does not mean durable crash redelivery.

- Registration commits the immutable original/job, schedules after(), then responds.
- At most one converter runs in a warm process. A slot unavailable after 30 seconds produces blocked/WORKER_BUSY, preserving the original and exposing retry.
- A transient worker requeue is converted atomically to blocked/RECOVERY_REQUIRED by the callback, guarded by current status and attempt. It cannot silently remain queued when no daemon exists.
- Jobs with an expired 10-minute processing lease, or queued originals never claimed for 10 minutes, are presented as recoverable blocked states; attempt-limit cases appear failed. The checked retry RPC independently rechecks stale state and never resets an active lease.
- New, unclaimed queued jobs can be picked up by authenticated workspace status polling. Once stale, explicit retry is required. This does not depend on the uploader’s browser for an already running after() invocation, but normal function termination or platform interruption still needs recovery.
- Derivative upload cacheControl is **0**. Signed redirects remain private/no-store with 60-second signatures. Real browser/CDN caching and removal/revocation must be tested; instant revocation is not promised.

## Existing-Vercel limits and costs

Current primary docs specify Pro Fluid maximum **4 GB/2 vCPU**, 300-second default and 800-second standard maximum, and **250 MB standard uncompressed function bundles**. This adapter sets route maxDuration=300 and conversion wall limit=150 seconds. Keep the existing Standard 2 GB setting for preview testing: single-core tests with an additional 512 MiB resident parent reserve observed a combined peak of 1.443 GB for a valid synthetic 48 MP HEIC padded to exactly 100 MB, and 1.435 GB for 4K 10-bit HDR. The child keeps its 2 GiB virtual-address cap because 1.5/1.75 GiB caps reject that valid HEIC; actual RSS is substantially lower. These are 5 ms local RSS observations, not Vercel platform metrics. Change memory settings only if deployed evidence establishes a need. No 5 GB large-function beta appears necessary from the measured traces, but the actual deployment is the final check. The request body limit remains 4.5 MB, so originals still go through direct Supabase TUS and never through the function body.

The existing Vercel plan’s active CPU, provisioned-memory and request usage charges and Supabase storage/egress still apply. This is not a promise of cost-free conversion. Increasing the function memory allocation can change usage costs; that setting is not changed here.

## Optional durable recovery without a new secret

`optional-workflow/` contains a separate, **not enabled** Workflow 5.0.1 plan. Its installed documentation verifies automatic Vercel OIDC authentication, managed queuing and persisted state, without CRON_SECRET. It requires access to system environment variables/VERCEL_DEPLOYMENT_ID and its generated step’s native-file packaging must be verified. It also introduces metered Workflow and Queue usage, so it remains approval-dependent. Do not use its driver and after() concurrently for the same pipeline.

## Remaining release gates

1. Merge guarded overlay, exact dependencies/lock and build/tracing fragments; review/apply the additive SQL with authorization.
2. Verify the project’s Node/Fluid/memory settings, existing service connection, build tools, binary loading and final function size in a preview deployment.
3. Authenticated real TUS >50 MB/near-100 MB uploads, source hashes and private original/derivative access from another authorized user/device.
4. Browser video/audio/image playback, Range seeking, removal/restriction/cache revocation, actual iPhone HEIC/HEIF/HEVC/HDR/orientation/audio-sync samples.
5. Close the uploading tab after registration and confirm ready; deliberately interrupt an invocation before claim and during processing, then verify honest recovery UI and retry.
6. Durable unattended crash recovery requires a real approved trigger/Workflow and its end-to-end redelivery test. The after-response mode deliberately does not claim that guarantee.

Primary references: [Vercel function limits](https://vercel.com/docs/functions/limitations), [build image](https://vercel.com/docs/builds/build-image), [Next after](https://nextjs.org/docs/app/api-reference/functions/after), [Workflow pricing](https://vercel.com/docs/workflows/pricing), [official FFmpeg downloads](https://ffmpeg.org/download.html), [libheif-js](https://github.com/catdad-experiments/libheif-js).
