import type { ImageDisplayRecord } from '../core/display-records.js';
import { createButton, createCard as createPrimitiveCard, createIconButton } from '../ui/components/primitives.js';
import { recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from '../ui/components/record-metadata.js';
import { createRecordRow } from '../ui/components/record-row.js';
import type { GalleryAlbumSummary } from './gallery-albums.js';
import { createGalleryAlbumControls, createGalleryHeader, createGalleryStatus } from './gallery-controls-view.js';
import { createGalleryFilterControls } from './gallery-filter-controls-view.js';
import { galleryFiltersActive, type GalleryFilterFacets, type GalleryFilters } from './gallery-filters.js';
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
  readonly filters: GalleryFilters;
  readonly filterFacets: GalleryFilterFacets;
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
  readonly updateFilters: (filters: GalleryFilters) => void;
  readonly clearFilters: () => void;
  readonly updatePageLimit: (limit: number) => void;
  readonly loadPage: (offset: number) => void;
  readonly reload: () => void;
}

export function createGalleryView(
  state: GalleryViewState,
  handlers: GalleryViewHandlers,
  options: { readonly embedded?: boolean } = {},
): HTMLElement {
  const shell = document.createElement('main');
  shell.className = 'image-trail-panel-root image-trail-gallery';
  if (options.embedded) shell.classList.add('is-embedded');
  shell.append(
    createGalleryHeader(state, handlers, { showIdentity: !options.embedded }),
    createGalleryFilterControls(state, handlers),
    createGalleryAlbumControls(state, handlers),
    createGalleryStatus(state),
    createGrid(state, handlers),
  );
  return shell;
}

function createGrid(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'image-trail-gallery__grid';
  list.setAttribute('aria-label', 'Durable image library');
  if (!state.loading && state.items.length === 0) list.append(createEmptyState(state));
  else for (const record of state.items) list.append(createGalleryCard(record, state, handlers));
  return list;
}

function createEmptyState(state: GalleryViewState): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'image-trail-gallery__empty';
  const title = document.createElement('h2');
  const message = document.createElement('p');
  if (state.message && /could not|failed/iu.test(state.message)) {
    title.textContent = 'Gallery unavailable';
    message.textContent = state.message;
  } else if (state.searchQuery.trim() || galleryFiltersActive(state.filters)) {
    title.textContent = 'No matches';
    message.textContent = 'Try a different search, filter combination, or album.';
  } else if (state.selectedAlbumId) {
    title.textContent = 'Album is empty';
    message.textContent = 'Add a durable record from All Images or drag one onto this album.';
  } else {
    title.textContent = 'No durable images yet';
    message.textContent = 'Pinned images and captured bookmarks will appear here.';
  }
  item.append(createPrimitiveCard({ children: [title, message], ariaLabel: 'Gallery empty state' }));
  return item;
}

function createGalleryCard(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLLIElement {
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
  if (state.selectedAlbumId) return createRemoveFromAlbumControl(record, state, handlers);
  if (state.albums.length === 0) return null;
  return createAddToAlbumPopover(record, state, handlers);
}

function createRemoveFromAlbumControl(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'image-trail-gallery__card-album-control';
  actions.append(
    createIconButton({
      glyph: '−',
      label: `Remove ${recordDisplayName(record, state)} from selected album`,
      disabled: state.loading,
      className: 'image-trail-gallery__card-album-toggle',
      onClick: () => handlers.removeRecordFromAlbum(state.selectedAlbumId!, record.id),
    }),
  );
  return actions;
}

function createAddToAlbumPopover(record: ImageDisplayRecord, state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-gallery__card-album-control';
  const open = state.openAlbumMenuRecordIds.includes(record.id);
  const selectedAlbumId = state.albumMenuSelections[record.id] ?? null;
  const toggle = createIconButton({
    glyph: '+',
    label: `Add ${recordDisplayName(record, state)} to album`,
    pressed: open,
    disabled: state.loading,
    className: 'image-trail-gallery__card-album-toggle',
    onClick: () => handlers.toggleAlbumMenu(record.id),
  });
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
    choices.append(
      createButton({
        label: `${summary.album.name} (${summary.recordIds.length})`,
        variant: 'secondary',
        pressed: summary.album.id === selectedAlbumId,
        className: 'image-trail-gallery__album-choice',
        onClick: () => handlers.chooseAlbumForRecord(record.id, summary.album.id),
      }),
    );
  }
  const apply = createButton({
    label: 'Apply',
    variant: 'primary',
    disabled: selectedAlbumId === null || state.loading,
    className: 'image-trail-gallery__album-popover-apply',
    onClick: () => {
      if (selectedAlbumId) handlers.addRecordToAlbum(selectedAlbumId, record.id);
    },
  });
  panel.append(choices, apply);
  return panel;
}

function isAlbumControlDragOrigin(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.image-trail-gallery__card-album-control') !== null;
}
