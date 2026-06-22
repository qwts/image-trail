import { displayTitleForRecord, encryptedBlobIdForRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import { createPrivacyThumbnail, PRIVACY_RECORD_META, PRIVACY_RECORD_NAME, recordTitle } from './record-metadata.js';

type HistoryAction =
  | { readonly name: 'history/pin'; readonly id: string }
  | { readonly name: 'history/remove'; readonly id: string }
  | { readonly name: 'history/delete-all' }
  | { readonly name: 'history-selection/toggle'; readonly id: string }
  | { readonly name: 'history-selection/clear' }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'history'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

interface HistoryViewOptions {
  readonly blobKeyAvailable: boolean;
  readonly listBlockSize: number | null;
  readonly onListResize: (blockSize: number) => void;
  readonly privacyMode?: boolean;
}

export function createHistoryView(
  items: readonly ImageDisplayRecord[],
  selectedIds: readonly string[],
  captureInProgress: boolean,
  blobKeyUnlocked: boolean,
  dispatch: (action: HistoryAction) => void,
  options?: HistoryViewOptions,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__history-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Recent history';

  const toolbar = document.createElement('div');
  toolbar.className = 'image-trail-panel__history-toolbar';
  if (items.length > 0) {
    const deleteAll = document.createElement('button');
    deleteAll.type = 'button';
    deleteAll.textContent = `Delete recents (${items.length})`;
    deleteAll.addEventListener('click', () => dispatch({ name: 'history/delete-all' }));
    toolbar.append(deleteAll);
  }

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  if (options?.listBlockSize !== null && options?.listBlockSize !== undefined) {
    list.classList.add('is-user-resized');
    list.style.setProperty('--image-trail-history-size', `${options.listBlockSize}px`);
  }
  list.addEventListener('pointerdown', (event) => {
    const rect = list.getBoundingClientRect();
    if (rect.bottom - event.clientY > 18) return;
    const blockSize = Math.round(rect.height);
    list.classList.add('is-user-resized');
    list.style.setProperty('--image-trail-history-size', `${blockSize}px`);
  });
  list.addEventListener('mouseup', () => {
    if (!list.classList.contains('is-user-resized')) return;
    options?.onListResize(Math.round(list.getBoundingClientRect().height));
  });
  for (const item of items) {
    const capturedBlobId = encryptedBlobIdForRecord(item);
    const encryptedRecord = isEncryptedRecord(item);
    const keyUnavailable = encryptedRecord && !blobKeyUnlocked;
    const keyMissing = options?.blobKeyAvailable === false;
    const lockedEncrypted = isLockedEncryptedRecord(item, blobKeyUnlocked);
    const previewableEncrypted = isPreviewableEncryptedRecord(item, blobKeyUnlocked);
    const selected = selectedIds.includes(item.id);
    const entry = document.createElement('li');
    entry.className = 'image-trail-panel__history-item';
    if (options?.privacyMode && item.privacyStatus !== 'locked') entry.classList.add('is-privacy-masked');
    if (previewableEncrypted) entry.classList.add('is-captured');
    if (selected) entry.classList.add('is-selected');
    entry.setAttribute('aria-selected', String(selected));
    entry.addEventListener('click', (event) => {
      if (!isMultiSelectClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      dispatch({ name: 'history-selection/toggle', id: item.id });
    });
    if (keyUnavailable) {
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
        if (selectedIds.length > 0) dispatch({ name: 'history-selection/clear' });
        dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId });
      });
      entry.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        if (selectedIds.length > 0) dispatch({ name: 'history-selection/clear' });
        dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId });
      });
    }
    const visual = createRecordVisual(item, options);
    const link = document.createElement('span');
    link.className = 'image-trail-panel__record-link';
    link.textContent = options?.privacyMode && item.privacyStatus !== 'locked' ? PRIVACY_RECORD_NAME : (item.label ?? item.url);
    link.title = options?.privacyMode && item.privacyStatus !== 'locked' ? recordTitle(item, options) : displayTitleForRecord(item);
    if (options?.privacyMode && item.privacyStatus !== 'locked') {
      const meta = document.createElement('span');
      meta.className = 'image-trail-panel__record-row-meta';
      meta.textContent = PRIVACY_RECORD_META;
      meta.title = meta.textContent;
      link.append(document.createElement('br'), meta);
    }

    const actions = document.createElement('span');
    actions.className = 'image-trail-panel__item-actions';
    actions.addEventListener('keydown', (event) => event.stopPropagation());

    if (!keyUnavailable && !lockedEncrypted) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.textContent = 'Pin';
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'history/pin', id: item.id });
      });
      actions.append(pin);
    }

    if (item.captureStatus === 'captured' && item.blobId && !keyMissing) {
      const deleteCapture = document.createElement('button');
      deleteCapture.type = 'button';
      deleteCapture.textContent = 'Delete original';
      deleteCapture.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'capture/delete', id: item.id, blobId: item.blobId! });
      });
      actions.append(deleteCapture);
    } else if (blobKeyUnlocked) {
      const capture = document.createElement('button');
      capture.type = 'button';
      capture.textContent = 'Capture';
      capture.disabled = captureInProgress;
      capture.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'capture/request', url: item.url, sourceType: 'history', sourceRecordId: item.id });
      });
      actions.append(capture);
    }

    if (!keyMissing || item.captureStatus === 'captured') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'history/remove', id: item.id });
      });
      actions.append(remove);
    }
    entry.append(visual, link, actions);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent = 'Loaded images will appear here newest-first.';
  const selectionMeta = document.createElement('p');
  selectionMeta.className = 'image-trail-panel__meta';
  selectionMeta.textContent =
    selectedIds.length > 0
      ? `${selectedIds.length} recent item(s) selected for export.`
      : 'Cmd/Ctrl-click rows to select recent items for export.';
  section.append(heading, toolbar, items.length ? selectionMeta : empty);
  if (items.length) section.append(list);
  return section;
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
  fallback.textContent = 'IMG';
  return fallback;
}

function isMultiSelectClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey;
}
