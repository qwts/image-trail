import { encryptedBlobIdForRecord, type ImageDisplayRecord } from '../../core/display-records.js';

type HistoryAction =
  | { readonly name: 'history/remove'; readonly id: string }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'history'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

export function createHistoryView(
  items: readonly ImageDisplayRecord[],
  captureInProgress: boolean,
  blobKeyUnlocked: boolean,
  dispatch: (action: HistoryAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__history-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Recent history';

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  for (const item of items) {
    const capturedBlobId = encryptedBlobIdForRecord(item);
    const lockedEncrypted = isLockedEncryptedRecord(item, blobKeyUnlocked);
    const previewableEncrypted = isPreviewableEncryptedRecord(item, blobKeyUnlocked);
    const entry = document.createElement('li');
    entry.className = 'image-trail-panel__history-item';
    if (previewableEncrypted) entry.classList.add('is-captured');
    if (lockedEncrypted) {
      entry.classList.add('is-locked-encrypted');
      entry.setAttribute('aria-disabled', 'true');
      entry.title = 'Unlock encrypted originals before previewing this row.';
    } else {
      entry.tabIndex = 0;
      entry.setAttribute('role', 'button');
      entry.title = 'Preview this image in the selected host image.';
      entry.addEventListener('click', () => dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId }));
      entry.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId });
      });
    }
    const visual = createRecordVisual(item);
    const link = document.createElement('span');
    link.className = 'image-trail-panel__record-link';
    link.textContent = item.label ?? item.url;

    const actions = document.createElement('span');
    actions.className = 'image-trail-panel__item-actions';
    actions.addEventListener('click', (event) => event.stopPropagation());
    actions.addEventListener('keydown', (event) => event.stopPropagation());

    if (item.captureStatus === 'captured' && item.blobId) {
      const deleteCapture = document.createElement('button');
      deleteCapture.type = 'button';
      deleteCapture.textContent = 'Delete original';
      deleteCapture.addEventListener('click', () => dispatch({ name: 'capture/delete', id: item.id, blobId: item.blobId! }));
      actions.append(deleteCapture);
    } else {
      const capture = document.createElement('button');
      capture.type = 'button';
      capture.textContent = 'Capture';
      capture.disabled = captureInProgress;
      capture.addEventListener('click', () =>
        dispatch({ name: 'capture/request', url: item.url, sourceType: 'history', sourceRecordId: item.id }),
      );
      actions.append(capture);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => dispatch({ name: 'history/remove', id: item.id }));
    actions.append(remove);
    entry.append(visual, link, actions);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent = 'Loaded images will appear here newest-first.';
  section.append(heading, items.length ? list : empty);
  return section;
}

function isLockedEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && !blobKeyUnlocked;
}

function isPreviewableEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && blobKeyUnlocked;
}

function createRecordVisual(item: ImageDisplayRecord): HTMLElement {
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
