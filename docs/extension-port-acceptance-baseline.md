# Extension Port Acceptance Baseline

## Purpose

This document defines the first vertical slice for the Brave/Chromium MV3 extension port, maps existing manual acceptance tests to the milestones they gate, establishes the parity checklist derived from the bookmarklet behavior map, and names explicitly deferred work.

All tests listed here start as manual browser scenarios and may later move to automated extension test infrastructure.

---

## First Vertical Slice

The first vertical slice spans M01 through M05. It covers the minimum set of behaviors needed to establish a testable, functional extension that preserves bookmarklet parity for the core workflows.

### Slice scope

| Area | Minimum required |
|---|---|
| Extension shell | MV3 manifest, service worker, basic permissions (`activeTab`, `scripting`, `storage`) |
| Panel injection | Browser action toggles an in-page panel reliably; repeated toggles do not duplicate DOM |
| Messaging | Typed ping/status message round-trip between service worker and content script |
| Target selection | Auto-select one image or prompt user to pick; visual selection indicator |
| Image apply | Clear `srcset`/`sizes`, set `img.src`, handle load/error, surface status |
| URL navigation | Parse URL into model, increment/decrement numeric field, rebuild URL, apply |
| Request throttle | Rapid manual navigation is coalesced or rate-limited |
| Style restore | Closing the panel restores all extension-owned styles |
| Runtime history | Successful loads appear in session history; 404 loads do not |
| Encrypted storage | IndexedDB schema open, versioned, migrateable; no raw key material in storage |
| Bookmarks | User can bookmark the current URL; bookmarks survive restart |
| Local settings | Settings load from `chrome.storage.local` with typed defaults; writes persist |

### Slice exclusions (not required for first slice)

- Full LLM metadata fetch (M09)
- Stored original image bytes / cross-origin capture (M06)
- Import/export (M07)
- Recall and search (M07)
- Automation / slideshow / 404 traversal (M08)
- Keyboard routing beyond basic field navigation (M08)
- React/Vite UI (M10)
- Automatic migration of existing bookmarklet localStorage data

### Slice acceptance statement

The first vertical slice is complete when:

1. Loading the extension unpacked in Brave/Chromium does not produce manifest errors.
2. Clicking the browser action injects the panel; clicking again toggles it off; the DOM is clean after each toggle.
3. The panel displays the current page URL, a status area, a target image picker button, and a URL field editor with parsed fields.
4. On a page with exactly one qualifying image, the extension selects it automatically and shows it as the target.
5. On a page with multiple images, the user can click "Pick Target" and select an image; the indicator and status update.
6. Incrementing or decrementing a numeric URL field updates the target image to the new URL and surfaces load or error status.
7. Closing the panel returns the page to its pre-extension appearance (styles, `srcset`, `sizes`).
8. At least one URL is added to runtime session history after a successful load.
9. Bookmarking a URL persists across panel close and reopen.
10. IndexedDB opens at the expected version and the service worker does not throw unhandled errors.
11. No raw key material appears in `chrome.storage.local` or IndexedDB without encryption.

---

## Milestone-to-Test Mapping

### Existing manual acceptance tests (from `docs/acceptance-tests/`)

These tests are release gates for specific later milestones. They are not M00 exit criteria.

| Test | File | Gates milestone |
|---|---|---|
| M00 Planning Baseline Review | `m00-planning-baseline-review.md` | M00 |
| Target Picker Captures Only The Selected Image | `target-picker-captures-only-selected-image.md` | M02, M06 |
| Local Original Capture Survives Remote Loss | `local-original-capture-survives-remote-loss.md` | M05, M06 |
| Third-Party CDN Permission Flow | `third-party-cdn-permission-flow.md` | M06 |
| Oversized Original Is Bounded | `oversized-original-is-bounded.md` | M05, M06 |

### Additional tests to write when their milestones begin

| Test (to be created) | Gates milestone |
|---|---|
| Panel toggles without DOM leaks | M01 |
| Service worker ping round-trip | M01 |
| Single-image auto-select on injection | M02 |
| Multi-image manual pick with visual indicator | M02 |
| Panel close restores page styles | M02 |
| URL parse, increment, and rebuild round-trip | M03 |
| Failed image load clears pending history | M03 |
| Same-origin location bar update | M03 |
| Request throttle prevents rapid uncontrolled requests | M03 |
| IndexedDB opens and migrates | M04 |
| Encrypted record can be written and read back | M04 |
| Settings load with correct defaults and persist on change | M04 |
| Successful load adds history entry | M05 |
| 404 load does not add history entry | M05 |
| Bookmark persists across panel close and browser restart | M05 |
| Download is blocked for already-downloaded URL | M05 |

---

## Bookmarklet Parity Checklist

This checklist is derived from `docs/bookmarklet-behavior-map.md`. Items are grouped by the milestone responsible.

### M02: Target image selection parity

- [ ] `findSingleTargetImage` selects exactly one image when the page has exactly one qualifying image.
- [ ] When multiple images exist, no image is auto-selected; status prompts "Pick Target".
- [ ] `setTargetImage` marks the selected image with a visible outline indicator.
- [ ] Switching target first restores previous target's styles before applying to the new one.
- [ ] `removeTargetImageListeners` removes the previous load/error listeners before re-binding.
- [ ] `buildImageSelector` and `recoverTargetImageFromSelector` allow recovery after DOM mutations.
- [ ] MutationObserver updates pick mode listener bindings when new images arrive.
- [ ] Shift+click outside the panel adds the clicked image's URL to session history.
- [ ] Closing the panel calls `destroy`-equivalent cleanup: removes all listeners, restores styles, removes panel DOM.

### M03: URL parse and navigation parity

- [ ] `decodeHtmlEntities` processes all five common entities before URL parsing.
- [ ] `safeDecodeURIComponent` and `safeEncodeURIComponent` handle malformed percent sequences without throwing.
- [ ] `safeDecodeQueryPart` converts `+` to space; `safeEncodeQueryPart` converts space to `+`.
- [ ] `encodedSlashAt` detects `%2f`, `%252f` (double-encoded) at any position in the pathname.
- [ ] `splitPreservingSlashStyle` produces `sep`/`segment` pairs preserving the original slash style.
- [ ] `maybeSplitQueryLikePath` detects and correctly splits query-like paths without a `?`.
- [ ] `detectNumericType` correctly returns `'hex'` for `0x`-prefixed values, hex-looking values, and `'int'` for digit-only values.
- [ ] `tokenizeEditableText` splits a segment into numeric and text sub-tokens.
- [ ] `parseModel` produces a complete model for all fixture URL patterns in `extension/src/test-fixtures/urls.ts`.
- [ ] `rebuildUrl` round-trips all fixture URLs without changing non-edited parts.
- [ ] `bumpField` increments/decrements int and hex fields with BigInt; zero-clamps; preserves width padding and hex case.
- [ ] `removeResponsiveSourceAttrs` clears `srcset`/`sizes` from both `<img>` and `<source>` elements in a `<picture>`.
- [ ] `updateLocationBarIfAllowed` calls `history.pushState` only for same-origin URLs; sets status for cross-origin.
- [ ] History entry is committed on `onImageLoad`, not on `applyCurrentUrl`; `pendingHistoryUrl` is cleared on error.

### M05: History and bookmarks parity

- [ ] `addHistory` deduplicates by URL and prepends new entries (newest first).
- [ ] `getVisibleHistoryEntries` returns at most 30 items for session display.
- [ ] `updateHistoryForUrl` patches a history entry in place without reordering.
- [ ] `addFavorite` (renamed `addBookmark` in extension) deduplicates by URL and prepends.
- [ ] The bookmarklet's `favorites` key is accepted as an import source; extension writes to `bookmarks`.
- [ ] Download records are checked for both URL match and fingerprint match before a download is allowed.
- [ ] `downloadedAt` is set on the history entry only after a successful blob download, not on a canvas fallback.
- [ ] Thumbnails are generated from the currently loaded image when available; blob fetch fallback otherwise.
- [ ] Thumbnail stored against a URL is not replaced by a thumbnail from a different loaded image.

### M08: Keyboard and automation parity

- [ ] `Enter` loads focused history item; `Shift+Enter` downloads selected history items.
- [ ] Arrow keys move history selection when a selection exists and no input is focused.
- [ ] `ArrowLeft` / `ArrowRight` move the active field down/up.
- [ ] `Space` stops a running slideshow; if not running, steps once in the configured direction.
- [ ] Letter keys `a`–`z` jump to the corresponding field index.
- [ ] `h` toggles panel hidden; grayscale filter is applied to the target image when hidden.
- [ ] Opposite-direction manual navigation stops a running slideshow and disables 404 auto-advance.
- [ ] Slideshow step counter is consumed; slideshow stops at `autoCount` if non-zero.
- [ ] 404 auto-advance fires after `autoDelay` ms; stops at `auto404Count` if non-zero.

### M09: LLM metadata parity

- [ ] Request shape matches bookmarklet: `temperature: 0`, `stream: false`, `response_format.json_schema`, `image_url` content part.
- [ ] Title schema name is `"image_title_metadata"`, description schema name is `"image_description_metadata"`.
- [ ] Thumbnail data URL is preferred as image input; blob-to-data-URL is the fallback; raw URL is the last resort.
- [ ] On fetch failure, the cached value is preserved; if no cached value, title falls back to URL-derived filename.
- [ ] Auto-fetch settings (`autoFetchOnQueryChange`, `autoFetchTitleOnLoad`, `autoFetchDescriptionOnPreload`) trigger at the correct lifecycle points.

---

## Architecture Boundaries for First Vertical Slice

The following boundaries must be established before any milestone beyond M01 adds feature code. Violation of these boundaries is a regression regardless of whether the feature works.

| Boundary | Rule |
|---|---|
| `core/` | No direct DOM access; no `document`, `window`, `chrome` APIs; no storage I/O |
| `data/` | No UI rendering; no DOM manipulation |
| `content/` | No IndexedDB access directly; no business logic other than DOM integration and dispatching named actions |
| `background/` | No owned DOM state; no unlocked key material; no long-running automation as the sole source of truth |
| `ui/` | No parser logic; no crypto; no IndexedDB; renders from explicit state and calls named actions only |

---

## Explicit Deferrals

These are acknowledged areas that the first vertical slice does not cover. Each must be named before implementation begins to avoid accidental scope creep.

| Deferred item | First eligible milestone |
|---|---|
| Stored original image bytes | M06 |
| Cross-origin host permission requests | M06 |
| Import bookmarklet localStorage data | M07 (import UI) |
| Export encrypted archive | M07 |
| History recall / search | M07 |
| Slideshow and 404 auto-advance | M08 |
| Full keyboard routing | M08 |
| LLM metadata fetch | M09 |
| Encrypted metadata cache | M09 |
| React/Vite decision | M10 |
| Automatic bookmarklet data migration | Not in scope; import-only |
| WebAuthn key wrapping | Placeholder; post-M11 |

---

## Test Fixture References

- URL parser/navigation regression cases: `extension/src/test-fixtures/urls.ts`
- History/bookmark shape examples: `extension/src/test-fixtures/sample-history.json`

These fixtures are consumed by M03 parser tests and M05 history repository tests respectively.
