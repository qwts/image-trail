import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_PROTOCOL_VERSION,
  MessageType,
  createCaptureImageMessage,
  createCaptureResultMessage,
  createDeleteBlobMessage,
  createDeleteBlobResultMessage,
  createFetchThumbnailSourceMessage,
  createFetchThumbnailSourceResultMessage,
  createLoadBookmarksMessage,
  createLoadBookmarksResultMessage,
  createAddRecentHistoryMessage,
  createAddRecentHistoryResultMessage,
  createLoadRecentHistoryMessage,
  createLoadRecentHistoryResultMessage,
  createPingMessage,
  createRemoveBookmarkMessage,
  createRemoveBookmarkResultMessage,
  createRemoveRecentHistoryMessage,
  createRemoveRecentHistoryResultMessage,
  createRetrieveBlobMessage,
  createRetrieveBlobResultMessage,
  createSaveBookmarkMessage,
  createSaveBookmarkResultMessage,
  createStatusMessage,
  createStorageUsageRequestMessage,
  createStorageUsageResponseMessage,
  createTogglePanelMessage,
  createUnknownMessageResponse,
  isCaptureResultMessage,
  isExtensionRequest,
  isExtensionResponse,
  isFetchThumbnailSourceResultMessage,
  isLoadBookmarksResultMessage,
  isAddRecentHistoryResultMessage,
  isLoadRecentHistoryResultMessage,
  isRemoveBookmarkResultMessage,
  isRemoveRecentHistoryResultMessage,
  isRetrieveBlobResultMessage,
  isSaveBookmarkResultMessage,
  isStatusMessage,
} from '../extension/src/background/messages.js';

test('recognizes only versioned extension requests as requests', () => {
  assert.equal(isExtensionRequest(createTogglePanelMessage()), true);
  assert.equal(isExtensionRequest(createPingMessage()), true);
  assert.equal(isExtensionRequest(createStatusMessage(false, 'hidden')), false);
  assert.equal(isExtensionRequest({ type: MessageType.Ping, version: 0, payload: {} }), false);
  assert.equal(isExtensionRequest({ type: MessageType.Ping, version: MESSAGE_PROTOCOL_VERSION }), false);
});

test('recognizes status and unknown responses separately from requests', () => {
  const status = createStatusMessage(true, 'ready');
  const unknown = createUnknownMessageResponse('unsupported');

  assert.equal(isExtensionResponse(status), true);
  assert.equal(isExtensionResponse(unknown), true);
  assert.equal(isExtensionResponse(createPingMessage()), false);
  assert.equal(isStatusMessage(status), true);
  assert.equal(isStatusMessage(unknown), false);
  assert.equal(isStatusMessage({ ...status, payload: { panelVisible: 'yes', status: 'ready' } }), false);
});

test('creates capture image request messages with correct structure', () => {
  const msg = createCaptureImageMessage('https://cdn.example.com/photo.jpg', 'target');
  assert.equal(msg.type, MessageType.CaptureImage);
  assert.equal(msg.version, MESSAGE_PROTOCOL_VERSION);
  assert.equal(msg.payload.url, 'https://cdn.example.com/photo.jpg');
  assert.equal(msg.payload.sourceType, 'target');
  assert.equal(msg.payload.sourceRecordId, undefined);

  const withId = createCaptureImageMessage('https://example.com/img.png', 'history', 'record-42');
  assert.equal(withId.payload.sourceRecordId, 'record-42');
  assert.equal(withId.payload.sourceType, 'history');
});

test('recognizes capture-related messages as extension requests', () => {
  assert.equal(isExtensionRequest(createCaptureImageMessage('https://example.com/a.jpg', 'target')), true);
  assert.equal(isExtensionRequest(createStorageUsageRequestMessage()), true);
  assert.equal(isExtensionRequest(createDeleteBlobMessage('blob-1')), true);
  assert.equal(isExtensionRequest(createRetrieveBlobMessage('blob-1')), true);
  assert.equal(isExtensionRequest(createFetchThumbnailSourceMessage('https://example.com/a.jpg')), true);
});

test('creates capture result response messages for success and failure', () => {
  const success = createCaptureResultMessage({
    status: 'captured',
    blobId: 'b-1',
    mimeType: 'image/png',
    byteLength: 1024,
  });
  assert.equal(success.type, MessageType.CaptureResult);
  assert.equal(success.payload.status, 'captured');

  const failure = createCaptureResultMessage({
    status: 'failed',
    reason: 'too-large',
    message: 'Image exceeds size limit.',
  });
  assert.equal(failure.payload.status, 'failed');

  const remoteOnly = createCaptureResultMessage({
    status: 'remote-only',
    reason: 'permission-needed',
    message: 'Permission needed.',
    origin: 'https://cdn.example.com',
  });
  assert.equal(remoteOnly.payload.status, 'remote-only');
});

test('creates thumbnail source fetch messages', () => {
  const request = createFetchThumbnailSourceMessage('https://example.test/thumb.jpg', 'https://example.test/page');
  assert.equal(request.type, MessageType.FetchThumbnailSource);
  assert.equal(request.payload.url, 'https://example.test/thumb.jpg');
  assert.equal(request.payload.referrer, 'https://example.test/page');
  assert.equal(isExtensionRequest(request), true);

  const success = createFetchThumbnailSourceResultMessage({
    ok: true,
    dataUrl: 'data:image/jpeg;base64,abc',
    mimeType: 'image/jpeg',
    byteLength: 3,
  });
  assert.equal(success.type, MessageType.FetchThumbnailSourceResult);
  assert.equal(success.payload.ok, true);
  assert.equal(isExtensionResponse(success), true);
  assert.equal(isFetchThumbnailSourceResultMessage(success), true);

  const failure = createFetchThumbnailSourceResultMessage({ ok: false, reason: 'network-error', message: 'Nope.' });
  assert.equal(failure.payload.ok, false);
  assert.equal(isFetchThumbnailSourceResultMessage(failure), true);
});

test('creates bookmark store messages for extension-origin persistence', () => {
  const record = {
    id: 'bookmark-1',
    url: 'https://example.test/a.jpg',
    label: 'a.jpg',
    timestamp: '2026-06-19T00:00:00.000Z',
    source: 'bookmark' as const,
  };
  const load = createLoadBookmarksMessage({ offset: 0, limit: 30, scope: 'global', currentPageUrl: 'https://example.test/' });
  const loadResult = createLoadBookmarksResultMessage({
    items: [record],
    offset: 0,
    limit: 30,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });
  const save = createSaveBookmarkMessage(record);
  const saveResult = createSaveBookmarkResultMessage({ ok: true, record });
  const remove = createRemoveBookmarkMessage(record);
  const removeResult = createRemoveBookmarkResultMessage({ ok: true });

  assert.equal(isExtensionRequest(load), true);
  assert.equal(isExtensionResponse(loadResult), true);
  assert.equal(isLoadBookmarksResultMessage(loadResult), true);
  assert.equal(isExtensionRequest(save), true);
  assert.equal(isExtensionResponse(saveResult), true);
  assert.equal(isSaveBookmarkResultMessage(saveResult), true);
  assert.equal(isExtensionRequest(remove), true);
  assert.equal(isExtensionResponse(removeResult), true);
  assert.equal(isRemoveBookmarkResultMessage(removeResult), true);
});

test('creates transient recent history messages', () => {
  const record = {
    id: 'history-1',
    url: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fa.jpg',
    label: 'a.jpg',
    timestamp: '2026-06-19T00:00:00.000Z',
    source: 'history' as const,
  };
  const load = createLoadRecentHistoryMessage('https://external-content.duckduckgo.com/');
  const loadResult = createLoadRecentHistoryResultMessage([record]);
  const add = createAddRecentHistoryMessage('https://external-content.duckduckgo.com/', record);
  const addResult = createAddRecentHistoryResultMessage([record]);
  const remove = createRemoveRecentHistoryMessage('https://external-content.duckduckgo.com/', record.id);
  const removeResult = createRemoveRecentHistoryResultMessage([]);

  assert.equal(isExtensionRequest(load), true);
  assert.equal(isExtensionResponse(loadResult), true);
  assert.equal(isLoadRecentHistoryResultMessage(loadResult), true);
  assert.equal(isExtensionRequest(add), true);
  assert.equal(isExtensionResponse(addResult), true);
  assert.equal(isAddRecentHistoryResultMessage(addResult), true);
  assert.equal(isExtensionRequest(remove), true);
  assert.equal(isExtensionResponse(removeResult), true);
  assert.equal(isRemoveRecentHistoryResultMessage(removeResult), true);
});

test('recognizes capture result messages as extension responses', () => {
  const result = createCaptureResultMessage({ status: 'captured', blobId: 'b-1', mimeType: 'image/png', byteLength: 100 });
  assert.equal(isExtensionResponse(result), true);
  assert.equal(isCaptureResultMessage(result), true);
  assert.equal(isCaptureResultMessage(createStatusMessage(true, 'ok')), false);
  assert.equal(isCaptureResultMessage(null), false);
  assert.equal(isCaptureResultMessage({ type: MessageType.CaptureResult, version: 0, payload: {} }), false);
});

test('creates storage usage response messages', () => {
  const msg = createStorageUsageResponseMessage({ totalBytes: 5000, blobCount: 3 });
  assert.equal(msg.type, MessageType.StorageUsageResponse);
  assert.equal(msg.payload.totalBytes, 5000);
  assert.equal(msg.payload.blobCount, 3);
  assert.equal(isExtensionResponse(msg), true);
});

test('creates delete blob request and result messages', () => {
  const request = createDeleteBlobMessage('blob-42');
  assert.equal(request.type, MessageType.DeleteBlob);
  assert.equal(request.payload.blobId, 'blob-42');
  assert.equal(isExtensionRequest(request), true);

  const result = createDeleteBlobResultMessage(true, { totalBytes: 200, blobCount: 1 });
  assert.equal(result.type, MessageType.DeleteBlobResult);
  assert.equal(result.payload.deleted, true);
  assert.equal(result.payload.usage.totalBytes, 200);
  assert.equal(isExtensionResponse(result), true);
});

test('creates retrieve blob request and result messages', () => {
  const request = createRetrieveBlobMessage('blob-99');
  assert.equal(request.type, MessageType.RetrieveBlob);
  assert.equal(request.payload.blobId, 'blob-99');
  assert.equal(isExtensionRequest(request), true);

  const success = createRetrieveBlobResultMessage({
    ok: true,
    blobId: 'blob-99',
    dataUrl: 'data:image/jpeg;base64,/9j/',
    mimeType: 'image/jpeg',
    byteLength: 4,
    capturedAt: '2026-06-19T00:00:00.000Z',
  });
  assert.equal(success.type, MessageType.RetrieveBlobResult);
  assert.equal(success.payload.ok, true);
  assert.equal(isExtensionResponse(success), true);
  assert.equal(isRetrieveBlobResultMessage(success), true);

  const failure = createRetrieveBlobResultMessage({ ok: false, reason: 'encryption-locked', message: 'Unlock first.' });
  assert.equal(failure.payload.ok, false);
  assert.equal(isRetrieveBlobResultMessage(failure), true);
});
