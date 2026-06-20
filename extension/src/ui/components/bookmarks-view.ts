import { encryptedBlobIdForRecord, imageExtensionFromUrl, imageExtensionFromValue, type ImageDisplayRecord } from '../../core/display-records.js';

type BookmarkAction =
  | { readonly name: 'bookmark/current' }
  | { readonly name: 'bookmark/load'; readonly id: string }
  | { readonly name: 'bookmark/remove'; readonly id: string }
  | { readonly name: 'bookmarks/older' }
  | { readonly name: 'bookmarks/newer' }
  | { readonly name: 'bookmarks/toggle-scope' }
  | { readonly name: 'bookmarks/reload' }
  | { readonly name: 'bookmarks/refresh-thumbnails' }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'bookmark'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

export function createBookmarksView(
  currentUrl: string | null,
  items: readonly ImageDisplayRecord[],
  captureInProgress: boolean,
  blobKeyUnlocked: boolean,
  visibilityScope: 'global' | 'site',
  page: {
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  },
  dispatch: (action: BookmarkAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section';

  const heading = document.createElement('h3');
  heading.textContent = 'Bookmarks';

  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Bookmark current image';
  add.disabled = currentUrl === null;
  add.addEventListener('click', () => dispatch({ name: 'bookmark/current' }));

  const refreshThumbnails = document.createElement('button');
  refreshThumbnails.type = 'button';
  refreshThumbnails.textContent = 'Refresh thumbnails';
  refreshThumbnails.disabled = items.length === 0;
  refreshThumbnails.addEventListener('click', () => dispatch({ name: 'bookmarks/refresh-thumbnails' }));

  const scope = document.createElement('button');
  scope.type = 'button';
  scope.textContent = visibilityScope === 'global' ? 'Scope: All sites' : 'Scope: This site';
  scope.title = visibilityScope === 'global' ? 'Showing saved bookmarks from every site.' : 'Showing saved bookmarks for this site only.';
  scope.addEventListener('click', () => dispatch({ name: 'bookmarks/toggle-scope' }));

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = 'Reload bookmarks';
  reload.title = 'Reload saved bookmarks from encrypted storage.';
  reload.addEventListener('click', () => dispatch({ name: 'bookmarks/reload' }));

  const pageMeta = document.createElement('p');
  pageMeta.className = 'image-trail-panel__meta';
  const pageStart = page.total === 0 ? 0 : page.offset + 1;
  const pageEnd = Math.min(page.offset + page.limit, page.total);
  pageMeta.textContent = `Bookmarks ${pageStart}-${pageEnd} of ${page.total} (${visibilityScope === 'global' ? 'all sites' : 'this site'})`;

  const pager = document.createElement('div');
  pager.className = 'image-trail-panel__actions';
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

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  for (const item of items) {
    const capturedBlobId = encryptedBlobIdForRecord(item);
    const lockedEncrypted = isLockedEncryptedRecord(item, blobKeyUnlocked);
    const previewableEncrypted = isPreviewableEncryptedRecord(item, blobKeyUnlocked);
    const entry = document.createElement('li');
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
    const bookmarkLabel = document.createElement('div');
    bookmarkLabel.className = 'image-trail-panel__bookmark-label';
    const source = document.createElement('span');
    source.className = 'image-trail-panel__bookmark-source';
    source.textContent = extensionLabelFor(item);
    const label = document.createElement('span');
    label.className = 'image-trail-panel__bookmark-name';
    label.textContent = item.label ?? item.url;
    bookmarkLabel.append(source, label);

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
        dispatch({ name: 'capture/request', url: item.url, sourceType: 'bookmark', sourceRecordId: item.id }),
      );
      actions.append(capture);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => dispatch({ name: 'bookmark/remove', id: item.id }));
    actions.append(remove);
    entry.append(visual, bookmarkLabel, actions);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent =
    visibilityScope === 'global'
      ? 'No saved bookmarks loaded from encrypted storage.'
      : 'No saved bookmarks match this site. Switch to All sites to show every saved bookmark.';
  section.append(heading, add, refreshThumbnails, scope, reload, pageMeta, pager, items.length ? list : empty);
  return section;
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
  fallback.textContent = extensionLabelFor(item).slice(0, 4);
  return fallback;
}

export function extensionLabelFor(item: ImageDisplayRecord): string {
  const extension = imageExtensionFromValue(item.label) ?? imageExtensionFromUrl(item.url);
  return extension ? extension.toUpperCase() : 'IMAGE';
}

function isLockedEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && !blobKeyUnlocked;
}

function isPreviewableEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && blobKeyUnlocked;
}
