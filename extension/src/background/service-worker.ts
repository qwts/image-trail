import type { StorageUsageSummary } from '../core/image/capture-result.js';
import { sourceImageUrlFrom } from '../core/display-records.js';
import { getActiveBlobKey } from '../data/crypto/blob-keyring.js';
import { activateWrappedBlobKey, createAndActivateWrappedBlobKey } from '../data/crypto/blob-keyring.js';
import { openBlobPayload, sealBlobPayload } from '../data/crypto/binary-envelope.js';
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
  createCreateBlobPreviewResultMessage,
  createDeleteBlobResultMessage,
  createPingMessage,
  createRetrieveBlobResultMessage,
  createStorageUsageResponseMessage,
  createTogglePanelMessage,
  isExtensionRequest,
  isStatusMessage,
} from './messages.js';
import type { CaptureImageMessage, DeleteBlobMessage, RetrieveBlobMessage, GrantPermissionAndCaptureMessage } from './messages.js';
import type { CreateBlobPreviewMessage } from './messages.js';
import type { SetupBlobKeyMessage, UnlockBlobKeyMessage, BlobKeyResultMessage } from './messages.js';
import { extractOrigin, hasOriginPermission, requestOriginPermission } from './permissions.js';

const CONTENT_SCRIPT_FILE = 'src/content/content-script.js';
const SUPPORTED_PAGE_PATTERN = /^https?:\/\//u;
const PREVIEW_TTL_MS = 60_000;

interface PreviewPayload {
  readonly dataUrl: string;
  readonly byteLength: number;
  readonly createdAt: number;
}

const previewPayloads = new Map<string, PreviewPayload>();

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

function canonicalCaptureUrl(url: string): string {
  try {
    return sourceImageUrlFrom(url).href;
  } catch {
    return url;
  }
}

function isStoredBlobKey(record: StoredKeyRecord | undefined): record is StoredKeyRecord<'blob'> {
  return record?.kind === 'blob';
}

function arrayBufferToBase64(bytes: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function handleCaptureImage(message: CaptureImageMessage): Promise<import('../core/image/capture-result.js').CaptureResult> {
  const url = canonicalCaptureUrl(message.payload.url);
  const activeBlobKey = getActiveBlobKey();
  if (!activeBlobKey) {
    return {
      status: 'failed',
      reason: 'encryption-locked',
      message: 'Encrypted blob storage must be unlocked before original image capture.',
    };
  }

  const origin = extractOrigin(url);
  if (origin && !(await hasOriginPermission(origin))) {
    return { status: 'remote-only', reason: 'permission-needed', message: `Permission needed for ${origin}.`, origin };
  }

  const fetchResult = await fetchImageBytes(url);
  if (!fetchResult.ok) {
    return { status: 'failed', reason: fetchResult.reason, message: fetchResult.message };
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
    metadata: { mimeType: fetchResult.mimeType, byteLength: fetchResult.byteLength, sourceUrl: url, capturedAt: now },
    bytes: fetchResult.bytes,
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
  return { status: 'captured', blobId: record.id, mimeType: fetchResult.mimeType, byteLength: fetchResult.byteLength };
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

async function handleCreateBlobPreview(message: CreateBlobPreviewMessage): Promise<import('./messages.js').CreateBlobPreviewResultMessage['payload']> {
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

async function handleStorageUsage(): Promise<StorageUsageSummary> {
  const db = await getDb();
  if (!db) return { totalBytes: 0, blobCount: 0 };
  return new BlobsRepository(db).getStorageUsage();
}

async function handleSetupBlobKey(message: SetupBlobKeyMessage): Promise<BlobKeyResultMessage['payload']> {
  const password = message.payload.password.trim();
  if (!password) return { ok: false, reason: 'empty-password', message: 'Enter a password to set up encrypted blob storage.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const wrapped = await createAndActivateWrappedBlobKey({ password });
  await new KeysRepository(db).put(wrapped.metadata);
  return { ok: true, keyReference: wrapped.metadata.reference, message: `Encrypted blob storage unlocked with ${wrapped.metadata.reference}.` };
}

async function handleUnlockBlobKey(message: UnlockBlobKeyMessage): Promise<BlobKeyResultMessage['payload']> {
  const password = message.payload.password.trim();
  if (!password) return { ok: false, reason: 'empty-password', message: 'Enter a password to unlock encrypted blob storage.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'db-unavailable', message: 'Database unavailable.' };
  const keys = new KeysRepository(db);
  const requested = message.payload.keyReference ? await keys.get(message.payload.keyReference) : undefined;
  const latest = [...(await keys.listByKind('blob'))].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  const blobKey =
    requested ?? latest;
  if (!isStoredBlobKey(blobKey)) {
    return { ok: false, reason: 'missing-key', message: 'No encrypted blob key exists. Set up encrypted storage first.' };
  }
  await activateWrappedBlobKey(blobKey, password);
  return { ok: true, keyReference: blobKey.reference, message: `Encrypted blob storage unlocked with ${blobKey.reference}.` };
}

async function handleGrantPermissionAndCapture(
  message: GrantPermissionAndCaptureMessage,
): Promise<import('../core/image/capture-result.js').CaptureResult> {
  const { sourceType, sourceRecordId } = message.payload;
  const url = canonicalCaptureUrl(message.payload.url);
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

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionRequest(message)) return false;

  switch (message.type) {
    case MessageType.CaptureImage:
      handleCaptureImage(message)
        .then((result) => sendResponse(createCaptureResultMessage(result)))
        .catch(() => sendResponse(createCaptureResultMessage({ status: 'failed', reason: 'unknown', message: 'Internal capture error.' })));
      return true;

    case MessageType.StorageUsageRequest:
      handleStorageUsage()
        .then((usage) => sendResponse(createStorageUsageResponseMessage(usage)))
        .catch(() => sendResponse(createStorageUsageResponseMessage({ totalBytes: 0, blobCount: 0 })));
      return true;

    case MessageType.DeleteBlob:
      handleDeleteBlob(message)
        .then(({ deleted, usage }) => sendResponse(createDeleteBlobResultMessage(deleted, usage)))
        .catch(() => sendResponse(createDeleteBlobResultMessage(false, { totalBytes: 0, blobCount: 0 })));
      return true;

    case MessageType.RetrieveBlob:
      handleRetrieveBlob(message)
        .then((result) => sendResponse(createRetrieveBlobResultMessage(result)))
        .catch(() => sendResponse(createRetrieveBlobResultMessage({ ok: false, reason: 'unknown', message: 'Blob retrieval failed.' })));
      return true;

    case MessageType.CreateBlobPreview:
      handleCreateBlobPreview(message)
        .then((result) => sendResponse(createCreateBlobPreviewResultMessage(result)))
        .catch(() => sendResponse(createCreateBlobPreviewResultMessage({ ok: false, reason: 'unknown', message: 'Preview creation failed.' })));
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
