# Milestone User Story Plan — Updated

## Revision Context

The proposed extension architecture is treated as final for this plan. This milestone update does not replace the proposed file structure; it aligns the milestone sequence to that structure and tightens dependency boundaries.

The main revision is to separate bookmarklet-behavior parity from extension-only stored-original capture. History and bookmarks are existing product concepts that should be ported and hardened. Stored originals, permission recovery, and local recall of captured image bytes are extension-era capabilities and should be isolated into their own milestone.

## Planning Rules

- Preserve observable bookmarklet behavior before redesigning it.
- Keep `core/`, `data/`, `content/`, `background/`, and `ui/` boundaries intact.
- Keep business logic framework-independent.
- Use TypeScript compilation only until UI complexity justifies React/Vite.
- Treat IndexedDB, encryption envelopes, migrations, and key records as foundational interfaces, even when early UI coverage is minimal.
- Keep runtime/session-visible state separate from encrypted durable records.
- Store original image bytes only through explicit user action.
- Do not request broad host permissions up front.
- Every milestone should leave the extension in a manually testable state.

## Milestone Summary

| Order | Milestone                                                             | Type                     | Primary Outcome                                                 |
| ----: | --------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------- |
|     0 | M00: Planning Baseline And Bookmarklet Behavior Map                   | Planning / parity map    | Known behavior surface, fixtures, acceptance baseline           |
|     1 | M01: MV3 Shell, Message Contracts, And Injected Panel                 | Extension foundation     | Browser action toggles injected panel reliably                  |
|     2 | M02: Target Image Selection And Page Integration                      | Port / adapt             | Correct image targeting, preview styling, cleanup               |
|     3 | M03: URL Parser, Field Model, And Navigation Core                     | Port / refactor          | URL navigation parity in framework-independent core             |
|     4 | M04: IndexedDB, Keys, Local Settings, And Envelope Foundation         | Data/security foundation | Versioned durable storage and crypto interfaces                 |
|     5 | M05: Runtime History And Bookmarks Parity                             | Port / replace storage   | Existing history/favorite workflows mapped to extension storage |
|     6 | M06: Stored Originals, Capture Pipeline, And Cross-Origin Permissions | New extension capability | Explicit local image-byte capture and recoverable failures      |
|     7 | M07: Recall, Migration, Import/Export, And Encrypted Downloads        | Data portability         | Recover, migrate, export, import, and encrypted download flows  |
|     8 | M08: Automation, Keybindings, And Request Governance                  | Port / harden            | Fast workflows restored with request caps and stop behavior     |
|     9 | M09: LLM Metadata And Encrypted Metadata Cache                        | Port / deferable         | Optional metadata generation with encrypted persistence         |
|    10 | M10: UI Scale-Up And React/Vite Decision                              | Decision gate            | Determine whether plain DOM remains sufficient                  |
|    11 | M11: Hardening, Regression Validation, And Release Readiness          | Hardening                | Brave/Chromium validation, privacy review, recovery paths       |

---

## M00: Planning Baseline And Bookmarklet Behavior Map

**Order:** 0  
**Type:** Planning / parity map

As a developer, I want a clear map from existing bookmarklet behavior to the extension architecture so the port preserves important workflows instead of accidentally rebuilding or dropping them. This milestone defines implementation boundaries, regression fixtures, and the first acceptance-test baseline before new extension code expands.

### Scope

- Inventory bookmarklet behavior by feature area: URL parser, field model, target image control, history, favorites/bookmarks, thumbnails, downloads, automation, keybindings, and LLM metadata.
- Classify each feature as `port`, `refactor`, `replace storage`, `new extension work`, or `defer`.
- Define representative URL fixtures and image-page scenarios.
- Identify architecture mapping into `background/`, `content/`, `core/`, `data/`, and `ui/`.
- Define the first vertical slice acceptance criteria.

### Out Of Scope

- New feature implementation.
- Encryption UI design beyond interface assumptions.
- React/Vite decision.

### Exit Criteria

- A bookmarklet-to-extension behavior matrix exists.
- Regression fixtures exist for representative URL patterns.
- The first vertical slice is explicitly defined.
- Deferred work is named instead of left implicit.

### Primary Artifacts

- `docs/bookmarklet-behavior-map.md`
- `docs/extension-port-acceptance-baseline.md`
- `extension/src/test-fixtures/urls.ts`
- `extension/src/test-fixtures/sample-history.json`

---

## M01: MV3 Shell, Message Contracts, And Injected Panel

**Order:** 1  
**Type:** Extension foundation

As a user, I want to click the browser action and see an in-page panel so I can start using the tool without a popup. This milestone creates the minimal Manifest V3 shell, service worker, content script injection, panel lifecycle, and initial message contracts.

### Scope

- Add `manifest.json`, TypeScript config, package metadata, and basic compile output.
- Add MV3 service worker entry point.
- Add browser-action click behavior that injects or toggles the content script panel.
- Establish typed message contracts between service worker and content script.
- Render a plain DOM panel with status, close/toggle behavior, and a minimal action dispatch path.
- Add basic panel style isolation and cleanup.

### Out Of Scope

- URL parser port.
- IndexedDB persistence beyond smoke-test wiring.
- Full keyboard handling.
- Capture, downloads, LLM, automation, import/export.

### Exit Criteria

- Extension loads unpacked in Brave/Chromium.
- Browser action toggles the in-page panel on supported pages.
- Repeated toggles do not duplicate panels or leak obvious DOM nodes.
- Service worker and content script can exchange a typed ping/status message.
- The panel renders from explicit state and calls named actions, not inline business logic.

### Primary Modules

- `extension/manifest.json`
- `extension/src/background/service-worker.ts`
- `extension/src/background/messages.ts`
- `extension/src/content/content-script.ts`
- `extension/src/ui/panel.ts`
- `extension/src/ui/render.ts`
- `extension/src/ui/styles/panel.css`
- `extension/src/core/actions.ts`
- `extension/src/core/state.ts`
- `extension/src/core/types.ts`

---

## M02: Target Image Selection And Page Integration

**Order:** 2  
**Type:** Port / adapt

As a user, I want the extension to select the only image automatically or let me manually pick one so actions affect the intended image only. This milestone ports target image detection, manual picking, image application hooks, preview styling, DOM observation, and cleanup behavior.

### Scope

- Auto-select exactly one qualifying image when appropriate.
- Add manual target-pick mode with visible hover/selection indication.
- Track the selected target image through a page adapter.
- Apply preview styling when the single-image case allows it.
- Restore original image/page styles on close or target change.
- Observe late-loaded images during target-pick mode.
- Preserve previous target state enough to recover from failed operations.

### Out Of Scope

- Full URL field editor.
- Durable history persistence.
- Original image capture.
- Full automation.

### Exit Criteria

- On a page with exactly one qualifying image, the extension selects it automatically.
- On a page with multiple images, the user can select the intended target manually.
- Target selection is visually clear.
- Closing the panel restores extension-owned styling.
- Late-added images can be selected during pick mode.
- No extension action mutates unrelated page images.

### Primary Modules

- `extension/src/content/target-image.ts`
- `extension/src/content/page-adapter.ts`
- `extension/src/content/page-style.ts`
- `extension/src/content/dom-observer.ts`
- `extension/src/ui/components/target-picker-view.ts`
- `extension/src/ui/components/status-view.ts`

---

## M03: URL Parser, Field Model, And Navigation Core

**Order:** 3  
**Type:** Port / refactor

As a user, I want the extension to understand and edit image URL fields so I can navigate image sequences like the bookmarklet does. This milestone extracts and ports URL parsing, URL rebuilding, token field movement, image URL application, same-origin visible URL updates, and request throttling into framework-independent core code.

### Scope

- Port generic URL tokenization for protocol, host, path segments, filename tokens, query fields, hash fields, encoded slash paths, HTML entity handling, decimal fields, hex fields, and width preservation.
- Rebuild URLs by token position rather than unsafe global replacement.
- Add active field selection and increment/decrement behavior.
- Clear `srcset` and `sizes` before applying a new URL to the target image.
- Preserve same-origin `history.pushState()` behavior where safe.
- Add request-throttling scaffold that applies to rapid manual navigation.
- Add parser regression fixtures from M00.

### Out Of Scope

- Advanced domain-specific field aliases and split patterns unless required for parity tests.
- Slideshow/404 automation.
- Durable encrypted history recall.
- LLM metadata.

### Exit Criteria

- Known bookmarklet URL patterns parse and rebuild correctly.
- Incrementing/decrementing a numeric field produces the expected next URL.
- Rebuilt URLs update the selected target image only.
- Failed image loads surface status without corrupting the previous usable state.
- Same-origin visible URL updates happen only when allowed.
- Request throttling prevents uncontrolled rapid manual requests.

### Primary Modules

- `extension/src/core/url/parse-url.ts`
- `extension/src/core/url/rebuild-url.ts`
- `extension/src/core/url/tokenize-fields.ts`
- `extension/src/core/url/types.ts`
- `extension/src/core/image/image-navigation.ts`
- `extension/src/content/request-throttle.ts`
- `extension/src/ui/components/url-editor-view.ts`
- `extension/src/ui/components/fields-view.ts`
- `extension/src/ui/components/controls-view.ts`

---

## M04: IndexedDB, Keys, Local Settings, And Envelope Foundation

**Order:** 4  
**Type:** Data/security foundation

As a user, I want durable data to be encrypted and settings to load predictably so private image history and configuration are protected. This milestone creates the versioned IndexedDB schema, migration system, key records, encryption envelope interfaces, local settings wrappers, and session unlock scaffolding.

### Scope

- Define IndexedDB database name, version, stores, indexes, and record shapes.
- Add idempotent migration scaffolding.
- Add key table records keyed by `kind`, `uuid`, and `reference`.
- Add AES-GCM envelope interfaces and WebCrypto wrappers.
- Add local settings wrapper for plaintext non-sensitive settings.
- Add local settings migration scaffolding.
- Add session unlock shape without overbuilding password export/import UI.
- Add repository boundary for durable history writes.

### Out Of Scope

- Full import/export UX.
- WebAuthn/YubiKey implementation.
- Full key rotation UX.
- Search over encrypted history.
- Storing original image bytes.

### Exit Criteria

- IndexedDB initializes and migrates predictably.
- Local settings are accessed only through the wrapper.
- Durable encrypted record format has explicit schema and payload versions.
- Key metadata can support future wrapping changes without rewriting unrelated records.
- A minimal encrypted history record can be written and read through repository boundaries.
- Migration failure surfaces a recoverable status instead of silently corrupting state.

### Primary Modules

- `extension/src/data/db.ts`
- `extension/src/data/schema.ts`
- `extension/src/data/migrations.ts`
- `extension/src/data/local-settings.ts`
- `extension/src/data/local-settings-migrations.ts`
- `extension/src/data/types.ts`
- `extension/src/data/crypto/webcrypto.ts`
- `extension/src/data/crypto/envelope.ts`
- `extension/src/data/crypto/keyring.ts`
- `extension/src/data/crypto/lock.ts`
- `extension/src/data/crypto/types.ts`
- `extension/src/data/repositories/keys-repository.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/runtime/session-unlock.ts`

---

## M05: Runtime History And Bookmarks Parity

**Order:** 5  
**Type:** Port / replace storage

As a user, I want recent image activity and bookmarks to survive normal browsing workflows without losing the behavior I already have in the bookmarklet. This milestone ports runtime history and favorites/bookmarks into the extension model, replacing the old large localStorage blob with runtime state plus encrypted durable IndexedDB records.

### Scope

- Add runtime-visible history for recent active-session items.
- Add encrypted durable history records.
- Add bookmark/favorite current image URL.
- Add bookmark list, load bookmark, remove bookmark, and basic dedupe.
- Preserve display fields: URL, title, label, thumbnail reference when available, timestamp, and downloaded/captured metadata placeholders.
- Add bounded visible history behavior.
- Add delete/remove actions and session undo for accidental UI actions.
- Keep favorites naming compatibility for imported bookmarklet data while using `bookmarks` in new code.

### Out Of Scope

- Stored original image bytes.
- Cross-origin capture permission flow.
- Full encrypted-history search.
- Import/export files.
- LLM metadata.
- Advanced batch selection unless required for baseline parity.

### Exit Criteria

- Loading/navigating an image adds a runtime history item.
- Recent runtime history is visible without decrypt/recall during active use.
- Durable history and bookmarks are stored through encrypted repository boundaries.
- Bookmark, load, remove, and basic dedupe work.
- The active visible history list is bounded.
- Delete/remove behavior does not orphan obvious related state.

### Primary Modules

- `extension/src/data/runtime/runtime-history.ts`
- `extension/src/data/runtime/undo-stack.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/repositories/bookmarks-repository.ts`
- `extension/src/ui/components/history-view.ts`
- `extension/src/ui/components/bookmarks-view.ts`

---

## M06: Stored Originals, Capture Pipeline, And Cross-Origin Permissions

**Order:** 6  
**Type:** New extension capability

As a user, I want to explicitly store selected online images locally and recall them later even when the remote source is unavailable. This milestone adds bounded stored-original capture, local blob persistence, image-byte hashing, permission-aware extension fetches, clear failure states, retry behavior, and storage usage reporting.

### Scope

- Add explicit `store original` / `capture original` action for the current target, history item, or bookmark.
- Add local blob storage for original image bytes and optional thumbnail bytes.
- Attach stored-original references to history/bookmark records without making stored originals the center of the entire app model.
- Fetch image bytes from the extension context when content-script/page context is insufficient.
- Request specific optional origin permission only when needed.
- Record recoverable failure reasons: permission needed, fetch forbidden, not image, too large, network error, auth required, canvas tainted, unknown.
- Add remote-only fallback records when the user attempted capture but bytes cannot be stored.
- Add SHA-256 or equivalent exact-byte identity for dedupe and future vector/idempotency workflows.
- Add storage usage and deletion behavior for stored originals.

### Out Of Scope

- Server storage.
- Vector embeddings.
- Perceptual hash search.
- Face/object recognition.
- Automatic capture of every visible page image.
- Broad host permissions requested up front.

### Exit Criteria

- User can explicitly store the selected image locally.
- Stored image bytes can be recalled from extension storage without loading the remote URL.
- Cross-origin failure states are visible and actionable.
- Optional permission prompts are origin-specific, not broad by default.
- Deleting a stored original removes associated blob records or marks references cleanly.
- Storage usage is visible enough to prevent silent unbounded growth.

### Primary Modules

- `extension/src/background/permissions.ts`
- `extension/src/background/downloads.ts`
- `extension/src/background/messages.ts`
- `extension/src/core/image/image-metadata.ts`
- `extension/src/core/image/thumbnails.ts`
- `extension/src/core/image/fingerprints.ts`
- `extension/src/data/repositories/downloads-repository.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/repositories/bookmarks-repository.ts`
- `extension/src/ui/components/history-view.ts`
- `extension/src/ui/components/bookmarks-view.ts`
- `extension/src/ui/components/status-view.ts`

### Suggested Additional Modules

These can be added if the existing repository names become too ambiguous:

- `extension/src/data/blob-store.ts`
- `extension/src/data/repositories/blobs-repository.ts`
- `extension/src/background/fetch-image.ts`

---

## M07: Recall, Migration, Import/Export, And Encrypted Downloads

**Order:** 7  
**Type:** Data portability

As a user, I want to recover older encrypted records and move data between installs without exposing plaintext. This milestone adds recall/decrypt flows, explicit bookmarklet JSON import, encrypted import/export, password wrapping, key import/export, and encrypted download envelopes.

### Scope

- Add recall/decrypt flow for older encrypted history/bookmark records.
- Allow selected encrypted records to be brought into the visible runtime history view.
- Import old bookmarklet JSON as an explicit user action.
- Export/import encrypted history and bookmarks.
- Add key export/import with password wrapping.
- Add manually password-protected export/import mode for selected payloads or groups.
- Add encrypted download-to-disk file format with versioned header metadata.
- Preserve recovery messaging around migration and encryption-format changes.

### Out Of Scope

- Server sync.
- Automated cloud backup.
- WebAuthn/YubiKey unlock implementation unless separately promoted.
- Full-text search over encrypted records without explicit decrypt/recall.

### Exit Criteria

- User can recall selected encrypted records into the visible session view.
- Bookmarklet JSON import works only through an explicit trust-boundary action.
- Encrypted export can be imported into a clean install with the correct password/key material.
- Failed import/export operations fail closed and surface useful recovery status.
- Encrypted download files have enough header metadata to identify format, algorithm, salt, IV, wrapping mode, and key reference.

### Primary Modules

- `extension/src/data/import-export/history-export.ts`
- `extension/src/data/import-export/history-import.ts`
- `extension/src/data/import-export/key-export.ts`
- `extension/src/data/import-export/key-import.ts`
- `extension/src/data/import-export/encrypted-file-format.ts`
- `extension/src/data/crypto/password-wrap.ts`
- `extension/src/ui/components/import-export-view.ts`
- `extension/src/ui/components/lock-view.ts`
- `extension/src/data/repositories/downloads-repository.ts`

---

## M08: Automation, Keybindings, And Request Governance

**Order:** 8  
**Type:** Port / harden

As a user, I want fast keyboard and automation workflows while keeping image requests under control. This milestone restores keyboard routing, slideshow behavior, 404 retry/advance, preload controls, auto-download options, stop behavior, and hard request governance.

### Scope

- Restore core keyboard shortcuts for field movement, image movement, panel hide/show, selection, load, and download actions.
- Preserve normal typing behavior in inputs and editable UI fields.
- Add slideshow state machine.
- Add 404 retry/advance behavior.
- Add optional preload above/below current URL structure.
- Add auto-download on successful load if enabled.
- Enforce minimum request interval and hard request caps across manual and automated flows.
- Stop, pause, or throttle automation when limits are reached or user interrupts.

### Out Of Scope

- New crawling/scraping behavior unrelated to explicit image navigation.
- Automatic broad prefetching without user enablement.
- Server-side automation.

### Exit Criteria

- Keyboard shortcuts work without breaking input typing.
- Automation can be started, stopped, and interrupted reliably.
- 404 retry/advance behavior follows configured limits.
- Request caps prevent uncontrolled request bursts.
- UI clearly surfaces throttled, paused, stopped, and failed states.

### Primary Modules

- `extension/src/content/keyboard.ts`
- `extension/src/content/request-throttle.ts`
- `extension/src/core/automation/navigation-queue.ts`
- `extension/src/core/automation/slideshow.ts`
- `extension/src/core/automation/retry-404.ts`
- `extension/src/core/automation/types.ts`
- `extension/src/ui/components/controls-view.ts`
- `extension/src/ui/components/status-view.ts`

---

## M09: LLM Metadata And Encrypted Metadata Cache

**Order:** 9  
**Type:** Port / deferable

As a user, I want optional local LLM metadata generation so images can receive useful titles, filenames, labels, and descriptions. This milestone ports endpoint/model settings, schema-constrained title and description requests, fallback behavior, metadata caching, and encrypted metadata persistence.

### Scope

- Port local OpenAI-compatible endpoint settings.
- Port model and max-token configuration.
- Preserve strict JSON-schema response expectations.
- Support title/filename metadata requests.
- Support description metadata requests.
- Use current image data URL when safely available and fall back to current image URL when needed.
- Cache metadata by URL and mode.
- Store generated metadata in encrypted records.
- Preserve auto-fetch toggles only after manual metadata generation is stable.

### Out Of Scope

- Hosted remote model defaults.
- Server-side metadata jobs.
- Vector embeddings.
- Semantic search UI.
- Automatic metadata generation for large batches unless explicitly enabled later.

### Exit Criteria

- User can configure a local-compatible endpoint and model.
- Manual title/description generation works for supported images.
- Invalid model responses are rejected safely.
- Metadata cache updates history/bookmark display fields.
- Generated metadata persists in encrypted durable storage.
- CORS/canvas/data-URL limitations surface clear fallback status.

### Primary Modules

- `extension/src/core/llm/schemas.ts`
- `extension/src/core/llm/prompts.ts`
- `extension/src/core/llm/metadata-client.ts`
- `extension/src/core/llm/types.ts`
- `extension/src/core/image/image-metadata.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/repositories/bookmarks-repository.ts`
- `extension/src/data/local-settings.ts`

---

## M10: UI Scale-Up And React/Vite Decision

**Order:** 10  
**Type:** Decision gate

As a developer, I want to decide whether the panel has become complex enough to justify React/Vite without moving business logic into the UI. This milestone evaluates UI complexity and, if adopted, limits React to panel rendering while preserving framework-independent core, data, content, and background boundaries.

### Scope

- Review plain DOM panel complexity.
- Evaluate nested UI state, batch selection, lock/import/export dialogs, thumbnail gallery behavior, sorting/filtering, and metadata workflows.
- Decide whether React/Vite reduces complexity enough to justify build-system overhead.
- If adopted, define migration path for `ui/` only.
- Document which plain-DOM views map to React components.

### Out Of Scope

- Rewriting parser, storage, crypto, messaging, target-image handling, automation, or LLM logic into React.
- Introducing dependencies for aesthetic reasons only.

### Exit Criteria

- A written decision exists: keep plain DOM or adopt React/Vite.
- If React/Vite is adopted, the boundary is limited to UI rendering.
- Build output remains reviewable.
- Core/data/content/background modules remain framework-independent.

### Primary Modules

- `extension/src/ui/react-ready/README.md`
- `extension/src/ui/panel.ts`
- `extension/src/ui/render.ts`
- Possible later `extension/vite.config.js`
- Possible later `extension/src/ui/react/`

---

## M11: Hardening, Regression Validation, And Release Readiness

**Order:** 11  
**Type:** Hardening

As a developer, I want the extension to be reliable, recoverable, and privacy-conscious before treating it as the primary workflow. This milestone validates Brave/Chromium behavior, storage migrations, encryption boundaries, permission prompts, request throttling, data recovery, and regression parity against the bookmarklet baseline.

### Scope

- Run manual regression tests against M00 fixtures.
- Verify Brave-specific behavior for extension injection, storage, permissions, image loading, canvas restrictions, and downloads.
- Review host permission posture.
- Review encrypted record and key-wrapping assumptions.
- Test migration failure and recovery behavior.
- Test import/export restore path with a clean profile.
- Test storage growth, deletion, and orphan cleanup.
- Test automation stop/throttle behavior.
- Document known limitations and recovery steps.

### Out Of Scope

- Server integration.
- Mobile ingestion.
- Photo-library replacement semantics.
- Vector search.

### Exit Criteria

- Known bookmarklet workflows pass or have documented intentional changes.
- Clean install, upgrade, import, export, and delete flows are manually verified.
- Permission prompts are narrow and understandable.
- Storage usage and cleanup behavior are verified.
- No known migration can silently destroy readable prior data.
- Known limitations are documented before daily use.

### Primary Artifacts

- `docs/manual-regression-checklist.md`
- `docs/privacy-and-permissions-review.md`
- `docs/storage-and-recovery-notes.md`
- `docs/known-limitations.md`

---

## Cross-Milestone Technical Spikes

These should be scheduled before or inside the earliest affected milestone.

| Spike                                 | Earliest Milestone | Pass Condition                                                             |
| ------------------------------------- | -----------------: | -------------------------------------------------------------------------- |
| MV3 ES module loading without bundler |                M01 | Unpacked extension loads compiled TypeScript output cleanly                |
| Content-script panel isolation        |                M01 | Page CSS does not materially break core panel controls                     |
| Target image mutation behavior        |                M02 | Late images and target changes are handled without stale references        |
| URL parser parity                     |                M03 | Fixture URLs round-trip and mutate by token position                       |
| IndexedDB migration safety            |                M04 | Failed migration leaves prior readable state when possible                 |
| WebCrypto envelope shape              |                M04 | Minimal encrypted record can be written/read with versioned metadata       |
| Extension-context image fetch         |                M06 | Same-origin and selected cross-origin outcomes are understood and surfaced |
| Optional host permission request flow |                M06 | Specific image origin can be requested without broad upfront permissions   |
| Encrypted export/import restore       |                M07 | Clean profile can import selected exported records                         |
| Automation request governance         |                M08 | Rapid manual and automated actions are throttled by the same cap model     |
| LLM image input fallback              |                M09 | Data URL and URL fallback paths behave predictably                         |

## Definition Of Done For Any Milestone

- The extension remains loadable as an unpacked MV3 extension.
- New state changes flow through named actions or repositories, not ad hoc UI writes.
- Storage changes include schema/version implications.
- Sensitive durable data is either encrypted or explicitly classified as plaintext local settings.
- Feature behavior has at least one manual happy-path and one failure-path check.
- New permissions are justified by a specific feature and documented.
- Any deferred behavior is explicitly listed rather than silently omitted.
