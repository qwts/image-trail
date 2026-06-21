import type { StorageUsageSummary } from '../core/image/capture-result.js';
import { computeSha256 } from '../core/image/fingerprints.js';
import { IndexedDbBookmarkStore } from '../data/bookmarks-controller.js';
import { getActiveBlobKey, lockBlobKey } from '../data/crypto/blob-keyring.js';
import { activateWrappedBlobKey, createAndActivateWrappedBlobKey } from '../data/crypto/blob-keyring.js';
import { openBlobPayload, sealBlobPayload } from '../data/crypto/binary-envelope.js';
import { exportStoredKeyBackupWithPassword, importStoredKeyBackupWithPassword } from '../data/import-export/key-backup.js';
import { openImageTrailDb } from '../data/db.js';
import { BlobsRepository } from '../data/repositories/blobs-repository.js';
import { KeysRepository } from '../data/repositories/keys-repository.js';
import type { StoredBlobRecord } from '../data/types.js';
import type { StoredKeyRecord } from '../data/crypto/types.js';
import { fetchImageBytes } from './fetch-image.js';
import {
  MessageType,
  createCaptureImageMessage,
  createBlobKeyResultMessage,
  createCaptureResultMessage,
  createCleanupOrphanedBlobsResultMessage,
  createCreateBlobPreviewResultMessage,
  createDeleteBlobResultMessage,
  createDownloadImageResultMessage,
  createFetchThumbnailSourceResultMessage,
  createLoadBookmarksResultMessage,
  createAddRecentHistoryResultMessage,
  createLoadRecentHistoryResultMessage,
  createRemoveBookmarkResultMessage,
  createRemoveRecentHistoryResultMessage,
  createSaveBookmarkResultMessage,
  createBlobKeyStatusResultMessage,
  createExportBlobKeyBackupResultMessage,
  createImportBlobKeyBackupResultMessage,
  createPingMessage,
  createRetrieveBlobResultMessage,
  createStorageUsageResponseMessage,
  createTogglePanelMessage,
  isExtensionRequest,
  isStatusMessage,
} from './messages.js';
import type {
  CaptureImageMessage,
  DeleteBlobMessage,
  DownloadImageMessage,
  RetrieveBlobMessage,
  GrantPermissionAndCaptureMessage,
} from './messages.js';
import type { LoadBookmarksMessage, RemoveBookmarkMessage, SaveBookmarkMessage } from './messages.js';
import type { AddRecentHistoryMessage, LoadRecentHistoryMessage, RemoveRecentHistoryMessage } from './messages.js';
import type { FetchThumbnailSourceMessage } from './messages.js';
import type { CreateBlobPreviewMessage } from './messages.js';
import type { SetupBlobKeyMessage, UnlockBlobKeyMessage, BlobKeyResultMessage } from './messages.js';
import type { ExportBlobKeyBackupMessage, ImportBlobKeyBackupMessage } from './messages.js';
import { extractOrigin, hasOriginPermission, requestOriginPermission } from './permissions.js';

const CONTENT_SCRIPT_FILE = 'src/content/content-script.js';
const SUPPORTED_PAGE_PATTERN = /^https?:\/\//u;
const PREVIEW_TTL_MS = 60_000;
const MAX_THUMBNAIL_SOURCE_BYTES = 5 * 1024 * 1024;

interface PreviewPayload {
  readonly dataUrl: string;
  readonly byteLength: number;
  readonly createdAt: number;
}

const previewPayloads = new Map<string, PreviewPayload>();
const bookmarkStore = new IndexedDbBookmarkStore();
const recentHistoryBySite = new Map<string, import('../core/display-records.js').ImageDisplayRecord[]>();
const MAX_RECENT_HISTORY_ITEMS = 30;

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

function recentHistoryKey(pageUrl: string): string {
  try {
    return new URL(pageUrl).hostname;
  } catch {
    return 'unknown';
  }
}

async function referencedBlobIds(): Promise<Set<string>> {
  const referenced = new Set<string>();
  for (const bookmark of await bookmarkStore.load()) {
    if (bookmark.blobId) referenced.add(bookmark.blobId);
  }
  for (const history of recentHistoryBySite.values()) {
    for (const item of history) {
      if (item.blobId) referenced.add(item.blobId);
    }
  }
  return referenced;
}

function isStoredBlobKey(record: StoredKeyRecord | undefined): record is StoredKeyRecord<'blob'> {
  return record?.kind === 'blob';
}

function arrayBufferToBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
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
  const usage = await blobs.getStorageUsage();
  return { deleted: true, usage };
}

async function handleCleanupOrphanedBlobs(): Promise<import('./messages.js').CleanupOrphanedBlobsResultMessage['payload']> {
  if (!getActiveBlobKey()) return { deletedCount: 0, usage: await handleStorageUsage() };

  const db = await getDb();
  if (!db) return { deletedCount: 0, usage: { totalBytes: 0, blobCount: 0 } };

  const referenced = await referencedBlobIds();

  const blobs = new BlobsRepository(db);
  const orphanedBlobIds = (await blobs.list()).filter((blob) => !referenced.has(blob.id)).map((blob) => blob.id);
  const deletedCount = await blobs.deleteMany(orphanedBlobIds);

  return { deletedCount, usage: await blobs.getStorageUsage() };
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
  const fetchResult = await fetchImageBytes(message.payload.url, MAX_THUMBNAIL_SOURCE_BYTES, {
    referrer: message.payload.referrer,
  });
  if (!fetchResult.ok) {
    return { ok: false, reason: fetchResult.reason, message: fetchResult.message };
  }
  return {
    ok: true,
    dataUrl: `data:${fetchResult.mimeType};base64,${arrayBufferToBase64(fetchResult.bytes)}`,
    mimeType: fetchResult.mimeType,
    byteLength: fetchResult.byteLength,
    sha256: await computeSha256(fetchResult.bytes),
  };
}

async function handleStorageUsage(): Promise<StorageUsageSummary> {
  const db = await getDb();
  if (!db) return { totalBytes: 0, blobCount: 0 };
  const blobs = new BlobsRepository(db);
  const [usage, referenced] = await Promise.all([blobs.getStorageUsage(), referencedBlobIds()]);
  const all = await blobs.list();
  return { ...usage, orphanedBlobCount: all.filter((blob) => !referenced.has(blob.id)).length };
}

async function handleLoadBookmarks(message: LoadBookmarksMessage): Promise<import('./messages.js').LoadBookmarksResultMessage['payload']> {
  return bookmarkStore.loadPage(message.payload);
}

async function handleSaveBookmark(message: SaveBookmarkMessage): Promise<import('./messages.js').SaveBookmarkResultMessage['payload']> {
  const record = await bookmarkStore.save(message.payload.record);
  return { ok: true, record };
}

async function handleRemoveBookmark(
  message: RemoveBookmarkMessage,
): Promise<import('./messages.js').RemoveBookmarkResultMessage['payload']> {
  await bookmarkStore.remove(message.payload.record);
  return { ok: true };
}

function handleLoadRecentHistory(message: LoadRecentHistoryMessage): import('./messages.js').LoadRecentHistoryResultMessage['payload'] {
  return { items: recentHistoryBySite.get(recentHistoryKey(message.payload.pageUrl)) ?? [] };
}

function handleAddRecentHistory(message: AddRecentHistoryMessage): import('./messages.js').AddRecentHistoryResultMessage['payload'] {
  const key = recentHistoryKey(message.payload.pageUrl);
  const item = message.payload.item;
  const next = [item, ...(recentHistoryBySite.get(key) ?? []).filter((entry) => entry.url !== item.url && entry.id !== item.id)].slice(
    0,
    MAX_RECENT_HISTORY_ITEMS,
  );
  recentHistoryBySite.set(key, next);
  return { items: next };
}

function handleRemoveRecentHistory(
  message: RemoveRecentHistoryMessage,
): import('./messages.js').RemoveRecentHistoryResultMessage['payload'] {
  const key = recentHistoryKey(message.payload.pageUrl);
  const next = (recentHistoryBySite.get(key) ?? []).filter((entry) => entry.id !== message.payload.id);
  recentHistoryBySite.set(key, next);
  return { items: next };
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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionRequest(message)) return false;

  switch (message.type) {
    case MessageType.CaptureImage:
      handleCaptureImage(message)
        .then((result) => sendResponse(createCaptureResultMessage(result)))
        .catch(() => sendResponse(createCaptureResultMessage({ status: 'failed', reason: 'unknown', message: 'Internal capture error.' })));
      return true;

    case MessageType.DownloadImage:
      handleDownloadImage(message)
        .then((result) => sendResponse(createDownloadImageResultMessage(result)))
        .catch(() => sendResponse(createDownloadImageResultMessage({ ok: false, message: 'Image download could not be started.' })));
      return true;

    case MessageType.StorageUsageRequest:
      handleStorageUsage()
        .then((usage) => sendResponse(createStorageUsageResponseMessage(usage)))
        .catch(() => sendResponse(createStorageUsageResponseMessage({ totalBytes: 0, blobCount: 0 })));
      return true;

    case MessageType.LoadBookmarks:
      handleLoadBookmarks(message)
        .then((result) => sendResponse(createLoadBookmarksResultMessage(result)))
        .catch(() =>
          sendResponse(
            createLoadBookmarksResultMessage({
              items: [],
              offset: message.payload.offset,
              limit: message.payload.limit,
              total: 0,
              hasOlder: false,
              hasNewer: false,
            }),
          ),
        );
      return true;

    case MessageType.LoadRecentHistory:
      sendResponse(createLoadRecentHistoryResultMessage(handleLoadRecentHistory(message).items));
      return false;

    case MessageType.AddRecentHistory:
      sendResponse(createAddRecentHistoryResultMessage(handleAddRecentHistory(message).items));
      return false;

    case MessageType.RemoveRecentHistory:
      sendResponse(createRemoveRecentHistoryResultMessage(handleRemoveRecentHistory(message).items));
      return false;

    case MessageType.SaveBookmark:
      handleSaveBookmark(message)
        .then((result) => sendResponse(createSaveBookmarkResultMessage(result)))
        .catch(() => sendResponse(createSaveBookmarkResultMessage({ ok: false, message: 'Bookmark save failed.' })));
      return true;

    case MessageType.RemoveBookmark:
      handleRemoveBookmark(message)
        .then((result) => sendResponse(createRemoveBookmarkResultMessage(result)))
        .catch(() => sendResponse(createRemoveBookmarkResultMessage({ ok: false })));
      return true;

    case MessageType.DeleteBlob:
      handleDeleteBlob(message)
        .then(({ deleted, usage }) => sendResponse(createDeleteBlobResultMessage(deleted, usage)))
        .catch(() => sendResponse(createDeleteBlobResultMessage(false, { totalBytes: 0, blobCount: 0 })));
      return true;

    case MessageType.CleanupOrphanedBlobs:
      handleCleanupOrphanedBlobs()
        .then((result) => sendResponse(createCleanupOrphanedBlobsResultMessage(result)))
        .catch(() => sendResponse(createCleanupOrphanedBlobsResultMessage({ deletedCount: 0, usage: { totalBytes: 0, blobCount: 0 } })));
      return true;

    case MessageType.RetrieveBlob:
      handleRetrieveBlob(message)
        .then((result) => sendResponse(createRetrieveBlobResultMessage(result)))
        .catch(() => sendResponse(createRetrieveBlobResultMessage({ ok: false, reason: 'unknown', message: 'Blob retrieval failed.' })));
      return true;

    case MessageType.CreateBlobPreview:
      handleCreateBlobPreview(message)
        .then((result) => sendResponse(createCreateBlobPreviewResultMessage(result)))
        .catch(() =>
          sendResponse(createCreateBlobPreviewResultMessage({ ok: false, reason: 'unknown', message: 'Preview creation failed.' })),
        );
      return true;

    case MessageType.CreateDataUrlPreview:
      createPreviewForDataUrl(message.payload.dataUrl)
        .then((result) => sendResponse(createCreateBlobPreviewResultMessage(result)))
        .catch(() =>
          sendResponse(createCreateBlobPreviewResultMessage({ ok: false, reason: 'unknown', message: 'Preview creation failed.' })),
        );
      return true;

    case MessageType.FetchThumbnailSource:
      handleFetchThumbnailSource(message)
        .then((result) => sendResponse(createFetchThumbnailSourceResultMessage(result)))
        .catch(() =>
          sendResponse(
            createFetchThumbnailSourceResultMessage({ ok: false, reason: 'unknown', message: 'Thumbnail source fetch failed.' }),
          ),
        );
      return true;

    case MessageType.BlobKeyStatus:
      handleBlobKeyStatus()
        .then((result) => sendResponse(createBlobKeyStatusResultMessage(result)))
        .catch(() => sendResponse(createBlobKeyStatusResultMessage({ unlocked: false, keyReference: null, hasKey: false })));
      return true;

    case MessageType.SetupBlobKey:
      handleSetupBlobKey(message)
        .then((result) => sendResponse(createBlobKeyResultMessage(result)))
        .catch(() => sendResponse(createBlobKeyResultMessage({ ok: false, reason: 'unknown', message: 'Blob key setup failed.' })));
      return true;

    case MessageType.UnlockBlobKey:
      handleUnlockBlobKey(message)
        .then((result) => sendResponse(createBlobKeyResultMessage(result)))
        .catch(() => sendResponse(createBlobKeyResultMessage({ ok: false, reason: 'unknown', message: 'Blob key unlock failed.' })));
      return true;

    case MessageType.ClearBlobKey:
      handleClearBlobKey()
        .then((result) => sendResponse(createBlobKeyResultMessage(result)))
        .catch(() => sendResponse(createBlobKeyResultMessage({ ok: false, reason: 'unknown', message: 'Blob key clear failed.' })));
      return true;

    case MessageType.ExportBlobKeyBackup:
      handleExportBlobKeyBackup(message)
        .then((result) => sendResponse(createExportBlobKeyBackupResultMessage(result)))
        .catch(() =>
          sendResponse(createExportBlobKeyBackupResultMessage({ ok: false, reason: 'unknown', message: 'Key backup export failed.' })),
        );
      return true;

    case MessageType.ImportBlobKeyBackup:
      handleImportBlobKeyBackup(message)
        .then((result) => sendResponse(createImportBlobKeyBackupResultMessage(result)))
        .catch(() =>
          sendResponse(createImportBlobKeyBackupResultMessage({ ok: false, reason: 'unknown', message: 'Key backup import failed.' })),
        );
      return true;

    case MessageType.GrantPermissionAndCapture:
      handleGrantPermissionAndCapture(message)
        .then((result) => sendResponse(createCaptureResultMessage(result)))
        .catch(() =>
          sendResponse(createCaptureResultMessage({ status: 'failed', reason: 'unknown', message: 'Internal permission/capture error.' })),
        );
      return true;

    default:
      return false;
  }
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
