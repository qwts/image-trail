import { encryptedBlobIdForRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import { createPrivacyThumbnail, recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from './record-metadata.js';
import { registerPreviewRowClick } from './record-row-preview-click.js';
import { selectedRangeIds } from './selection-ranges.js';

type BookmarkAction =
  | { readonly name: 'pin/current' }
  | { readonly name: 'bookmark/current' }
  | { readonly name: 'bookmark/load'; readonly id: string }
  | { readonly name: 'bookmark/remove'; readonly id: string }
  | { readonly name: 'bookmark/clear'; readonly id: string }
  | { readonly name: 'bookmark-selection/toggle'; readonly id: string }
  | { readonly name: 'bookmark-selection/single'; readonly id: string }
  | { readonly name: 'bookmark-selection/select'; readonly ids: readonly string[]; readonly mode?: 'replace' | 'add' }
  | { readonly name: 'bookmark-selection/clear' }
  | { readonly name: 'bookmarks/older' }
  | { readonly name: 'bookmarks/newer' }
  | { readonly name: 'bookmarks/toggle-scope' }
  | { readonly name: 'bookmarks/clear-visible' }
  | { readonly name: 'bookmarks/reload' }
  | { readonly name: 'bookmarks/refresh-thumbnails' }
  | { readonly name: 'gallery/open' }
  | { readonly name: 'recall/open'; readonly side: 'left' | 'right' }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'bookmark'; readonly sourceRecordId: string }
  | {
      readonly name: 'capture/preview';
      readonly url: string;
      readonly blobId?: string | undefined;
      readonly scrollAnchorId?: string | undefined;
    }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string }
  | { readonly name: 'panel/bookmarks-section-open'; readonly open: boolean };

export function createBookmarksView(
  currentUrl: string | null,
  items: readonly ImageDisplayRecord[],
  selectedIds: readonly string[],
  captureInProgress: boolean,
  blobKeyUnlocked: boolean,
  blobKeyAvailable: boolean,
  visibilityScope: 'global' | 'site',
  page: {
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  },
  recall: { readonly recallOpen: boolean },
  options: { readonly privacyMode?: boolean; readonly sectionOpen?: boolean },
  dispatch: (action: BookmarkAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__bookmarks-section';

  const sectionOpen = options.sectionOpen !== false;
  const heading = document.createElement('h3');
  const headingToggle = document.createElement('button');
  headingToggle.type = 'button';
  headingToggle.className = 'image-trail-panel__section-heading-toggle';
  headingToggle.textContent = 'Queue';
  headingToggle.setAttribute('aria-expanded', String(sectionOpen));
  headingToggle.title = sectionOpen ? 'Hide the Queue list' : 'Show the Queue list';
  headingToggle.addEventListener('click', (event) => {
    event.preventDefault();
    dispatch({ name: 'panel/bookmarks-section-open', open: !sectionOpen });
  });
  heading.append(headingToggle);
  const header = document.createElement('div');
  header.className =
    'image-trail-panel__section-header image-trail-panel__section-header--with-actions image-trail-panel__section-header--collapsible';
  header.dataset['open'] = String(sectionOpen);
  header.append(heading);

  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Pin current';
  add.title = 'Save the current image URL and thumbnail to the durable queue without capturing original bytes.';
  add.disabled = currentUrl === null;
  add.addEventListener('click', () => dispatch({ name: 'pin/current' }));

  const recallButton = document.createElement('button');
  recallButton.type = 'button';
  recallButton.textContent = recall.recallOpen ? 'Close Recall' : 'Recall';
  recallButton.className = 'image-trail-panel__primary-action';
  recallButton.disabled = page.total === 0;
  recallButton.title = 'Browse offloaded queue records and recall selected rows into the visible queue.';
  recallButton.addEventListener('click', () => dispatch({ name: 'recall/open', side: 'right' }));

  const queueMenu = document.createElement('details');
  queueMenu.className = 'image-trail-panel__queue-menu';

  const queueMenuSummary = document.createElement('summary');
  queueMenuSummary.textContent = 'Queue';
  queueMenuSummary.title = 'Queue scope and maintenance actions.';
  queueMenu.append(queueMenuSummary);

  const queueMenuActions = document.createElement('div');
  queueMenuActions.className = 'image-trail-panel__queue-menu-actions';

  const refreshThumbnails = document.createElement('button');
  refreshThumbnails.type = 'button';
  refreshThumbnails.textContent = 'Refresh thumbnails';
  refreshThumbnails.disabled = items.length === 0;
  refreshThumbnails.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmarks/refresh-thumbnails' });
  });

  const scope = document.createElement('button');
  scope.type = 'button';
  scope.textContent = visibilityScope === 'global' ? 'Showing all sites' : 'Showing this site';
  scope.title = visibilityScope === 'global' ? 'Showing saved queue rows from every site.' : 'Showing saved queue rows for this site only.';
  scope.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmarks/toggle-scope' });
  });

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload queue';
  reload.title = 'Reload saved queue rows from storage.';
  reload.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmarks/reload' });
  });

  const gallery = document.createElement('button');
  gallery.type = 'button';
  gallery.textContent = 'Open gallery';
  gallery.title = 'Browse the durable image library in a dedicated tab.';
  gallery.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'gallery/open' });
  });

  const selectAllQueue = document.createElement('button');
  selectAllQueue.type = 'button';
  selectAllQueue.textContent = 'Select all queue';
  selectAllQueue.disabled = items.length === 0;
  selectAllQueue.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmark-selection/select', ids: items.map((item) => item.id) });
  });

  const queuePins = items.filter((item) => !isCapturedOriginalRecord(item));
  const selectPins = document.createElement('button');
  selectPins.type = 'button';
  selectPins.textContent = 'Select queue pins';
  selectPins.disabled = queuePins.length === 0;
  selectPins.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmark-selection/select', ids: queuePins.map((item) => item.id) });
  });

  const queueBookmarks = items.filter(isCapturedOriginalRecord);
  const selectBookmarks = document.createElement('button');
  selectBookmarks.type = 'button';
  selectBookmarks.textContent = 'Select captured bookmarks';
  selectBookmarks.disabled = queueBookmarks.length === 0;
  selectBookmarks.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmark-selection/select', ids: queueBookmarks.map((item) => item.id) });
  });

  const clearQueue = document.createElement('button');
  clearQueue.type = 'button';
  clearQueue.textContent = 'Clear queue';
  clearQueue.title = 'Hide the currently visible queue rows until the queue is reloaded.';
  clearQueue.disabled = items.length === 0;
  clearQueue.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmarks/clear-visible' });
  });

  queueMenuActions.append(scope, reload, gallery, selectAllQueue, selectPins, selectBookmarks, refreshThumbnails, clearQueue);
  queueMenu.append(queueMenuActions);

  const toolbar = document.createElement('div');
  toolbar.className = 'image-trail-panel__bookmark-toolbar';
  toolbar.append(add, recallButton, queueMenu);

  const pageMeta = document.createElement('p');
  pageMeta.className = 'image-trail-panel__meta';
  const pageStart = page.total === 0 ? 0 : page.offset + 1;
  const pageEnd = Math.min(page.offset + page.limit, page.total);
  pageMeta.textContent = `Queue ${pageStart}-${pageEnd} of ${page.total} (${visibilityScope === 'global' ? 'all sites' : 'this site'})`;

  const statusRow = document.createElement('div');
  statusRow.className = 'image-trail-panel__bookmark-status-row';

  const pager = document.createElement('div');
  pager.className = 'image-trail-panel__bookmark-pager';
  const newer = document.createElement('button');
  newer.type = 'button';
  newer.textContent = 'Newer';
  newer.disabled = !page.hasNewer;
  newer.addEventListener('click', () => dispatch({ name: 'bookmarks/newer' }));
  const older = document.createElement('button');
  older.type = 'button';
  older.textContent = 'Older';
  older.disabled = !page.hasOlder;
  older.addEventListener('click', () => dispatch({ name: 'bookmarks/older' }));
  pager.append(newer, older);
  statusRow.append(pageMeta, pager);

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  for (const item of items) {
    const capturedBlobId = encryptedBlobIdForRecord(item);
    const privatePlaceholder = item.privacyStatus === 'locked';
    const encryptedRecord = isEncryptedRecord(item);
    const keyUnavailable = encryptedRecord && !blobKeyUnlocked;
    const keyMissing = !blobKeyAvailable;
    const lockedEncrypted = isLockedEncryptedRecord(item, blobKeyUnlocked);
    const previewableEncrypted = isPreviewableEncryptedRecord(item, blobKeyUnlocked);
    const selected = selectedIds.includes(item.id);
    const entry = document.createElement('li');
    entry.className = 'image-trail-panel__bookmark-item';
    entry.dataset['imageTrailScrollAnchor'] = `bookmark:${item.id}`;
    entry.dataset['imageTrailRowId'] = item.id;
    if (options.privacyMode && !privatePlaceholder) entry.classList.add('is-privacy-masked');
    if (previewableEncrypted) entry.classList.add('is-captured');
    if (selected) entry.classList.add('is-selected');
    entry.setAttribute('aria-selected', String(selected));
    entry.addEventListener('click', (event) => {
      if (!isSelectionClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.shiftKey) {
        dispatch({
          name: 'bookmark-selection/select',
          ids: selectedRangeIds(
            items.map((record) => record.id),
            selectedIds,
            item.id,
          ),
          mode: 'add',
        });
        return;
      }
      dispatch({ name: 'bookmark-selection/toggle', id: item.id });
    });
    if (privatePlaceholder) {
      entry.classList.add('is-locked-encrypted');
      entry.setAttribute('aria-disabled', 'true');
      entry.title = 'Unlock encrypted originals before using this private pin.';
    } else if (keyUnavailable) {
      entry.classList.add('is-locked-encrypted');
      entry.classList.add('is-key-unavailable');
      entry.setAttribute('aria-disabled', 'true');
      entry.title = keyMissing
        ? 'Import the encrypted originals key backup before using this row.'
        : 'Unlock encrypted originals before using this row.';
    } else if (lockedEncrypted) {
      entry.classList.add('is-locked-encrypted');
      entry.setAttribute('aria-disabled', 'true');
      entry.title = 'Unlock encrypted originals before previewing this row.';
    } else {
      entry.tabIndex = 0;
      entry.setAttribute('role', 'button');
      entry.title =
        'Click to select this row. Double-click or press Enter to preview it. Cmd/Ctrl-click selects for export. Shift-click selects a range.';
      entry.addEventListener('click', (event) => {
        if (isSelectionClick(event)) return;
        event.preventDefault();
        if (!registerPreviewRowClick(`bookmark:${item.id}`) || !selected || selectedIds.length !== 1) {
          dispatch({ name: 'bookmark-selection/single', id: item.id });
          return;
        }
        dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId, scrollAnchorId: `bookmark:${item.id}` });
      });
      entry.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          selectAdjacentBookmarkRow(items, item.id, event.key === 'ArrowDown' ? 1 : -1, dispatch);
          return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (!selected || selectedIds.length !== 1) {
          dispatch({ name: 'bookmark-selection/single', id: item.id });
          return;
        }
        dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId, scrollAnchorId: `bookmark:${item.id}` });
      });
    }
    const visual = createRecordVisual(item, options);
    const bookmarkLabel = document.createElement('div');
    bookmarkLabel.className = 'image-trail-panel__bookmark-label';
    const source = createExtensionIndicator(item);
    const label = document.createElement('span');
    label.className = 'image-trail-panel__bookmark-name';
    label.textContent = recordDisplayName(item, options);
    label.title = recordTitle(item, options);
    const meta = document.createElement('span');
    meta.className = 'image-trail-panel__record-row-meta';
    meta.textContent = recordMetadataText(item, options);
    meta.title = meta.textContent;
    bookmarkLabel.append(source, label, meta);

    const actions = document.createElement('span');
    actions.className = 'image-trail-panel__item-actions';
    actions.addEventListener('click', (event) => event.stopPropagation());
    actions.addEventListener('keydown', (event) => event.stopPropagation());

    if (item.captureStatus !== 'captured' && blobKeyUnlocked) {
      const capture = document.createElement('button');
      capture.type = 'button';
      capture.textContent = captureInProgress ? 'Capturing...' : 'Capture';
      capture.disabled = captureInProgress;
      capture.classList.toggle('is-waiting', captureInProgress);
      capture.addEventListener('click', () =>
        dispatch({ name: 'capture/request', url: item.url, sourceType: 'bookmark', sourceRecordId: item.id }),
      );
      actions.append(capture);
    }

    if (item.captureStatus === 'captured' && item.blobId && !keyMissing) {
      const blobId = item.blobId;
      const deleteCapture = document.createElement('button');
      deleteCapture.type = 'button';
      deleteCapture.className = 'image-trail-panel__delete-original';
      deleteCapture.textContent = 'Delete original';
      deleteCapture.title = 'Delete original from encrypted storage.';
      deleteCapture.addEventListener('click', () => {
        if (deleteCapture.dataset['confirming'] !== 'true') {
          deleteCapture.dataset['confirming'] = 'true';
          deleteCapture.textContent = 'Confirm delete original';
          deleteCapture.title = 'Click again to delete original from encrypted storage.';
          return;
        }
        dispatch({ name: 'capture/delete', id: item.id, blobId });
      });
      actions.append(deleteCapture);
    }

    if (!keyMissing || item.captureStatus === 'captured') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.title = 'Delete this durable queue row. Linked originals follow reference-count cleanup rules.';
      remove.className = 'is-danger';
      remove.addEventListener('click', () => dispatch({ name: 'bookmark/remove', id: item.id }));
      actions.append(remove);

      const clear = document.createElement('button');
      clear.type = 'button';
      bindBookmarkClearButton(clear, item.id, dispatch);
      actions.append(clear);
    }
    entry.append(visual, bookmarkLabel, actions);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent =
    visibilityScope === 'global'
      ? 'No saved queue rows loaded from storage.'
      : 'No saved queue rows match this site. Switch to All sites to show every saved queue row.';
  const selectionMeta = document.createElement('p');
  selectionMeta.className = 'image-trail-panel__meta';
  selectionMeta.textContent =
    selectedIds.length > 0
      ? `${selectedIds.length} queue row(s) selected for export.`
      : 'Cmd/Ctrl-click rows to select queue rows for export. Shift-click selects a range.';
  // The toolbar lives in the header row (#430) so the heading line carries the section's actions
  // instead of leaving a dead row above a full-width button strip.
  header.append(toolbar);
  section.append(header);
  // Collapsed (#438): the header row (heading toggle + actions + detach) stays; the content hides.
  if (sectionOpen) {
    section.append(statusRow, items.length ? selectionMeta : empty);
    if (items.length) section.append(list);
  }
  return section;
}

function createRecordVisual(item: ImageDisplayRecord, options: { readonly privacyMode?: boolean } = {}): HTMLElement {
  if (options.privacyMode && item.privacyStatus !== 'locked') return createPrivacyThumbnail();
  if (item.thumbnail) {
    const image = document.createElement('img');
    image.className = 'image-trail-panel__record-thumbnail';
    image.src = item.thumbnail;
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }

  const fallback = document.createElement('span');
  fallback.className = 'image-trail-panel__record-thumbnail image-trail-panel__record-thumbnail--empty';
  fallback.textContent = extensionLabelFor(item).slice(0, 4);
  return fallback;
}

export function extensionLabelFor(item: ImageDisplayRecord): string {
  return recordExtensionLabel(item);
}

export function createExtensionIndicator(item: ImageDisplayRecord): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'image-trail-panel__record-extension-wrap';

  const source = document.createElement('span');
  source.className = 'image-trail-panel__bookmark-source';
  source.textContent = extensionLabelFor(item);
  source.title = source.textContent;
  wrapper.append(source);

  if (item.storedOriginal || item.captureStatus === 'captured') {
    const dot = document.createElement('span');
    dot.className = 'image-trail-panel__stored-original-dot';
    dot.title = 'Original stored';
    wrapper.append(dot);
  }

  return wrapper;
}

function isLockedEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && !blobKeyUnlocked;
}

function isEncryptedRecord(item: ImageDisplayRecord): boolean {
  return !!encryptedBlobIdForRecord(item);
}

function isPreviewableEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && blobKeyUnlocked;
}

function isSelectionClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey;
}

function selectAdjacentBookmarkRow(
  items: readonly ImageDisplayRecord[],
  currentId: string,
  delta: -1 | 1,
  dispatch: (action: BookmarkAction) => void,
): void {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  const next = items[currentIndex + delta];
  if (!next) return;
  dispatch({ name: 'bookmark-selection/single', id: next.id });
  focusRecordRow(next.id);
}

/* c8 ignore start */
function focusRecordRow(id: string): void {
  queueMicrotask(() => {
    const row = findRecordRow(id);
    if (row) row.focus();
  });
}

function findRecordRow(id: string): HTMLElement | null {
  for (const candidate of document.querySelectorAll('[data-image-trail-row-id]')) {
    if (!(candidate instanceof HTMLElement)) continue;
    if (candidate.dataset['imageTrailRowId'] === id) {
      return candidate;
    }
  }
  return null;
}
/* c8 ignore stop */

export function bookmarkRowClearAction(): 'bookmark/clear' {
  return 'bookmark/clear';
}

export function bookmarkRowClearLabel(): 'Clear' {
  return 'Clear';
}

function updateBookmarkClearButton(button: HTMLButtonElement): void {
  button.textContent = 'Clear';
  button.title = 'Hide this queue row until bookmarks are reloaded.';
  button.classList.remove('is-danger');
}

function bindBookmarkClearButton(button: HTMLButtonElement, id: string, dispatch: (action: BookmarkAction) => void): void {
  updateBookmarkClearButton(button);
  button.addEventListener('click', () => {
    dispatch({ name: 'bookmark/clear', id });
  });
}

export function isCapturedOriginalRecord(item: ImageDisplayRecord): boolean {
  return item.captureStatus === 'captured' || !!item.storedOriginal || item.protectedPin?.hasStoredOriginal === true;
}

export function queueRecordKindLabel(item: ImageDisplayRecord): 'Pin' | 'Captured bookmark' {
  return isCapturedOriginalRecord(item) ? 'Captured bookmark' : 'Pin';
}
