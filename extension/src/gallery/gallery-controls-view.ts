import {
  createButton,
  createCard,
  createInput,
  createSectionHeader,
  createStatusPill,
  type StatusTone,
} from '../ui/components/primitives.js';
import type { GalleryAlbumSummary } from './gallery-albums.js';
import { galleryFiltersActive } from './gallery-filters.js';
import type { GalleryViewHandlers, GalleryViewState } from './gallery-view.js';

export function createGalleryHeader(
  state: GalleryViewState,
  handlers: GalleryViewHandlers,
  options: { readonly showIdentity?: boolean } = {},
): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-gallery__header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'image-trail-gallery__title-group';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'image-trail-gallery__wordmark';
  eyebrow.textContent = 'Image Trail';
  const title = document.createElement('h2');
  title.textContent = 'Gallery';
  const meta = document.createElement('p');
  meta.textContent = pageText(state);
  titleGroup.append(eyebrow, title, meta);

  const headerTools = document.createElement('div');
  headerTools.className = 'image-trail-gallery__header-tools';
  headerTools.append(createSearchControls(state, handlers), createPagingControls(state, handlers));
  if (options.showIdentity ?? true) header.append(titleGroup, headerTools);
  else {
    header.classList.add('is-embedded');
    header.append(headerTools);
  }
  return header;
}

export function createGalleryAlbumControls(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-gallery__albums';
  section.setAttribute('aria-label', 'Gallery albums');
  const content: HTMLElement[] = [
    createSectionHeader({ title: 'Albums', headingLevel: 2, divider: false }),
    createAlbumCreateForm(state, handlers),
    createAlbumPicker(state, handlers),
  ];
  const selected = selectedAlbum(state);
  if (selected) content.push(createSelectedAlbumTools(selected, state, handlers));
  const card = createCard({ children: content, className: 'image-trail-gallery__album-card' });
  section.append(card);
  return section;
}

export function createGalleryStatus(state: GalleryViewState): HTMLElement {
  const text = state.message ?? defaultStatusText(state);
  return createStatusPill({
    label: text || 'Ready',
    tone: statusTone(state, text),
    waiting: state.loading,
    className: 'image-trail-gallery__status',
  });
}

function createPagingControls(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const controls = document.createElement('nav');
  controls.className = 'image-trail-gallery__controls';
  controls.setAttribute('aria-label', 'Gallery pages');
  controls.append(
    createButton({
      label: 'Newer',
      variant: 'ghost',
      disabled: !state.hasNewer || state.loading,
      onClick: () => handlers.loadPage(Math.max(0, state.offset - state.limit)),
    }),
    createButton({
      label: 'Older',
      variant: 'ghost',
      disabled: !state.hasOlder || state.loading,
      onClick: () => handlers.loadPage(state.offset + state.limit),
    }),
    createButton({ label: 'Reload', variant: 'secondary', disabled: state.loading, onClick: handlers.reload }),
  );
  return controls;
}

function createAlbumCreateForm(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const form = document.createElement('form');
  form.className = 'image-trail-gallery__album-form';
  const field = createField('New album');
  const input = createInput({ ariaLabel: 'New album', placeholder: 'Album name', spellcheck: false });
  input.maxLength = 80;
  field.append(input);
  const submit = () => {
    handlers.createAlbum(input.value);
    input.value = '';
  };
  const button = createButton({ label: 'Create album', variant: 'primary', disabled: state.loading, onClick: submit });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!button.disabled) submit();
  });
  form.append(field, button);
  return form;
}

function createAlbumPicker(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const nav = document.createElement('nav');
  nav.className = 'image-trail-gallery__album-list';
  nav.setAttribute('aria-label', 'Choose an album');
  nav.append(createAlbumSelectButton('All Images', state.selectedAlbumId === null, !state.loading, () => handlers.selectAlbum(null)));
  for (const summary of state.albums) {
    nav.append(
      createAlbumSelectButton(
        `${summary.album.name} (${summary.recordIds.length})`,
        state.selectedAlbumId === summary.album.id,
        !state.loading,
        () => handlers.selectAlbum(summary.album.id),
        (recordId) => handlers.addRecordToAlbum(summary.album.id, recordId),
      ),
    );
  }
  return nav;
}

function createSelectedAlbumTools(summary: GalleryAlbumSummary, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const form = document.createElement('form');
  form.className = 'image-trail-gallery__album-form image-trail-gallery__album-form--selected';
  const field = createField('Selected album');
  const input = createInput({ ariaLabel: 'Selected album', value: summary.album.name, spellcheck: false });
  input.maxLength = 80;
  field.append(input);
  const rename = () => handlers.renameAlbum(summary.album.id, input.value);
  const renameButton = createButton({ label: 'Rename', variant: 'secondary', disabled: state.loading, onClick: rename });
  const deleteButton = createButton({
    label: 'Delete album',
    variant: 'danger',
    disabled: state.loading,
    onClick: () => handlers.deleteAlbum(summary.album.id),
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!renameButton.disabled) rename();
  });
  form.append(field, renameButton, deleteButton);
  return form;
}

function createSearchControls(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const controls = document.createElement('section');
  controls.className = 'image-trail-gallery__search';
  controls.setAttribute('aria-label', 'Search and page size');
  controls.append(createSearchField(state, handlers), createLimitForm(state, handlers));
  return controls;
}

function createSearchField(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-gallery__search-row';
  const field = createField('Search gallery');
  const input = createInput({
    ariaLabel: 'Search gallery',
    type: 'search',
    value: state.draftSearchQuery,
    placeholder: 'URL, host, filename, label',
    autocomplete: 'off',
    onInput: () => {
      clear.disabled = input.value.length === 0 || state.loading;
      handlers.updateSearch(input.value);
    },
  });
  field.append(input);
  const clear = createButton({
    label: 'Clear',
    variant: 'ghost',
    disabled: state.draftSearchQuery.length === 0 || state.loading,
    onClick: handlers.clearSearch,
  });
  wrapper.append(field, clear);
  return wrapper;
}

function createLimitForm(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const form = document.createElement('form');
  form.className = 'image-trail-gallery__limit-form';
  const field = createField('Page limit');
  const input = createInput({
    ariaLabel: 'Page limit',
    type: 'number',
    value: String(state.limit),
    describedBy: 'image-trail-gallery-limit-help',
  });
  input.min = '0';
  input.max = '500';
  input.step = '1';
  input.inputMode = 'numeric';
  field.append(input);
  const help = document.createElement('span');
  help.id = 'image-trail-gallery-limit-help';
  help.className = 'image-trail-gallery__hint';
  help.textContent = '0 shows all';
  const applyLimit = () => {
    const value = Number(input.value);
    if (Number.isInteger(value)) handlers.updatePageLimit(value);
  };
  const apply = createButton({ label: 'Apply', variant: 'primary', disabled: state.loading, onClick: applyLimit });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!apply.disabled) applyLimit();
  });
  form.append(field, help, apply);
  return form;
}

function createField(label: string): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'image-trail-gallery__field';
  const text = document.createElement('span');
  text.textContent = label;
  field.append(text);
  return field;
}

function createAlbumSelectButton(
  label: string,
  selected: boolean,
  enabled: boolean,
  onClick: () => void,
  onDropRecord?: (recordId: string) => void,
): HTMLButtonElement {
  const button = createButton({ label, variant: 'secondary', pressed: selected, disabled: !enabled, onClick });
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
  button.addEventListener('dragleave', () => button.classList.remove('is-drop-target'));
  button.addEventListener('drop', (event) => {
    const recordId = dragRecordId(event);
    button.classList.remove('is-drop-target');
    if (!recordId) return;
    event.preventDefault();
    onDropRecord(recordId);
  });
}

function dragRecordId(event: DragEvent): string | null {
  return event.dataTransfer?.getData('application/x-image-trail-record-id') || event.dataTransfer?.getData('text/plain') || null;
}

function hasDraggedRecord(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('application/x-image-trail-record-id');
}

function pageText(state: GalleryViewState): string {
  const album = selectedAlbum(state);
  const narrowed = state.searchQuery.trim() || galleryFiltersActive(state.filters);
  if (state.total === 0) {
    if (narrowed) return album ? 'No matching album records' : 'No matching durable records';
    return album ? `${album.album.name} album` : 'Durable pins and captured bookmarks';
  }
  if (state.limit === 0) return `${state.total} ${album ? 'album' : 'durable'} record${state.total === 1 ? '' : 's'}`;
  const start = Math.min(state.offset + 1, state.total);
  const end = Math.min(state.offset + state.items.length, state.total);
  const suffix = narrowed ? `matching ${album ? 'album' : 'durable'} records` : `${album ? 'album' : 'durable'} records`;
  return `${start}-${end} of ${state.total} ${suffix}`;
}

function defaultStatusText(state: GalleryViewState): string {
  const album = selectedAlbum(state);
  const narrowed = state.searchQuery.trim() || galleryFiltersActive(state.filters);
  if (state.loading) return narrowed ? 'Filtering library...' : 'Loading library...';
  if (state.missingAlbumRecordCount > 0) {
    return `${state.missingAlbumRecordCount} missing album record${state.missingAlbumRecordCount === 1 ? '' : 's'} skipped.`;
  }
  if (state.total === 0) {
    if (narrowed) return state.selectedAlbumId ? 'No album matches.' : 'No gallery matches.';
    return album ? 'Album is empty.' : 'No durable pins or bookmarks yet.';
  }
  return '';
}

function selectedAlbum(state: GalleryViewState): GalleryAlbumSummary | null {
  return state.albums.find((summary) => summary.album.id === state.selectedAlbumId) ?? null;
}

function statusTone(state: GalleryViewState, text: string): StatusTone {
  if (state.loading) return 'busy';
  if (/could not|failed|unavailable/iu.test(text)) return 'error';
  if (/missing|locked|skipped/iu.test(text)) return 'warning';
  if (state.message) return 'success';
  return 'ready';
}
