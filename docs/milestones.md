# Extension Build Milestones

## Purpose

This document turns the current planning docs into a build sequence for the Brave/Chromium Manifest V3 extension port.

Source docs:

- `docs/brave-extension-port-plan.md`
- `docs/proposed-extension-file-structure.md`
- `docs/indexeddb-structure-draft.md`
- `docs/local-storage-structure-draft.md`
- `docs/acceptance-tests/`

The milestones are ordered to get the extension shape right early: MV3 injection, a framework-independent TypeScript core, bounded encrypted storage, and target-image URL navigation that preserves the bookmarklet behavior.

## Build Principles

- Preserve `deprecated/bookmarklet` as the fallback and behavior reference.
- Build the first version with TypeScript compilation only, no popup, no bundler, and no external runtime dependencies unless the panel complexity later justifies them.
- Keep parser, storage, crypto, messaging, image navigation, automation, and LLM logic outside the UI renderer.
- Keep durable history/bookmarks encrypted in IndexedDB, while recent active-session history can stay visible in memory for about 30 minutes.
- Store original image blobs only when explicitly captured, bookmarked, saved, or downloaded.
- Enforce day-one capture limits: 25 MB default original max, 100 MB hard max, bounded thumbnails, and about 200 visible runtime history items.
- Avoid broad host permissions up front. Request optional origin permissions only when a specific feature needs them.

## Milestone 0: Planning Baseline And Bookmarklet Map

Goal: lock the implementation baseline before creating extension code.

Deliverables:

- Keep the current bookmarklet under `deprecated/bookmarklet` intact.
- Identify bookmarklet behaviors that need parity: URL parsing/rebuilding, target image selection, image apply/load/error handling, history/bookmarks shape, keyboard routing, 404 traversal, and LLM request shape.
- Keep the first acceptance tests under `docs/acceptance-tests/` as manual scenarios until automated extension tests exist.
- Decide the exact initial file subset from `docs/proposed-extension-file-structure.md`.

Exit criteria:

- The extension boundary is clear: `background/`, `content/`, `core/`, `data/`, and `ui/`.
- There is no requirement to migrate old bookmarklet data automatically in the first slice.
- The acceptance scenarios are treated as release gates for the relevant later milestones.

## Milestone 1: MV3 Shell And Injected Panel

Goal: create the extension container with browser-action injection and a minimal in-page panel.

Deliverables:

- `extension/manifest.json`, `package.json`, and `tsconfig.json`.
- MV3 service worker that handles the browser action and injects/toggles the content script.
- Minimal permissions: `activeTab`, `scripting`, and `storage`.
- Content script that injects a plain DOM side/floating panel into the active page.
- Panel status area, close/toggle behavior, current page/image status, and target-picker entry point.
- Basic message contracts between background and content script.

Exit criteria:

- Clicking the extension action injects or toggles the panel without a popup.
- Reloading the page and clicking again gives a clean panel state.
- The service worker does not own DOM state, unlocked key state, or long-running automation state.

## Milestone 2: Target Image Selection And Page Integration

Goal: make the extension reliably choose and control the intended page image.

Deliverables:

- Exact-single-image autodetect on injection.
- Manual target picker with visible hover/selection indication.
- Page adapter for reading/writing only the selected target image.
- Image apply behavior that clears `srcset`/`sizes`, updates `img.src`, and attaches load/error status handling.
- Preview styling for the selected image, including immediate preview when exactly one image exists.
- Cleanup that restores original page/image styling on close.
- DOM observer support for late-loaded images and target-pick mode.

Exit criteria:

- A page with one qualifying image is selected automatically.
- A page with many images requires deliberate target selection.
- Capture/navigation operations act only on the selected image.
- Closing the panel restores temporary page styling.

Acceptance coverage:

- `docs/acceptance-tests/target-picker-captures-only-selected-image.md`

## Milestone 3: URL Parser And Navigation Core

Goal: port the bookmarklet URL controls into framework-independent extension modules.

Deliverables:

- URL parser/rebuilder modules under `extension/src/core/url/`.
- Token models for protocol, host/domain, path segments, filename parts, query fields, hash, decimal fields, hex fields, width/zero padding, and encoded slash paths.
- Rebuild-by-position behavior instead of broad string replacement.
- Active field selection, numeric step, direction, and width preservation.
- Same-origin `history.pushState()` behavior where safe.
- Controller/actions layer that lets UI events call named navigation actions.
- Request throttle scaffold shared by manual navigation and later automation.

Exit criteria:

- Representative bookmarklet URL patterns parse, rebuild, increment, decrement, and apply correctly.
- Navigation is routed through the app/controller layer, not directly through UI event handlers.
- Rapid manual navigation is coalesced or throttled instead of issuing uncontrolled requests.

## Milestone 4: Storage, Keys, And Local Settings Foundation

Goal: create durable storage and encryption boundaries before feature data spreads.

Deliverables:

- IndexedDB wrapper, schema definition, and migration runner.
- Object stores for `keys`, `history`, `bookmarks`, `thumbnails`, `imageBlobs`, `downloads`, `lockedSettings`, `storageStats`, and `migrations`.
- Key records keyed by `kind`, `uuid`, and `reference`.
- Common encrypted envelope format with AES-GCM and per-record IVs.
- Per-item content key flow with wrapped keys.
- Local settings wrapper and local settings migration module.
- Plaintext settings defaults for UI, runtime history, navigation, automation, preview styling, fields, LLM defaults, privacy caps, and React readiness.
- Lock/unlock skeleton for moving sensitive settings into encrypted IndexedDB later.

Exit criteria:

- Application code does not read/write raw local storage keys directly.
- IndexedDB migrations are versioned and additive where possible.
- Encrypted payload versions can evolve independently from the IndexedDB database version.
- Usage reporting can use metadata and `storageStats` without decrypting every record.
- Long-lived raw key material is not stored directly.

## Milestone 5: Runtime History, Capture, And Bookmarks

Goal: store useful image records without exposing more local data than intended.

Deliverables:

- Runtime history model for recent active-session records.
- Encrypted durable history records with remote-only and capture-status metadata.
- Encrypted bookmark records using the new `bookmarks` name while preserving old `favorites` only for import compatibility.
- Explicit capture flow for selected image originals.
- Optional encrypted thumbnail records after the core record path is stable.
- Storage usage indicator with captured count, original bytes, thumbnail bytes, failed/remote-only count, history count, and bookmark count.
- Delete/remove behavior that updates related records, key references, and storage stats according to final deletion policy.

Exit criteria:

- Recent history can be used during the active session without an unlock prompt.
- Durable history/bookmarks survive browser restart as encrypted records.
- Full original bytes are stored only after explicit user action.
- Oversized, quota-blocked, CORS-blocked, or permission-blocked captures leave valid metadata/remote-only records instead of corrupt partial records.

Acceptance coverage:

- `docs/acceptance-tests/local-original-capture-survives-remote-loss.md`
- `docs/acceptance-tests/oversized-original-is-bounded.md`

## Milestone 6: Permission And Cross-Origin Capture Flow

Goal: make cross-origin image capture failures explicit, recoverable, and privacy-preserving.

Deliverables:

- Capture error model that distinguishes permission, quota, size, CORS, network, and policy failures.
- Optional host permission request path for a specific image origin.
- Retry flow after permission grant.
- Remote-only fallback when local original capture remains impossible.
- Extension-context fetch path where it helps avoid page CORS limitations.

Exit criteria:

- The extension does not request broad host permissions at install time.
- The panel names the specific origin when permission is needed.
- Failed captures do not leave corrupt blob records or incorrect storage totals.

Acceptance coverage:

- `docs/acceptance-tests/third-party-cdn-permission-flow.md`

## Milestone 7: Recall, Import, Export, And Encrypted Downloads

Goal: support cross-session recovery and portable encrypted data.

Deliverables:

- Recall/decrypt flow that brings selected encrypted records into the active history view.
- Optional encrypted-history keywording without broad plaintext domain/path indexes by default.
- Explicit import of old plaintext bookmarklet history/favorites JSON.
- Encrypted history/bookmark export and import.
- Key export/import with password wrapping.
- Manual symmetric-password export/import mode.
- Versioned encrypted download file envelope with key reference, algorithm metadata, salt, IV, and wrapping mode.

Exit criteria:

- Old bookmarklet JSON is imported only through an explicit user action.
- Exported encrypted data can be imported with the correct password.
- Import failures leave existing local records intact.
- Encrypted downloads have enough header metadata to be imported or opened later.

## Milestone 8: Automation And Keyboard Controls

Goal: reintroduce bookmarklet navigation speed without risking uncontrolled requests.

Deliverables:

- Keyboard shortcuts for active field movement, move/stop, download, panel hide/show, field selection, selected-history load, selected-history download, and history selection.
- Slideshow navigation and stop behavior.
- 404 retry/advance behavior.
- Preload-around-current controls with a default radius of 1.
- Auto-download on successful load, if enabled.
- Global request cap and minimum interval that apply to automation and rapid manual input.
- Clear pause/stop/throttle status when request limits are reached.

Exit criteria:

- Typing in normal page inputs is not hijacked by extension shortcuts.
- Automation can be interrupted by the user.
- The extension cannot issue thousands of requests in a short burst.
- Service worker lifecycle interruptions do not lose the only copy of automation state.

## Milestone 9: LLM Metadata Integration

Goal: port title/description metadata helpers after storage, navigation, and capture are stable.

Deliverables:

- Local OpenAI-compatible endpoint, model, and max-token settings.
- Title/filename and description requests with strict JSON-schema response expectations.
- Image input as data URL when possible, with URL fallback.
- Auto-fetch toggles for query changes, title on load, and description on preload/load.
- Metadata cache keyed by URL/mode.
- Encrypted storage of generated metadata with history/bookmark records.
- Permission/CORS review for local endpoints in Brave.

Exit criteria:

- LLM calls are opt-in/configurable and do not block core navigation.
- Generated metadata updates the visible history/bookmark display fields.
- Sensitive LLM endpoint settings can be locked through the encrypted settings flow.

## Milestone 10: UI Scale-Up And React/Vite Decision

Goal: decide whether the plain DOM panel has reached the point where React/Vite is worth the added build complexity.

Trigger conditions:

- Key-management unlock flows become nested enough to be awkward in plain DOM.
- Encrypted-history recall/search needs substantial selection, sorting, or filtering UI.
- Import/export dialogs become multi-step.
- Thumbnail gallery behavior becomes complex.
- Batch selection and batch editing become central workflows.

Deliverables if React/Vite is adopted:

- React replaces only `extension/src/ui/` rendering.
- `core/`, `data/`, `content/`, and `background/` boundaries remain intact.
- Build output remains reviewable and avoids unnecessary dependencies.

Exit criteria:

- React is adopted for panel rendering only, or the project explicitly continues with plain DOM.
- No parser, storage, crypto, image-navigation, automation, or service-worker logic is absorbed into the UI framework.

## First Vertical Slice

The first implementation should complete a narrow path across Milestones 1 through 5:

1. MV3 action injects a plain DOM panel.
2. The panel identifies or lets the user pick a target image.
3. URL parser/navigation can modify and apply the selected image URL.
4. Request throttling prevents uncontrolled manual navigation.
5. IndexedDB, local settings, encrypted envelope, and key repository skeletons exist.
6. A minimal encrypted history/bookmark record can be written.
7. Runtime history remains separate from durable encrypted history.
8. Storage limits and storage usage metadata exist before original capture grows.

This slice proves the extension architecture before adding large UX surfaces like recall/search, import/export, downloads, automation, LLM metadata, or React.

## Not In The First Slice

- Full LLM title/description integration.
- Full import/export UX.
- Key export/import UX.
- Encrypted downloads-to-disk.
- Full encrypted-history recall/search.
- Batch history selection and batch downloads.
- Complete slideshow and 404 automation.
- Full thumbnails, fingerprints, and downloaded-state tracking.
- Broad host permissions requested up front.
- Automatic migration of old plaintext bookmarklet storage.
- React, Vite, or external runtime dependencies.
