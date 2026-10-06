# Fairway Studio asset manifest


## User-provided originals received 2026-10-02

These eight 1024 × 1536 PNGs are original uploaded creative posters and moodboards. They are preferred source artwork for the relevant real workspace content, but they are not text-free product photographs or exact matches to the imagery embedded in the handoff mockups. Full PNG bytes and Library xattrs were preserved. Approval and image-generation history are not inferred from upload. No app screenshots were used as content images.

Original business artwork lives outside the public web root in `assets/originals/`. Serve it only through an authenticated, version-bound endpoint, with `object-fit: contain` in full-artwork review views. Do not treat words printed in the artwork, including KEEP / CHANGE / REMOVE, as recorded user decisions. Existing generated files under `/mockup-assets/` remain untouched. The machine-readable mappings, Library IDs, original filenames, dimensions, byte counts and SHA-256 checksums are in `lib/studio/original-assets.json`.

| File | Artwork | Related project(s) | Exact mockup match |
|---|---|---|---|
| slim-silhouette-golf-bag.png | product-concept-poster | Signature golf bag | No |
| ageless-golf-style.png | campaign-poster | First apparel collection, Campaign: Generations of style | No |
| generations-on-fairway.png | campaign-poster | Campaign: Generations of style | No |
| three-generations-collection.png | campaign-poster | First apparel collection, Campaign: Generations of style | No |
| complete-the-look.png | product-styling-moodboard | First apparel collection, Signature golf bag | No |
| detail-challenge.png | design-detail-moodboard | First apparel collection, Signature golf bag | No |
| founders-five.png | product-range-moodboard | First apparel collection, Signature golf bag | No |
| keep-change-remove.png | comparison-moodboard | Signature golf bag, First apparel collection | No |

All eight assets have been opened and inspected visually. None supplies a separate Common Form / Common Thread logo, CF monogram, exact brown connected-bag concept, or the exact campaign banner used in the app mockups. Keep these gaps explicit until further uploads arrive.

## Earlier generated artwork (retained)

Generated 2026-10-02 using the built-in OpenAI image_gen tool.

## Provenance and approval state

Standalone AI-recreated illustrative concept artwork based on user-supplied Fairway Studio design mockups. These files may seed editable persistent content but are not approved brand assets or evidence of manufactured products. Source mockups label their content as sample content. No full UI screenshot is used as a product image.

Original generated PNG bytes copied without raster modification. Every generated file was inspected visually. No Python or other raster processing was used. No screenshots, interface controls, or card labels remain in the artwork. The two original public images (studio-editorial.png and moodboard-detail.png) were inspected; neither matched the source mockups, so they remain untouched and are not used as replacements for the supplied cream/burgundy concepts.

These are faithful visual recreations, not exact extraction of original brand photography. They stay exploratory/unapproved when imported into the live workspace. The image prompts used the word demo for some initial visual-context descriptions; this does not impose a demo-only usage restriction. Approval must come through the product review workflow.

## Asset contract

All files live under public/mockup-assets/ and resolve at /mockup-assets/<filename>. Recommended cover cards use object-fit: cover; full product comparisons use the portrait images without stretching. Logo panels use the cream backgrounds provided. The palette artwork is illustrative; brand kit swatch values should use the exact native UI tokens from the handoff (#760D24, #4A3028, #181818, #2448A6, #C3A17A, #F4EDE1).

| File | Pixels | Source mockup | Intended use |
|---|---|---|---|
| golf-bag-cream.png | 1122 × 1402 | 11-mobile-canvas.png | Signature golf bag covers; canvas Concept A; mobile canvas; conversations; founder-review preview; task attachment |
| golf-bag-connected.png | 1122 × 1402 | 09-project-canvas.png | Connected golf bag idea; canvas Concept B; task comparison attachment |
| apparel-generations.png | 1536 × 1024 | 03-projects.png | First apparel collection cover; Generations of style idea; Campaign concept library image |
| leather-detail.png | 1254 × 1254 | 04-library.png | Sample reference layout library image; bag pocket task; home next action |
| cream-knit.png | 1254 × 1254 | 04-library.png | Cream knit fabric sample library image; cream textile task |
| common-form-mark.png | 1254 × 1254 | 03-projects.png | Common Form idea; Brand identity project; workspace identity |
| common-form-wordmark.png | 1774 × 887 | 10-founder-review.png | Brand Kit logo panel; founder review design artwork |
| common-thread-wordmark.png | 1536 × 1024 | 02-ideas.png | Common Thread idea card |
| course-to-city.png | 1536 × 1024 | 02-ideas.png | Course to city idea card |
| royal-blue-capsule.png | 1536 × 1024 | 02-ideas.png | Royal blue capsule idea card |
| campaign-generations-back.png | 2172 × 724 | 03-projects.png | Campaign: Generations of style project banner |
| cf-embroidery.png | 1254 × 1254 | 04-library.png | CF monogram concept library image; refine embroidery task |
| royal-blue-polo.png | 1254 × 1254 | 04-library.png | Royal blue polo concept library image; royal-blue next action |
| cream-polo.png | 1536 × 1024 | 07-brand-kit.png | Brand Kit and founder-review application preview |
| cream-cap.png | 1254 × 1254 | 10-founder-review.png | Founder-review application preview |
| royal-blue-cap.png | 1536 × 1024 | 07-brand-kit.png | Brand Kit application preview |
| color-palette.png | 1254 × 1254 | 04-library.png | Color palette library artwork; accurate app swatches remain native UI |
| burgundy-moodboard.png | 1254 × 1254 | 06-tasks.png | Build burgundy color study task artwork |
| founder-review-notes.png | 1254 × 1254 | 06-tasks.png | Draft founder review criteria task artwork |

## Integrity

19 original PNG files. Total bytes: 45752598. Full generation prompts, dimensions, file sizes, approval status, and SHA-256 values are preserved in public/mockup-assets/provenance.json.

- golf-bag-cream.png: a6f986ab06b9c252076fea596d37ebe63943356062d4a74d52710b6a530c30d7
- golf-bag-connected.png: 0001215fc8f2b88b3c9b921b79246e4fdb71edf7f493034290d3ccc7552cd18e
- apparel-generations.png: cd57a73771daf83124dd94f0bdf9895346a7da92680fc5f2eee1be12322789be
- leather-detail.png: 3fbe25abf749cff75aadb06b307e4d0e97b5e87ca929bf84cf935e9203d12774
- cream-knit.png: 3b6494ffafce7c7c4261849369647ff76da1f577a316530e430ed0a88472581c
- common-form-mark.png: 3c46d462ac687837a563d91c0d0b5fc624a59f634de12993a81f6be974bd2ca4
- common-form-wordmark.png: 7be44a3308b806027edd474a66fd7e497ff6b00ca5f47c280b119339b4ede555
- common-thread-wordmark.png: 7b73dffe946763c5d02a41217515303db71ea0c1e55ecc3c1ab716e46ee12840
- course-to-city.png: 83163e4297afacb38ac9f00a0720c7685596021027a246b283dbbb35a89e9f1e
- royal-blue-capsule.png: c63a9a1684688064180963e4b12d2858d2438db4dcfcec3b2982f0db247e01b5
- campaign-generations-back.png: 63b0d05a55d63937a3effa2ba3d7bc6f3cb313a61c28fa6293ed319fadb7d949
- cf-embroidery.png: 600972d42b2d837289c279a501f6d8980143d578c9462ad7172d47caac83e754
- royal-blue-polo.png: ab4cccf1adfb8024080462378b54f6c299fa6ef8cd7f12d04fbe654e30054ace
- cream-polo.png: 44334abd5868ab7c8fb5cb78714b75cfe5f65aba66d278326bdab933914e8a31
- cream-cap.png: 0662cebad365d6d834f31c196c2f0a0000d331df6ca52f9dc8faf43ae083278d
- royal-blue-cap.png: f43ae9d06987f6096252d354ef337e37585ea6af5b96a2ba0ad873f1c6c0b620
- color-palette.png: 9caf610f01153f3c24e89e793fcd41c65c8ee3a840decca3304ab4de2860964b
- burgundy-moodboard.png: 4cfe9dd28a08572942dea4cdd0a12d899b1798888a6ca97cc6f1e1be3b8131b3
- founder-review-notes.png: 9f0b30fec2dd96023d39abc425b291fb0c626dfd16684edd848962f0c8426965

## Remaining visual limitations

- Recreations preserve subjects, materials, palette and composition but vary subtly from the embedded originals.
- The burgundy moodboard uses an illustrative two-golfer lifestyle print rather than claiming an existing approved campaign.
- Common Form and Common Thread are concept marks reproduced from supplied sample mockups; no trademark clearance or founder approval is implied.
- No remote uploads, database writes, app-source edits, or production deployment were performed as part of this asset preparation.
