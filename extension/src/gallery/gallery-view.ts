import type { ImageDisplayRecord } from '../core/display-records.js';
import { recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from '../ui/components/record-metadata.js';
import { galleryRecordKind, openActionForGalleryRecord } from './gallery-model.js';

export interface GalleryViewState {
  readonly items: readonly ImageDisplayRecord[];
  readonly searchQuery: string;
  readonly draftSearchQuery: string;
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
  readonly updateSearch: (query: string) => void;
  readonly clearSearch: () => void;
  readonly updatePageLimit: (limit: number) => void;
  readonly loadPage: (offset: number) => void;
  readonly reload: () => void;
}

export function createGalleryView(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'image-trail-gallery';
  shell.append(createHeader(state, handlers), createSearchControls(state, handlers), createStatus(state), createGrid(state, handlers));
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

function createSearchControls(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const controls = document.createElement('section');
  controls.className = 'image-trail-gallery__search';
  controls.append(createSearchField(state, handlers), createLimitForm(state, handlers));
  return controls;
}

function createSearchField(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const label = document.createElement('label');
  label.className = 'image-trail-gallery__field';
  const labelText = document.createElement('span');
  labelText.textContent = 'Search gallery';
  const input = document.createElement('input');
  const inputValue = state.draftSearchQuery;
  input.type = 'search';
  input.value = inputValue;
  input.placeholder = 'URL, host, filename, label';
  input.autocomplete = 'off';
  input.setAttribute('aria-label', 'Search gallery');
  label.append(labelText, input);

  const clear = createPageButton('Clear', inputValue.length > 0 && !state.loading, handlers.clearSearch);
  input.addEventListener('input', () => {
    clear.disabled = input.value.length === 0 || state.loading;
    handlers.updateSearch(input.value);
  });
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-gallery__search-row';
  wrapper.append(label, clear);
  return wrapper;
}

function createLimitForm(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const form = document.createElement('form');
  form.className = 'image-trail-gallery__limit-form';
  const label = document.createElement('label');
  label.className = 'image-trail-gallery__field';
  const labelText = document.createElement('span');
  labelText.textContent = 'Page limit';
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '500';
  input.step = '1';
  input.value = String(state.limit);
  input.inputMode = 'numeric';
  input.setAttribute('aria-describedby', 'image-trail-gallery-limit-help');
  label.append(labelText, input);

  const help = document.createElement('span');
  help.id = 'image-trail-gallery-limit-help';
  help.className = 'image-trail-gallery__hint';
  help.textContent = '0 shows all';

  const applyLimit = () => {
    const value = Number(input.value);
    if (Number.isInteger(value)) handlers.updatePageLimit(value);
  };
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';
  apply.disabled = state.loading;
  apply.addEventListener('click', (event) => {
    event.preventDefault();
    applyLimit();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    applyLimit();
  });
  form.append(label, help, apply);
  return form;
}

function createStatus(state: GalleryViewState): HTMLElement {
  const status = document.createElement('p');
  status.className = 'image-trail-gallery__status';
  status.setAttribute('role', 'status');
  status.textContent = state.message ?? defaultStatusText(state);
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
  if (state.total === 0) return state.searchQuery.trim() ? 'No matching durable records' : 'Durable pins and captured bookmarks';
  if (state.limit === 0) return `${state.total} durable record${state.total === 1 ? '' : 's'}`;
  const start = Math.min(state.offset + 1, state.total);
  const end = Math.min(state.offset + state.items.length, state.total);
  const suffix = state.searchQuery.trim() ? 'matching durable records' : 'durable records';
  return `${start}-${end} of ${state.total} ${suffix}`;
}

function defaultStatusText(state: GalleryViewState): string {
  if (state.loading) return state.searchQuery.trim() ? 'Searching library...' : 'Loading library...';
  if (state.total === 0) return state.searchQuery.trim() ? 'No gallery matches.' : 'No durable pins or bookmarks yet.';
  return '';
}
