# Creative conversations

Open Creative Assistant from the studio header. Each founder can create a private conversation or a conversation shared with the workspace. Shared means every current workspace member, not just the three founders.

## Working flow

1. Choose Private or Shared workspace before sending the first message. Conversation visibility is fixed at creation to prevent accidental disclosure of private history.
2. Select a project for its brief to inform the AI. Text discussion and comments also work without a project.
3. Talk with AI for ideas and critique. The latest twenty completed turns, selected project brief, and selected source image are sent to the configured provider. The complete saved conversation remains in Supabase; the interface currently displays the latest 200 turns.
4. Choose Create / edit image for a new draft or an edit of a specific source version. This submits one image to the existing durable generation queue. Choose the source explicitly; earlier images are never guessed from a pronoun.
5. Upload PNG, JPEG, or WebP up to 10 MB. Upload & attach saves the original into the workspace Library and creates a project version. This is shared project content even if the conversation itself is private; the UI states this before upload.
6. Keep a generated result as a shared project version. The original remains unchanged. Edit this image starts a new generation using that retained version as its parent. Shared participants can see draft outputs; the job creator controls keeping, retrying, and cancelling, consistent with existing generation authorization.
7. Open Canvas or Founder Review from a kept result. Existing project review controls handle ratings and decisions. The AI does not submit votes, approve concepts, or publish a brand kit.
8. Use Comment only to add a founder message without invoking a provider.

## Wiring

- `components/studio/creative-chat.tsx` replaces the single-answer assistant entry point.
- `/api/studio/creative-chat` authenticates workspace membership and checks conversation RLS before every read/write. Identity and assistant replies are server assigned.
- `studio_creative_chats` stores titles, creators and immutable visibility. `studio_creative_turns` stores attributed user prompts, assistant replies, source version IDs and generation job links.
- Client roles have SELECT only. Server-only writes prevent forged assistant responses and arbitrary generation-job attachment. There are no new SECURITY DEFINER functions.
- A partial unique index permits only one pending turn per conversation. Request UUIDs and payload hashes prevent duplicate processing of the same request. Requests interrupted for over three minutes become failed when a subsequent message arrives.
- Image creation, leases, quotas, retry limits, immutable retention and parent provenance reuse `lib/studio/generation.ts` and `/api/studio/generation`.
- Shared image bytes are proxied only after conversation authorization and only for job IDs already linked by the server. Internal output paths are not returned in the conversation payload.
- SWR polls open conversations every four seconds and the conversation list every ten seconds; it does not require Supabase Realtime publication changes. Cache keys include the signed-in user ID. Workspace/user changes remount the panel.

## Configuration and rollout

Apply `supabase/migrations/20261011055223_creative_conversations.sql` once. It was applied and its RLS/grants verified on the existing approved Supabase project on October 11, 2026. It is additive and contains no user-content updates.

The existing deployment needs its server-only `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` from Google AI Studio. Both chat and images call Google directly, with no AI Gateway account or key. Models are pinned server-side to `gemini-3.8-flash` and `gemini-nano-banana-2.1`; legacy `STUDIO_TEXT_MODEL`, `STUDIO_IMAGE_MODEL`, and Gateway credentials are unused. Never expose server keys with a NEXT_PUBLIC prefix. The public Supabase URL/key continue to use the existing session setup. No secrets were created, copied into this repository, or requested in chat.

Provider requests require an explicit usage acknowledgement. This branch has not been verified against live paid provider calls or a signed-in founder session. Existing image worker configuration remains required for automatic recovery without a user reopening and continuing a queued request.

## Verification

- TypeScript and the production Next.js build.
- Prompt validation and bounded-history tests.
- Route tests for cross-origin rejection, inaccessible conversation output access, usage consent, request replay and conflicting author IDs.
- Isolated PostgreSQL tests for private/shared RLS, cross-workspace isolation, removed members, anonymous access, rejected forged writes, pending-turn serialization, and workspace foreign keys. Run with `PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node tests/creative-chat-sql-runtime.mjs`.
- Full existing test suite compared with unchanged `main`: six existing failures in guide playback, frozen source hashes and a session lifecycle test double also occur on the baseline. The new component import is added to the existing shell test double; baseline assertions have not been weakened or rewritten.

The build environment may need `TAR_OPTIONS=--no-same-owner pnpm build` when its filesystem cannot preserve ownership in the existing verified FFmpeg archive. This is an environment setting, not a change to the archive verification.

After adding the Google key to Production, redeploy and verify a chat reply, image creation, a reference-image edit, retaining the image, and reopening it. Existing failed jobs from the old provider require a new image request; their prompts remain saved. A missing key disables generation before a job is queued. Google billing/quota or model-access errors must be resolved in that key’s Google project.
