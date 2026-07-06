// Previewing/projecting a Recents or queue row requires a REAL double-click (#426). Native
// `dblclick` can't be used: the first click's selection dispatch rerenders the panel and swaps the
// row element between the two clicks, so the browser never sees two clicks on one node. Instead
// the last row click is tracked at module level (it survives the rerender) and the second click
// counts only when it lands on the same row within the window. Without this, ANY later click on a
// still-selected row — even minutes later — projected the image.
const PREVIEW_DOUBLE_CLICK_WINDOW_MS = 500;

let lastRowClick: { readonly key: string; readonly at: number } | null = null;

/**
 * Records a non-selection click on a preview-capable row and reports whether it completes a
 * double-click on that row. A completed double-click resets the tracker so a third rapid click
 * starts a fresh pair instead of chaining previews.
 */
export function registerPreviewRowClick(key: string, now = Date.now()): boolean {
  const isDoubleClick = lastRowClick !== null && lastRowClick.key === key && now - lastRowClick.at <= PREVIEW_DOUBLE_CLICK_WINDOW_MS;
  lastRowClick = isDoubleClick ? null : { key, at: now };
  return isDoubleClick;
}

/** Test seam: the module-level tracker would otherwise leak double-click state between tests. */
export function resetPreviewRowClickTracking(): void {
  lastRowClick = null;
}
