import type { ImageDisplayRecord } from '../core/display-records.js';
import { recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from '../ui/components/record-metadata.js';
import { galleryRecordKind, openActionForGalleryRecord } from './gallery-model.js';

export interface GalleryViewState {
  readonly items: readonly ImageDisplayRecord[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
  readonly loading: boolean;
  readonly message: string | null;
  readonly blobKeyUnlocked: boolean;
  readonly privacyMode: boolean;
}

export interface GalleryViewHandlers {
  readonly openRecord: (record: ImageDisplayRecord) => void;
  readonly loadPage: (offset: number) => void;
  readonly reload: () => void;
}

export function createGalleryView(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'image-trail-gallery';
  shell.append(createHeader(state, handlers), createStatus(state), createGrid(state, handlers));
  return shell;
}

function createHeader(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-gallery__header';

  const titleGroup = document.createElement('div');
  const title = document.createElement('h1');
  title.textContent = 'Image Trail Gallery';
  const meta = document.createElement('p');
  meta.textContent = pageText(state);
  titleGroup.append(title, meta);

  const controls = document.createElement('div');
  controls.className = 'image-trail-gallery__controls';
  const newer = createPageButton('Newer', state.hasNewer && !state.loading, () => {
    handlers.loadPage(Math.max(0, state.offset - state.limit));
  });
  const older = createPageButton('Older', state.hasOlder && !state.loading, () => {
    handlers.loadPage(state.offset + state.limit);
  });
  const reload = createPageButton('Reload', !state.loading, handlers.reload);
  controls.append(newer, older, reload);

  header.append(titleGroup, controls);
  return header;
}

function createStatus(state: GalleryViewState): HTMLElement {
  const status = document.createElement('p');
  status.className = 'image-trail-gallery__status';
  status.setAttribute('role', 'status');
  status.textContent =
    state.message ?? (state.loading ? 'Loading library...' : state.total === 0 ? 'No durable pins or bookmarks yet.' : '');
  return status;
}

function createGrid(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'image-trail-gallery__grid';
  list.setAttribute('aria-label', 'Durable image library');
  if (state.loading && state.items.length === 0) return list;

  for (const record of state.items) {
    list.append(createCard(record, state, handlers));
  }
  return list;
}

function createCard(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'image-trail-gallery__card';

  const action = openActionForGalleryRecord(record, { blobKeyUnlocked: state.blobKeyUnlocked });
  const disabledReason = action.kind === 'locked' || action.kind === 'unsupported' ? action.message : null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trail-gallery__card-button';
  button.disabled = disabledReason !== null;
  button.title = disabledReason ?? recordTitle(record, state);
  button.addEventListener('click', () => handlers.openRecord(record));

  button.append(createVisual(record, state), createBody(record, state, disabledReason));
  item.append(button);
  return item;
}

function createVisual(record: ImageDisplayRecord, state: GalleryViewState): HTMLElement {
  if (record.thumbnail && record.privacyStatus !== 'locked' && !state.privacyMode) {
    const image = document.createElement('img');
    image.className = 'image-trail-gallery__thumbnail';
    image.src = record.thumbnail;
    image.alt = recordDisplayName(record, state);
    image.loading = 'lazy';
    return image;
  }

  const fallback = document.createElement('span');
  fallback.className = 'image-trail-gallery__thumbnail image-trail-gallery__thumbnail--fallback';
  fallback.textContent = state.privacyMode && record.privacyStatus !== 'locked' ? 'PRIVATE' : recordExtensionLabel(record);
  return fallback;
}

function createBody(record: ImageDisplayRecord, state: GalleryViewState, disabledReason: string | null): HTMLElement {
  const body = document.createElement('span');
  body.className = 'image-trail-gallery__card-body';

  const name = document.createElement('span');
  name.className = 'image-trail-gallery__card-title';
  name.textContent = recordDisplayName(record, state);

  const meta = document.createElement('span');
  meta.className = 'image-trail-gallery__card-meta';
  meta.textContent = [galleryRecordKind(record), recordMetadataText(record, state)].filter(Boolean).join(' | ');

  body.append(name, meta);
  if (disabledReason) {
    const reason = document.createElement('span');
    reason.className = 'image-trail-gallery__card-warning';
    reason.textContent = disabledReason;
    body.append(reason);
  }
  return body;
}

function createPageButton(label: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = !enabled;
  button.addEventListener('click', onClick);
  return button;
}

function pageText(state: GalleryViewState): string {
  if (state.total === 0) return 'Durable pins and captured bookmarks';
  const start = Math.min(state.offset + 1, state.total);
  const end = Math.min(state.offset + state.items.length, state.total);
  return `${start}-${end} of ${state.total} durable records`;
}
