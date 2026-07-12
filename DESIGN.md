# Image Trail Design Brief

This is the repo-local design brief for AI design editors and human UI
reviewers. Use it to propose Image Trail UI/UX directions without changing the
product model, storage behavior, security posture, or feature scope.

Image Trail is pre-release, source-only Brave/Chromium extension software. Do
not describe it as published, store-ready, cloud-first, or product-ready.

## Design Goal

Image Trail turns image URL structure into navigable trails and local galleries.
The UI should feel like a compact image-workbench overlay: precise, inspectable,
privacy-conscious, and stable during repeated navigation.

Primary audience:

- People reviewing image sequences from hosted sites or self-hosted photo
  servers.
- Developers and power users running a source-only extension during pre-release
  development.
- Reviewers using Storybook and acceptance tests to critique states before full
  browser flows hide UI issues.

Design proposals may improve hierarchy, density, accessibility, labels,
interaction feedback, and visual polish. They must not invent new product
capabilities or change persistence/encryption semantics.

## Product Model To Preserve

- The host-page target image is the active image. URL edits, previews, and
  navigation apply to that selected target only.
- Parsed URL fields are controls for image trails. Numeric, hex, split, path,
  filename, query, and text fields must remain understandable and editable.
- Recents are transient session state. They are not durable memory.
- Pins are durable queue records and persist when they enter the queue.
- Bookmarks are pins with associated captured original bytes.
- Captured original bytes live separately in the encrypted blob/original store and
  are linked from durable pin/bookmark records.
- Recall pages durable pins/bookmarks from the queue producer after the visible
  queue window. Recall is not a browser over encrypted blobs and must not add
  records to Recents.
- Queue ordering is based on `queueUpdatedAt`. Metadata refreshes and thumbnail
  updates must not visually imply a reorder unless the user intentionally moves
  a pin.
- Extension-owned settings and storage use extension-owned stores, not host-page
  `localStorage`.

## Primary Workflows

- Select a target image automatically on simple pages or manually with target
  picking on multi-image pages.
- Project image URL changes back into the selected target while preserving page
  cleanup and target ownership.
- Edit URL fields, preview changes, and use previous/next navigation over
  included fields.
- Review Recents for active-session image activity.
- Pin durable records into the visible queue and use queue actions without
  confusing clear/presentation actions with destructive delete actions.
- Capture originals explicitly, show capture status, and keep stored-original
  state distinct from selection.
- Open Recall to page durable offscreen queue records back into the current
  workflow.
- Unlock, import, export, back up, and restore encrypted local data through
  explicit user actions.
- Use pCloud backup as a provider-backed encrypted backup flow; do not imply
  server sync or cloud-native storage.

## UI Surfaces

Current inspectable surfaces live in Storybook under `Extension UI/*`:

- Panel layout: `extension/src/ui/render.stories.ts`
- Host target: `extension/src/ui/components/target-picker-view.stories.ts`
- URL editor: `extension/src/ui/components/url-editor-view.stories.ts`
- Parsed fields: `extension/src/ui/components/fields-view.stories.ts`
- Status and async cues: `extension/src/ui/components/status-view.stories.ts`
- Recent history: `extension/src/ui/components/history-view.stories.ts`
- Queue: `extension/src/ui/components/bookmarks-view.stories.ts`
- Recall drawer: `extension/src/ui/components/recall-drawer-view.stories.ts`
- Encrypted originals: `extension/src/ui/components/encryption-view.stories.ts`
- Import, export, and cloud backup:
  `extension/src/ui/components/import-export-view.stories.ts`
- Settings action groups:
  `extension/src/ui/components/action-group.stories.ts`

Design review should start from Storybook and the canonical acceptance pages:

- [Storybook UI Review](https://github.com/qwts/image-trail/wiki/Acceptance-Test-Storybook-UI-Review)
- [Row And List Visual System](https://github.com/qwts/image-trail/wiki/Acceptance-Test-Row-And-List-Visual-System)
- [Panel Layout Stability](https://github.com/qwts/image-trail/wiki/Acceptance-Test-Panel-Layout-Stability)
- [Queue And Recall Clear/Delete Semantics](https://github.com/qwts/image-trail/wiki/Acceptance-Test-Queue-And-Recall-Clear-Delete-Semantics)
- [pCloud Provider Boundary](https://github.com/qwts/image-trail/wiki/Acceptance-Test-pCloud-Provider-Boundary)

## Stable Visual Primitives

- Selected target/row state must remain visually stronger than
  stored-original/captured state.
- Stored-original/captured state should be an indicator, not a competing
  selected-row background.
- Recents, queue rows, and Recall rows should read as the same row family.
- Thumbnail and extension-label treatments are stable primitives across queue
  and Recall rows.
- Locked/private rows must avoid exposing sensitive URL, title, thumbnail, or
  metadata while still showing clear safe actions.
- Status, loading, retry, permission, and error states must be visible without
  leaking sensitive URLs when privacy masking is active.
- Compact and narrow layouts must keep controls reachable, labels legible, and
  hit targets stable.
- The panel is an overlay workbench; redesigns should not make it feel like a
  marketing page, media gallery replacement, or standalone cloud app.

## Privacy, Storage, And Security Constraints

- Do not show plaintext protected metadata while encrypted storage is locked.
- Do not suggest host-page storage for extension-owned state.
- Do not broaden permissions for visual convenience.
- Do not imply automatic capture of every visible image. Capture is explicit.
- Do not imply pCloud receives plaintext Image Trail data; backups are
  password-encrypted before upload.
- Do not collapse key backup, encrypted import/export, original capture, and
  pCloud provider states into one generic "sync" concept.
- Do not add design language that suggests vector search, hosted LLM defaults,
  mobile ingestion, or photo-library replacement unless a future issue promotes
  those capabilities.

## Design Tool Instructions

When prompting an external design editor, include this file and current
Storybook screenshots or captures when available. Ask for UI/UX exploration
within the existing feature set.

Good directions:

- Improve hierarchy and grouping inside the compact panel.
- Clarify selected, pinned, captured, locked, loading, error, and disabled
  states.
- Reduce visual noise while preserving information density.
- Improve accessibility cues, labels, focus states, and keyboard-visible
  controls.
- Propose consistent row/list treatments for Recents, queue, and Recall.
- Make import/export, encryption, and pCloud backup states easier to scan
  without changing what those flows do.

Avoid these directions:

- Do not add new released-product claims or extension-store readiness.
- Do not redesign Image Trail into a cloud gallery, social product, generic
  download manager, or photo-library replacement.
- Do not blur Recents, queue pins, bookmarks, captured originals, and Recall
  into one undifferentiated saved-items model.
- Do not make captured/stored-original state look like the primary selected
  state.
- Do not remove privacy masking, locked placeholders, explicit permission
  prompts, or encrypted backup wording.
- Do not move parser, storage, crypto, content-script, background, or pCloud
  behavior into UI-only concepts.

## Review Checklist

Before accepting a design proposal, confirm:

- Current feature scope is preserved.
- Storybook surfaces are used as the current-state reference.
- Selected state remains distinct from captured/stored-original state.
- Recents remain transient; pins/bookmarks remain durable queue records.
- Recall remains an offscreen durable queue browser, not encrypted-blob search.
- Encryption, lock, key backup, import/export, and pCloud backup flows remain
  explicit and privacy-preserving.
- Pre-release, source-only status is not overstated.
- No screenshots or assets are added unless they are current and verified.
