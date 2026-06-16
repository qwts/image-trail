# Architecture Notes

## Key Data Structures

### `app` object (global state)
- `app.settings.history` — array of history entries, NEWEST FIRST (index 0). Entries have: `url`, `title`, `label`, `thumbnail`, `timestamp`, `downloadedAt`.
- `app.settings.favorites` — array of favorite entries, same shape as history.
- `app.settings.panelSections` — map of section IDs to booleans (expanded/collapsed). Persisted in localStorage.
- `app.settings.showHistoryThumbnails` — boolean controlling thumbnail column in history list.
- `app.thumbnailCache` — in-memory map of `url → dataUrl` thumbnail strings.
- `app.thumbnailInflight` — in-memory map of `url → Promise` for deduplication of concurrent thumbnail fetches.
- `app.selectedHistoryUrls` — array of selected history item URLs.
- `app.historyFocusedUrl` — the URL of the currently keyboard-focused history item.
- `app.historySelectionAnchorUrl` — anchor for shift-click range selection.

### History ordering
`addHistory(url)` uses `unshift` to prepend the new item — newest items are at index 0. `getVisibleHistoryEntries()` returns `app.settings.history.slice(0, 30)`, so the **first 30 entries** are the 30 most recent.

**Important:** The import handler uses `push` (not `unshift`), so imported items land at the **end** of the array and may not be visible in the first-30 window if there is already a large history.

## Rendering Model

The panel is built once by `renderPanel()` at init. It creates stable container elements:
- `app.historyEl` — container for the History section content
- `app.favoritesEl` — container for the Favorites section content
- `app.fieldsEl` — container for the Fields section content

`renderHistory()`, `renderFavorites()`, and `renderFields()` do `el.innerHTML = ''` and rebuild their container's content in place. They do **not** recreate the section wrappers or toggle buttons — those are stable DOM.

`renderAll()` calls all three plus syncs the URL/domain inputs.

### Re-render triggers
- `updateHistoryForUrl(url, patch)` — mutates a history entry in place, calls `saveState()` + `renderHistory()` if anything changed.
- `updateFavoriteForUrl(url, patch)` — same pattern for favorites.
- `cacheThumbnailForUrl(url, thumbnail)` — calls both `updateFavoriteForUrl` and `updateHistoryForUrl`, potentially triggering two re-renders.

## Event Handling: Capture Phase

The global keyboard handler is registered in **capture phase**:

```js
document.addEventListener('keydown', onKeyDown, true)  // true = capture
```

This means `onKeyDown` runs **before** any element's own `onkeydown` handler (target/bubble phase). Crucially, `stopPropagation()` called inside `onKeyDown` stops further capture-phase propagation but does **not** prevent the target element's own handlers from running. This is a subtle but important distinction.

**Consequence:** Any keyboard shortcut handled in both the global capture listener and a specific element's inline handler will fire **twice**.

## Section Expand/Collapse State

Section expanded state is stored in `app.settings.panelSections[sectionId]`. Toggling a section calls `setSectionExpanded(sectionId, expanded)` which writes to `app.settings` and calls `saveState()`. The `section()` helper reads the initial state via `isSectionExpanded(sectionId)` — it is only called once at `renderPanel()` time. Subsequent re-renders (`renderHistory()` etc.) do not re-call `section()` and therefore do not affect expand/collapse state.

## Thumbnail Fetching

`ensureThumbnailForUrl(url, sourceImage)`:
1. Returns cached result if available.
2. Returns in-flight promise if already fetching.
3. Otherwise: tries to generate a thumbnail from `sourceImage` (the currently loaded `<img>`), then falls back to fetching the image blob from `url` and resizing via canvas.
4. On success, calls `cacheThumbnailForUrl(url, thumbnail)` which persists the thumbnail to both the history and favorites entries and saves state.

If called with `sourceImage = app.targetImg` for a URL that does not match the currently displayed image, the function will still use `app.targetImg` to generate the thumbnail if `sourceImage` is loaded — this can create **wrong thumbnails** (the currently displayed image's thumbnail stored against a different URL). This primarily affects the LLM image-input path (`getImageInputForLlm`) rather than the visible thumbnail in the history list.
