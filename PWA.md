# Fairway Studio PWA / offline baseline

## Implemented

- Next.js `app/manifest.ts`: stable `/` app identity/start URL/scope, standalone display, cream theme, neutral Fairway geometric monogram PNGs (192, 512, maskable 512, Apple 180). No proposed consumer identity is implied.
- `public/sw.js`: explicit public-shell allowlist; authenticated HTML navigations are network-only with a static offline fallback. No API, RSC, Supabase, signed URLs, arbitrary preview images, query-string URLs, mutation or cross-origin caching. Installation fetches use omitted credentials and reject redirects. Public hashed JS/CSS/fonts can be cached only when successful, non-redirected and not private/no-store.
- `PwaControls`: capability-detected install affordance, iOS/browser instructions, offline indicator, explicit update-ready action, scoped device drafts, queue status, export, retry and conflict comparison. Updates never automatically activate or force reload.
- IndexedDB idea/note drafts include account, workspace, local ID, base revision, request ID, payload and status. Request IDs survive retry. Browser Web Locks serialize same-scope sync across tabs where supported; servers must still enforce idempotency.
- Sync runs on mount/resume/reconnection and explicit Retry only when a real adapter exists. Membership is verified before every replay. An earlier error/conflict or unmet dependency stops later replay. No approvals/reviews/decisions are queued.
- Keep mine as new draft creates a fresh local request, preserves original conflict and does not silently submit it.

## Integration

Mount `PwaControls` in the client shell with a verified `scope={{ accountId, workspaceId }}`. Never use the same scope for different accounts. The component remounts when scope changes and does not show the old account's loaded drafts. Unauthenticated rendering can omit scope and still offer install/update guidance.

Supply `beforeUpdate: () => Promise<boolean>` to save or block all other unsaved editors/reviews/uploads before update. The component checks its own composer and obtains explicit refresh confirmation, but cannot discover other editors' state itself.

Supply a stable `syncAdapter` only when the server provides:
1. `verifyScope(scope)` that checks current authenticated user identity and workspace membership, not merely cached state.
2. `send(draft)` that applies the allowed idea/note operation with an atomic unique request-ID constraint, base-revision comparison, RLS, and authorization. Return `{status:'saved', revision}` only after commit, or `{status:'conflict', revision, text}`. Reuse an already committed idempotent result after a lost response.

Without an adapter the UI explicitly says sync is not configured and saves only on this device. This is intentional: there is no fabricated remote success or unverified table mapping.

Before logout/account change, inspect `listDrafts(scope)`, warn about unsynced text and offer export/return/discard. `clearScopeDrafts(scope)` refuses unsynced deletion by default; pass `true` only after the user's explicit discard choice. Clear every workspace for the departing account through an authenticated account-level flow where appropriate. Do not delete another account's pending drafts. Disable signout while a sync request is in flight or coordinate cancellation/settlement before clearing. The public service-worker cache contains no private data; no private preview caching is implemented.

Update root metadata Apple icon to `/pwa/apple-touch-icon.png`, theme/background `#f4f3ed`. Next manifest convention adds its link automatically. Exclude `/sw.js`, `/offline.html`, `/manifest.webmanifest` and `/pwa/` from the auth proxy. Serve `/sw.js` with `Content-Type: application/javascript`, `Cache-Control: no-cache, no-store, must-revalidate`, and `Service-Worker-Allowed: /`. Production needs HTTPS (localhost is allowed). Registration is intentionally disabled in development mode.

## Validation

Run with Node 22.18+ or Node 24:

    node --test tests/pwa*.test.mjs

Nine tests cover allowlist exclusions; noninterception of private requests; navigation fallback; manual update activation; scoped local reads/deletion; stable retry identity; revision conflicts; dependency failure; membership denial. The IndexedDB tests use an in-memory API double. They do not establish real-browser storage durability or backend atomicity. PWA TypeScript files were also checked in isolation with the project's compiler options.

## Release checklist / known limits

- Verify production HTTPS install on real iOS Safari and Android Chrome, plus standalone deep-link login redirects and intended-route return.
- Verify production worker registration, offline cold start/fallback, online app left open while drafting, reconnect retry, and multiple-tab updates.
- Exercise IndexedDB quota denial/private browsing and storage eviction; export before destructive logout.
- Exercise two real accounts and multiple workspaces; no previous-account draft preview must appear after switching.
- Exercise server commit followed by dropped response: retry must return one idea, not create two.
- Exercise membership revocation during sync and concurrent revision conflicts.
- Verify new worker waits during uploads/review work until user chooses Update and `beforeUpdate` permits it.
- Offline cold-start intentionally shows a public reconnect page rather than cached authenticated HTML. Local drafts are editable in an already open authenticated app; standalone offline draft browsing after a fresh launch remains a separate enhancement.
- Authorized per-account preview caching, push, background sync and native-store distribution are not implemented.

Official references checked during implementation:
- https://nextjs.org/docs/app/guides/progressive-web-apps
- https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest


## Integrated application example

The root layout now mounts installation/update controls. The auth proxy excludes the public PWA files, worker headers are configured, and TypeScript build errors are no longer ignored.

Inside the authenticated app shell, memoize the real adapter and mount scoped controls (the adapter remains undefined in demo mode):

```tsx
import { useMemo } from 'react'
import { PwaControls } from '@/components/studio/pwa-controls'
import { createIdeaDraftSyncAdapter, prepareScopeSignOut } from '@/lib/studio/offline'

const draftAdapter = useMemo(
  () => createIdeaDraftSyncAdapter(() => result.mutate()),
  [result.mutate],
)
<PwaControls
  scope={{ accountId: userId, workspaceId }}
  syncAdapter={demo ? undefined : draftAdapter}
  manageInstallation={false}
/>

// Before actual sign-out; repeat for every known workspace of the departing account.
if (!(await prepareScopeSignOut({ accountId: userId, workspaceId }))) return
await createClient().auth.signOut()
```

`prepareScopeSignOut` resolves in-tab sync first, warns about unsynced drafts, offers export or explicit discard, verifies export was obtained, and detects changes made during the prompt. Cancel returns false; storage errors throw so callers must show them and keep the account signed in. A custom async chooser can return `export`, `discard`, or `cancel` for an application dialog. Other tabs must still be coordinated during logout.

The concrete adapter supports new ideas and notes through the existing workspace API (notes become Ideas categorized Note) and uses the queued request ID unchanged. Server GET verifies account and membership. New idea writes have no prior revision; existing-row revision updates are deliberately rejected rather than silently overwriting shared data. The generic adapter remains available for future revision-aware note operations.
