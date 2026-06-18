import { BlobsRepository } from '../data/repositories/blobs-repository.js';
import { openImageTrailDb } from '../data/db.js';
import { fetchImageForCapture } from './fetch-image.js';
import {
  createCaptureResultMessage,
  createPingMessage,
  createTogglePanelMessage,
  isExtensionRequest,
  isStatusMessage,
  MessageType,
} from './messages.js';

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

async function captureOriginal(url: string, requestPermission: boolean): Promise<ReturnType<typeof createCaptureResultMessage>> {
  const dbResult = await openImageTrailDb();
  if (!dbResult.db) {
    return createCaptureResultMessage({
      ok: false,
      status: 'failed',
      url,
      reason: 'unknown',
      message: dbResult.status.message,
    });
  }

  const repository = new BlobsRepository(dbResult.db);
  const fetched = await fetchImageForCapture(url, { requestPermission });
  if (!fetched.ok) {
    const storageUsage = await repository.recordAttempt({
      uuid: crypto.randomUUID(),
      url,
      status: fetched.status,
      reason: fetched.reason,
      message: fetched.message,
      createdAt: new Date().toISOString(),
    });
    return createCaptureResultMessage({ ...fetched, storageUsage });
  }

  const existing = await repository.getBySha256(fetched.record.sha256);
  const record = existing ?? fetched.record;
  if (!existing) await repository.putOriginal(record);
  const storageUsage = await repository.getUsage();
  return createCaptureResultMessage({
    ok: true,
    status: 'captured',
    url,
    original: {
      blobId: record.uuid,
      sha256: record.sha256,
      mimeType: record.mimeType,
      byteLength: record.byteLength,
      capturedAt: record.createdAt,
    },
    storageUsage,
  });
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse): boolean => {
  if (!isExtensionRequest(message) || message.type !== MessageType.CaptureOriginal) return false;
  captureOriginal(message.payload.url, message.payload.requestPermission ?? true)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse(
        createCaptureResultMessage({
          ok: false,
          status: 'failed',
          url: message.payload.url,
          reason: 'unknown',
          message: error instanceof Error ? error.message : 'Unknown capture failure.',
        }),
      );
    });
  return true;
});
