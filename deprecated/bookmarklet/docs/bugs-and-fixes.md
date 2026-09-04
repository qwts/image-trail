# Bugs & Fixes

## 2026-06-13

---

### Bug: Import History does not populate thumbnails when Show Thumbnails is on

**Symptom:** After importing a history JSON file with "show history thumbnails" enabled, all imported items that lacked embedded thumbnails showed empty placeholder boxes indefinitely. Thumbnails were never attempted.

**Root cause:** `renderHistory()` renders an empty placeholder `<div>` for items without thumbnails but makes no attempt to fetch them. The only existing call site for `ensureThumbnailForUrl` was `onImageLoad` — triggered only when an image is loaded in the main preview, not on import.

**Fix:** After a successful import, collect all newly added URLs that lack a thumbnail, intersect them with the currently visible entries (`getVisibleHistoryEntries()` — the first 30), and fetch their thumbnails sequentially using a promise chain.

```js
if (app.settings.showHistoryThumbnails !== false && newUrlsWithoutThumbnail.length) {
  var visibleUrls = Object.create(null);
  getVisibleHistoryEntries().forEach(function (entry) {
    visibleUrls[entry.url] = true;
  });
  var visibleWithoutThumbnail = newUrlsWithoutThumbnail.filter(function (url) {
    return visibleUrls[url];
  });
  var thumbnailChain = Promise.resolve();
  visibleWithoutThumbnail.forEach(function (url) {
    thumbnailChain = thumbnailChain.then(function () {
      return ensureThumbnailForUrl(url).catch(function () {});
    });
  });
}
```

**Key design decisions:**

- Only fetch thumbnails for **visible** items (first 30). Fetching for all imported items (potentially hundreds) caused the history panel to rebuild constantly via `updateHistoryForUrl → renderHistory()` for items the user couldn't see, resulting in layout thrashing.
- No explicit `renderHistory()` call needed in the chain. `ensureThumbnailForUrl` → `cacheThumbnailForUrl` → `updateHistoryForUrl` already calls `renderHistory()` when it saves a thumbnail. Adding another call caused double renders per item.

**Affected code:** Import History button handler inside `renderHistory()` (~line 2850).

---

### Bug: Shift+Enter on a history item triggers `downloadSelectedHistoryItems()` twice

**Symptom:** With multiple history items selected, pressing Shift+Enter (meant to batch-download) would run the download twice with inconsistent selection state. The history list visually showed items with stale/wrong data after the first download pass settled, and selections appeared to reset. Clicking an item afterwards would "fix" the display.

**Root cause:** The global keyboard handler is registered in **capture phase**:

```js
document.addEventListener('keydown', onKeyDown, true);
```

Capture-phase listeners fire **before** target-element handlers. `stopPropagation()` called in a capture listener prevents further capture propagation but does **not** prevent the target element's own `onkeydown` from running in the target phase.

So for Shift+Enter on a history `<button>`:

1. **Capture phase** — global `onKeyDown` fires, calls `downloadSelectedHistoryItems()` (potentially without the focused button's item in the selection).
2. **Target phase** — the button's own `onkeydown` fires, ensures the item is in the selection via `setHistorySelectionByIndex`, then calls `downloadSelectedHistoryItems()` again.

Both chains run concurrently with different selection snapshots.

**Fix:** In the global `onKeyDown`, skip the Shift+Enter branch when the event target is a `<button>`. Buttons have their own handlers that correctly sequence "ensure selection → download once."

```js
if (event.shiftKey) {
  if (isButtonTarget(event.target)) return; // let the button's own handler run
  event.preventDefault();
  event.stopPropagation();
  downloadSelectedHistoryItems();
}
```

Plain Enter (load selected item) is still handled by the global handler for buttons — this is fine because the history button's `onkeydown` only handles Shift+Enter, not plain Enter.

**Affected code:** `onKeyDown()` function and the helper `isButtonTarget()` added alongside it (~line 3261).

---

### Bug: Batch Shift+Enter download overwrites thumbnails (and LLM titles) of non-current history items

**Symptom:** With multiple history items selected via ctrl/cmd-click, pressing Shift+Enter to batch-download causes the history thumbnails (and, when LLM is configured, the titles) of all selected items that lack a cached thumbnail to be overwritten with the data of the first (currently-displayed) image. Items that already have a thumbnail stored in `app.thumbnailCache` are unaffected.

**Root cause:** `getImageInputForLlm(url)` unconditionally passes `app.targetImg` as the `sourceImage` parameter to `ensureThumbnailForUrl`:

```js
function getImageInputForLlm (url) {
  return ensureThumbnailForUrl(url, app.targetImg)   // ← always uses page image
  ...
}
```

`ensureThumbnailForUrl` short-circuits and returns the cached value when `app.thumbnailCache[url]` already exists. But when the cache is cold (which is always true for non-current URLs that haven't been individually loaded in this session), it falls through to the `sourceImage` branch and creates a thumbnail snapshot of `app.targetImg` — the currently-displayed page image. That snapshot is then persisted back to the history entry via `cacheThumbnailForUrl → updateHistoryForUrl(url, { thumbnail })`. Because the page is showing the first selected item's image, all other selected items get that image's thumbnail written into their history entries. When LLM is configured, `getImageInputForLlm` also returns this wrong thumbnail as the image input, so the LLM returns a title based on the wrong image.

**Fix:** Only pass `app.targetImg` when `url` matches the currently-displayed URL. For any other URL, pass `null` so `ensureThumbnailForUrl` skips the `sourceImage` branch and fetches the correct image directly from `url`.

```js
function getImageInputForLlm (url) {
  var currentUrl = app.fullUrlEl ? app.fullUrlEl.value : app.lastAppliedUrl
  return ensureThumbnailForUrl(url, url === currentUrl ? app.targetImg : null)
  ...
}
```

**Affected code:** `getImageInputForLlm()` (~line 578).

---

## General notes for future debugging

- **Double render / layout thrashing:** If `renderHistory()` is being called in a loop or async chain, check whether `updateHistoryForUrl` or `cacheThumbnailForUrl` is also in the call path — they each trigger their own `renderHistory()` call. Avoid adding explicit `renderHistory()` calls after `ensureThumbnailForUrl` for this reason.

- **Capture vs. bubble event handling:** Any shortcut that needs to be handled by both the global `onKeyDown` (capture) and a specific element's inline handler will double-fire. Use `isButtonTarget` / `isTypingTarget` checks in the global handler to route to the correct handler. Alternatively, for new shortcuts, add them only to one place.

- **Selection normalization:** `normalizeHistorySelection()` strips any selected URLs not present in `getVisibleHistoryEntries()` (first 30). If selected items are somehow outside the visible window, they will silently deselect on the next `renderHistory()` call.

- **Import ordering:** Imported history items are appended with `push`, not `unshift`. They appear at the bottom of the `app.settings.history` array and beyond the visible-30 window if history is already large. This is intentional (imported items are treated as older), but means thumbnail auto-fetch on import must intersect against `getVisibleHistoryEntries()` rather than the full imported list.
