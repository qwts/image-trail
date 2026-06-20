# June 20 Regression Fix Notes

This note summarizes the image bookmark/preview regressions fixed on June 20, 2026 on branch `codex/fix-m09-prereqs`.

## Pull Request

- Draft PR: https://github.com/qwtm/image-trail/pull/68
- Base branch: `codex/dev`
- Head branch: `codex/fix-m09-prereqs`

## Problems Fixed

- Shift-click bookmarking was sometimes saving a derived link/query source instead of the actual loaded image URL.
- Bookmark and history saves could re-split image URLs through `u`, `url`, `imgurl`, or `mediaurl` query parameters.
- Thumbnail creation regressed after the loaded-image validation path stopped using the previous preload fallback.
- Preview clicks were falling back to opening new browser tabs.
- Plain-looking bookmark/history rows could route into encrypted blob preview when stale `blobId` metadata existed without `captureStatus: captured`.
- Service-worker image fetches were missing page context needed by some image hosts.

## Root Causes

- `getImageUrl()` intentionally unwraps image-search links for target selection, but shift-click needed the literal loaded image source.
- `validateImageRecordUrl()`, `sourceUrlForBookmark()`, and `canonicalCaptureUrl()` reused source-unwrapping logic in persistence and fetch paths where URLs must remain literal.
- Row rendering used one rule for color/locked state, but click dispatch passed `item.blobId` directly.
- Preview behavior mixed two actions: projecting into the selected host image and opening a standalone tab.
- Service-worker fetches used extension host permissions but did not include credentials or the page referrer in thumbnail/preload fetch messages.

## Fixes Landed

- `df9f1a3 Fix shift-click image source saves`
  - Added loaded-image URL extraction for shift-click.
  - Shift-click now prefers `currentSrc` / `src` from the actual image element.
  - Added regression coverage for wrapper links versus actual loaded image URLs.

- `594d514 Restore thumbnails for loaded image saves`
  - Centralized thumbnail resolution for bookmark/history adds.
  - Restored fallback thumbnail generation for trusted loaded-image saves without blocking the save.

- `a90c293 Use service worker context for previews`
  - Stopped row preview from automatically opening new tabs.
  - Added page referrer to thumbnail source fetch messages.
  - Updated service-worker image fetches to use `credentials: include`.

- `4c906bb Ignore stale blob ids on plain rows`
  - Added `encryptedBlobIdForRecord()`.
  - Bookmark and history rows only dispatch encrypted preview when `captureStatus === 'captured'`.
  - Added regression coverage for stale blob ids.

- `a0ca5f6 Preserve literal image URLs`
  - Removed URL unwrapping from record validation, panel save/history/capture routing, service-worker thumbnail/capture fetch, and bookmark site filtering.
  - Kept source unwrapping only for display label and extension derivation.
  - Added tests proving wrapper URLs are preserved as literal saved URLs.

## Verification

The final branch state was verified with:

```sh
npm test
npm run build
```

Final verification result:

- `npm test`: 163 tests passed
- `npm run build`: passed
- Worktree was clean before push

## Behavioral Rules Captured

- Shift-click should save the actual loaded image URL, not a link-wrapper source.
- Bad URLs should fail before being added, but an already-loaded image should not be rejected just because URL derivation or wrapper parsing guesses differently.
- Service-worker fetches should be used for image byte/thumbnail loading when canvas or page-context limitations would break the direct path.
- Saved, previewed, captured, and filtered URLs should remain literal unless a UI-only label/extension helper is explicitly deriving display text.
- Plain rows must not require blob storage unlock unless they are actually captured encrypted-original records.
