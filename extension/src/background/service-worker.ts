import type { StorageUsageSummary } from '../core/image/capture-result.js';
import { computeSha256 } from '../core/image/fingerprints.js';
import { openImageTrailDb } from '../data/db.js';
import { BlobsRepository } from '../data/repositories/blobs-repository.js';
import type { StoredBlobRecord } from '../data/types.js';
import { fetchImageBytes } from './fetch-image.js';
import {
  MessageType,
  createCaptureImageMessage,
  createCaptureResultMessage,
  createDeleteBlobResultMessage,
  createPingMessage,
  createStorageUsageResponseMessage,
  createTogglePanelMessage,
  isExtensionRequest,
  isStatusMessage,
} from './messages.js';
import type { CaptureImageMessage, DeleteBlobMessage, GrantPermissionAndCaptureMessage } from './messages.js';
import { extractOrigin, hasOriginPermission, requestOriginPermission } from './permissions.js';

const CONTENT_SCRIPT_FILE = 'src/content/content-script.js';
const SUPPORTED_PAGE_PATTERN = /^https?:\/\//u;

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

async function handleCaptureImage(message: CaptureImageMessage): Promise<import('../core/image/capture-result.js').CaptureResult> {
  const { url } = message.payload;

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

  const sha256 = await computeSha256(fetchResult.bytes);
  const blobs = new BlobsRepository(db);

  const existing = await blobs.getBySha256(sha256);
  if (existing) {
    const updated = await blobs.put(existing);
    return { status: 'captured', blobId: updated.id, sha256, mimeType: fetchResult.mimeType, byteLength: fetchResult.byteLength };
  }

  const record: StoredBlobRecord = {
    id: crypto.randomUUID(),
    kind: 'original',
    sha256,
    mimeType: fetchResult.mimeType,
    byteLength: fetchResult.byteLength,
    bytes: fetchResult.bytes,
    createdAt: new Date().toISOString(),
    sourceUrl: url,
    referenceCount: 1,
  };
  await blobs.put(record);
  return { status: 'captured', blobId: record.id, sha256, mimeType: fetchResult.mimeType, byteLength: fetchResult.byteLength };
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

async function handleStorageUsage(): Promise<StorageUsageSummary> {
  const db = await getDb();
  if (!db) return { totalBytes: 0, blobCount: 0 };
  return new BlobsRepository(db).getStorageUsage();
}

async function handleGrantPermissionAndCapture(
  message: GrantPermissionAndCaptureMessage,
): Promise<import('../core/image/capture-result.js').CaptureResult> {
  const { url, sourceType, sourceRecordId } = message.payload;
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
