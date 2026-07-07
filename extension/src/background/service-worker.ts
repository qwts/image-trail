import type { StorageUsageSummary } from '../core/image/capture-result.js';
import { isBuildIdentity } from '../core/build-info.js';
import { IndexedDbBookmarkStore } from '../data/bookmarks-controller.js';
import { IndexedDbAlbumStore } from '../data/albums-controller.js';
import { IndexedDbPanelPositionStore } from '../data/panel-position-controller.js';
import { IndexedDbWorkspaceLayoutStore } from '../data/workspace-layout-controller.js';
import { IndexedDbParsedFieldStateStore } from '../data/parsed-field-state-controller.js';
import { IndexedDbUrlTemplateStore } from '../data/url-template-controller.js';
import { IndexedDbUrlReviewStatusStore } from '../data/url-review-status-controller.js';
import { RecentHistoryCache } from './recent-history-cache.js';
import { DEFAULT_LOCAL_SETTINGS, LOCAL_SETTINGS_KEY, migrateLocalSettings } from '../data/local-settings.js';
import { getActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { openBlobPayload, sealBlobPayload } from '../data/crypto/binary-envelope.js';
import { createEncryptedImageFile, openEncryptedImageFile, parseEncryptedImageFileHeader } from '../data/import-export/encrypted-image.js';
import {
  portableStoredBlobRecord,
  storedBlobRecordFromPortable,
  type PortableStoredBlobRecord,
} from '../data/import-export/full-backup.js';
import { openImageTrailDb } from '../data/db.js';
import { BlobsRepository } from '../data/repositories/blobs-repository.js';
import { EncryptedPinsRepository } from '../data/repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from '../data/repositories/encrypted-pin-thumbnails-repository.js';
import type { StoredBlobRecord } from '../data/types.js';
import type { UrlReviewStatusClearFilter } from '../core/types.js';
import { BROWSER_COMMAND_SHORTCUTS } from '../core/keyboard-shortcuts.js';
import { fetchImageBytes } from './fetch-image.js';
import {
  MessageType,
  createCaptureImageMessage,
  createCaptureResultMessage,
  createClearUrlReviewStatusResultMessage,
  createCheckImageRequestPolicyResultMessage,
  createCleanupOrphanedBlobsResultMessage,
  createCreateBlobPreviewResultMessage,
  createDeleteBlobResultMessage,
  createDownloadImageResultMessage,
  createExportEncryptedImageResultMessage,
  createFetchLinkedPageResultMessage,
  createFetchThumbnailSourceResultMessage,
  createLoadParsedFieldStateBySourceResultMessage,
  createImportEncryptedImageResultMessage,
  createImportUrlReviewStatusResultMessage,
  createLoadBuildIdentityResultMessage,
  createLoadParsedFieldStateResultMessage,
  createLoadLocalSettingsResultMessage,
  createListUrlReviewStatusResultMessage,
  createSaveParsedFieldStateResultMessage,
  createSaveUrlReviewStatusResultMessage,
  createSaveLocalSettingsResultMessage,
  createFetchBufferedImageSourceResultMessage,
  createExportOriginalBlobsResultMessage,
  createImportOriginalBlobsResultMessage,
  createPingMessage,
  createProbeImageSourceResultMessage,
  createRetrieveBlobResultMessage,
  createStorageUsageResponseMessage,
  createToggleBuildIdentityOverlayMessage,
  createTogglePanelMessage,
  isExtensionRequest,
  isStatusMessage,
} from './messages.js';
import type {
  CaptureImageMessage,
  DeleteBlobMessage,
  DownloadImageMessage,
  ExportEncryptedImageMessage,
  ExportOriginalBlobsMessage,
  ImportOriginalBlobsMessage,
  RetrieveBlobMessage,
  GrantPermissionAndCaptureMessage,
} from './messages.js';
import type { LoadParsedFieldStateMessage, SaveParsedFieldStateMessage } from './messages.js';
import type {
  ClearUrlReviewStatusMessage,
  ImportUrlReviewStatusMessage,
  ListUrlReviewStatusMessage,
  SaveUrlReviewStatusMessage,
} from './messages.js';
import type { SaveLocalSettingsMessage } from './messages.js';
import type {
  FetchBufferedImageSourceMessage,
  CheckImageRequestPolicyMessage,
  FetchLinkedPageMessage,
  FetchThumbnailSourceMessage,
  ProbeImageSourceMessage,
} from './messages.js';
import type { CreateBlobPreviewMessage } from './messages.js';
import type { ImportEncryptedImageMessage } from './messages.js';
import { ImageRequestManager } from './image-request-manager.js';
import { extractOrigin, hasOriginPermission, requestOriginPermission } from './permissions.js';
import { defineMessage, dispatchRequest, type MessageDef } from './message-dispatch.js';
import * as requestSchemas from './message-schemas.js';
import type { ExtensionRequest, ExtensionResponse } from './messages.js';
import type {
  CleanupOrphanedBlobsMessage,
  CreateDataUrlPreviewMessage,
  LoadBuildIdentityMessage,
  LoadLocalSettingsMessage,
  LoadParsedFieldStateBySourceMessage,
  StorageUsageRequestMessage,
} from './messages.js';
import { createBookmarkMessageRegistry } from './handlers/bookmark-message-handlers.js';
import { createAlbumMessageRegistry } from './handlers/album-handlers.js';
import { createPanelPositionMessageRegistry } from './handlers/panel-position-handlers.js';
import { createRecentHistoryMessageRegistry } from './handlers/recent-history-handlers.js';
import { createRecallMessageRegistry } from './handlers/recall-handlers.js';
import { createBlobKeyMessageRegistry } from './handlers/blob-key-handlers.js';
import { createGalleryMessageRegistry } from './handlers/gallery-page-handler.js';
import { createPCloudMessageRegistry } from './handlers/pcloud-handlers.js';
import { createUrlTemplateMessageRegistry } from './handlers/url-template-handlers.js';
import { normalizeHostname } from './handlers/hostname.js';
import { createRuntimeLibraryChangeNotifier } from './library-change-notifier.js';
import type { ServiceWorkerContext } from './service-worker-context.js';
import { createShortcutActionMessage } from './shortcut-action-message.js';

const CONTENT_SCRIPT_FILE = 'src/content/content-script.js';
const TOGGLE_BUILD_IDENTITY_COMMAND = 'toggle-build-info-overlay';
const BROWSER_COMMAND_ACTIONS = new Map(BROWSER_COMMAND_SHORTCUTS.map((shortcut) => [shortcut.command, shortcut.action]));
const SUPPORTED_PAGE_PATTERN = /^https?:\/\//u;
const PREVIEW_TTL_MS = 60_000;
const MAX_LINKED_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_LINKED_PAGE_TIMEOUT_MS = 15_000;

interface PreviewPayload {
  readonly dataUrl: string;
  readonly byteLength: number;
  readonly createdAt: number;
}

const previewPayloads = new Map<string, PreviewPayload>();
const imageRequests = new ImageRequestManager();
const bookmarkStore = new IndexedDbBookmarkStore({
  getActiveBlobKey,
  getPinSaveStoragePreference: async () => (await loadLocalSettings()).pinSaveStoragePreference,
  getSearchableMetadataPolicy: async () => (await loadLocalSettings()).searchableMetadataPolicy,
});
const albumStore = new IndexedDbAlbumStore();
const parsedFieldStateStore = new IndexedDbParsedFieldStateStore();
const urlReviewStatusStore = new IndexedDbUrlReviewStatusStore();
const urlTemplateStore = new IndexedDbUrlTemplateStore();
const recentHistoryCache = new RecentHistoryCache();
const notifyLibraryChange = createRuntimeLibraryChangeNotifier(chrome.runtime);

/** Composition-root context handed to extracted handler modules; see {@link ServiceWorkerContext}. */
const context: ServiceWorkerContext = {
  bookmarkStore,
  albumStore,
  panelPositionStore: new IndexedDbPanelPositionStore(),
  workspaceLayoutStore: new IndexedDbWorkspaceLayoutStore(),
  parsedFieldStateStore,
  urlReviewStatusStore,
  urlTemplateStore,
  recentHistoryCache,
  imageRequests,
  getDb,
  loadLocalSettings,
};

async function requestStatus(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, createPingMessage());
    return isStatusMessage(response);
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId: number): Promise<void> {
  if (await requestStatus(tabId)) return;

  await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT_FILE] });

  if (!(await requestStatus(tabId))) {
    throw new Error('Injected content script did not return a valid Image Trail status response.');
  }
}

async function sendToggle(tabId: number): Promise<void> {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, createTogglePanelMessage());
  if (!isStatusMessage(response)) {
    console.warn('Image Trail received an unexpected toggle response.', response);
  }
}

async function sendToggleBuildIdentityOverlay(tabId: number): Promise<void> {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, createToggleBuildIdentityOverlayMessage());
  if (!isStatusMessage(response)) {
    console.warn('Image Trail received an unexpected build-info toggle response.', response);
  }
}

async function sendShortcutAction(tabId: number, action: string): Promise<void> {
  await ensureContentScript(tabId);
  const response = await chrome.tabs.sendMessage(tabId, createShortcutActionMessage(action));
  if (!isStatusMessage(response)) {
    console.warn('Image Trail received an unexpected shortcut action response.', response);
  }
}

function supportedTabId(tab: chrome.tabs.Tab): number | null {
  if (typeof tab.id === 'number' && tab.url && SUPPORTED_PAGE_PATTERN.test(tab.url)) return tab.id;
  return null;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = openImageTrailDb().then((result) => (result.status.ok ? result.db : null));
  }
  return dbPromise;
}

async function referencedBlobIds(): Promise<Set<string>> {
  const referenced = new Set(await bookmarkStore.loadOriginalBlobIds());
  for (const history of recentHistoryCache.values()) {
    for (const item of history) {
      if (item.blobId) referenced.add(item.blobId);
    }
  }
  return referenced;
}

function arrayBufferToBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < view.length; offset += chunkSize) {
    chunks.push(String.fromCharCode(...view.subarray(offset, offset + chunkSize)));
  }
  const binary = chunks.join('');
  return btoa(binary);
}

function dataUrlToImageBytes(
  dataUrl: string,
):
  | { readonly ok: true; readonly bytes: ArrayBuffer; readonly mimeType: string; readonly byteLength: number }
  | { readonly ok: false; readonly message: string } {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return { ok: false, message: 'Imported image data could not be decoded.' };
  const mimeType = match[1]!.toLowerCase();
  const base64 = match[2]!.replace(/\s/gu, '');
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { ok: true, bytes: bytes.buffer, mimeType, byteLength: bytes.byteLength };
  } catch {
    return { ok: false, message: 'Imported image data could not be decoded.' };
  }
}

function createPreviewForDataUrl(dataUrl: string): Promise<import('./messages.js').CreateBlobPreviewResultMessage['payload']> {
  const parsed = dataUrlToImageBytes(dataUrl);
  if (!parsed.ok) return Promise.resolve({ ok: false, reason: 'invalid-data-url', message: parsed.message });
  const token = crypto.randomUUID();
  previewPayloads.set(token, { dataUrl, byteLength: parsed.byteLength, createdAt: Date.now() });
  setTimeout(() => previewPayloads.delete(token), PREVIEW_TTL_MS);
  const previewUrl = chrome.runtime.getURL(`src/preview/preview.html#${encodeURIComponent(token)}`);
  return chrome.tabs
    .create({ url: previewUrl })
    .then(() => ({ ok: true as const, previewUrl, byteLength: parsed.byteLength }))
    .catch(() => {
      previewPayloads.delete(token);
      return { ok: false as const, reason: 'preview-blocked', message: 'Preview tab could not be opened by the extension.' };
    });
}

async function handleCaptureImage(message: CaptureImageMessage): Promise<import('../core/image/capture-result.js').CaptureResult> {
  const url = message.payload.url;
  const activeBlobKey = getActiveBlobKey();
  if (!activeBlobKey) {
    return {
      status: 'failed',
      reason: 'encryption-locked',
      message: 'Encrypted blob storage must be unlocked before original image capture.',
    };
  }

  const bytesResult = url.startsWith('data:image/')
    ? dataUrlToImageBytes(url)
    : await (async () => {
        const origin = extractOrigin(url);
        if (origin && !(await hasOriginPermission(origin))) {
          return { ok: false as const, reason: 'permission-needed', message: `Permission needed for ${origin}.`, origin };
        }
        return fetchImageBytes(url);
      })();
  if (!bytesResult.ok) {
    return 'reason' in bytesResult &&
      bytesResult.reason === 'permission-needed' &&
      'origin' in bytesResult &&
      typeof bytesResult.origin === 'string'
      ? { status: 'remote-only', reason: 'permission-needed', message: bytesResult.message, origin: bytesResult.origin }
      : { status: 'failed', reason: 'unknown', message: bytesResult.message };
  }

  const db = await getDb();
  if (!db) {
    return { status: 'failed', reason: 'unknown', message: 'Database unavailable.' };
  }

  const blobs = new BlobsRepository(db);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const aad = {
    id,
    kind: 'original' as const,
    schemaVersion: 1 as const,
    algorithm: 'AES-GCM' as const,
    createdAt: now,
    key: activeBlobKey.reference,
  };
  const sealed = await sealBlobPayload({
    key: activeBlobKey.key,
    aad,
    metadata: { mimeType: bytesResult.mimeType, byteLength: bytesResult.byteLength, sourceUrl: url, capturedAt: now },
    bytes: bytesResult.bytes,
  });

  const record: StoredBlobRecord = {
    id,
    kind: 'original',
    schemaVersion: 1,
    algorithm: 'AES-GCM',
    iv: sealed.iv,
    ciphertext: sealed.ciphertext,
    encryptedByteLength: sealed.encryptedByteLength,
    createdAt: now,
    key: activeBlobKey.reference,
    referenceCount: 1,
  };
  await blobs.put(record);
  return { status: 'captured', blobId: record.id, mimeType: bytesResult.mimeType, byteLength: bytesResult.byteLength };
}

async function handleDeleteBlob(message: DeleteBlobMessage): Promise<{ deleted: boolean; usage: StorageUsageSummary }> {
  const db = await getDb();
  if (!db) {
    return { deleted: false, usage: { totalBytes: 0, blobCount: 0 } };
  }
  const blobs = new BlobsRepository(db);
  await blobs.remove(message.payload.blobId);
  const usage = await handleStorageUsage();
  return { deleted: true, usage };
}

async function handleCleanupOrphanedBlobs(): Promise<import('./messages.js').CleanupOrphanedBlobsResultMessage['payload']> {
  const db = await getDb();
  if (!db) return { deletedCount: 0, usage: { totalBytes: 0, blobCount: 0 } };

  const referenced = await referencedBlobIds();

  const blobs = new BlobsRepository(db);
  const orphanedBlobIds = (await blobs.list()).filter((blob) => !referenced.has(blob.id)).map((blob) => blob.id);
  const deletedCount = await blobs.deleteMany(orphanedBlobIds);

  return { deletedCount, usage: await handleStorageUsage() };
}

async function handleExportOriginalBlobs(
  message: ExportOriginalBlobsMessage,
): Promise<import('./messages.js').ExportOriginalBlobsResultMessage['payload']> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const blobs = new BlobsRepository(db);
  const records: PortableStoredBlobRecord[] = [];
  const missingBlobIds: string[] = [];
  for (const blobId of [...new Set(message.payload.blobIds)]) {
    const record = await blobs.get(blobId);
    if (record?.kind === 'original') {
      records.push(portableStoredBlobRecord(record));
    } else {
      missingBlobIds.push(blobId);
    }
  }
  return { ok: true, records, missingBlobIds };
}

async function handleImportOriginalBlobs(
  message: ImportOriginalBlobsMessage,
): Promise<import('./messages.js').ImportOriginalBlobsResultMessage['payload']> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const blobs = new BlobsRepository(db);
  let importedCount = 0;
  try {
    for (const record of message.payload.records) {
      if (record.kind !== 'original') continue;
      await blobs.put(storedBlobRecordFromPortable(record));
      importedCount += 1;
    }
  } catch {
    return { ok: false, reason: 'invalid-original', message: 'Encrypted original backup payload was invalid.' };
  }
  return { ok: true, importedCount };
}

async function handleRetrieveBlob(message: RetrieveBlobMessage): Promise<import('./messages.js').RetrieveBlobResultMessage['payload']> {
  const activeBlobKey = getActiveBlobKey();
  if (!activeBlobKey) {
    return { ok: false, reason: 'encryption-locked', message: 'Encrypted blob storage must be unlocked before retrieval.' };
  }
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const record = await new BlobsRepository(db).get(message.payload.blobId);
  if (!record) return { ok: false, reason: 'not-found', message: 'Encrypted blob was not found.' };
  if (record.key.reference !== activeBlobKey.reference.reference) {
    return { ok: false, reason: 'wrong-key', message: `Unlock ${record.key.reference} before retrieving this blob.` };
  }
  const opened = await openBlobPayload({
    key: activeBlobKey.key,
    iv: record.iv,
    ciphertext: record.ciphertext,
    aad: {
      id: record.id,
      kind: record.kind,
      schemaVersion: record.schemaVersion,
      algorithm: record.algorithm,
      createdAt: record.createdAt,
      key: record.key,
    },
  });
  return {
    ok: true,
    blobId: record.id,
    dataUrl: `data:${opened.metadata.mimeType};base64,${arrayBufferToBase64(opened.bytes)}`,
    mimeType: opened.metadata.mimeType,
    byteLength: opened.metadata.byteLength,
    capturedAt: opened.metadata.capturedAt,
  };
}

async function handleCreateBlobPreview(
  message: CreateBlobPreviewMessage,
): Promise<import('./messages.js').CreateBlobPreviewResultMessage['payload']> {
  const retrieved = await handleRetrieveBlob({ type: MessageType.RetrieveBlob, version: 1, payload: { blobId: message.payload.blobId } });
  if (!retrieved.ok) return retrieved;
  const token = crypto.randomUUID();
  previewPayloads.set(token, { dataUrl: retrieved.dataUrl, byteLength: retrieved.byteLength, createdAt: Date.now() });
  setTimeout(() => previewPayloads.delete(token), PREVIEW_TTL_MS);
  const previewUrl = chrome.runtime.getURL(`src/preview/preview.html#${encodeURIComponent(token)}`);
  try {
    await chrome.tabs.create({ url: previewUrl });
  } catch {
    previewPayloads.delete(token);
    return { ok: false, reason: 'preview-blocked', message: 'Preview tab could not be opened by the extension.' };
  }
  return {
    ok: true,
    previewUrl,
    byteLength: retrieved.byteLength,
  };
}

async function handleFetchThumbnailSource(
  message: FetchThumbnailSourceMessage,
): Promise<import('./messages.js').FetchThumbnailSourceResultMessage['payload']> {
  return imageRequests.fetchThumbnail(message.payload.url, {
    intent: message.payload.intent,
    referrer: message.payload.referrer,
    contextKey: message.payload.contextKey,
    sourceProfile: message.payload.sourceProfile,
  });
}

async function handleProbeImageSource(
  message: ProbeImageSourceMessage,
): Promise<import('./messages.js').ProbeImageSourceResultMessage['payload']> {
  return imageRequests.probeSpeculativeImage(message.payload.url, {
    referrer: message.payload.referrer,
    timeoutMs: message.payload.timeoutMs,
    contextKey: message.payload.contextKey,
    probeMethod: message.payload.probeMethod,
  });
}

async function handleFetchBufferedImageSource(
  message: FetchBufferedImageSourceMessage,
): Promise<import('./messages.js').FetchBufferedImageSourceResultMessage['payload']> {
  return imageRequests.fetchBufferedImage(message.payload.url, {
    intent: message.payload.intent,
    referrer: message.payload.referrer,
    contextKey: message.payload.contextKey,
  });
}

async function handleCheckImageRequestPolicy(
  message: CheckImageRequestPolicyMessage,
): Promise<import('./messages.js').CheckImageRequestPolicyResultMessage['payload']> {
  return imageRequests.checkRequestPolicy(message.payload.url, {
    intent: message.payload.intent,
    referrer: message.payload.referrer,
    contextKey: message.payload.contextKey,
  });
}

async function handleFetchLinkedPage(
  message: FetchLinkedPageMessage,
): Promise<import('./messages.js').FetchLinkedPageResultMessage['payload']> {
  const maxBytes = Math.min(MAX_LINKED_PAGE_BYTES, Math.max(32_768, message.payload.maxBytes));
  const timeoutMs = Math.min(MAX_LINKED_PAGE_TIMEOUT_MS, Math.max(1000, message.payload.timeoutMs));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = new URL(message.payload.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, reason: 'unsupported-url', message: 'Linked page URL must use HTTP or HTTPS.' };
    }

    const response = await fetch(url.href, { credentials: 'include', signal: controller.signal });
    if (!response.ok) return { ok: false, reason: 'http-error', message: `Linked page returned ${response.status}.` };
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      return { ok: false, reason: 'too-large', message: 'Linked page is larger than the strategy limit.' };
    }

    const result = await readLimitedText(response, maxBytes);
    return { ok: true, text: result.text, byteLength: result.byteLength, finalUrl: response.url };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: 'Linked page fetch timed out.' };
    }
    if (error instanceof Error && error.message === 'too-large') {
      return { ok: false, reason: 'too-large', message: 'Linked page is larger than the strategy limit.' };
    }
    return { ok: false, reason: 'network-error', message: 'Linked page fetch failed.' };
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<{ readonly text: string; readonly byteLength: number }> {
  if (!response.body) {
    const text = await response.text();
    const byteLength = new TextEncoder().encode(text).byteLength;
    if (byteLength > maxBytes) throw new Error('too-large');
    return { text, byteLength };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      await reader.cancel();
      throw new Error('too-large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return { text: text + decoder.decode(), byteLength };
}

async function handleStorageUsage(): Promise<StorageUsageSummary> {
  const db = await getDb();
  if (!db) return { totalBytes: 0, blobCount: 0 };
  const blobs = new BlobsRepository(db);
  const pins = new EncryptedPinsRepository(db);
  const thumbnails = new EncryptedPinThumbnailsRepository(db);
  const [usage, bookmarkUsage, pinUsage, thumbnailUsage, referenced] = await Promise.all([
    blobs.getStorageUsage(),
    bookmarkStore.getStorageUsage(),
    pins.getStorageUsage(),
    thumbnails.getStorageUsage(),
    referencedBlobIds(),
  ]);
  const all = await blobs.list();
  const inlineThumbnailUsage = bookmarkUsage.thumbnails ?? { count: 0, totalBytes: 0 };
  const combinedThumbnailUsage = {
    count: inlineThumbnailUsage.count + thumbnailUsage.blobCount,
    totalBytes: inlineThumbnailUsage.totalBytes + thumbnailUsage.totalBytes,
  };
  const queueMetadataBytes = Math.max(0, bookmarkUsage.totalBytes - inlineThumbnailUsage.totalBytes) + pinUsage.totalBytes;
  return {
    totalBytes: usage.totalBytes + bookmarkUsage.totalBytes + pinUsage.totalBytes + thumbnailUsage.totalBytes,
    blobCount: usage.blobCount,
    orphanedBlobCount: all.filter((blob) => !referenced.has(blob.id)).length,
    originals: { count: usage.blobCount, totalBytes: usage.totalBytes },
    queueRecords: { count: bookmarkUsage.blobCount + pinUsage.blobCount, totalBytes: queueMetadataBytes },
    thumbnails: combinedThumbnailUsage,
  };
}

async function handleLoadParsedFieldState(
  message: LoadParsedFieldStateMessage,
): Promise<import('./messages.js').LoadParsedFieldStateResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: true, record: null };
  return { ok: true, record: await parsedFieldStateStore.load(hostname, message.payload.pageUrl) };
}

async function handleLoadParsedFieldStateBySource(
  message: import('./messages.js').LoadParsedFieldStateBySourceMessage,
): Promise<import('./messages.js').LoadParsedFieldStateBySourceResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: true, record: null };
  return { ok: true, record: await parsedFieldStateStore.loadForSource(hostname, message.payload.sourceUrl) };
}

async function handleSaveParsedFieldState(
  message: SaveParsedFieldStateMessage,
): Promise<import('./messages.js').SaveParsedFieldStateResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.record.hostname);
  if (!hostname) return { ok: false };
  await parsedFieldStateStore.save({ ...message.payload.record, hostname });
  return { ok: true };
}

async function handleListUrlReviewStatus(
  message: ListUrlReviewStatusMessage,
): Promise<import('./messages.js').ListUrlReviewStatusResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: true, records: [] };
  return { ok: true, records: await urlReviewStatusStore.list(hostname) };
}

async function handleSaveUrlReviewStatus(
  message: SaveUrlReviewStatusMessage,
): Promise<import('./messages.js').SaveUrlReviewStatusResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.record.hostname);
  if (!hostname) return { ok: false };
  const settings = await loadLocalSettings();
  await urlReviewStatusStore.save({ ...message.payload.record, hostname }, { maxRecordsPerHost: settings.urlReviewStatusLimit });
  return { ok: true };
}

async function handleImportUrlReviewStatus(
  message: ImportUrlReviewStatusMessage,
): Promise<import('./messages.js').ImportUrlReviewStatusResultMessage['payload']> {
  const records = message.payload.records
    .map((record) => {
      const hostname = normalizeHostname(record.hostname);
      return hostname ? { ...record, hostname } : null;
    })
    .filter((record): record is NonNullable<typeof record> => record !== null);
  const settings = await loadLocalSettings();
  return { ok: true, importedCount: await urlReviewStatusStore.importMany(records, { maxRecordsPerHost: settings.urlReviewStatusLimit }) };
}

async function handleClearUrlReviewStatus(
  message: ClearUrlReviewStatusMessage,
): Promise<import('./messages.js').ClearUrlReviewStatusResultMessage['payload']> {
  const filter = normalizeUrlReviewStatusClearFilter(message.payload.filter);
  if (!filter) return { ok: false, message: 'URL review status clear scope is invalid.' };
  return { ok: true, deletedCount: await urlReviewStatusStore.clear(filter) };
}

function normalizeUrlReviewStatusClearFilter(filter: UrlReviewStatusClearFilter): UrlReviewStatusClearFilter | null {
  if (filter.scope === 'all') return filter;
  const hostname = normalizeHostname(filter.hostname);
  if (!hostname) return null;
  if (filter.scope === 'hostname') return { scope: 'hostname', hostname };
  if (filter.scope === 'page') return typeof filter.pageUrl === 'string' ? { scope: 'page', hostname, pageUrl: filter.pageUrl } : null;
  return typeof filter.sourceUrl === 'string' ? { scope: 'source', hostname, sourceUrl: filter.sourceUrl } : null;
}

async function handleLoadLocalSettings(): Promise<import('./messages.js').LoadLocalSettingsResultMessage['payload']> {
  return { ok: true, settings: await loadLocalSettings() };
}

async function loadLocalSettings(): Promise<typeof DEFAULT_LOCAL_SETTINGS> {
  const stored = await chrome.storage.local.get(LOCAL_SETTINGS_KEY);
  const raw = stored[LOCAL_SETTINGS_KEY];
  if (typeof raw === 'string') {
    try {
      return migrateLocalSettings(JSON.parse(raw) as Partial<typeof DEFAULT_LOCAL_SETTINGS>);
    } catch {
      return DEFAULT_LOCAL_SETTINGS;
    }
  }
  return migrateLocalSettings(typeof raw === 'object' && raw !== null ? raw : DEFAULT_LOCAL_SETTINGS);
}

async function handleSaveLocalSettings(
  message: SaveLocalSettingsMessage,
): Promise<import('./messages.js').SaveLocalSettingsResultMessage['payload']> {
  const settings = migrateLocalSettings(message.payload.settings);
  await chrome.storage.local.set({ [LOCAL_SETTINGS_KEY]: settings });
  recentHistoryCache.pruneForSettings(settings);
  // Reconcile durable records with the (possibly changed) searchable-metadata policy — e.g. redact
  // plaintext bookmark URLs to their hash when the URL class tightens (#451). Fire-and-forget so
  // saving a setting never blocks on a durable pass, and internally flag-gated so it does real work
  // only when the URL mode actually changed (a deliberate policy toggle), never on startup.
  void bookmarkStore.applySearchableMetadataPolicy(settings.searchableMetadataPolicy).catch((error: unknown) => {
    console.warn('Image Trail could not reconcile the searchable-metadata policy.', error);
  });
  return { ok: true };
}

async function handleGrantPermissionAndCapture(
  message: GrantPermissionAndCaptureMessage,
): Promise<import('../core/image/capture-result.js').CaptureResult> {
  const { sourceType, sourceRecordId } = message.payload;
  const url = message.payload.url;
  const origin = extractOrigin(url);

  if (!origin) {
    return { status: 'failed', reason: 'unknown', message: 'Could not extract origin from URL.' };
  }

  const granted = await requestOriginPermission(origin);
  if (!granted) {
    return { status: 'failed', reason: 'permission-needed', message: 'Permission was not granted.' };
  }

  return handleCaptureImage(createCaptureImageMessage(url, sourceType, sourceRecordId));
}

async function handleDownloadImage(message: DownloadImageMessage): Promise<import('./messages.js').DownloadImageResultMessage['payload']> {
  try {
    const downloadId = await chrome.downloads.download({
      url: message.payload.url,
      filename: message.payload.fileName,
      saveAs: message.payload.saveAs,
      conflictAction: 'uniquify',
    });
    return { ok: true, downloadId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Image download could not be started.',
    };
  }
}

async function handleExportEncryptedImage(
  message: ExportEncryptedImageMessage,
): Promise<import('./messages.js').ExportEncryptedImageResultMessage['payload']> {
  const activeBlobKey = getActiveBlobKey();
  if (!activeBlobKey) {
    return { ok: false, reason: 'encryption-locked', message: 'Unlock encrypted originals before exporting encrypted images.' };
  }

  const bytesResult = message.payload.blobId
    ? await imageBytesFromStoredBlob(message.payload.blobId)
    : await imageBytesFromUrl(message.payload.url);
  if (!bytesResult.ok) return bytesResult;

  const result = await createEncryptedImageFile({
    bytes: bytesResult.bytes,
    mimeType: bytesResult.mimeType,
    sourceUrl: bytesResult.sourceUrl,
    fileName: message.payload.fileName,
    key: activeBlobKey.key,
    keyReference: activeBlobKey.reference,
  });
  return {
    ok: true,
    fileContent: result.fileContent,
    fileName: result.fileName,
    message: `Encrypted image export prepared for ${message.payload.fileName}.`,
  };
}

async function imageBytesFromStoredBlob(
  blobId: string,
): Promise<
  | { readonly ok: true; readonly bytes: ArrayBuffer; readonly mimeType: string; readonly sourceUrl: string }
  | { readonly ok: false; readonly reason: string; readonly message: string }
> {
  const activeBlobKey = getActiveBlobKey();
  if (!activeBlobKey) {
    return { ok: false, reason: 'encryption-locked', message: 'Unlock encrypted originals before exporting encrypted images.' };
  }
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const record = await new BlobsRepository(db).get(blobId);
  if (!record) return { ok: false, reason: 'not-found', message: 'Encrypted blob was not found.' };
  if (record.key.reference !== activeBlobKey.reference.reference) {
    return { ok: false, reason: 'wrong-key', message: `Unlock ${record.key.reference} before exporting this encrypted image.` };
  }
  const opened = await openBlobPayload({
    key: activeBlobKey.key,
    iv: record.iv,
    ciphertext: record.ciphertext,
    aad: {
      id: record.id,
      kind: record.kind,
      schemaVersion: record.schemaVersion,
      algorithm: record.algorithm,
      createdAt: record.createdAt,
      key: record.key,
    },
  });
  return {
    ok: true,
    bytes: opened.bytes,
    mimeType: opened.metadata.mimeType,
    sourceUrl: opened.metadata.sourceUrl,
  };
}

async function imageBytesFromUrl(
  url: string,
): Promise<
  | { readonly ok: true; readonly bytes: ArrayBuffer; readonly mimeType: string; readonly sourceUrl: string }
  | { readonly ok: false; readonly reason: string; readonly message: string }
> {
  const parsed = url.startsWith('data:image/') ? dataUrlToImageBytes(url) : await imageRequests.fetchOriginalImage(url);
  if (!parsed.ok) {
    const reason = 'reason' in parsed && typeof parsed.reason === 'string' ? parsed.reason : 'invalid-data-url';
    return { ok: false, reason, message: parsed.message };
  }
  return { ok: true, bytes: parsed.bytes, mimeType: parsed.mimeType, sourceUrl: url };
}

async function handleImportEncryptedImage(
  message: ImportEncryptedImageMessage,
): Promise<import('./messages.js').ImportEncryptedImageResultMessage['payload']> {
  let expectedKeyReference: string;
  try {
    expectedKeyReference = parseEncryptedImageFileHeader(message.payload.fileContent).keyReference;
  } catch (error) {
    return {
      ok: false,
      reason: 'invalid-format',
      message: error instanceof Error ? error.message : 'Encrypted image import file is invalid.',
    };
  }

  const activeBlobKey = getActiveBlobKey();
  if (!activeBlobKey) {
    return { ok: false, reason: 'encryption-locked', message: 'Unlock encrypted originals before importing encrypted images.' };
  }
  if (activeBlobKey.reference.reference !== expectedKeyReference) {
    return { ok: false, reason: 'wrong-key', message: `Unlock ${expectedKeyReference} before importing this encrypted image.` };
  }
  try {
    const result = await openEncryptedImageFile(message.payload.fileContent, activeBlobKey.key, expectedKeyReference);
    return {
      ok: true,
      dataUrl: `data:${result.mimeType};base64,${arrayBufferToBase64(result.bytes)}`,
      fileName: result.fileName,
      sourceUrl: result.sourceUrl,
      mimeType: result.mimeType,
      byteLength: result.bytes.byteLength,
      keyReference: result.keyReference,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'decryption-failed',
      message: error instanceof Error ? error.message : 'Encrypted image import failed.',
    };
  }
}

async function handleLoadBuildIdentity(): Promise<ReturnType<typeof createLoadBuildIdentityResultMessage>['payload']> {
  try {
    const response = await fetch(chrome.runtime.getURL('build-info.json'), { cache: 'no-store' });
    if (!response.ok) {
      return { ok: false, identity: null, message: 'Build identity could not be loaded.' };
    }
    const payload: unknown = await response.json();
    if (!isBuildIdentity(payload)) {
      return { ok: false, identity: null, message: 'Build identity payload was invalid.' };
    }
    return { ok: true, identity: payload };
  } catch {
    return { ok: false, identity: null, message: 'Build identity could not be loaded.' };
  }
}

type DispatchedRequestType = Exclude<
  ExtensionRequest['type'],
  typeof MessageType.TogglePanel | typeof MessageType.ToggleBuildIdentityOverlay | typeof MessageType.Ping
>;

/**
 * Message registry: the single source of truth for background request dispatch.
 * `satisfies Record<DispatchedRequestType, ...>` enforces completeness at compile
 * time -- every request type (except TogglePanel/Ping, handled by the content
 * script) must have exactly one entry, so adding a request without wiring it is a
 * type error. Each entry replaces one `case` of the former ~475-line switch:
 * `handle` runs the work, `respond` wraps the result into a response envelope, and
 * `fallback` supplies the reply used when the handler rejects. `requestSchema` is
 * reserved for schema validation (#271) and is not populated yet.
 */
const messageRegistry = {
  [MessageType.LoadBuildIdentity]: defineMessage({
    requestSchema: requestSchemas.loadBuildIdentityRequestSchema,
    handle: (_message: LoadBuildIdentityMessage) => handleLoadBuildIdentity(),
    respond: (result) => createLoadBuildIdentityResultMessage(result),
    fallback: () => createLoadBuildIdentityResultMessage({ ok: false, identity: null, message: 'Build identity could not be loaded.' }),
  }),
  ...createGalleryMessageRegistry(),
  ...createAlbumMessageRegistry({ albumStore, notifyLibraryChange }),
  [MessageType.CaptureImage]: defineMessage({
    requestSchema: requestSchemas.captureImageRequestSchema,
    handle: (message: CaptureImageMessage) => handleCaptureImage(message),
    respond: (result) => createCaptureResultMessage(result),
    fallback: () => createCaptureResultMessage({ status: 'failed', reason: 'unknown', message: 'Internal capture error.' }),
  }),
  [MessageType.DownloadImage]: defineMessage({
    requestSchema: requestSchemas.downloadImageRequestSchema,
    handle: (message: DownloadImageMessage) => handleDownloadImage(message),
    respond: (result) => createDownloadImageResultMessage(result),
    fallback: () => createDownloadImageResultMessage({ ok: false, message: 'Image download could not be started.' }),
  }),
  [MessageType.ExportEncryptedImage]: defineMessage({
    requestSchema: requestSchemas.exportEncryptedImageRequestSchema,
    handle: (message: ExportEncryptedImageMessage) => handleExportEncryptedImage(message),
    respond: (result) => createExportEncryptedImageResultMessage(result),
    fallback: () => createExportEncryptedImageResultMessage({ ok: false, reason: 'unknown', message: 'Encrypted image export failed.' }),
  }),
  [MessageType.ImportEncryptedImage]: defineMessage({
    requestSchema: requestSchemas.importEncryptedImageRequestSchema,
    handle: (message: ImportEncryptedImageMessage) => handleImportEncryptedImage(message),
    respond: (result) => createImportEncryptedImageResultMessage(result),
    fallback: () => createImportEncryptedImageResultMessage({ ok: false, reason: 'unknown', message: 'Encrypted image import failed.' }),
  }),
  [MessageType.StorageUsageRequest]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: StorageUsageRequestMessage) => handleStorageUsage(),
    respond: (result) => createStorageUsageResponseMessage(result),
    fallback: () => createStorageUsageResponseMessage({ totalBytes: 0, blobCount: 0 }),
  }),
  ...createBookmarkMessageRegistry({ bookmarkStore, notifyLibraryChange }),
  ...createRecentHistoryMessageRegistry(context),
  ...createRecallMessageRegistry(context),
  ...createPanelPositionMessageRegistry(context),
  [MessageType.LoadParsedFieldState]: defineMessage({
    requestSchema: requestSchemas.loadParsedFieldStateRequestSchema,
    handle: (message: LoadParsedFieldStateMessage) => handleLoadParsedFieldState(message),
    respond: (result) => createLoadParsedFieldStateResultMessage(result),
    fallback: () => createLoadParsedFieldStateResultMessage({ ok: false, message: 'Parsed field state could not be loaded.' }),
  }),
  [MessageType.LoadParsedFieldStateBySource]: defineMessage({
    requestSchema: requestSchemas.loadParsedFieldStateBySourceRequestSchema,
    handle: (message: LoadParsedFieldStateBySourceMessage) => handleLoadParsedFieldStateBySource(message),
    respond: (result) => createLoadParsedFieldStateBySourceResultMessage(result),
    fallback: () => createLoadParsedFieldStateBySourceResultMessage({ ok: false, message: 'Parsed field state could not be loaded.' }),
  }),
  [MessageType.SaveParsedFieldState]: defineMessage({
    requestSchema: requestSchemas.saveParsedFieldStateRequestSchema,
    handle: (message: SaveParsedFieldStateMessage) => handleSaveParsedFieldState(message),
    respond: (result) => createSaveParsedFieldStateResultMessage(result),
    fallback: () => createSaveParsedFieldStateResultMessage({ ok: false }),
  }),
  [MessageType.ListUrlReviewStatus]: defineMessage({
    requestSchema: requestSchemas.listUrlReviewStatusRequestSchema,
    handle: (message: ListUrlReviewStatusMessage) => handleListUrlReviewStatus(message),
    respond: (result) => createListUrlReviewStatusResultMessage(result),
    fallback: () => createListUrlReviewStatusResultMessage({ ok: false, message: 'URL review status could not be loaded.' }),
  }),
  [MessageType.SaveUrlReviewStatus]: defineMessage({
    requestSchema: requestSchemas.saveUrlReviewStatusRequestSchema,
    handle: (message: SaveUrlReviewStatusMessage) => handleSaveUrlReviewStatus(message),
    respond: (result) => createSaveUrlReviewStatusResultMessage(result),
    fallback: () => createSaveUrlReviewStatusResultMessage({ ok: false }),
  }),
  [MessageType.ImportUrlReviewStatus]: defineMessage({
    requestSchema: requestSchemas.importUrlReviewStatusRequestSchema,
    handle: (message: ImportUrlReviewStatusMessage) => handleImportUrlReviewStatus(message),
    respond: (result) => createImportUrlReviewStatusResultMessage(result),
    fallback: () => createImportUrlReviewStatusResultMessage({ ok: false, message: 'URL review status could not be imported.' }),
  }),
  [MessageType.ClearUrlReviewStatus]: defineMessage({
    requestSchema: requestSchemas.clearUrlReviewStatusRequestSchema,
    handle: (message: ClearUrlReviewStatusMessage) => handleClearUrlReviewStatus(message),
    respond: (result) => createClearUrlReviewStatusResultMessage(result),
    fallback: () => createClearUrlReviewStatusResultMessage({ ok: false, message: 'URL review status could not be cleared.' }),
  }),
  ...createUrlTemplateMessageRegistry(context),
  [MessageType.LoadLocalSettings]: defineMessage({
    requestSchema: requestSchemas.loadLocalSettingsRequestSchema,
    handle: (_message: LoadLocalSettingsMessage) => handleLoadLocalSettings(),
    respond: (result) => createLoadLocalSettingsResultMessage(result),
    fallback: () => createLoadLocalSettingsResultMessage({ ok: false, message: 'Local settings could not be loaded.' }),
  }),
  [MessageType.SaveLocalSettings]: defineMessage({
    requestSchema: requestSchemas.saveLocalSettingsRequestSchema,
    handle: (message: SaveLocalSettingsMessage) => handleSaveLocalSettings(message),
    respond: (result) => createSaveLocalSettingsResultMessage(result),
    fallback: () => createSaveLocalSettingsResultMessage({ ok: false }),
  }),
  ...createPCloudMessageRegistry(),
  [MessageType.DeleteBlob]: defineMessage({
    requestSchema: requestSchemas.deleteBlobRequestSchema,
    handle: (message: DeleteBlobMessage) => handleDeleteBlob(message),
    respond: (result) => createDeleteBlobResultMessage(result.deleted, result.usage),
    fallback: () => createDeleteBlobResultMessage(false, { totalBytes: 0, blobCount: 0 }),
  }),
  [MessageType.CleanupOrphanedBlobs]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: CleanupOrphanedBlobsMessage) => handleCleanupOrphanedBlobs(),
    respond: (result) => createCleanupOrphanedBlobsResultMessage(result),
    fallback: () => createCleanupOrphanedBlobsResultMessage({ deletedCount: 0, usage: { totalBytes: 0, blobCount: 0 } }),
  }),
  [MessageType.RetrieveBlob]: defineMessage({
    requestSchema: requestSchemas.retrieveBlobRequestSchema,
    handle: (message: RetrieveBlobMessage) => handleRetrieveBlob(message),
    respond: (result) => createRetrieveBlobResultMessage(result),
    fallback: () => createRetrieveBlobResultMessage({ ok: false, reason: 'unknown', message: 'Blob retrieval failed.' }),
  }),
  [MessageType.ExportOriginalBlobs]: defineMessage({
    requestSchema: requestSchemas.exportOriginalBlobsRequestSchema,
    handle: (message: ExportOriginalBlobsMessage) => handleExportOriginalBlobs(message),
    respond: (result) => createExportOriginalBlobsResultMessage(result),
    fallback: () => createExportOriginalBlobsResultMessage({ ok: false, reason: 'unknown', message: 'Encrypted originals export failed.' }),
  }),
  [MessageType.ImportOriginalBlobs]: defineMessage({
    requestSchema: requestSchemas.importOriginalBlobsRequestSchema,
    handle: (message: ImportOriginalBlobsMessage) => handleImportOriginalBlobs(message),
    respond: (result) => createImportOriginalBlobsResultMessage(result),
    fallback: () => createImportOriginalBlobsResultMessage({ ok: false, reason: 'unknown', message: 'Encrypted originals import failed.' }),
  }),
  [MessageType.CreateBlobPreview]: defineMessage({
    requestSchema: requestSchemas.createBlobPreviewRequestSchema,
    handle: (message: CreateBlobPreviewMessage) => handleCreateBlobPreview(message),
    respond: (result) => createCreateBlobPreviewResultMessage(result),
    fallback: () => createCreateBlobPreviewResultMessage({ ok: false, reason: 'unknown', message: 'Preview creation failed.' }),
  }),
  [MessageType.CreateDataUrlPreview]: defineMessage({
    requestSchema: requestSchemas.createDataUrlPreviewRequestSchema,
    handle: (message: CreateDataUrlPreviewMessage) => createPreviewForDataUrl(message.payload.dataUrl),
    respond: (result) => createCreateBlobPreviewResultMessage(result),
    fallback: () => createCreateBlobPreviewResultMessage({ ok: false, reason: 'unknown', message: 'Preview creation failed.' }),
  }),
  [MessageType.FetchThumbnailSource]: defineMessage({
    requestSchema: requestSchemas.fetchThumbnailSourceRequestSchema,
    handle: (message: FetchThumbnailSourceMessage) => handleFetchThumbnailSource(message),
    respond: (result) => createFetchThumbnailSourceResultMessage(result),
    fallback: () => createFetchThumbnailSourceResultMessage({ ok: false, reason: 'unknown', message: 'Thumbnail source fetch failed.' }),
  }),
  [MessageType.ProbeImageSource]: defineMessage({
    requestSchema: requestSchemas.probeImageSourceRequestSchema,
    handle: (message: ProbeImageSourceMessage) => handleProbeImageSource(message),
    respond: (result) => createProbeImageSourceResultMessage(result),
    fallback: () => createProbeImageSourceResultMessage({ ok: false, reason: 'unknown', message: 'Image probe failed.' }),
  }),
  [MessageType.FetchBufferedImageSource]: defineMessage({
    requestSchema: requestSchemas.fetchBufferedImageSourceRequestSchema,
    handle: (message: FetchBufferedImageSourceMessage) => handleFetchBufferedImageSource(message),
    respond: (result) => createFetchBufferedImageSourceResultMessage(result),
    fallback: () => createFetchBufferedImageSourceResultMessage({ ok: false, reason: 'unknown', message: 'Buffered image fetch failed.' }),
  }),
  [MessageType.CheckImageRequestPolicy]: defineMessage({
    requestSchema: requestSchemas.checkImageRequestPolicyRequestSchema,
    handle: (message: CheckImageRequestPolicyMessage) => handleCheckImageRequestPolicy(message),
    respond: (result) => createCheckImageRequestPolicyResultMessage(result),
    fallback: () => createCheckImageRequestPolicyResultMessage({ status: 'unknown' }),
  }),
  [MessageType.FetchLinkedPage]: defineMessage({
    requestSchema: requestSchemas.fetchLinkedPageRequestSchema,
    handle: (message: FetchLinkedPageMessage) => handleFetchLinkedPage(message),
    respond: (result) => createFetchLinkedPageResultMessage(result),
    fallback: () => createFetchLinkedPageResultMessage({ ok: false, reason: 'unknown', message: 'Linked page fetch failed.' }),
  }),
  ...createBlobKeyMessageRegistry(context),
  [MessageType.GrantPermissionAndCapture]: defineMessage({
    requestSchema: requestSchemas.grantPermissionAndCaptureRequestSchema,
    handle: (message: GrantPermissionAndCaptureMessage) => handleGrantPermissionAndCapture(message),
    respond: (result) => createCaptureResultMessage(result),
    fallback: () => createCaptureResultMessage({ status: 'failed', reason: 'unknown', message: 'Internal permission/capture error.' }),
  }),
} satisfies Record<DispatchedRequestType, MessageDef<ExtensionRequest, ExtensionResponse>>;

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionRequest(message)) return false;
  return dispatchRequest(messageRegistry, message, sendResponse);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message)) return false;
  if ((message as { type?: unknown }).type !== 'imageTrail.consumePreview') return false;
  const token = (message as { token?: unknown }).token;
  if (typeof token !== 'string') {
    sendResponse({ ok: false, reason: 'missing-token', message: 'Preview token is missing.' });
    return false;
  }
  const payload = previewPayloads.get(token);
  previewPayloads.delete(token);
  if (!payload || Date.now() - payload.createdAt > PREVIEW_TTL_MS) {
    sendResponse({ ok: false, reason: 'not-found', message: 'Preview expired or was not found.' });
    return false;
  }
  sendResponse({ ok: true, dataUrl: payload.dataUrl, byteLength: payload.byteLength });
  return false;
});

chrome.action.onClicked.addListener((tab) => {
  const tabId = supportedTabId(tab);
  if (tabId === null) {
    console.warn('Image Trail can only be injected into http(s) pages.');
    return;
  }

  sendToggle(tabId).catch((error: unknown) => {
    console.warn('Image Trail could not toggle the in-page panel.', error);
  });
});

chrome.commands.onCommand.addListener((command, tab) => {
  const shortcutAction = BROWSER_COMMAND_ACTIONS.get(command);
  if (!shortcutAction && command !== TOGGLE_BUILD_IDENTITY_COMMAND) return;
  if (!tab) {
    console.warn('Image Trail command did not include an active tab.');
    return;
  }
  const tabId = supportedTabId(tab);
  if (tabId === null) {
    console.warn('Image Trail commands can only run on http(s) pages.');
    return;
  }

  if (shortcutAction) {
    sendShortcutAction(tabId, shortcutAction).catch((error: unknown) => {
      console.warn('Image Trail could not run the browser shortcut action.', error);
    });
    return;
  }

  sendToggleBuildIdentityOverlay(tabId).catch((error: unknown) => {
    console.warn('Image Trail could not toggle the build-info overlay.', error);
  });
});
