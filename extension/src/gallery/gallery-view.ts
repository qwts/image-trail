import type { ImageDisplayRecord } from '../core/display-records.js';
import { recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from '../ui/components/record-metadata.js';
import { createRecordRow } from '../ui/components/record-row.js';
import type { GalleryAlbumSummary } from './gallery-albums.js';
import { galleryRecordKind, openActionForGalleryRecord } from './gallery-model.js';

const RECORD_DRAG_MIME = 'application/x-image-trail-record-id';

export interface GalleryViewState {
  readonly items: readonly ImageDisplayRecord[];
  readonly albums: readonly GalleryAlbumSummary[];
  readonly selectedAlbumId: string | null;
  readonly missingAlbumRecordCount: number;
  readonly openAlbumMenuRecordIds: readonly string[];
  readonly albumMenuSelections: Readonly<Record<string, string>>;
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
  readonly createAlbum: (name: string) => void;
  readonly selectAlbum: (albumId: string | null) => void;
  readonly renameAlbum: (albumId: string, name: string) => void;
  readonly deleteAlbum: (albumId: string) => void;
  readonly toggleAlbumMenu: (recordId: string) => void;
  readonly chooseAlbumForRecord: (recordId: string, albumId: string) => void;
  readonly addRecordToAlbum: (albumId: string, recordId: string) => void;
  readonly removeRecordFromAlbum: (albumId: string, recordId: string) => void;
  readonly updateSearch: (query: string) => void;
  readonly clearSearch: () => void;
  readonly updatePageLimit: (limit: number) => void;
  readonly loadPage: (offset: number) => void;
  readonly reload: () => void;
}

export function createGalleryView(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'image-trail-gallery';
  shell.append(createHeader(state, handlers), createAlbumControls(state, handlers), createStatus(state), createGrid(state, handlers));
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

  const headerTools = document.createElement('div');
  headerTools.className = 'image-trail-gallery__header-tools';
  headerTools.append(createSearchControls(state, handlers), controls);

  header.append(titleGroup, headerTools);
  return header;
}

function createAlbumControls(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-gallery__albums';
  section.append(createAlbumCreateForm(state, handlers), createAlbumPicker(state, handlers));
  const selected = selectedAlbum(state);
  if (selected) section.append(createSelectedAlbumTools(selected, state, handlers));
  return section;
}

function createAlbumCreateForm(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const form = document.createElement('form');
  form.className = 'image-trail-gallery__album-form';
  const label = document.createElement('label');
  label.className = 'image-trail-gallery__field';
  const text = document.createElement('span');
  text.textContent = 'New album';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Album name';
  input.maxLength = 80;
  label.append(text, input);
  const button = createPageButton('Create album', !state.loading, () => {
    handlers.createAlbum(input.value);
    input.value = '';
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    button.click();
  });
  form.append(label, button);
  return form;
}

function createAlbumPicker(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'image-trail-gallery__album-list';
  nav.setAttribute('aria-label', 'Gallery albums');
  nav.append(createAlbumSelectButton('All Images', state.selectedAlbumId === null, () => handlers.selectAlbum(null)));
  for (const summary of state.albums) {
    nav.append(
      createAlbumSelectButton(
        `${summary.album.name} (${summary.recordIds.length})`,
        state.selectedAlbumId === summary.album.id,
        () => handlers.selectAlbum(summary.album.id),
        (recordId) => handlers.addRecordToAlbum(summary.album.id, recordId),
      ),
    );
  }
  return nav;
}

function createSelectedAlbumTools(summary: GalleryAlbumSummary, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const form = document.createElement('form');
  form.className = 'image-trail-gallery__album-form';
  const label = document.createElement('label');
  label.className = 'image-trail-gallery__field';
  const text = document.createElement('span');
  text.textContent = 'Selected album';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = summary.album.name;
  input.maxLength = 80;
  label.append(text, input);

  const rename = createPageButton('Rename', !state.loading, () => handlers.renameAlbum(summary.album.id, input.value));
  const remove = createPageButton('Delete album', !state.loading, () => handlers.deleteAlbum(summary.album.id));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    rename.click();
  });
  form.append(label, rename, remove);
  return form;
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
  const action = openActionForGalleryRecord(record, { blobKeyUnlocked: state.blobKeyUnlocked });
  const disabledReason = action.kind === 'locked' || action.kind === 'unsupported' ? action.message : null;
  const privacyMasked = state.privacyMode && record.privacyStatus !== 'locked';
  const row = createRecordRow({
    className: 'image-trail-gallery__card',
    layout: 'gallery',
    interactionTarget: 'button',
    thumbnail: record.thumbnail,
    thumbnailAlt: recordDisplayName(record, state),
    thumbnailFallback: privacyMasked ? 'PRIVATE' : recordExtensionLabel(record),
    source: privacyMasked ? 'PRIVATE' : recordExtensionLabel(record),
    name: recordDisplayName(record, state),
    nameTitle: recordTitle(record, state),
    meta: [galleryRecordKind(record), recordMetadataText(record, state)].filter(Boolean).join(' | '),
    warning: disabledReason ?? undefined,
    storedOriginal: !!record.storedOriginal || record.captureStatus === 'captured',
    state: record.privacyStatus === 'locked' ? 'locked-encrypted' : 'default',
    privacyMasked,
    bodyClassName: 'image-trail-gallery__card-body',
    nameClassName: 'image-trail-gallery__card-title',
    metaClassName: 'image-trail-gallery__card-meta',
    warningClassName: 'image-trail-gallery__card-warning',
  });
  const item = row.root;
  const button = row.interactionTarget as HTMLButtonElement;
  button.classList.add('image-trail-gallery__card-button');
  if (state.openAlbumMenuRecordIds.includes(record.id)) item.classList.add('has-album-popover');
  item.draggable = true;
  button.disabled = disabledReason !== null;
  button.title = disabledReason ?? recordTitle(record, state);
  let suppressOpenClick = false;
  button.addEventListener('click', (event) => {
    if (suppressOpenClick) {
      event.preventDefault();
      suppressOpenClick = false;
      return;
    }
    handlers.openRecord(record);
  });
  item.addEventListener('dragstart', (event) => {
    if (isAlbumControlDragOrigin(event.target)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer?.setData(RECORD_DRAG_MIME, record.id);
    event.dataTransfer?.setData('text/plain', record.id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
    item.classList.add('is-dragging');
  });
  item.addEventListener('dragend', () => {
    item.classList.remove('is-dragging');
    suppressOpenClick = true;
    window.setTimeout(() => {
      suppressOpenClick = false;
    }, 0);
  });
  const albumActions = createCardAlbumControl(record, state, handlers);
  if (albumActions) item.append(albumActions);
  return item;
}

function createCardAlbumControl(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement | null {
  if (state.selectedAlbumId) {
    return createRemoveFromAlbumControl(record, state, handlers);
  }
  if (state.albums.length === 0) return null;
  return createAddToAlbumPopover(record, state, handlers);
}

function createRemoveFromAlbumControl(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'image-trail-gallery__card-album-control';
  const remove = createIconButton('-', `Remove ${recordDisplayName(record, state)} from selected album`, !state.loading, () =>
    handlers.removeRecordFromAlbum(state.selectedAlbumId!, record.id),
  );
  remove.classList.add('image-trail-gallery__card-album-toggle');
  actions.append(remove);
  return actions;
}

function createAddToAlbumPopover(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-gallery__card-album-control';
  const open = state.openAlbumMenuRecordIds.includes(record.id);
  const selectedAlbumId = state.albumMenuSelections[record.id] ?? null;
  const toggle = createIconButton('+', `Add ${recordDisplayName(record, state)} to album`, !state.loading, () => {
    handlers.toggleAlbumMenu(record.id);
  });
  toggle.classList.add('image-trail-gallery__card-album-toggle');
  toggle.setAttribute('aria-expanded', String(open));
  wrapper.append(toggle);
  if (open) wrapper.append(createAlbumPopover(record, state, handlers, selectedAlbumId));
  return wrapper;
}

function createAlbumPopover(
  record: ImageDisplayRecord,
  state: GalleryViewState,
  handlers: GalleryViewHandlers,
  selectedAlbumId: string | null,
): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'image-trail-gallery__album-popover';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', `Albums for ${recordDisplayName(record, state)}`);
  const choices = document.createElement('div');
  choices.className = 'image-trail-gallery__album-popover-list';
  for (const summary of state.albums) {
    choices.append(createAlbumChoiceButton(record.id, summary, selectedAlbumId, handlers));
  }
  const apply = createPageButton('Apply', selectedAlbumId !== null && !state.loading, () => {
    if (selectedAlbumId) handlers.addRecordToAlbum(selectedAlbumId, record.id);
  });
  apply.classList.add('image-trail-gallery__album-popover-apply');
  panel.append(choices, apply);
  return panel;
}

function createAlbumChoiceButton(
  recordId: string,
  summary: GalleryAlbumSummary,
  selectedAlbumId: string | null,
  handlers: GalleryViewHandlers,
): HTMLButtonElement {
  const choice = createPageButton(`${summary.album.name} (${summary.recordIds.length})`, true, () =>
    handlers.chooseAlbumForRecord(recordId, summary.album.id),
  );
  choice.className = 'image-trail-gallery__album-choice';
  choice.setAttribute('aria-pressed', String(summary.album.id === selectedAlbumId));
  return choice;
}

function createPageButton(label: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = !enabled;
  button.addEventListener('click', onClick);
  return button;
}

function createIconButton(label: string, ariaLabel: string, enabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = createPageButton(label, enabled, onClick);
  button.setAttribute('aria-label', ariaLabel);
  button.title = ariaLabel;
  return button;
}

function createAlbumSelectButton(
  label: string,
  selected: boolean,
  onClick: () => void,
  onDropRecord?: (recordId: string) => void,
): HTMLButtonElement {
  const button = createPageButton(label, true, onClick);
  button.className = selected ? 'is-selected' : '';
  button.setAttribute('aria-pressed', String(selected));
  if (onDropRecord) installAlbumDropTarget(button, onDropRecord);
  return button;
}

function installAlbumDropTarget(button: HTMLButtonElement, onDropRecord: (recordId: string) => void): void {
  button.addEventListener('dragover', (event) => {
    if (!hasDraggedRecord(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  button.addEventListener('dragenter', (event) => {
    if (!hasDraggedRecord(event)) return;
    event.preventDefault();
    button.classList.add('is-drop-target');
  });
  button.addEventListener('dragleave', () => {
    button.classList.remove('is-drop-target');
  });
  button.addEventListener('drop', (event) => {
    const recordId = dragRecordId(event);
    button.classList.remove('is-drop-target');
    if (!recordId) return;
    event.preventDefault();
    onDropRecord(recordId);
  });
}

function dragRecordId(event: DragEvent): string | null {
  return event.dataTransfer?.getData(RECORD_DRAG_MIME) || event.dataTransfer?.getData('text/plain') || null;
}

function hasDraggedRecord(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(RECORD_DRAG_MIME);
}

function isAlbumControlDragOrigin(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.image-trail-gallery__card-album-control') !== null;
}

function pageText(state: GalleryViewState): string {
  const album = selectedAlbum(state);
  if (state.total === 0) {
    if (state.searchQuery.trim()) return album ? 'No matching album records' : 'No matching durable records';
    return album ? `${album.album.name} album` : 'Durable pins and captured bookmarks';
  }
  if (state.limit === 0) return `${state.total} ${album ? 'album' : 'durable'} record${state.total === 1 ? '' : 's'}`;
  const start = Math.min(state.offset + 1, state.total);
  const end = Math.min(state.offset + state.items.length, state.total);
  const suffix = state.searchQuery.trim() ? `matching ${album ? 'album' : 'durable'} records` : `${album ? 'album' : 'durable'} records`;
  return `${start}-${end} of ${state.total} ${suffix}`;
}

function defaultStatusText(state: GalleryViewState): string {
  const album = selectedAlbum(state);
  if (state.loading) return state.searchQuery.trim() ? 'Searching library...' : 'Loading library...';
  if (state.missingAlbumRecordCount > 0) {
    return `${state.missingAlbumRecordCount} missing album record${state.missingAlbumRecordCount === 1 ? '' : 's'} skipped.`;
  }
  if (state.total === 0) {
    if (state.searchQuery.trim()) return state.selectedAlbumId ? 'No album matches.' : 'No gallery matches.';
    return album ? 'Album is empty.' : 'No durable pins or bookmarks yet.';
  }
  return '';
}

function selectedAlbum(state: GalleryViewState): GalleryAlbumSummary | null {
  return state.albums.find((summary) => summary.album.id === state.selectedAlbumId) ?? null;
}
