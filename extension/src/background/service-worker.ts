import type { StorageUsageSummary } from '../core/image/capture-result.js';
import { isBuildIdentity } from '../core/build-info.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { IndexedDbBookmarkStore } from '../data/bookmarks-controller.js';
import { IndexedDbPanelPositionStore } from '../data/panel-position-controller.js';
import { IndexedDbParsedFieldStateStore } from '../data/parsed-field-state-controller.js';
import { IndexedDbUrlTemplateStore } from '../data/url-template-controller.js';
import { IndexedDbUrlReviewStatusStore } from '../data/url-review-status-controller.js';
import { RecentHistoryCache } from './recent-history-cache.js';
import { DEFAULT_LOCAL_SETTINGS, LOCAL_SETTINGS_KEY, migrateLocalSettings } from '../data/local-settings.js';
import { getActiveBlobKey, lockBlobKey } from '../data/crypto/blob-keyring.js';
import { activateWrappedBlobKey, createAndActivateWrappedBlobKey } from '../data/crypto/blob-keyring.js';
import { openBlobPayload, sealBlobPayload } from '../data/crypto/binary-envelope.js';
import { createEncryptedImageFile, openEncryptedImageFile, parseEncryptedImageFileHeader } from '../data/import-export/encrypted-image.js';
import {
  portableStoredBlobRecord,
  storedBlobRecordFromPortable,
  type PortableStoredBlobRecord,
} from '../data/import-export/full-backup.js';
import { exportStoredKeyBackupWithPassword, importStoredKeyBackupWithPassword } from '../data/import-export/key-backup.js';
import { openImageTrailDb } from '../data/db.js';
import { BlobsRepository } from '../data/repositories/blobs-repository.js';
import { EncryptedPinsRepository } from '../data/repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from '../data/repositories/encrypted-pin-thumbnails-repository.js';
import { KeysRepository } from '../data/repositories/keys-repository.js';
import type { StoredBlobRecord } from '../data/types.js';
import type { StoredKeyRecord } from '../data/crypto/types.js';
import type { RecallCandidate, UrlReviewStatusClearFilter } from '../core/types.js';
import { fetchImageBytes } from './fetch-image.js';
import {
  MessageType,
  createCaptureImageMessage,
  createBlobKeyResultMessage,
  createCaptureResultMessage,
  createClearUrlReviewStatusResultMessage,
  createCheckImageRequestPolicyResultMessage,
  createCleanupOrphanedBlobsResultMessage,
  createCreateBlobPreviewResultMessage,
  createDeleteBlobResultMessage,
  createDownloadImageResultMessage,
  createDownloadPCloudBackupResultMessage,
  createExportEncryptedImageResultMessage,
  createFetchLinkedPageResultMessage,
  createFetchThumbnailSourceResultMessage,
  createLoadParsedFieldStateBySourceResultMessage,
  createImportEncryptedImageResultMessage,
  createImportUrlReviewStatusResultMessage,
  createLoadBuildIdentityResultMessage,
  createAddRecentHistoryResultMessage,
  createConnectPCloudProviderResultMessage,
  createLoadRecentHistoryResultMessage,
  createLoadRecallCandidatesResultMessage,
  createLoadParsedFieldStateResultMessage,
  createLoadLocalSettingsResultMessage,
  createListGrabSourcePatternsResultMessage,
  createListPCloudBackupsResultMessage,
  createListUrlTemplatesResultMessage,
  createListUrlReviewStatusResultMessage,
  createRemoveRecentHistoryResultMessage,
  createRecallRecordsResultMessage,
  createSaveParsedFieldStateResultMessage,
  createSaveUrlReviewStatusResultMessage,
  createSaveLocalSettingsResultMessage,
  createSaveGrabSourcePatternResultMessage,
  createSaveUrlTemplateResultMessage,
  createDeleteGrabSourcePatternResultMessage,
  createDeleteUrlTemplateResultMessage,
  createDisconnectPCloudProviderResultMessage,
  createBlobKeyStatusResultMessage,
  createExportBlobKeyBackupResultMessage,
  createFetchBufferedImageSourceResultMessage,
  createExportOriginalBlobsResultMessage,
  createImportOriginalBlobsResultMessage,
  createImportBlobKeyBackupResultMessage,
  createPingMessage,
  createPCloudProviderStatusResultMessage,
  createProbeImageSourceResultMessage,
  createRetrieveBlobResultMessage,
  createStorageUsageResponseMessage,
  createTogglePanelMessage,
  createUploadPCloudBackupResultMessage,
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
import type { AddRecentHistoryMessage, LoadRecentHistoryMessage, RemoveRecentHistoryMessage } from './messages.js';
import type { LoadRecallCandidatesMessage, RecallRecordsMessage } from './messages.js';
import type { LoadParsedFieldStateMessage, SaveParsedFieldStateMessage } from './messages.js';
import type {
  ClearUrlReviewStatusMessage,
  ImportUrlReviewStatusMessage,
  ListUrlReviewStatusMessage,
  SaveUrlReviewStatusMessage,
} from './messages.js';
import type {
  DeleteGrabSourcePatternMessage,
  DeleteUrlTemplateMessage,
  ListGrabSourcePatternsMessage,
  ListUrlTemplatesMessage,
  SaveGrabSourcePatternMessage,
  SaveUrlTemplateMessage,
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
import type { SetupBlobKeyMessage, UnlockBlobKeyMessage, BlobKeyResultMessage } from './messages.js';
import type { ExportBlobKeyBackupMessage, ImportBlobKeyBackupMessage } from './messages.js';
import type { ImportEncryptedImageMessage } from './messages.js';
import type { DownloadPCloudBackupMessage, UploadPCloudBackupMessage } from './messages.js';
import { ImageRequestManager } from './image-request-manager.js';
import { extractOrigin, hasOriginPermission, requestOriginPermission } from './permissions.js';
import {
  connectPCloudProvider,
  disconnectPCloudProvider,
  downloadPCloudBackup,
  listPCloudBackups,
  loadPCloudProviderStatus,
  uploadPCloudBackup,
} from './pcloud-provider.js';
import * as v from 'valibot';
import { defineMessage, dispatchRequest, type MessageDef } from './message-dispatch.js';
import * as requestSchemas from './message-schemas.js';
import { imageDisplayRecordSchema } from '../core/display-records.schema.js';
import type { ExtensionRequest, ExtensionResponse } from './messages.js';
import type {
  BlobKeyStatusMessage,
  CleanupOrphanedBlobsMessage,
  ClearBlobKeyMessage,
  ConnectPCloudProviderMessage,
  CreateDataUrlPreviewMessage,
  DisconnectPCloudProviderMessage,
  ListPCloudBackupsMessage,
  LoadBuildIdentityMessage,
  LoadLocalSettingsMessage,
  LoadParsedFieldStateBySourceMessage,
  PCloudProviderStatusMessage,
  StorageUsageRequestMessage,
} from './messages.js';
import { createBookmarkMessageRegistry } from './handlers/bookmark-message-handlers.js';
import { createPanelPositionMessageRegistry } from './handlers/panel-position-handlers.js';
import { normalizeHostname } from './handlers/hostname.js';
import type { ServiceWorkerContext } from './service-worker-context.js';

const CONTENT_SCRIPT_FILE = 'src/content/content-script.js';
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
});
const panelPositionStore = new IndexedDbPanelPositionStore();
const parsedFieldStateStore = new IndexedDbParsedFieldStateStore();
const urlReviewStatusStore = new IndexedDbUrlReviewStatusStore();
const urlTemplateStore = new IndexedDbUrlTemplateStore();
const recentHistoryCache = new RecentHistoryCache();

/** Composition-root context handed to extracted handler modules; see {@link ServiceWorkerContext}. */
const context: ServiceWorkerContext = {
  bookmarkStore,
  panelPositionStore,
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

function isStoredBlobKey(record: StoredKeyRecord | undefined): record is StoredKeyRecord<'blob'> {
  return record?.kind === 'blob';
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

async function handleBlobKeyStatus(): Promise<import('./messages.js').BlobKeyStatusResultMessage['payload']> {
  const activeBlobKey = getActiveBlobKey();
  if (activeBlobKey) return { unlocked: true, keyReference: activeBlobKey.reference.reference, hasKey: true };
  const db = await getDb();
  if (!db) return { unlocked: false, keyReference: null, hasKey: false };
  const blobKeys = await new KeysRepository(db).listByKind('blob');
  return { unlocked: false, keyReference: null, hasKey: blobKeys.length > 0 };
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

async function handleListUrlTemplates(
  message: ListUrlTemplatesMessage,
): Promise<import('./messages.js').ListUrlTemplatesResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: true, templates: [] };
  return { ok: true, templates: await urlTemplateStore.load(hostname) };
}

async function handleSaveUrlTemplate(
  message: SaveUrlTemplateMessage,
): Promise<import('./messages.js').SaveUrlTemplateResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.template.hostname);
  if (!hostname) return { ok: false };
  await urlTemplateStore.save({ ...message.payload.template, hostname });
  return { ok: true };
}

async function handleDeleteUrlTemplate(
  message: DeleteUrlTemplateMessage,
): Promise<import('./messages.js').DeleteUrlTemplateResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: false };
  await urlTemplateStore.remove(hostname, message.payload.id);
  return { ok: true };
}

async function handleListGrabSourcePatterns(
  message: ListGrabSourcePatternsMessage,
): Promise<import('./messages.js').ListGrabSourcePatternsResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: true, patterns: [] };
  return { ok: true, patterns: await urlTemplateStore.loadGrabSourcePatterns(hostname) };
}

async function handleSaveGrabSourcePattern(
  message: SaveGrabSourcePatternMessage,
): Promise<import('./messages.js').SaveGrabSourcePatternResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.pattern.hostname);
  if (!hostname) return { ok: false };
  await urlTemplateStore.saveGrabSourcePattern({ ...message.payload.pattern, hostname });
  return { ok: true };
}

async function handleDeleteGrabSourcePattern(
  message: DeleteGrabSourcePatternMessage,
): Promise<import('./messages.js').DeleteGrabSourcePatternResultMessage['payload']> {
  const hostname = normalizeHostname(message.payload.hostname);
  if (!hostname) return { ok: false };
  await urlTemplateStore.removeGrabSourcePattern(hostname, message.payload.id);
  return { ok: true };
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
  return { ok: true };
}

async function handleLoadRecentHistory(
  message: LoadRecentHistoryMessage,
): Promise<import('./messages.js').LoadRecentHistoryResultMessage['payload']> {
  const settings = await loadLocalSettings();
  return { items: recentHistoryCache.load(message.payload.pageUrl, settings, message.payload.includeRetained ?? false) };
}

async function handleAddRecentHistory(
  message: AddRecentHistoryMessage,
): Promise<import('./messages.js').AddRecentHistoryResultMessage['payload']> {
  const settings = await loadLocalSettings();
  return { items: recentHistoryCache.add(message.payload.pageUrl, message.payload.item, settings) };
}

async function handleRemoveRecentHistory(
  message: RemoveRecentHistoryMessage,
): Promise<import('./messages.js').RemoveRecentHistoryResultMessage['payload']> {
  const settings = await loadLocalSettings();
  return { items: recentHistoryCache.remove(message.payload.pageUrl, message.payload.id, settings) };
}

async function handleLoadRecallCandidates(
  message: LoadRecallCandidatesMessage,
): Promise<import('./messages.js').LoadRecallCandidatesResultMessage['payload']> {
  const offset = Math.max(0, message.payload.offset);
  const limit = Math.max(1, Math.min(100, message.payload.limit));
  const page = await bookmarkStore.loadRecallPage({
    offset,
    limit,
    scope: message.payload.scope ?? 'global',
    currentPageUrl: message.payload.currentPageUrl,
  });
  const candidates = page.items.map(toRecallCandidate);
  const moreMessage = page.hasMore ? ` Showing ${candidates.length} of ${page.total}.` : '';
  return {
    ok: true,
    candidates,
    total: page.total,
    nextOffset: page.nextOffset,
    hasMore: page.hasMore,
    failedCount: page.failedCount,
    message: `Loaded ${candidates.length} recall record${candidates.length === 1 ? '' : 's'}.${moreMessage}`,
  };
}

async function handleRecallRecords(message: RecallRecordsMessage): Promise<import('./messages.js').RecallRecordsResultMessage['payload']> {
  const ids = message.payload.ids.filter(Boolean);
  if (ids.length === 0) return { ok: false, reason: 'empty-selection', message: 'Select one or more records to recall.' };
  const records = await bookmarkStore.moveToFront(ids);
  const failedCount = ids.length - records.length;
  return {
    ok: true,
    records,
    failedCount,
    message: `Recalled ${records.length} record${records.length === 1 ? '' : 's'}${failedCount ? `, ${failedCount} failed` : ''}.`,
  };
}

function toRecallCandidate(record: ImageDisplayRecord): RecallCandidate {
  return { ...record, envelopeCreatedAt: record.timestamp };
}

async function handleSetupBlobKey(message: SetupBlobKeyMessage): Promise<BlobKeyResultMessage['payload']> {
  const password = message.payload.password.trim();
  if (!password) return { ok: false, reason: 'empty-password', message: 'Enter a password to set up encrypted blob storage.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const wrapped = await createAndActivateWrappedBlobKey({ password });
  await new KeysRepository(db).put(wrapped.metadata);
  return {
    ok: true,
    keyReference: wrapped.metadata.reference,
    message: `Encrypted blob storage unlocked with ${wrapped.metadata.reference}.`,
  };
}

async function handleUnlockBlobKey(message: UnlockBlobKeyMessage): Promise<BlobKeyResultMessage['payload']> {
  const password = message.payload.password.trim();
  if (!password) return { ok: false, reason: 'empty-password', message: 'Enter a password to unlock encrypted blob storage.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const keys = new KeysRepository(db);
  const requested = message.payload.keyReference ? await keys.get(message.payload.keyReference) : undefined;
  const latest = [...(await keys.listByKind('blob'))].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const blobKey = requested ?? latest;
  if (!isStoredBlobKey(blobKey)) {
    return { ok: false, reason: 'missing-key', message: 'No encrypted blob key exists. Set up encrypted storage first.' };
  }
  await activateWrappedBlobKey(blobKey, password);
  return { ok: true, keyReference: blobKey.reference, message: `Encrypted blob storage unlocked with ${blobKey.reference}.` };
}

async function handleExportBlobKeyBackup(
  message: ExportBlobKeyBackupMessage,
): Promise<import('./messages.js').ExportBlobKeyBackupResultMessage['payload']> {
  const password = message.payload.password.trim();
  if (!password) return { ok: false, reason: 'empty-password', message: 'Enter a password to export a key backup.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const keys = new KeysRepository(db);
  const blobKey = message.payload.keyReference
    ? await keys.get(message.payload.keyReference)
    : latestKeyByCreatedAt(await keys.listByKind('blob'));
  if (!isStoredBlobKey(blobKey)) {
    return { ok: false, reason: 'missing-key', message: 'No encrypted blob key exists to back up.' };
  }
  const result = await exportStoredKeyBackupWithPassword(blobKey, password);
  if (!result.status.ok || !result.fileContent || !result.fileName) {
    return { ok: false, reason: result.status.code, message: result.status.message };
  }
  return {
    ok: true,
    keyReference: blobKey.reference,
    fileContent: result.fileContent,
    fileName: result.fileName,
    message: result.status.message,
  };
}

async function handleImportBlobKeyBackup(
  message: ImportBlobKeyBackupMessage,
): Promise<import('./messages.js').ImportBlobKeyBackupResultMessage['payload']> {
  const password = message.payload.password.trim();
  if (!password) return { ok: false, reason: 'empty-password', message: 'Enter a password to import a key backup.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const result = await importStoredKeyBackupWithPassword(message.payload.fileContent, password);
  if (!result.status.ok || !result.record) {
    return { ok: false, reason: result.status.code, message: result.status.message };
  }
  if (!isStoredBlobKey(result.record)) {
    return { ok: false, reason: 'unsupported-key', message: 'Only blob key backups can be imported here.' };
  }
  const keys = new KeysRepository(db);
  if (await keys.get(result.record.reference)) {
    return {
      ok: true,
      keyReference: result.record.reference,
      imported: false,
      message: `Key backup already exists for ${result.record.reference}.`,
    };
  }
  await keys.put(result.record);
  return {
    ok: true,
    keyReference: result.record.reference,
    imported: true,
    message: `Imported key backup for ${result.record.reference}.`,
  };
}

async function handleClearBlobKey(): Promise<BlobKeyResultMessage['payload']> {
  lockBlobKey();
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const keys = new KeysRepository(db);
  const blobKeys = await keys.listByKind('blob');
  for (const key of blobKeys) {
    await keys.remove(key.reference);
  }
  return { ok: true, keyReference: '', message: 'Encrypted blob key cleared. Import a key backup to recover encrypted originals.' };
}

function latestKeyByCreatedAt(keys: readonly StoredKeyRecord[]): StoredKeyRecord | undefined {
  return keys.reduce<StoredKeyRecord | undefined>((latest, key) => (!latest || key.createdAt > latest.createdAt ? key : latest), undefined);
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

type DispatchedRequestType = Exclude<ExtensionRequest['type'], typeof MessageType.TogglePanel | typeof MessageType.Ping>;

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
  ...createBookmarkMessageRegistry({ bookmarkStore }),
  [MessageType.LoadRecentHistory]: defineMessage({
    requestSchema: requestSchemas.loadRecentHistoryRequestSchema,
    handle: (message: LoadRecentHistoryMessage) => handleLoadRecentHistory(message),
    respond: (result) => createLoadRecentHistoryResultMessage(result.items),
    fallback: () => createLoadRecentHistoryResultMessage([]),
  }),
  [MessageType.AddRecentHistory]: defineMessage({
    requestSchema: requestSchemas.addRecentHistoryRequestSchema,
    handle: (message: AddRecentHistoryMessage) => handleAddRecentHistory(message),
    respond: (result) => createAddRecentHistoryResultMessage(result.items),
    // Only echo the item back optimistically when it is a valid record; a payload that
    // failed validation reaches this fallback too, and its `item` may be malformed.
    fallback: (message) =>
      createAddRecentHistoryResultMessage(v.is(imageDisplayRecordSchema, message.payload.item) ? [message.payload.item] : []),
  }),
  [MessageType.RemoveRecentHistory]: defineMessage({
    requestSchema: requestSchemas.removeRecentHistoryRequestSchema,
    handle: (message: RemoveRecentHistoryMessage) => handleRemoveRecentHistory(message),
    respond: (result) => createRemoveRecentHistoryResultMessage(result.items),
    fallback: () => createRemoveRecentHistoryResultMessage([]),
  }),
  [MessageType.LoadRecallCandidates]: defineMessage({
    requestSchema: requestSchemas.loadRecallCandidatesRequestSchema,
    handle: (message: LoadRecallCandidatesMessage) => handleLoadRecallCandidates(message),
    respond: (result) => createLoadRecallCandidatesResultMessage(result),
    fallback: () =>
      createLoadRecallCandidatesResultMessage({ ok: false, reason: 'unknown', message: 'Recall records could not be loaded.' }),
  }),
  [MessageType.RecallRecords]: defineMessage({
    requestSchema: requestSchemas.recallRecordsRequestSchema,
    handle: (message: RecallRecordsMessage) => handleRecallRecords(message),
    respond: (result) => createRecallRecordsResultMessage(result),
    fallback: () => createRecallRecordsResultMessage({ ok: false, reason: 'unknown', message: 'Selected records could not be recalled.' }),
  }),
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
  [MessageType.ListUrlTemplates]: defineMessage({
    requestSchema: requestSchemas.listUrlTemplatesRequestSchema,
    handle: (message: ListUrlTemplatesMessage) => handleListUrlTemplates(message),
    respond: (result) => createListUrlTemplatesResultMessage(result),
    fallback: () => createListUrlTemplatesResultMessage({ ok: false, message: 'URL templates could not be loaded.' }),
  }),
  [MessageType.SaveUrlTemplate]: defineMessage({
    requestSchema: requestSchemas.saveUrlTemplateRequestSchema,
    handle: (message: SaveUrlTemplateMessage) => handleSaveUrlTemplate(message),
    respond: (result) => createSaveUrlTemplateResultMessage(result),
    fallback: () => createSaveUrlTemplateResultMessage({ ok: false }),
  }),
  [MessageType.DeleteUrlTemplate]: defineMessage({
    requestSchema: requestSchemas.deleteUrlTemplateRequestSchema,
    handle: (message: DeleteUrlTemplateMessage) => handleDeleteUrlTemplate(message),
    respond: (result) => createDeleteUrlTemplateResultMessage(result),
    fallback: () => createDeleteUrlTemplateResultMessage({ ok: false }),
  }),
  [MessageType.ListGrabSourcePatterns]: defineMessage({
    requestSchema: requestSchemas.listGrabSourcePatternsRequestSchema,
    handle: (message: ListGrabSourcePatternsMessage) => handleListGrabSourcePatterns(message),
    respond: (result) => createListGrabSourcePatternsResultMessage(result),
    fallback: () => createListGrabSourcePatternsResultMessage({ ok: false, message: 'Grab source patterns could not be loaded.' }),
  }),
  [MessageType.SaveGrabSourcePattern]: defineMessage({
    requestSchema: requestSchemas.saveGrabSourcePatternRequestSchema,
    handle: (message: SaveGrabSourcePatternMessage) => handleSaveGrabSourcePattern(message),
    respond: (result) => createSaveGrabSourcePatternResultMessage(result),
    fallback: () => createSaveGrabSourcePatternResultMessage({ ok: false }),
  }),
  [MessageType.DeleteGrabSourcePattern]: defineMessage({
    requestSchema: requestSchemas.deleteGrabSourcePatternRequestSchema,
    handle: (message: DeleteGrabSourcePatternMessage) => handleDeleteGrabSourcePattern(message),
    respond: (result) => createDeleteGrabSourcePatternResultMessage(result),
    fallback: () => createDeleteGrabSourcePatternResultMessage({ ok: false }),
  }),
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
  [MessageType.PCloudProviderStatus]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: PCloudProviderStatusMessage) => loadPCloudProviderStatus(),
    respond: (result) => createPCloudProviderStatusResultMessage(result),
    fallback: () => createPCloudProviderStatusResultMessage({ connected: false, message: 'pCloud status could not be loaded.' }),
  }),
  [MessageType.ConnectPCloudProvider]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: ConnectPCloudProviderMessage) => connectPCloudProvider(),
    respond: (result) => createConnectPCloudProviderResultMessage(result),
    fallback: () =>
      createConnectPCloudProviderResultMessage({
        ok: false,
        status: { connected: false, message: 'pCloud connection failed.' },
        message: 'pCloud connection failed.',
      }),
  }),
  [MessageType.DisconnectPCloudProvider]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: DisconnectPCloudProviderMessage) => disconnectPCloudProvider(),
    respond: (result) => createDisconnectPCloudProviderResultMessage(result),
    fallback: () =>
      createDisconnectPCloudProviderResultMessage({
        ok: false,
        status: { connected: false, message: 'pCloud disconnect failed.' },
        message: 'pCloud disconnect failed.',
      }),
  }),
  [MessageType.UploadPCloudBackup]: defineMessage({
    requestSchema: requestSchemas.uploadPCloudBackupRequestSchema,
    handle: (message: UploadPCloudBackupMessage) => uploadPCloudBackup(message.payload),
    respond: (result) => createUploadPCloudBackupResultMessage(result),
    fallback: () =>
      createUploadPCloudBackupResultMessage({
        ok: false,
        status: { connected: false, message: 'pCloud backup upload failed.', messageIsError: true },
        reason: 'upload-failed',
        message: 'pCloud backup upload failed.',
      }),
  }),
  [MessageType.ListPCloudBackups]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: ListPCloudBackupsMessage) => listPCloudBackups(),
    respond: (result) => createListPCloudBackupsResultMessage(result),
    fallback: () =>
      createListPCloudBackupsResultMessage({
        ok: false,
        status: { connected: false, message: 'pCloud backups could not be listed.', messageIsError: true },
        reason: 'list-failed',
        message: 'pCloud backups could not be listed.',
      }),
  }),
  [MessageType.DownloadPCloudBackup]: defineMessage({
    requestSchema: requestSchemas.downloadPCloudBackupRequestSchema,
    handle: (message: DownloadPCloudBackupMessage) => downloadPCloudBackup(message.payload),
    respond: (result) => createDownloadPCloudBackupResultMessage(result),
    fallback: () =>
      createDownloadPCloudBackupResultMessage({
        ok: false,
        status: { connected: false, message: 'pCloud backup could not be downloaded.', messageIsError: true },
        reason: 'download-failed',
        message: 'pCloud backup could not be downloaded.',
      }),
  }),
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
  [MessageType.BlobKeyStatus]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: BlobKeyStatusMessage) => handleBlobKeyStatus(),
    respond: (result) => createBlobKeyStatusResultMessage(result),
    fallback: () => createBlobKeyStatusResultMessage({ unlocked: false, keyReference: null, hasKey: false }),
  }),
  [MessageType.SetupBlobKey]: defineMessage({
    requestSchema: requestSchemas.setupBlobKeyRequestSchema,
    handle: (message: SetupBlobKeyMessage) => handleSetupBlobKey(message),
    respond: (result) => createBlobKeyResultMessage(result),
    fallback: () => createBlobKeyResultMessage({ ok: false, reason: 'unknown', message: 'Blob key setup failed.' }),
  }),
  [MessageType.UnlockBlobKey]: defineMessage({
    requestSchema: requestSchemas.unlockBlobKeyRequestSchema,
    handle: (message: UnlockBlobKeyMessage) => handleUnlockBlobKey(message),
    respond: (result) => createBlobKeyResultMessage(result),
    fallback: () => createBlobKeyResultMessage({ ok: false, reason: 'unknown', message: 'Blob key unlock failed.' }),
  }),
  [MessageType.ClearBlobKey]: defineMessage({
    requestSchema: requestSchemas.emptyPayloadSchema,
    handle: (_message: ClearBlobKeyMessage) => handleClearBlobKey(),
    respond: (result) => createBlobKeyResultMessage(result),
    fallback: () => createBlobKeyResultMessage({ ok: false, reason: 'unknown', message: 'Blob key clear failed.' }),
  }),
  [MessageType.ExportBlobKeyBackup]: defineMessage({
    requestSchema: requestSchemas.exportBlobKeyBackupRequestSchema,
    handle: (message: ExportBlobKeyBackupMessage) => handleExportBlobKeyBackup(message),
    respond: (result) => createExportBlobKeyBackupResultMessage(result),
    fallback: () => createExportBlobKeyBackupResultMessage({ ok: false, reason: 'unknown', message: 'Key backup export failed.' }),
  }),
  [MessageType.ImportBlobKeyBackup]: defineMessage({
    requestSchema: requestSchemas.importBlobKeyBackupRequestSchema,
    handle: (message: ImportBlobKeyBackupMessage) => handleImportBlobKeyBackup(message),
    respond: (result) => createImportBlobKeyBackupResultMessage(result),
    fallback: () => createImportBlobKeyBackupResultMessage({ ok: false, reason: 'unknown', message: 'Key backup import failed.' }),
  }),
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
  const tabId = tab.id;
  if (typeof tabId !== 'number' || !tab.url || !SUPPORTED_PAGE_PATTERN.test(tab.url)) {
    console.warn('Image Trail can only be injected into http(s) pages.');
    return;
  }

  sendToggle(tabId).catch((error: unknown) => {
    console.warn('Image Trail could not toggle the in-page panel.', error);
  });
});
