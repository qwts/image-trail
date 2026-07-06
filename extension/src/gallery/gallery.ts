import { createLoadLocalSettingsMessage, isLoadLocalSettingsResultMessage } from '../background/messages.js';
import { CaptureController } from '../content/capture-controller.js';
import { ExtensionBookmarkStore } from '../content/extension-bookmark-store.js';
import { sendRuntimeMessage } from '../content/runtime-message.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { DEFAULT_LOCAL_SETTINGS } from '../data/local-settings.js';
import { GALLERY_PAGE_LIMIT, openActionForGalleryRecord } from './gallery-model.js';
import { createGalleryView, type GalleryViewState } from './gallery-view.js';

const bookmarkStore = new ExtensionBookmarkStore();
const captureStore = new CaptureController();

let state: GalleryViewState = {
  items: [],
  offset: 0,
  limit: GALLERY_PAGE_LIMIT,
  total: 0,
  hasOlder: false,
  hasNewer: false,
  loading: true,
  message: null,
  blobKeyUnlocked: false,
  privacyMode: DEFAULT_LOCAL_SETTINGS.privacyModeEnabled,
};

function root(): HTMLElement {
  const element = document.getElementById('image-trail-gallery-root');
  if (!element) throw new Error('Gallery root is missing.');
  return element;
}

function render(): void {
  root().replaceChildren(
    createGalleryView(state, {
      openRecord,
      loadPage: (offset) => {
        void loadPage(offset);
      },
      reload: () => {
        void loadPage(state.offset);
      },
    }),
  );
}

async function loadPage(offset: number): Promise<void> {
  state = { ...state, loading: true, message: null };
  render();

  try {
    const [page, blobKeyStatus, privacyMode] = await Promise.all([
      bookmarkStore.loadPage({ offset, limit: state.limit, scope: 'global' }),
      captureStore.requestBlobKeyStatus(),
      loadPrivacyMode(),
    ]);
    state = {
      ...state,
      items: page.items,
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      hasOlder: page.hasOlder,
      hasNewer: page.hasNewer,
      loading: false,
      message: null,
      blobKeyUnlocked: blobKeyStatus.unlocked,
      privacyMode,
    };
  } catch {
    state = { ...state, loading: false, message: 'Gallery could not load durable records.' };
  }
  render();
}

async function loadPrivacyMode(): Promise<boolean> {
  const response = await sendRuntimeMessage(createLoadLocalSettingsMessage());
  if (isLoadLocalSettingsResultMessage(response) && response.payload.ok) {
    return response.payload.settings.privacyModeEnabled;
  }
  return DEFAULT_LOCAL_SETTINGS.privacyModeEnabled;
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
  render();
  void loadPage(0);
});
