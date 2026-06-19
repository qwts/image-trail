import type { ImageDisplayRecord } from '../../core/display-records.js';

type HistoryAction =
  | { readonly name: 'history/remove'; readonly id: string }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'history'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly blobId: string }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

export function createHistoryView(
  items: readonly ImageDisplayRecord[],
  captureInProgress: boolean,
  dispatch: (action: HistoryAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section';

  const heading = document.createElement('h3');
  heading.textContent = 'Recent history';

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  for (const item of items) {
    const entry = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.label ?? item.url;

    const actions = document.createElement('span');
    actions.className = 'image-trail-panel__item-actions';

    if (item.captureStatus === 'captured' && item.blobId) {
      const badge = document.createElement('span');
      badge.className = 'image-trail-panel__capture-badge';
      badge.textContent = 'Stored';
      const preview = document.createElement('button');
      preview.type = 'button';
      preview.textContent = 'Preview original';
      preview.addEventListener('click', () => dispatch({ name: 'capture/preview', blobId: item.blobId! }));
      const deleteCapture = document.createElement('button');
      deleteCapture.type = 'button';
      deleteCapture.textContent = 'Delete original';
      deleteCapture.addEventListener('click', () => dispatch({ name: 'capture/delete', id: item.id, blobId: item.blobId! }));
      actions.append(badge, preview, deleteCapture);
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
    entry.append(link, actions);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent = 'Loaded images will appear here newest-first.';
  section.append(heading, items.length ? list : empty);
  return section;
}
