# Bookmarklet Behavior Map

## Purpose

This document maps every observable behavior of the reference bookmarklet to the extension architecture. Each feature area records the bookmarklet source symbols, the extension destination layer, a classification, and parity expectations and deferrals for the port.

Source of truth: `deprecated/bookmarklet/image-url-token-editor.bookmarklet.src/image-url-token-editor.bookmarklet.src.js`

## Classifications

| Label                | Meaning                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `port`               | Logic moves substantially as-is into the extension layer indicated     |
| `refactor`           | Logic moves but must be restructured to fit the extension architecture |
| `replace storage`    | Behavior is preserved; localStorage is replaced with IndexedDB         |
| `new extension work` | Extension capability with no bookmarklet equivalent                    |
| `defer`              | Not in the first few milestones; explicitly acknowledged               |

## Milestone Mapping

| Feature Area               | Classification     | Primary Milestone |
| -------------------------- | ------------------ | ----------------- |
| URL parser / field model   | refactor           | M03               |
| Target image selection     | refactor           | M02               |
| Image apply / load / error | port               | M02, M03          |
| History                    | replace storage    | M05               |
| Favorites / bookmarks      | replace storage    | M05               |
| Thumbnails (session)       | port               | M05               |
| Downloads                  | port               | M05               |
| Automation / 404 traversal | port               | M08               |
| Keyboard routing           | port               | M08               |
| LLM metadata               | port               | M09               |
| Stored original capture    | new extension work | M06               |
| Encrypted durable storage  | new extension work | M04               |
| Import / export            | defer              | M07               |
| Recall / search            | defer              | M07               |

---

## Feature Areas

### 1. URL Parser and Field Model

**Classification:** refactor  
**Extension destination:** `core/url/`  
**Milestone:** M03

#### Bookmarklet symbols

| Symbol                                                          | Role                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `resolveUrl(input)`                                             | Normalize and parse input to a `URL` object; decodes HTML entities; handles space-escaping                                  |
| `decodeHtmlEntities(value)`                                     | Strips `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` before parsing                                                            |
| `safeDecodeURIComponent(value)`                                 | Decode with fallback for malformed percent sequences                                                                        |
| `safeEncodeURIComponent(value)`                                 | Encode with extra escaping of `!'()*`                                                                                       |
| `safeDecodePathSegment(value)` / `safeEncodePathSegment(value)` | Path-specific encode/decode                                                                                                 |
| `safeDecodeQueryPart(value)` / `safeEncodeQueryPart(value)`     | Query-specific encode/decode; handles `+` as space                                                                          |
| `encodedSlashAt(value, index)`                                  | Detects `%2f` / `%252f` encoded slash at a given position                                                                   |
| `splitPreservingSlashStyle(pathname)`                           | Splits pathname into `{type:'sep', raw}` and `{type:'segment', raw}` tokens, preserving literal vs encoded slashes          |
| `maybeSplitQueryLikePath(urlObject)`                            | Detects query-like parameters embedded in the path (no `?` in URL)                                                          |
| `detectNumericType(value)`                                      | Returns `'hex'`, `'int'`, or `'text'` for a token value                                                                     |
| `tokenizeEditableText(text, context)`                           | Splits a segment or query value into `{kind, value, width, context}` tokens using a hex/int regex                           |
| `parseQueryFields(searchBody)`                                  | Parses `key=value&...` pairs, tokenizing each value                                                                         |
| `parseModel(input)`                                             | Full pipeline: resolve → split path → detect query-like path → tokenize all segments and query values; returns model object |
| `rebuildTextFromTokens(tokens)`                                 | Joins token values back to a string                                                                                         |
| `rebuildPathname(model)`                                        | Re-encodes and joins path parts                                                                                             |
| `rebuildSearch(model)`                                          | Re-encodes and joins query fields                                                                                           |
| `rebuildUrl(model)`                                             | Combines protocol, host, pathname, search, hash back to a string                                                            |

#### Field model symbols

| Symbol                                         | Role                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collectFields(model)`                         | Enumerates all path and query tokens as flat field list; assigns `id`, `label`, `kind`, `width`, `location`; auto-selects first numeric field as active |
| `isLikelyFilename(segment)`                    | Heuristic: segment containing `.` is labeled as `file N` instead of `path N.M`                                                                          |
| `getFieldValue(field)`                         | Returns `field.token.value`                                                                                                                             |
| `getFieldTokenContainer(field)`                | Navigates model to the token array containing a field's token                                                                                           |
| `setFieldValue(field, value)`                  | Mutates token value; re-detects numeric type; widens stored width if needed                                                                             |
| `padNumberText(value, width)`                  | Zero-pads a numeric string to the required width                                                                                                        |
| `bumpField(field, delta)`                      | Increments or decrements a numeric (int or hex) field using `BigInt`; clamps to zero; preserves prefix and case                                         |
| `getStep()`                                    | Parses `settings.step` as a positive integer; defaults to 1                                                                                             |
| `moveActiveField(direction)`                   | Gets active field, bumps by step in the given direction, applies and renders                                                                            |
| `fieldIndexForShortcutKey(lower)`              | Maps single letter `a`–`z` to field index                                                                                                               |
| `setActiveField(id)`                           | Sets `app.activeFieldId` and re-renders fields                                                                                                          |
| `splitFieldBySelection(field, inputEl)`        | Splits a field token at the current text selection into up to three metafield tokens                                                                    |
| `createMetafieldToken(value, context)`         | Creates a new typed token for a metafield split                                                                                                         |
| `findMatchingFieldInModel(model, sourceField)` | Finds the field in another model that corresponds to the same token position, for bulk history edits                                                    |
| `applyFieldChangeToSelectedHistory(field)`     | Applies the current field value to all selected history entries at the matching field position                                                          |
| `applyDomainToSelectedHistory()`               | Replaces host in all selected history entries with the current model host                                                                               |

#### Parity expectations for M03

- All URL patterns representable by the bookmarklet must parse, rebuild, increment, decrement, and round-trip correctly.
- Numeric type detection (int, hex, zero-prefix, hex with/without `0x` prefix) must be preserved.
- Width preservation on bumped fields must match bookmarklet behavior (widens, never narrows).
- Encoded slash paths (`%2f`, `%252f`) must survive parse and rebuild without double-encoding.
- Query-like paths (e.g., `?key=value` embedded in path) must be detected and parsed correctly.

#### Known deferrals

- Field aliases (`field-aliases.ts` per proposed structure) and domain-specific split patterns are deferred unless required to pass parity tests.
- Metafield split UI is deferred to after core field navigation is stable.

---

### 2. Target Image Selection

**Classification:** refactor  
**Extension destination:** `content/target-image.ts`, `content/page-adapter.ts`  
**Milestone:** M02

#### Bookmarklet symbols

| Symbol                             | Role                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `getImageUrl(img)`                 | Returns `currentSrc` → `src` attr → `src` property → `data-src` → `data-original` → empty                                            |
| `isProbablyVisible(img)`           | Checks bounding rect (`width>0`, `height>0`) and computed style (`display`, `visibility`, `opacity`)                                 |
| `imageScore(img)`                  | Returns `max(naturalWidth*naturalHeight, renderedWidth*renderedHeight)` for sorting                                                  |
| `getTargetImageCandidates()`       | All images with URLs, sorted by visibility first then score                                                                          |
| `findSingleTargetImage()`          | Returns the one candidate image if exactly one qualifies; else `null`                                                                |
| `findTargetImage()`                | Returns the largest visible image (legacy fallback, not used at startup)                                                             |
| `setTargetImage(img, options)`     | Restores previous target, clears indicator, marks new target with `data-img-nav-host-selected="1"`, saves selector, binds load/error |
| `buildImageSelector(img)`          | Builds a structural CSS selector for recovery                                                                                        |
| `recoverTargetImageFromSelector()` | Re-queries the DOM using the stored selector                                                                                         |
| `attachTargetImageListeners(img)`  | Attaches `load` and `error` listeners in capture phase                                                                               |
| `removeTargetImageListeners()`     | Removes previous listeners from `app.boundTargetImg`                                                                                 |
| `clearTargetIndicator()`           | Removes `data-img-nav-host-selected` from all images                                                                                 |
| `ensureTargetIndicatorStyles()`    | Injects a `<style>` for hover/selected indicator                                                                                     |

#### Manual target pick mode

| Symbol                                                      | Role                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `setTargetPickMode(enabled)`                                | Toggles pick mode; sets cursor to crosshair; attaches/detaches pick listeners                                           |
| `attachPickModeListeners()`                                 | Registers `pointerdown`, `mousedown`, `mouseup`, `click`, `mousemove` capture events; `MutationObserver` for new images |
| `detachPickModeListeners()`                                 | Removes all of the above                                                                                                |
| `bindPickImageListener(img)`                                | Adds `mouseover` and `click` capture listeners to a candidate image                                                     |
| `refreshPickModeImageListeners()`                           | Removes stale bindings, adds new visible in-viewport images                                                             |
| `schedulePickModeRefresh()`                                 | Deduplicates refresh via `requestAnimationFrame`                                                                        |
| `setPickHoverImage(img)` / `clearPickHoverImage()`          | Manages `data-img-nav-pick-hover` hover indicator                                                                       |
| `getImageFromPoint(x, y)`                                   | Hit-tests via `document.elementsFromPoint`                                                                              |
| `findImageFromEvent(event)` / `findImageFromTarget(target)` | Walks the DOM or composed path to find an image element                                                                 |
| `tryPickTargetFromEvent(event, preResolvedImage)`           | Resolves and confirms target from a pick-mode event                                                                     |
| `pickTargetImage(img, event)`                               | Prevents default, nullifies wrapping link, calls `setTargetImage`, loads the image URL                                  |
| `onPickModeCaptureEvent(event)`                             | Top-level pick mode event dispatcher                                                                                    |
| `onDocumentClick(event)`                                    | Handles Shift+click outside the panel to add a clicked image to history                                                 |

#### Parity expectations for M02

- Auto-selection fires only when exactly one qualifying image exists on the page at injection time.
- Manual pick mode uses a visible crosshair cursor and per-image outline indicators.
- Clicking in pick mode suppresses navigation for 1 second to prevent double-fire.
- Selecting a new target restores the previous target's original styles before applying styling to the new one.
- `MutationObserver` keeps pick mode listeners synchronized with late-arriving images.
- Closing the panel restores all extension-owned styles.

#### Known deferrals

- DOM observer integration outside of pick mode (for fully dynamic pages) deferred to M02 implementation details.
- Extension permission requests for cross-origin images deferred to M06.

---

### 3. Image Apply / Load / Error Handling

**Classification:** port  
**Extension destination:** `content/page-adapter.ts`, `core/image/image-navigation.ts`  
**Milestone:** M02, M03

#### Bookmarklet symbols

| Symbol                             | Role                                                                                                                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `removeResponsiveSourceAttrs(img)` | Removes `srcset`/`sizes` from the target `<img>` and any `<source>` elements inside a parent `<picture>`                                                                                            |
| `applyCurrentUrl(options)`         | Rebuilds URL from model; sets `app.lastAppliedUrl`; updates `fullUrlEl`; recovers disconnected target; re-applies styling; removes srcset/sizes; sets `img.src`; triggers preloads and optional LLM |
| `parseAndApplyUrl(url, options)`   | Parses URL into model, collects fields, then calls `applyCurrentUrl`                                                                                                                                |
| `updateLocationBarIfAllowed(url)`  | Calls `history.pushState` only when the new URL is same-origin                                                                                                                                      |
| `triggerPreloads()`                | Computes adjacent URLs (`computeUrlAtDelta`) and starts preload for ±1 neighbors                                                                                                                    |
| `preloadWithRetry(url, delta)`     | Creates a hidden `Image` object to preload; retries on error if 404 auto-advance is enabled                                                                                                         |
| `computeUrlAtDelta(delta)`         | Bumps the active field by `delta` and rebuilds URL without applying; used for preloads                                                                                                              |
| `onImageLoad()`                    | Clears `auto404Remaining`; ensures thumbnail; commits `pendingHistoryUrl` to history; triggers auto-download or LLM if configured; advances slideshow                                               |
| `onImageError()`                   | Clears `pendingHistoryUrl`; sets error status; schedules 404 auto-advance; continues slideshow if not in 404 mode                                                                                   |
| `rememberOriginalState()`          | Snapshots `html.style.cssText`, `body.style.cssText`, `img.style.cssText`, `img.src`, `img.srcset`, `img.sizes`                                                                                     |
| `restoreOriginalState()`           | Restores snapshotted styles; re-applies `srcset` and `sizes` if they existed                                                                                                                        |

#### Parity expectations for M02, M03

- History is committed only on successful load, not on 404 or pending state.
- `srcset` and `sizes` must be cleared on both the `<img>` and any `<source>` siblings before setting `src`.
- Same-origin `history.pushState` must be called unless `updateLocation: false` is passed explicitly.
- Failed loads must surface a clear status message without corrupting the last successful state.
- Closing must restore styles including `srcset` and `sizes` if they existed before the bookmarklet ran.

---

### 4. History

**Classification:** replace storage  
**Extension destination:** `data/repositories/history-repository.ts`, `data/runtime/runtime-history.ts`  
**Milestone:** M05

#### Bookmarklet shape

```js
// In localStorage[STORE_KEY].history — array, newest first
{
  url: string,
  timestamp: string,      // ISO 8601
  title: string,          // LLM filename or URL-derived fallback
  label: string,          // "filename.jpg – host"
  thumbnail: string,      // data URL or empty
  downloadedAt: string    // ISO 8601 or empty
}
```

#### Bookmarklet symbols

| Symbol                                       | Role                                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `addHistory(url)`                            | Deduplicates by URL, prepends new entry (newest first), saves state               |
| `updateHistoryForUrl(url, patch)`            | Patches matching entry in place; saves and re-renders if anything changed         |
| `getVisibleHistoryEntries()`                 | Returns `history.slice(0, 30)` — first 30 items only                              |
| `setHistorySelectionByIndex(index, options)` | Updates `selectedHistoryUrls` and `historyFocusedUrl`; supports Shift+click range |
| `moveHistorySelection(delta)`                | Moves keyboard selection by delta in visible entries                              |
| `normalizeHistorySelection()`                | Removes URLs from selection that are no longer in the visible list                |
| `loadSelectedHistoryItem()`                  | Loads focused URL via `parseAndApplyUrl`                                          |

#### Extension differences

- `localStorage` is replaced by encrypted IndexedDB records in `history` object store (M04).
- Runtime session history (~30 visible items, ~30-minute window) is kept in memory separately from the full encrypted durable record (M05).
- `downloadedAt` field becomes a proper capture/download status field in the extension record (M05/M06).
- The 30-item visible cap may grow; the bookmarklet cap of 30 is a UI rendering limit, not a storage limit.
- History ordering remains newest first.

#### Import compatibility note

The bookmarklet import handler uses `push` (not `unshift`), so imported entries land at the tail of the array. The extension import must handle this ordering correctly when migrating or importing legacy data.

#### Known deferrals

- Encrypted durable history search and recall deferred to M07.
- Full import/export UI deferred to M07.

---

### 5. Favorites / Bookmarks

**Classification:** replace storage  
**Extension destination:** `data/repositories/bookmarks-repository.ts`  
**Milestone:** M05

#### Bookmarklet shape

```js
// In localStorage[STORE_KEY].favorites — array, newest first, capped at 100
{
  url: string,
  timestamp: string,
  title: string,
  label: string,
  thumbnail: string       // no downloadedAt field
}
```

#### Bookmarklet symbols

| Symbol                             | Role                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `addFavorite(url)`                 | Deduplicates by URL, prepends, caps at `MAX_HISTORY` (100), saves state |
| `updateFavoriteForUrl(url, patch)` | Patches matching entry in place; saves and re-renders                   |

#### Extension differences

- The extension renames `favorites` to `bookmarks` in all new code and storage keys.
- The field `favorites` is preserved only as an import key for reading legacy localStorage data.
- Bookmarks store in the encrypted `bookmarks` IndexedDB object store (M04).
- The 100-item cap is a UI concern; underlying storage is unbounded but subject to privacy limits.

---

### 6. Thumbnails

**Classification:** port (session) → new extension work (durable encrypted)  
**Extension destination:** `core/image/thumbnails.ts`, `data/repositories/history-repository.ts`  
**Milestone:** M05 (session thumbnails), M06 (stored originals and durable thumbnails)

#### Bookmarklet symbols

| Symbol                                          | Role                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `THUMBNAIL_MAX_EDGE`                            | 256px maximum edge for thumbnail generation                                                       |
| `HISTORY_THUMBNAIL_SIZE`                        | 30px display size                                                                                 |
| `FAVORITE_THUMBNAIL_SIZE`                       | 44px display size                                                                                 |
| `createThumbnailDataUrlFromImage(img, maxEdge)` | Canvas-based resize from a loaded `<img>` element; returns JPEG data URL                          |
| `createThumbnailDataUrlFromBlob(blob)`          | Creates an object URL, loads it into a hidden Image, then calls `createThumbnailDataUrlFromImage` |
| `ensureThumbnailForUrl(url, sourceImage)`       | Checks memory cache → in-flight dedup → generate from `sourceImage` → fetch blob and resize       |
| `cacheThumbnailForUrl(url, thumbnail)`          | Stores in `app.thumbnailCache`; patches both history and favorites entries; saves state           |
| `app.thumbnailCache`                            | In-memory `url → dataUrl` map; not persisted independently                                        |
| `app.thumbnailInflight`                         | In-memory `url → Promise` map for deduplication                                                   |

#### Known bugs (from `deprecated/bookmarklet/docs/bugs-and-fixes.md`)

- Import does not restore thumbnails from imported history entries even if the data URL is present.
- Thumbnails generated during batch LLM fetches may be created from the wrong source image (`app.targetImg` mismatch).

#### Extension differences

- Thumbnails for runtime session history are kept in memory as in the bookmarklet.
- Durable thumbnails for bookmarks and encrypted history entries are stored in the `thumbnails` IndexedDB object store (M04/M05).
- Stored originals (full image bytes) are a separate explicit user action and live in the `imageBlobs` object store (M06).

---

### 7. Downloads

**Classification:** port  
**Extension destination:** `background/downloads.ts`, `core/image/image-navigation.ts`  
**Milestone:** M05

#### Bookmarklet symbols

| Symbol                                           | Role                                                                                                                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `downloadBlob(blob, filename)`                   | Creates object URL, inserts and clicks a `<a download>` element, revokes URL                                                                                                                  |
| `downloadImageViaCanvas(url, filename)`          | Cross-origin fallback: draws image to canvas, converts to blob, downloads                                                                                                                     |
| `downloadImageByUrl(url)`                        | Full pipeline: fetch LLM filename → check history dedup → compute fingerprint → check fingerprint dedup → cross-origin detect → canvas fallback → blob download; falls back to tab navigation |
| `downloadCurrentImage()`                         | Downloads the currently applied URL                                                                                                                                                           |
| `downloadSelectedHistoryItems()`                 | Downloads all selected history items in sequence                                                                                                                                              |
| `downloadHistoryItemViaCanvas(url, filename)`    | Per-item canvas fallback for history batch downloads                                                                                                                                          |
| `computeImageFingerprint(url)`                   | Fetches blob, computes SHA-256 via `crypto.subtle.digest`, returns hex string                                                                                                                 |
| `computeFingerprintFromBlob(blob)`               | SHA-256 fingerprint from an already-fetched blob                                                                                                                                              |
| `arrayBufferToHex(buffer)`                       | Converts `ArrayBuffer` to lowercase hex string                                                                                                                                                |
| `addDownloadRecord(url, filename, fingerprint)`  | Deduplicates by URL and fingerprint; prepends; caps at `MAX_DOWNLOAD_RECORDS` (500)                                                                                                           |
| `findDownloadRecord(normalizedUrl, fingerprint)` | Looks up by fingerprint first, then by URL                                                                                                                                                    |
| `findHistoryDownloadByUrl(normalizedUrl)`        | Checks whether the URL has a `downloadedAt` entry in history                                                                                                                                  |
| `ensureModelFilenameForUrl(url)`                 | Fetches or waits for LLM title, returns sanitized filename with extension                                                                                                                     |
| `sanitizeFilename(text)`                         | Replaces invalid characters with `_`, strips leading/trailing separators                                                                                                                      |
| `ensureFilenameExtension(baseName, sourceUrl)`   | Adds extension from URL if filename lacks one                                                                                                                                                 |
| `extensionFromUrl(url)`                          | Extracts lowercase extension from last path segment; defaults to `.jpg`                                                                                                                       |
| `normalizeAbsoluteUrl(url)`                      | Resolves relative URLs against `location.href` for dedup comparisons                                                                                                                          |

#### Bookmarklet dedup behavior

Two independent dedup checks before downloading:

1. URL already in history with a `downloadedAt` value → blocked.
2. URL or fingerprint already in `downloadRecords` → blocked.

#### Extension differences

- The extension uses `chrome.downloads` API via `background/downloads.ts` instead of DOM-based blob links (M05).
- Cross-origin fetches in the extension context go through the service worker with optional host permission (M06).
- Download records move to the encrypted `downloads` IndexedDB object store (M04/M05).

---

### 8. Automation and 404 Traversal

**Classification:** port  
**Extension destination:** `core/automation/`  
**Milestone:** M08

#### Slideshow symbols

| Symbol                                   | Role                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `startSlideshow()`                       | Sets `app.autoRunning = true`, initializes `app.autoRemaining` from `settings.autoCount` (0 = unlimited), schedules first step |
| `stopSlideshow(message)`                 | Clears `app.autoRunning`, timer, and remaining count                                                                           |
| `slideshowStep()`                        | Consumes one step counter, calls `moveActiveField`, schedules next step                                                        |
| `scheduleSlideshowStep(pause)`           | `setTimeout` with configured `slideshowPause` (default 1200ms)                                                                 |
| `consumeRemainingStep()`                 | Decrements counter; returns `false` when exhausted                                                                             |
| `getSlideshowPause()`                    | Parses `settings.slideshowPause`; defaults to 1200ms                                                                           |
| `stopAutoIfOppositeDirection(direction)` | Stops slideshow and disables 404 advance when user navigates in the opposite direction                                         |

#### 404 traversal symbols

| Symbol                         | Role                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `schedule404Advance()`         | Called from `onImageError`; starts counter on first call; decrements; schedules `moveActiveField` after `get404Delay()` |
| `start404AutoAdvanceCycle()`   | Initializes `app.auto404Remaining` from `settings.auto404Count` (0 = unlimited → `Infinity`)                            |
| `get404Delay()`                | Parses `settings.autoDelay`; defaults to 300ms                                                                          |
| `preloadWithRetry(url, delta)` | Preloads neighbor URL; on error calls `schedule404Advance` if 404 advance is enabled                                    |

#### Settings involved

| Setting            | Default  | Role                                                    |
| ------------------ | -------- | ------------------------------------------------------- |
| `autoCount`        | `'0'`    | Slideshow step limit (0 = unlimited)                    |
| `slideshowPause`   | `'1200'` | Milliseconds between slideshow steps                    |
| `autoAdvanceOn404` | `false`  | Enable 404 auto-advance                                 |
| `auto404Count`     | `'0'`    | 404 retry limit (0 = unlimited)                         |
| `autoDelay`        | `'300'`  | Milliseconds between 404 retry steps                    |
| `direction`        | `'up'`   | Navigation direction for both slideshow and 404 advance |

#### Extension differences

- The `setTimeout` loop lives in the content script session; it is not durable across page reloads.
- The extension request throttle (`content/request-throttle.ts`) applies to manual navigation but automation gets its own timing path.
- Extension automation may optionally signal state to the service worker via messages (M08).

---

### 9. Keyboard Routing

**Classification:** port  
**Extension destination:** `content/keyboard.ts`  
**Milestone:** M08

#### Bookmarklet behavior

The global keydown handler is registered in **capture phase** (`true` as the third argument), so it fires before element-level handlers.

| Key                     | Condition                                                 | Action                                                            |
| ----------------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `Enter`                 | Not in a typing target; history selection exists          | Load focused history item (`loadSelectedHistoryItem`)             |
| `Shift+Enter`           | Not typing; history selection exists; not a button target | Download selected history items                                   |
| `ArrowUp` / `ArrowDown` | Not typing; history selection exists                      | Move history keyboard selection                                   |
| `ArrowLeft`             | Not typing                                                | `moveActiveField('down')`                                         |
| `ArrowRight`            | Not typing                                                | `moveActiveField('up')`                                           |
| `Space`                 | Not typing                                                | Stop slideshow if running; else step once in configured direction |
| `ArrowDown` / `d`       | Not typing                                                | `downloadCurrentImage()`                                          |
| `h`                     | Not typing                                                | Toggle panel hidden                                               |
| `a`–`z`                 | Not typing                                                | Jump to field by shortcut index (`fieldIndexForShortcutKey`)      |
| `Enter` in field input  | Field input focused                                       | `applyCurrentUrl()`                                               |
| `Escape` in field input | Field input focused                                       | Blur                                                              |

#### Helpers

| Symbol                            | Role                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `isTypingTarget(target)`          | Returns true for `input`, `textarea`, `select`, and `contenteditable` elements |
| `isButtonTarget(target)`          | Returns true when target is a `<button>`                                       |
| `fieldIndexForShortcutKey(lower)` | Returns numeric index for a letter key; first 26 fields covered                |

#### Known architecture issue (from `deprecated/bookmarklet/docs/architecture-notes.md`)

The capture-phase global listener fires before element-level handlers. `Enter` in a field input triggers both the global handler (if history selection exists) and the input's own `onkeydown`. This can cause double-fire on `Shift+Enter` specifically. The extension keyboard module should route events to well-defined action dispatchers to avoid this.

#### Extension differences

- The extension keyboard module sends named action messages to `core/actions.ts` rather than calling DOM-coupled functions directly.
- The extension panel is isolated from the page and does not need to guard against `isTypingTarget` for page inputs; only panel-internal inputs require the guard.

---

### 10. LLM Metadata

**Classification:** port  
**Extension destination:** `core/llm/`  
**Milestone:** M09

#### Bookmarklet symbols

| Symbol                                                              | Role                                                                                                                 |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `LLM_DEFAULT_ENDPOINT`                                              | `http://127.0.0.1:1234/v1/chat/completions`                                                                          |
| `LLM_DEFAULT_MODEL`                                                 | `gemma-4-e4b`                                                                                                        |
| `LLM_DEFAULT_MAX_TOKENS`                                            | 220                                                                                                                  |
| `llmTitleSchema()`                                                  | Returns JSON Schema object requiring `filename` string                                                               |
| `llmDescriptionSchema()`                                            | Returns JSON Schema object requiring `description` string                                                            |
| `describeImageWithLlm(imageInput, sourceUrl, mode)`                 | Sends OpenAI-compatible chat/completions request with `response_format.json_schema` and an `image_url` content part  |
| `extractMessageText(message)`                                       | Extracts text from a message content string or array                                                                 |
| `parseJsonObject(text)`                                             | Parses JSON; fallback trims to first `{...}` object                                                                  |
| `runLlmMetadataFetch(url, mode, options)`                           | Full orchestration: deduplicate in-flight, get image input, call LLM, store result, update history/favorites, render |
| `getImageInputForLlm(url)`                                          | Prefers cached thumbnail; falls back to blob fetch and `toDataUrl`; falls back to raw URL                            |
| `metadataCacheKey(url, mode)`                                       | `mode + '::' + url`                                                                                                  |
| `setMetadataFieldForUrl(url, mode, value)`                          | Stores in `app.llmCache[url]`                                                                                        |
| `fallbackMetadataValue(url, mode)`                                  | Title: URL-derived filename; description: `"No description available."`                                              |
| `fetchTitleForCurrentImage()` / `fetchDescriptionForCurrentImage()` | Manual trigger wrappers                                                                                              |
| `maybeAutoFetchForQueryChange(url)`                                 | Auto-fetches if `settings.autoFetchOnQueryChange`                                                                    |
| `renderTitleForCurrentUrl()` / `renderDescriptionForCurrentUrl()`   | Update title/description DOM from cache                                                                              |

#### Auto-fetch settings

| Setting                         | Trigger                                      |
| ------------------------------- | -------------------------------------------- |
| `autoFetchOnQueryChange`        | On every URL change (each `applyCurrentUrl`) |
| `autoFetchTitleOnLoad`          | On `onImageLoad`                             |
| `autoFetchDescriptionOnPreload` | On `onImageLoad` and `preloadWithRetry`      |

#### LLM request shape (from `deprecated/bookmarklet/README.md`)

- `temperature: 0`, `stream: false`
- `response_format.type: "json_schema"`
- `response_format.json_schema.name`: `"image_title_metadata"` or `"image_description_metadata"`
- `response_format.json_schema.strict: true`
- Image sent as `image_url` content part (data URL preferred; raw URL fallback)

#### Extension differences

- LLM requests move to `core/llm/metadata-client.ts`; network call goes through the service worker in the extension context (same-origin local endpoint bypasses CORS).
- `app.llmCache` (session RAM) has no equivalent in M09; results are optionally stored in the encrypted `lockedSettings` or a separate metadata cache.
- Auto-fetch toggles are persisted in `local-settings.ts`.

#### Known deferrals

- Encrypted metadata cache (M09).
- Batch LLM fetches for multiple history items (deferred).

---

### 11. Panel UI

**Classification:** refactor  
**Extension destination:** `ui/panel.ts`, `ui/render.ts`, `ui/components/`  
**Milestone:** M01 (shell), M02–M05 (components)

#### Bookmarklet symbols

| Symbol                                                                     | Role                                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `renderPanel()`                                                            | Builds the entire panel DOM tree once using `createEl`, `button`, `input`, `label`, `section` helpers |
| `renderAll()`                                                              | Re-renders all dynamic sections                                                                       |
| `renderFields()`                                                           | Replaces `app.fieldsEl.innerHTML` with current field rows                                             |
| `renderHistory()`                                                          | Replaces `app.historyEl.innerHTML` with current history rows                                          |
| `renderFavorites()`                                                        | Replaces `app.favoritesEl.innerHTML` with current favorites rows                                      |
| `renderTitleForCurrentUrl()` / `renderDescriptionForCurrentUrl()`          | Update specific DOM nodes                                                                             |
| `setStatus(message)`                                                       | Sets `app.statusEl.textContent` and `console.log`                                                     |
| `syncFullUrlOnly()`                                                        | Updates only the full URL textarea without re-rendering other sections                                |
| `createEl(tagName, attrs, children)`                                       | Generic element factory; handles `style`, `text`, `html`, `on*` attributes                            |
| `button(label, onClick, extraStyle)`                                       | Styled button factory                                                                                 |
| `input(value, onInput, extraStyle, onApply)`                               | Styled input with Enter-to-apply and Escape-to-blur                                                   |
| `label(text)`                                                              | Styled label row factory                                                                              |
| `section(id, title, children)`                                             | Collapsible section with expand/collapse toggle; reads initial state from `settings.panelSections`    |
| `isSectionExpanded(sectionId)` / `setSectionExpanded(sectionId, expanded)` | Reads/writes `settings.panelSections`; saves state                                                    |
| `setPanelHidden(hidden)`                                                   | Toggles visibility; applies grayscale filter to target image when hidden                              |

#### Panel sections (default open/closed state)

| Section          | Default |
| ---------------- | ------- |
| imageDescription | open    |
| fullUrl          | closed  |
| domain           | closed  |
| fields           | open    |
| controls         | closed  |
| styling          | closed  |
| favorites        | open    |
| history          | open    |

#### Extension differences

- The extension panel is injected by the content script, not injected by a bookmarklet re-run.
- Panel does not use `innerHTML` rewrites; the extension UI calls named action dispatchers through `core/actions.ts`.
- The panel must not share state or DOM with the host page's own React/Vue/Angular rendering trees.

---

### 12. Page Styling

**Classification:** port  
**Extension destination:** `content/page-style.ts`  
**Milestone:** M02

#### Bookmarklet symbols

| Symbol                    | Role                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rememberOriginalState()` | Snapshots `html.style.cssText`, `body.style.cssText`, `img.style.cssText`, `img.src`, `img.srcset`, `img.sizes`                                       |
| `restoreOriginalState()`  | Writes snapshots back; conditionally restores `srcset`/`sizes`                                                                                        |
| `styleTargetImage()`      | Two modes: (1) no-op style restore if `previewReplacesStyling = false`; (2) full-page dark preview with configured object-fit, dimensions, background |
| `setPanelHidden(hidden)`  | Toggles grayscale filter on target image                                                                                                              |

#### Extension differences

- The extension must restore styles on panel close regardless of whether a session teardown occurs naturally.
- Cross-origin style writes that violate the host page's CSP must be handled gracefully.

---

### 13. State Persistence

**Classification:** replace storage  
**Extension destination:** `data/local-settings.ts`, `data/repositories/`  
**Milestone:** M04 (foundation), M05 (history/bookmarks)

#### Bookmarklet shape

All state is stored as a single JSON blob in `localStorage[STORE_KEY]`.

```js
defaultState() => {
  direction: 'up',
  step: '1',
  autoCount: '0',
  slideshowPause: '1200',
  autoDelay: '300',
  autoAdvanceOn404: false,
  auto404Count: '0',
  autoDownload: false,
  autoFetchOnQueryChange: false,
  autoFetchTitleOnLoad: false,
  autoFetchDescriptionOnPreload: false,
  previewReplacesStyling: false,
  showHistoryThumbnails: false,
  llmEndpoint: '...',
  llmModel: '...',
  llmMaxTokens: '220',
  pageBackground: '#000000',
  imageObjectFit: 'contain',
  imageWidth: '100vw',
  imageHeight: '100vh',
  panelSections: { ... },
  downloadRecords: [],
  history: [],
  favorites: []
}
```

#### Extension split

| Bookmarklet key                                                                                                    | Extension location                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `direction`, `step`, `autoCount`, `slideshowPause`, `autoDelay`, `autoAdvanceOn404`, `auto404Count`                | `local-settings.ts` (navigation/automation group)                  |
| `autoDownload`, `autoFetchOnQueryChange`, `autoFetchTitleOnLoad`, `autoFetchDescriptionOnPreload`                  | `local-settings.ts` (behavior group)                               |
| `previewReplacesStyling`, `showHistoryThumbnails`, `pageBackground`, `imageObjectFit`, `imageWidth`, `imageHeight` | `local-settings.ts` (UI/styling group)                             |
| `llmEndpoint`, `llmModel`, `llmMaxTokens`                                                                          | `local-settings.ts` (LLM group)                                    |
| `panelSections`                                                                                                    | `local-settings.ts` (UI group)                                     |
| `downloadRecords`                                                                                                  | `data/repositories/downloads-repository.ts` (IndexedDB)            |
| `history`                                                                                                          | `data/repositories/history-repository.ts` (IndexedDB, encrypted)   |
| `favorites`                                                                                                        | `data/repositories/bookmarks-repository.ts` (IndexedDB, encrypted) |

---

## Explicit Deferrals

The following behaviors from the bookmarklet exist but are intentionally deferred beyond the first five milestones:

| Behavior                                              | Reason for deferral                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| Full LLM metadata UI and auto-fetch                   | Deferred to M09                                                      |
| Encrypted metadata cache                              | Deferred to M09                                                      |
| Import/export UI (history, favorites/bookmarks, keys) | Deferred to M07                                                      |
| Recall / history search                               | Deferred to M07                                                      |
| Batch field apply across selected history             | Deferred to after M05 core history is stable                         |
| Bulk history download                                 | Deferred to after M05 download records exist                         |
| Metafield split                                       | Deferred to after M03 URL navigation is stable                       |
| React/Vite UI framework                               | Decision gate at M10; plain DOM first                                |
| Automatic migration of existing localStorage data     | No migration in the first slice; import from bookmarklet export only |
| WebAuthn key wrapping                                 | Placeholder only; deferred past M11                                  |
