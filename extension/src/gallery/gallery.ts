import {
  createLoadLocalSettingsMessage,
  createSaveLocalSettingsMessage,
  isLoadLocalSettingsResultMessage,
  isSaveLocalSettingsResultMessage,
} from '../background/messages.js';
import { CaptureController } from '../content/capture-controller.js';
import { ExtensionAlbumStore } from '../content/extension-album-store.js';
import { ExtensionBookmarkStore } from '../content/extension-bookmark-store.js';
import { sendRuntimeMessage } from '../content/runtime-message.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { GALLERY_PAGE_LIMITS } from '../core/settings.js';
import { DEFAULT_LOCAL_SETTINGS, LOCAL_SETTINGS_KEY, type PlaintextLocalSettings } from '../data/local-settings.js';
import { galleryAlbumSummaries, galleryListStore, missingAlbumRecordCount, selectedGalleryAlbum } from './gallery-albums.js';
import { openActionForGalleryRecord } from './gallery-model.js';
import { type GallerySearchPage, loadGallerySearchPage } from './gallery-search-loader.js';
import { createGalleryView, type GalleryViewState } from './gallery-view.js';

const bookmarkStore = new ExtensionBookmarkStore();
const albumStore = new ExtensionAlbumStore();
const captureStore = new CaptureController();
const SEARCH_DEBOUNCE_MS = 500;

let state: GalleryViewState = {
  items: [],
  albums: [],
  selectedAlbumId: null,
  missingAlbumRecordCount: 0,
  searchQuery: '',
  draftSearchQuery: '',
  offset: 0,
  limit: DEFAULT_LOCAL_SETTINGS.galleryPageLimit,
  total: 0,
  hasOlder: false,
  hasNewer: false,
  loading: true,
  message: null,
  blobKeyUnlocked: false,
  privacyMode: DEFAULT_LOCAL_SETTINGS.privacyModeEnabled,
};
let searchTimer: number | null = null;
let loadGeneration = 0;
let settingsRefreshInFlight = false;

function root(): HTMLElement {
  const element = document.getElementById('image-trail-gallery-root');
  if (!element) throw new Error('Gallery root is missing.');
  return element;
}

function render(options: { readonly focusSearch?: boolean } = {}): void {
  root().replaceChildren(
    createGalleryView(state, {
      openRecord,
      createAlbum: (name) => {
        void createAlbum(name);
      },
      selectAlbum: (albumId) => {
        void selectAlbum(albumId);
      },
      renameAlbum: (albumId, name) => {
        void renameAlbum(albumId, name);
      },
      deleteAlbum: (albumId) => {
        void deleteAlbum(albumId);
      },
      addRecordToAlbum: (albumId, recordId) => {
        void addRecordToAlbum(albumId, recordId);
      },
      removeRecordFromAlbum: (albumId, recordId) => {
        void removeRecordFromAlbum(albumId, recordId);
      },
      updateSearch,
      clearSearch,
      updatePageLimit: (limit) => {
        void updatePageLimit(limit);
      },
      loadPage: (offset) => {
        void loadPage(offset);
      },
      reload: () => {
        void loadPage(state.offset);
      },
    }),
  );
  if (options.focusSearch) focusSearchInput();
}

async function loadPage(offset: number, options: { readonly focusSearch?: boolean; readonly message?: string } = {}): Promise<void> {
  const generation = (loadGeneration += 1);
  const searchQuery = state.searchQuery;
  const selectedAlbumId = state.selectedAlbumId;
  state = { ...state, loading: true, message: null };
  render(options);

  try {
    const [settings, blobKeyStatus, albumSnapshot] = await Promise.all([
      loadLocalSettings(),
      captureStore.requestBlobKeyStatus(),
      albumStore.listSnapshot(),
    ]);
    const albums = galleryAlbumSummaries(albumSnapshot);
    const selectedAlbum = selectedGalleryAlbum(albums, selectedAlbumId);
    const pageResult = selectedAlbum
      ? await loadAlbumPage(selectedAlbum, searchQuery, offset, settings)
      : { page: await loadGalleryPage(searchQuery, offset, settings), missingCount: 0 };
    if (generation !== loadGeneration) return;
    state = {
      ...state,
      albums,
      selectedAlbumId: selectedAlbum?.album.id ?? null,
      missingAlbumRecordCount: pageResult.missingCount,
      items: pageResult.page.items,
      offset: pageResult.page.offset,
      limit: pageResult.page.limit,
      total: pageResult.page.total,
      hasOlder: pageResult.page.hasOlder,
      hasNewer: pageResult.page.hasNewer,
      loading: false,
      message: options.message ?? null,
      blobKeyUnlocked: blobKeyStatus.unlocked,
      privacyMode: settings.privacyModeEnabled,
    };
  } catch {
    if (generation !== loadGeneration) return;
    state = { ...state, loading: false, message: 'Gallery could not load durable records.' };
  }
  render(options);
}

async function loadGalleryPage(query: string, offset: number, settings: PlaintextLocalSettings): Promise<GallerySearchPage> {
  return loadGallerySearchPage({
    store: bookmarkStore,
    query,
    offset,
    limit: settings.galleryPageLimit,
    privacyMode: settings.privacyModeEnabled,
  });
}

async function loadAlbumPage(
  album: NonNullable<ReturnType<typeof selectedGalleryAlbum>>,
  query: string,
  offset: number,
  settings: PlaintextLocalSettings,
): Promise<{ readonly page: GallerySearchPage; readonly missingCount: number }> {
  const records = await bookmarkStore.loadByIds(album.recordIds);
  return {
    page: await loadGallerySearchPage({
      store: galleryListStore(records),
      query,
      offset,
      limit: settings.galleryPageLimit,
      privacyMode: settings.privacyModeEnabled,
    }),
    missingCount: missingAlbumRecordCount(album, records),
  };
}

async function loadLocalSettings(): Promise<PlaintextLocalSettings> {
  const response = await sendRuntimeMessage(createLoadLocalSettingsMessage());
  if (isLoadLocalSettingsResultMessage(response) && response.payload.ok) {
    return response.payload.settings;
  }
  return DEFAULT_LOCAL_SETTINGS;
}

function updateSearch(query: string): void {
  loadGeneration += 1;
  state = { ...state, draftSearchQuery: query };
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    searchTimer = null;
    state = { ...state, searchQuery: query, draftSearchQuery: query, offset: 0, message: null };
    void loadPage(0, { focusSearch: true });
  }, SEARCH_DEBOUNCE_MS);
}

function clearSearch(): void {
  loadGeneration += 1;
  if (searchTimer !== null) window.clearTimeout(searchTimer);
  searchTimer = null;
  state = { ...state, searchQuery: '', draftSearchQuery: '', offset: 0, message: 'Search cleared.' };
  void loadPage(0, { focusSearch: true });
}

async function createAlbum(name: string): Promise<void> {
  const album = await albumStore.createAlbum(name);
  if (!album) {
    state = { ...state, message: 'Album could not be created.' };
    render();
    return;
  }
  state = { ...state, selectedAlbumId: album.id, offset: 0 };
  await loadPage(0, { message: `Created album: ${album.name}.` });
}

async function selectAlbum(albumId: string | null): Promise<void> {
  if (albumId === state.selectedAlbumId) return;
  state = { ...state, selectedAlbumId: albumId, offset: 0 };
  await loadPage(0);
}

async function renameAlbum(albumId: string, name: string): Promise<void> {
  const album = await albumStore.renameAlbum(albumId, name);
  await loadPage(state.offset, { message: album ? `Renamed album: ${album.name}.` : 'Album could not be renamed.' });
}

async function deleteAlbum(albumId: string): Promise<void> {
  const deleted = await albumStore.deleteAlbum(albumId);
  state = { ...state, selectedAlbumId: state.selectedAlbumId === albumId ? null : state.selectedAlbumId, offset: 0 };
  await loadPage(0, { message: deleted ? 'Album deleted.' : 'Album could not be deleted.' });
}

async function addRecordToAlbum(albumId: string, recordId: string): Promise<void> {
  const memberships = await albumStore.addRecords(albumId, [recordId]);
  await loadPage(state.offset, { message: memberships.length > 0 ? 'Added record to album.' : 'Record is already in that album.' });
}

async function removeRecordFromAlbum(albumId: string, recordId: string): Promise<void> {
  const removed = await albumStore.removeRecord(albumId, recordId);
  const nextOffset = state.items.length <= 1 ? Math.max(0, state.offset - state.limit) : state.offset;
  await loadPage(nextOffset, { message: removed ? 'Removed record from album.' : 'Record was not in the album.' });
}

async function refreshSettingsFromStorage(options: { readonly reloadOnChange?: boolean } = {}): Promise<void> {
  if (settingsRefreshInFlight) return;
  settingsRefreshInFlight = true;
  try {
    const settings = await loadLocalSettings();
    const privacyChanged = settings.privacyModeEnabled !== state.privacyMode;
    const limitChanged = settings.galleryPageLimit !== state.limit;
    if (!privacyChanged && !limitChanged) return;
    state = { ...state, privacyMode: settings.privacyModeEnabled, limit: settings.galleryPageLimit };
    render();
    const nextOffset = settings.galleryPageLimit === 0 ? 0 : state.offset;
    if (options.reloadOnChange ?? true) void loadPage(nextOffset);
  } finally {
    settingsRefreshInFlight = false;
  }
}

function installSettingsRefreshHooks(): void {
  if (typeof chrome !== 'undefined') {
    chrome.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName !== 'local' || !(LOCAL_SETTINGS_KEY in changes)) return;
      void refreshSettingsFromStorage();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshSettingsFromStorage();
  });
  window.addEventListener('focus', () => {
    void refreshSettingsFromStorage();
  });
}

async function updatePageLimit(limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < GALLERY_PAGE_LIMITS.min || limit > GALLERY_PAGE_LIMITS.max || limit === state.limit) return;
  const settings = await loadLocalSettings();
  const response = await sendRuntimeMessage(createSaveLocalSettingsMessage({ ...settings, galleryPageLimit: limit }));
  if (!isSaveLocalSettingsResultMessage(response) || !response.payload.ok) {
    state = { ...state, message: 'Gallery page limit could not be saved.' };
    render();
    return;
  }
  state = { ...state, limit, offset: 0, message: limit === 0 ? 'Gallery page limit set to unlimited.' : 'Gallery page limit saved.' };
  render();
  void loadPage(0);
}

async function openRecord(record: ImageDisplayRecord): Promise<void> {
  const action = openActionForGalleryRecord(record, { blobKeyUnlocked: state.blobKeyUnlocked });
  if (action.kind === 'open-url') {
    window.open(action.url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (action.kind === 'preview-data-url') {
    await showPreviewResult(captureStore.requestDataUrlPreview(action.dataUrl));
    return;
  }
  if (action.kind === 'preview-blob') {
    await showPreviewResult(captureStore.requestBlobPreview(action.blobId));
    return;
  }
  state = { ...state, message: action.message };
  render();
}

async function showPreviewResult(preview: Promise<Awaited<ReturnType<CaptureController['requestBlobPreview']>>>): Promise<void> {
  const result = await preview;
  if (result.ok) return;
  state = { ...state, message: result.message };
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  installSettingsRefreshHooks();
  render();
  void loadPage(0);
});

function focusSearchInput(): void {
  const input = root().querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) return;
  input.focus();
  const position = input.value.length;
  input.setSelectionRange(position, position);
}
