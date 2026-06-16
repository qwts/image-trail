# Brave Extension Port Plan

## Final Assumptions

- Target browser is Brave/Chromium with Manifest V3.
- The extension has no popup. The browser action toggles or injects a side/floating panel into the active page.
- TypeScript is preferred for extension source so storage schemas, encrypted envelopes, key records, migrations, message contracts, and URL token models are typed from the start. Runtime output should stay simple browser-compatible JavaScript.
- No external runtime libraries will be used for the first implementation unless the UI complexity clearly justifies it. React and Vite are acceptable later if they reduce panel complexity without adding unnecessary bloat or exposure.
- The existing bookmarklet remains in the repository as a preserved fallback/debug artifact. The port should share behavior with it, not erase or replace it.
- The initial extension UI is injected by a content script into the active page. It should use isolated extension code where possible and only bridge into the page when page-context access is unavoidable.
- URL parsing, URL rebuilding, token navigation, image application, same-origin `history.pushState()` behavior, target image picking, 404 handling, and keyboard behavior should preserve the bookmarklet's observable behavior.
- Long-term state moves away from one large `localStorage` JSON blob. IndexedDB is the long-term store.  Local storage can be added for temporary store of data not pertain to url history for example algorithms, themes, sorting and other customizations.
- IndexedDB includes a key table/object store keyed by `kind`, `uuid`, and `reference`.
- History items are individually encrypted with aes-256 and each history item gets its own content key.
- Bookmark/favorite items are encrypted at rest. They may also use per-item keys when stored as independent durable records.
- Local storage has its own key record. In extension terms, this means a small extension-local record for local settings/session bootstrap, not page-origin `localStorage` unless explicitly needed for compatibility.
- Some local-storage-equivalent items may get their own key when their sensitivity or export behavior justifies it.
- Stored originals are opt-in. The default is encrypted metadata and thumbnails only; full image blobs are saved only when explicitly bookmarked, saved, or downloaded.
- Local capture must be bounded from day one. Defaults should include a 25 MB max original image size, 100 MB hard max original image size, small bounded thumbnails, and a visible recent/runtime item cap around 200.
- A storage usage indicator should be available early so local capture cannot grow silently.
- Downloads written to disk are encrypted and get their own key.
- Key export wraps keys with a user-provided password. Key import requires the password to unwrap.
- Manual symmetric password protection is supported as an additional option for selected exports, imports, downloads, or item groups.
- WebCrypto should be the crypto baseline: random per-record IVs, AES-GCM content encryption, PBKDF2-derived password wrapping unless a stronger browser-native option becomes available without adding dependencies.  WebAuthn is also plausiable for Yubikey.
- WebAuthn/YubiKey support is a later optional key wrapping/unlock method, but the key table should keep enough metadata to support it later.
- Service workers are treated as event-driven and semi-disposable.  They will be used for requests to avoid CORS error issues where possible. Durable state lives in IndexedDB; live page state lives in the content script/panel and is rehydrated as needed.

## Known Constraints

- Manifest V3 service workers cannot observe or mutate the DOM directly. DOM reactivity belongs in content scripts using `MutationObserver`, image load/error listeners, and explicit messages to/from the service worker.
- MV3 service workers can stop between events, so they cannot hold unlocked keys, automation state, or DOM target state as the only source of truth.
- Content scripts run in an isolated world. They can manipulate DOM nodes, but direct access to page JavaScript state is limited.
- Page CSP and cross-origin restrictions may affect image fetching, canvas thumbnail generation, LLM image input generation, and downloads.  Where feasable, think ahead of time pre plan for working out cors issues like loading cross site images  while on other pages consider using service workers and when necdssary recommend using new elements if reusing existing elements would cause cors issues.  The extension will not always modify every page beyond it's scope of created elements. IE wil laim to be self contained and access only the element it owns.
- Canvas-based thumbnails and fingerprints can fail or become tainted for cross-origin images.
- `history.pushState()` can only update the visible URL safely for same-origin destinations.
- Brave privacy protections may block or alter network/image behavior on some sites.
- `chrome.storage.local`, extension IndexedDB, and extension local storage are not OS keychain storage. Encryption-at-rest depends on key handling and unlock choices.
- If raw key material is stored unwrapped in extension storage, encryption protects against casual disk inspection but not against extension compromise.  RAW should not live in the indexdb for long lifetimes hence the import/export.  Ideally, there would be one mater key and the other items would be able to have keys rotated periodiically.
- Downloading encrypted files requires a clear file format/header so imports can locate the key reference, algorithm, salt, IV, and wrapping mode.
- The existing bookmarklet stores history, favorites, thumbnails, settings, download records, and LLM settings together; migration must separate settings from encrypted durable records.
- With or without a framework build system, shared core code should stay framework-independent and browser-compatible after TypeScript compilation. If React/Vite is adopted later, it should wrap the panel UI rather than absorb parser, crypto, storage, messaging, or image-navigation logic.
- The first build step should be as small as possible: TypeScript compilation for source safety, no bundled runtime dependencies, and reviewable generated JavaScript.
- Undo/global action history is session-only. It should allow recovery from accidental extension actions, such as removing a favorite, but does not need to survive browser restart.
- Non-sensitive settings such as algorithms, themes, sorting, and UI customizations may remain plaintext local settings. Sensitive settings and anything explicitly locked should move into encrypted IndexedDB records.
- Host permissions may be requested later when standard extension functionality requires them for image fetch, thumbnail generation, or download support. Privacy remains the top priority, but normal browser-extension permission practices are acceptable when they are not reckless.

## Runtime And Encrypted History Model

- Recent history is split into a runtime-visible layer and encrypted durable storage.
- Items added within the last 30 minutes should remain viewable in runtime memory without encryption while the browser/session is active.
- When the browser closes, the durable encrypted history remains encrypted in IndexedDB.
- The UI needs a recall flow that can decrypt selected stored items and bring them back into the current visible history.
- Encrypted history supports optional keywording. Keyword search can include encrypted stored history after unlock/decrypt, but domain filtering only applies to currently visible/runtime records unless indexed metadata has intentionally been exposed.
- For privacy, domain, path, and other sortable/searchable fields should not be made plaintext for all encrypted records by default.
- Because IndexedDB may eventually contain many records, the history UI should provide a bounded recall/import-into-view flow instead of trying to render everything. A visible runtime cap around 200 items is acceptable for the active view.

## Storage Limits And Usage

- Unbounded local image capture is not allowed.
- Original image blobs are opt-in and must respect size limits before they are stored.
- Default max original image size: 25 MB.
- Hard max original image size: 100 MB.
- Thumbnail size must be small and bounded by dimensions and byte size.
- Visible recent/runtime history should stay bounded around 200 items.
- Records that cannot store a local original because of size, quota, CORS, or user policy should remain valid as metadata/remote-only records.
- Add a storage usage indicator early, with counts and byte totals such as:

```text
Captured: 418 images
Originals: 1.8 GB
Thumbnails: 42 MB
Failed/remote-only: 37 records
```

- Storage usage should be computed from IndexedDB metadata where possible, not by decrypting every payload.

## React Readiness

- Code organization should make a future React panel easy to adopt without rewriting the extension core.
- Parser, URL model, crypto, IndexedDB access, key management, extension messaging, target-image handling, automation state, and import/export formats should live in small framework-independent modules.
- The first plain-DOM panel should be treated as a renderer over explicit state/actions, not as the owner of business logic.
- UI events should call named action functions that can later be reused from React event handlers.
- DOM reads/writes that must touch the active page should be isolated behind adapters so React can own only extension-created UI.
- State updates should flow through a small app/controller layer so a later React implementation can subscribe/render from the same state shape.
- React/Vite should be revisited when the panel has enough nested UI, selection state, key-management flows, import/export dialogs, search/filtering, or thumbnail gallery behavior to justify the dependency and build step.

## Current Bookmarklet Feature Surface

### Language Model Integration

- Configurable local OpenAI-compatible endpoint, model, and max token setting.
- Fetches title/filename metadata and description metadata with strict JSON-schema response expectations.
- Uses current image input as a data URL when possible and falls back to current image URL.
- Has auto-fetch toggles for query changes, title-on-load, and description-on-preload/load.
- Caches metadata by URL/mode and updates history/favorites display fields.

### Image History

- Stores a sortable history entries with URL, title, label, thumbnail, timestamp, and downloaded timestamp.
- Sortable by domain, image kind, title, prefixes in folders.  Apply to items in the history with common field structure.
- Shows a visible history window, a configurable max limit, no limit by default.
- The active view should be bounded for usability, with a practical visible/runtime cap around 200 items even if encrypted IndexedDB stores more.
- Recent runtime history covers the last 30 minutes without requiring decrypt/unlock during the active browser session.
- Older encrypted history is recalled into the active view through an explicit UI flow, optionally using keywords.
- Supports click, double-click, seelct-all, multiple-selection, keyboard selection, range selection, toggle selection, selected-item load, and selected-item download.
- Tracks download records and image fingerprints.
- Supports thumbnails with lazy/visible-only thumbnail generation on import.
- Handle image metadata capture.

### Favorites

- Stores favorites with the same basic display shape as history.
- Supports favorite current URL, import, export, display thumbnails, load favorite, and remove favorite.
- Favorites are capped separately from visible history behavior.

### Export And Import

- Current history/favorites export is plain JSON.
- Current import accepts either an array or an object containing `history` or `favorites`.
- Future export/import must encrypt payloads and wrap referenced keys with a password.
- Manual symmetric-password export/import should be supported in addition to normal key export/import.

### Loading Images Into DOMs

- Startup auto-selects a target image only when exactly one qualifying image exists.
- Manual target picking lets the user choose an image in the page.  Uses a visible indication as the user is finding the element to target.
- Applying a URL removes `srcset`/`sizes`, updates `img.src`, and binds load/error handling to drive status, history, 404 traversal, thumbnails, and downloads.
- Optional preview styling can make the selected image the primary visible page item while preserving original DOM state for cleanup.  Default is on when one image element is on page.
- When exactly one image is present on injection, preview styling should be applied immediately.
- When an image is loaded into existing image element it preserves the previous in history for restore if target changes.

### URL Controls With Advanced Configuration

- Generic URL tokenizer parses protocol, host/domain, path segments, filename tokens, query fields, hash, encoded slash paths, HTML entity `&amp;`, decimal fields, hex fields, and width/zero padding.
- Rebuilds URLs by position rather than global string replacement.
- Supports editable fields, active field selection, numeric `+`/`-`, step, direction, width override, selected-history field edits, domain edits across selected history, and selection-based metafield splitting.
- Advanced pattern setting for fields to allow the user to split a particular field into 2 or more.  For example if the field was the number 01011990 and the user wanted to split into 3 fields they might do ..|..|.... or use a regex to specify then each one of those fields cold be increment/decrement/modified independently and have a direct effect on the url and image loaded as well.
- Field can be selected and aliased specific to a domain and it's folder structure. IE field q might be aliased to question but when changeed would update q= in the title bar.
- The fields should have a text that starts the section showing something like /<field1>/<fiedl2>/... based on the naming that is currently chosen.
- Fields should detect if it is a hex number or integer or date/time on first load.  Hex includes a non int in hex format.  int is all inters.  Time/Date when matching the length of epoche time or format like 01011990.  These should be udpatable for example if I wanted to add phone number later or specific directions.  For example, if the field is a date I may break into 3 fields ..|.|.... for a specific domain.  This could be extended other buckets/containers/groupings etc.
- Eager date/time detection is acceptable, but every split/inferred field should be reversible or hideable so clutter can be reduced when fields do not add value.
- Hidden fields should remain available for advanced editing, including edits across multiple selected history items.
- Domain/folder-specific aliases and field patterns should be user configuration, and can be locked/offloaded from local settings into encrypted IndexedDB with a symmetric PIN-style unlock when stepping away.

### Automation

- Supports slideshow-style navigation, stop behavior, 404 retry/auto-advance, retry count/delay, auto-download on successful load, and preload-related LLM behavior.
- Existing automation is tied to image load/error events and timers in page context.
- User-driven repeated navigation should still respect the same minimum request interval as automation. Rapid forward/backward input should queue or coalesce actions instead of firing uncontrolled requests.

### 404 Automation

- Optional preloading images above and below a url - if the user has enabled and the furrent url has identified key path structure attempt to preload n images above and below.  The n is 1 by default but can be modified by the user.
- Special attention should be paid to how interactions occur so that infiniite `get` requests aren't submitted.  Also, automatoin should stop or when user interrupts.  Automation should continue in the direction of the last user interaction unless they click on a specific direction button.
- Automation must enforce a hard global request cap and a minimum delay between requests so thousands of requests cannot be made in a short span.
- If too many requests are detected, the extension should throttle, pause, or stop automation and surface the status clearly.

### Keybindings

- Global capture-phase keyboard handling preserves normal typing in inputs.
- Current shortcuts include left/right for active field movement, space for move/stop, down or `d` for download, `h` for panel hide/show, letter shortcuts for field selection, enter for selected history load, shift-enter for selected history download, and up/down for history selection.
- Capture-vs-target handling is a known sharp edge for history item buttons.

### Page Augmentation

- Injects a fixed left panel and a target picker control.
- Adds temporary outlines for selected/hovered target images.
- Applies optional page, body, and image styling, then restores original style state on close.
- Uses DOM mutation observation during target-pick mode to bind newly visible images.

## Risks

- The encryption model is bigger than a storage swap. Per-item keys, key wrapping, import/export, downloads, and unlock behavior need a small key-management layer before history/bookmarks are expanded.
- IndexedDB schema mistakes will be expensive to migrate once encrypted records exist.
- MV3 service worker lifecycle can interrupt long-running automation, key availability, or download flows if they are placed in the worker instead of the content script.
- Keeping the bookmarklet as a fallback while sharing behavior with the extension can create drift if URL parsing and image navigation are not factored deliberately.
- Cross-origin images may block thumbnails, fingerprints, LLM data URLs, or canvas downloads.
- Content-script UI can be affected by hostile or unusual page CSS unless the panel uses strong style isolation.
- Shadow DOM would improve UI isolation but can complicate event handling and styling. Plain DOM is simpler for the first pass.
- Brave-specific protections may need manual verification beyond Chromium.
- Importing old plaintext bookmarklet data into encrypted storage requires a migration path and a clear one-time trust boundary.
- Password wrapping without external libraries likely means PBKDF2 via WebCrypto. That is acceptable for a browser-native first pass but should be parameterized for future upgrades.

## Proposed Implementation Phases

### Phase 0: Preserve And Map The Bookmarklet

- Keep `deprecated/bookmarklet` intact as the working fallback/debug artifact.
- Identify source behavior that must be shared or ported: URL parser/rebuilder, field model, target image selection, image apply/load/error handling, history/favorites shape, LLM request shape, and keyboard routing.
- Add lightweight manual regression notes for representative URL patterns and image-page scenarios.

### Phase 1: MV3 Extension Shell And Injected Panel

- Add a minimal MV3 manifest, background service worker, and content script.
- Use the extension action to inject/toggle the panel in the active tab.
- Do not add a popup.
- Use minimal permissions first: `activeTab`, `scripting`, `storage`, and only expand host permissions when a feature proves it needs them.
- Render a basic side/floating panel in the page with status, current URL, target picker, and close/toggle behavior.

### Phase 2: Storage And Key Management Foundation

- Create the IndexedDB schema before feature storage spreads:
  - `keys`: `kind`, `uuid`, `reference`, wrapping metadata, algorithm metadata, created/updated timestamps.
  - `history`: encrypted payload, item UUID, key reference, URL lookup metadata if needed.
  - `bookmarks`: encrypted payload, item UUID, key reference.
  - `downloads`: encrypted file metadata, key reference, filename metadata.
  - `settings`: non-sensitive extension settings or encrypted sensitive settings.
  - `runtimeHistory`: session-only active history model, kept in memory and rebuilt from current session activity or explicit decrypt/recall.
  - `storageStats`: aggregate capture counts and byte totals for early usage reporting.
  - `migrations`: schema and data migration tracking.
- Implement envelope encryption:
  - Each durable item has a content key.
  - Content keys are stored in the key table and wrapped by a local/root key or password-derived key.
  - Exports wrap selected keys with a password.
  - Imports unwrap with the supplied password and re-store under local key policy.
- Keep unlock state in memory only in content script or extension pages, never as the only durable source of truth in the service worker.
- Add a lock flow that can move sensitive local settings/patterns into encrypted IndexedDB and require unlock before viewing or editing them again.

### Phase 3: URL Parser And Image Navigation Port

- Port the generic parser/rebuilder and token field model.
- Preserve encoded slash handling, query parsing, filename tokenization, decimal/hex detection, width preservation, active field behavior, same-origin `pushState`, and exact-position rebuilds.
- Apply rebuilt URLs to the selected page image with existing `srcset`/`sizes` clearing behavior.
- Bind load/error events for status, history update hooks, and future automation.

### Phase 4: History And Bookmarks

- Replace bookmarklet `localStorage` history/favorites with encrypted IndexedDB records.
- Track cross-session history and bookmarks.
- Keep recent 30-minute history in runtime memory unencrypted during the active browser session.
- Add a recall/decrypt flow for bringing selected encrypted records back into the active history view.
- Support optional encrypted-history keywording; do not expose broad plaintext domain/path indexes by default.
- Add visible lists, load item, remove item, favorite current URL, and basic dedupe.
- Add encrypted thumbnails only after the core record flow is stable.
- Add migration/import from old plaintext bookmarklet JSON as an explicit user action.

### Phase 5: DOM Reactivity And Page Augmentation

- Add `MutationObserver` behavior for changing page image sets, target-pick mode, and late-loaded images.
- Preserve exact-single-image auto-selection and manual target picking.
- Add page styling controls and restore-on-close behavior.
- Harden panel isolation against page CSS.

### Phase 6: Automation And Keybindings

- Reintroduce movement shortcuts, history selection shortcuts, panel hide/show, download shortcut, bypass/force download shortcut, slideshow, stop behavior, and 404 retry/advance.
- Keep automation timers and DOM-dependent state in the content script.
- Use the service worker only for extension-level commands, download orchestration if needed, and durable messages.
- Add global request throttling, a hard request cap, and a minimum interval that applies to both automation and rapid manual navigation.

### Phase 7: Export, Import, And Encrypted Downloads

- Add encrypted history/bookmark export and import.
- Add key export/import with password wrapping.
- Add manually password-protected export/import mode.
- Add encrypted downloads-to-disk with a versioned file envelope and per-download key reference.
- Decide whether plain image download remains a debug option or is replaced by encrypted download by default.

### Phase 8: LLM Integration

- Port endpoint/model/max-token settings and title/description fetches.
- Preserve strict schema expectations, fallback behavior, and auto-fetch toggles.
- Store metadata and related thumbnails under encrypted records.
- Revisit permissions and CORS behavior for local endpoints in Brave.

## What Will Be Implemented First

The first implementation should be a narrow vertical slice:

- MV3 manifest, service worker, and content script with browser-action injection/toggle.
- Injected side/floating panel with no popup.
- Preserved bookmarklet artifact left untouched.
- IndexedDB schema and key-management skeleton, including the key table by `kind`, `uuid`, and `reference`.
- Per-item encrypted storage path for history/bookmark records, even if the first UI only writes a minimal current URL record.
- Runtime history model for recent active-session items, with the encrypted durable store kept separate.
- Day-one storage limits for originals, thumbnails, active view size, and remote-only records.
- Storage usage indicator scaffold with captured count, original bytes, thumbnail bytes, and failed/remote-only count.
- Target image detection/picking, current URL display, parser/rebuilder port, active numeric field movement, and apply-to-image behavior.
- Immediate preview styling when injection finds exactly one image.
- Basic DOM reactivity for target picking and late image changes.
- Request throttling scaffold so manual and automated navigation cannot overwhelm the site.
- Minimal manual verification against the known bookmarklet URL patterns.

This gives the extension its correct shape early: MV3 injection, encrypted durable storage, and preserved URL/image navigation.

## What Will Intentionally Not Be Implemented First

- Full LLM title/description integration and auto-fetch toggles.
- Full import/export UX, key export/import UX, and manually password-protected export/import.
- Encrypted downloads-to-disk.
- Full encrypted-history recall/search UX beyond a minimal proof of the storage boundary.
- Batch history selection and batch downloads.
- Complete slideshow/404 automation.
- Full thumbnails, fingerprints, and downloaded-state tracking.
- Advanced page styling controls beyond what is needed to safely show and restore the selected image.
- Any bundler, framework, package dependency beyond TypeScript tooling, or external crypto library.
- Broad host permissions requested up front.
- Automatic migration of old plaintext bookmarklet storage without an explicit user action.
