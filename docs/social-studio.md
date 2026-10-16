# Social Studio

Social Studio is available in the main sidebar. It uses the existing authenticated workspace, social publication workflow and project database. It does not seed example posts, assign founder opinions, auto-approve content, or pretend to connect social platforms.

## Pages

| Page | Purpose | Implemented actions |
| --- | --- | --- |
| Overview | Understand the saved pipeline | Open working drafts, pending reviews, approved packages and manually posted records; reopen recently updated content |
| Content Library | Find and create content | Search title/caption/account; filter by channel, status and campaign/project; open exact content; create a blank draft |
| Campaigns | Keep a launch and its work together | Create a campaign project with a custom title, objective and owner; open its project; create a linked post; filter its content |
| Calendar | Plan posting dates | See all saved records, navigate weeks, change display timezone, filter formats, open a post to edit its planned date |
| Founder Review | Find packages awaiting decisions | Open an immutable submitted package; named reviewers approve or request changes with notes through the existing review flow |
| Results & Feedback | Learn from actual publications | Open manually posted content, record observations and optional manual metrics, create follow-up tasks |
| Connections | Explain available delivery | Show manual export support for each channel and filter to its content; explain Pinterest reference vs publication rights |

Sidebar entry opens `/w/:workspace/content/overview`. Existing `/content` links continue to open the library. Every view and saved post has a canonical deep link. Shared content is scoped to the selected workspace; use Team Workspace for founder collaboration.

## Create and refine a post

1. Choose Create content, or create content from a campaign card.
2. Enter a title, purpose, audience, destination account label and channel.
3. In the AI writing partner, describe your own direction. The assistant receives only the working title, purpose, audience, channel, format and caption plus your instruction. It does not see images or internal release/rights notes.
4. Read/edit the proposed caption. Refine it with another instruction, discard it, or choose Use as working caption. Applying replaces the working caption; it does not save or approve it.
5. Link the source project and exact design version. The media preview uses the existing authenticated media endpoint. Enter the planned time and timezone if useful.
6. Save. Reopen the saved draft to edit or request publication review.
7. Select the named reviewers. Reviewers inspect the immutable submitted package and make independent decisions. Editing a reviewed draft continues to require renewed publication approval.
8. Download the approved package, publish manually in the destination platform, then record its actual URL. Record measured metrics and observations afterward.

AI instructions and unused suggestions remain in the editor until applied and saved as the caption. Leaving dirty forms prompts before discarding. Network-uncertain mutations retain the exact request ID for safe replay. No AI response changes saved records automatically.

## Campaign data model

Campaigns are `studio_projects` with category `campaign`; custom creation forwards to the established `studio_mutate(createProject)` RPC. The API first authorizes membership and checks the selected campaign owner is a current workspace member. Existing creative projects with social posts also appear as project stories.

Posts retain their existing `project_id`. A source version must belong to that project. This release does not introduce an independent many-to-many campaign assignment across multiple source projects. A campaign can contain its own designs and media versions; existing product projects can directly host their launch content.

No database migration or new environment variable is required. The writing endpoint uses the existing direct OpenAI configuration and `OPENAI_API_KEY`, never Vercel AI Gateway. Fixed model, bounded input/output, 50-second provider timeout, no automatic retry, no provider-side response storage. It validates origin and authorizes workspace membership before generation. Provider failures leave the working draft unchanged.

## Delivery boundaries

- Calendar dates are plans, not a scheduler.
- Account labels are not OAuth connections.
- Publication URLs and metrics are manually recorded, not platform verified or synced.
- Exports remain subject to the existing rights, exact-version approval and embargo checks.
- Image generation/editing remains in Art Studio; Social Studio previews saved versions and assists with public copy.
- Video editing, per-slide carousel editing, dedicated campaign analytics and direct platform publishing remain future work.
- Windows 1.1.1 loads the same live app; existing installed versions also receive web updates.

## Verification

Production build and TypeScript pass. Focused social, routing and navigation tests cover the new routes, authorization-before-AI, private-field exclusion, safe retry, campaign owner validation and complete pagination. Isolated PostgreSQL tests exercise campaign create/replay/list and social draft create/replay/reload/revision conflicts/revoked membership (11 checks).

A broader suite on the base commit already fails ten tests relating to guide playback, historical source snapshots and stale guide-provider mocks. Those failures were reproduced in a detached unmodified main worktree. Live signed-in verification requires an authenticated Fairway Studio browser session; a signed-out page is not evidence of successful private saves or AI calls.
