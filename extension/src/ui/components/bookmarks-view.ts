import { encryptedBlobIdForRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import { createPrivacyThumbnail, recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from './record-metadata.js';

type BookmarkAction =
  | { readonly name: 'bookmark/current' }
  | { readonly name: 'bookmark/load'; readonly id: string }
  | { readonly name: 'bookmark/clear'; readonly id: string }
  | { readonly name: 'bookmark-selection/toggle'; readonly id: string }
  | { readonly name: 'bookmark-selection/single'; readonly id: string }
  | { readonly name: 'bookmark-selection/clear' }
  | { readonly name: 'bookmarks/older' }
  | { readonly name: 'bookmarks/newer' }
  | { readonly name: 'bookmarks/toggle-scope' }
  | { readonly name: 'bookmarks/clear-visible' }
  | { readonly name: 'bookmarks/reload' }
  | { readonly name: 'bookmarks/refresh-thumbnails' }
  | { readonly name: 'recall/open'; readonly side: 'left' | 'right' }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'bookmark'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string; readonly scrollAnchorId?: string }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

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
  options: { readonly privacyMode?: boolean },
  dispatch: (action: BookmarkAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__bookmarks-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Bookmarks';

  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Bookmark current';
  add.disabled = currentUrl === null;
  add.addEventListener('click', () => dispatch({ name: 'bookmark/current' }));

  const recallButton = document.createElement('button');
  recallButton.type = 'button';
  recallButton.textContent = recall.recallOpen ? 'Close Recall' : 'Recall';
  recallButton.className = 'image-trail-panel__primary-action';
  recallButton.disabled = page.total === 0;
  recallButton.title = 'Browse offloaded bookmark queue records and recall selected rows into the visible queue.';
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
  scope.title = visibilityScope === 'global' ? 'Showing saved bookmarks from every site.' : 'Showing saved bookmarks for this site only.';
  scope.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmarks/toggle-scope' });
  });

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload bookmarks';
  reload.title = 'Reload saved bookmarks from encrypted storage.';
  reload.addEventListener('click', () => {
    queueMenu.open = false;
    dispatch({ name: 'bookmarks/reload' });
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

  queueMenuActions.append(scope, reload, refreshThumbnails, clearQueue);
  queueMenu.append(queueMenuActions);

  const toolbar = document.createElement('div');
  toolbar.className = 'image-trail-panel__bookmark-toolbar';
  toolbar.append(add, recallButton, queueMenu);

  const pageMeta = document.createElement('p');
  pageMeta.className = 'image-trail-panel__meta';
  const pageStart = page.total === 0 ? 0 : page.offset + 1;
  const pageEnd = Math.min(page.offset + page.limit, page.total);
  pageMeta.textContent = `Bookmarks ${pageStart}-${pageEnd} of ${page.total} (${visibilityScope === 'global' ? 'all sites' : 'this site'})`;

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
    entry.dataset.imageTrailScrollAnchor = `bookmark:${item.id}`;
    if (options.privacyMode && !privatePlaceholder) entry.classList.add('is-privacy-masked');
    if (previewableEncrypted) entry.classList.add('is-captured');
    if (selected) entry.classList.add('is-selected');
    entry.setAttribute('aria-selected', String(selected));
    entry.addEventListener('click', (event) => {
      if (!isMultiSelectClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
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
      entry.title = 'Preview this image in the selected host image. Cmd/Ctrl-click to select for export.';
      entry.addEventListener('click', (event) => {
        if (isMultiSelectClick(event)) return;
        dispatch({ name: 'bookmark-selection/single', id: item.id });
        dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId, scrollAnchorId: `bookmark:${item.id}` });
      });
      entry.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        dispatch({ name: 'bookmark-selection/single', id: item.id });
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

    if (item.captureStatus === 'captured' && item.blobId && !keyMissing) {
      const deleteCapture = document.createElement('button');
      deleteCapture.type = 'button';
      deleteCapture.textContent = 'Delete original';
      deleteCapture.addEventListener('click', () => dispatch({ name: 'capture/delete', id: item.id, blobId: item.blobId! }));
      actions.append(deleteCapture);
    } else if (blobKeyUnlocked) {
      const capture = document.createElement('button');
      capture.type = 'button';
      capture.textContent = 'Capture';
      capture.disabled = captureInProgress;
      capture.addEventListener('click', () =>
        dispatch({ name: 'capture/request', url: item.url, sourceType: 'bookmark', sourceRecordId: item.id }),
      );
      actions.append(capture);
    }

    if (!keyMissing || item.captureStatus === 'captured') {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.textContent = 'Clear';
      clear.title = 'Hide this queue row until bookmarks are reloaded.';
      clear.addEventListener('click', () => dispatch({ name: 'bookmark/clear', id: item.id }));
      actions.append(clear);
    }
    entry.append(visual, bookmarkLabel, actions);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent =
    visibilityScope === 'global'
      ? 'No saved bookmarks loaded from encrypted storage.'
      : 'No saved bookmarks match this site. Switch to All sites to show every saved bookmark.';
  const selectionMeta = document.createElement('p');
  selectionMeta.className = 'image-trail-panel__meta';
  selectionMeta.textContent =
    selectedIds.length > 0
      ? `${selectedIds.length} bookmark(s) selected for export.`
      : 'Cmd/Ctrl-click rows to select bookmarks for export.';
  section.append(heading, toolbar, statusRow, items.length ? selectionMeta : empty);
  if (items.length) section.append(list);
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

function isMultiSelectClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
