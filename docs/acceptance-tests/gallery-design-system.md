# Gallery Design System

Purpose: prove that the independent extension Gallery completes the shared design-system migration without changing durable storage, queue ordering, Recall, Recents, privacy, or encrypted-original behavior.

## Automated coverage

- DOM: `tests/dom/gallery-view.test.ts` covers shared primitives, native semantics, paging, search, albums, locked/privacy, empty, loading, error, and independent album popovers.
- Tokens: `tests/design-tokens.test.ts` rejects Gallery-only aliases and legacy global control rules.
- Storybook: **Design System / Gallery** covers populated, interactive, locked/private, empty, loading, error, narrow, and reduced-motion states.
- Packaged extension: `tests/e2e/gallery-design-system.spec.ts` uses real durable IndexedDB records and covers canonical order, search, album membership, keyboard order, narrow overflow, and reduced motion.
- Product invariants: `tests/invariants.test.ts` proves Recents have no durable write path, queue order uses `queueUpdatedAt`, and Recall pages the queue producer rather than the blob store.

## Manual release script

1. Select the Node version in `.nvmrc`, run `npm ci`, then `npm run ci`, `npm run test:e2e`, and `npm run test:stories:ci`.
2. Load `extension/dist` as an unpacked Chromium extension.
3. Create three durable records: one URL-only pin, one captured bookmark with a stored original, and one locked private pin. Keep at least one transient Recent that is not pinned.
4. Open Gallery from the Queue menu. Verify a dedicated extension tab opens and **Gallery / Image Trail** chrome, search, page limit, paging, Albums, semantic status, and the durable card grid use the same dark hierarchy, type, borders, restrained mint accent, and focus treatment as the supplied mocked-tab reference.
5. Verify the transient Recent is absent. Verify All Images shows only durable pins/bookmarks in the same queue order as the panel.
6. Activate URL-only, captured, and locked cards. Verify URL-only opens its saved URL, captured requests the encrypted preview only after activation, and locked remains disabled without private metadata.
7. Search by URL host, filename, label, and extension; clear search; set a finite page limit and then `0`. Verify results retain queue order and no-match/loading/error status remains explicit.
8. Create, select, rename, and delete an album. Add/remove through the per-card popover, open choices for two cards to verify independent pending state, then drag a card onto an album button. Verify records remain in All Images and queue order does not change.
9. Navigate without a pointer. Verify visible focus and logical order through search, page limit, paging, album creation/selection, record activation, popover choices, and destructive actions. Native Enter/Space behavior must work once per action.
10. Repeat at 360px width and 200% browser zoom. Verify no horizontal page overflow, clipped accessible controls, covered status, unreachable popover action, or card text collision.
11. Enable reduced motion. Verify waiting state remains visible while sweeps, row transitions, and popover motion stop.
12. Enable privacy mode. Verify visible text, tooltips, titles, placeholders, and accessible names contain no URL-derived private values.
13. From another extension context, pin/capture a record and change album membership. Verify Gallery refreshes without a browser reload and does not flicker through an unrelated state.
14. Recheck Queue, Recall, and Recents. Verify queue order, Recall order/window, Recents contents, stored-original indicators, and encrypted original bytes are unchanged by Gallery browsing/search/album operations.

## Release screenshots

Capture these from the packaged extension after the manual script passes:

1. `gallery-standard.png`: 1280x720, populated All Images, captured indicator visible, no private values.
2. `gallery-album.png`: selected album with its membership action and semantic status visible.
3. `gallery-narrow.png`: 360x740 with header, controls, album surface, and one complete card visible without overflow.
4. `gallery-locked-private.png`: privacy mode with a locked card and masked unlocked card; no private values in the image.
5. `gallery-empty-error.png`: Storybook or packaged load-error state showing the shared Card and error StatusPill.

Store screenshots with the release notes or release-candidate evidence. Do not commit user URLs, labels, thumbnails, extension profile data, or encryption identifiers.

## Expected result

- Panel, Settings/Help, Queue, Recents, Recall, Field Editor, and Gallery read as one coherent design system.
- Gallery contains no mixed legacy/new controls or Gallery-only theme aliases.
- The extension page stays independent: no context rail, destination navigation, synchronized panel clone, host-page storage, or Recents surface.
- Browsing, search, filters, albums, and visual state never reorder the durable queue or read original blobs just to render.
- Keyboard, focus, narrow/mobile, 200% zoom, reduced motion, locked/privacy, empty, waiting, and error states remain usable and distinct.
