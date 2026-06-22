import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_PROTOCOL_VERSION,
  MessageType,
  createCaptureImageMessage,
  createCaptureResultMessage,
  createClearBlobKeyMessage,
  createDeleteBlobMessage,
  createDeleteBlobResultMessage,
  createDownloadImageMessage,
  createDownloadImageResultMessage,
  createExportEncryptedImageMessage,
  createExportEncryptedImageResultMessage,
  createExportBlobKeyBackupMessage,
  createExportBlobKeyBackupResultMessage,
  createFetchThumbnailSourceMessage,
  createFetchThumbnailSourceResultMessage,
  createImportBlobKeyBackupMessage,
  createImportBlobKeyBackupResultMessage,
  createImportEncryptedImageMessage,
  createImportEncryptedImageResultMessage,
  createLoadBookmarksMessage,
  createLoadBookmarksByIdsMessage,
  createLoadBookmarksByIdsResultMessage,
  createLoadBookmarksResultMessage,
  createLoadLocalSettingsMessage,
  createLoadLocalSettingsResultMessage,
  createLoadPanelPositionMessage,
  createLoadPanelPositionResultMessage,
  createListUrlTemplatesMessage,
  createListUrlTemplatesResultMessage,
  createLoadRecallCandidatesMessage,
  createLoadRecallCandidatesResultMessage,
  createAddRecentHistoryMessage,
  createAddRecentHistoryResultMessage,
  createLoadRecentHistoryMessage,
  createLoadRecentHistoryResultMessage,
  createPingMessage,
  createRemoveBookmarkMessage,
  createRemoveBookmarkResultMessage,
  createRemoveBookmarksMessage,
  createRemoveBookmarksResultMessage,
  createRemoveRecallBookmarksMessage,
  createRemoveRecallBookmarksResultMessage,
  createRemoveRecentHistoryMessage,
  createRemoveRecentHistoryResultMessage,
  createRecallRecordsMessage,
  createRecallRecordsResultMessage,
  createRetrieveBlobMessage,
  createRetrieveBlobResultMessage,
  createSaveBookmarkMessage,
  createSaveBookmarkResultMessage,
  createSaveLocalSettingsMessage,
  createSaveLocalSettingsResultMessage,
  createSavePanelPositionMessage,
  createSavePanelPositionResultMessage,
  createSaveUrlTemplateMessage,
  createSaveUrlTemplateResultMessage,
  createDeleteUrlTemplateMessage,
  createDeleteUrlTemplateResultMessage,
  createStatusMessage,
  createStorageUsageRequestMessage,
  createStorageUsageResponseMessage,
  createTogglePanelMessage,
  createUnknownMessageResponse,
  isCaptureResultMessage,
  isDownloadImageResultMessage,
  isExportEncryptedImageResultMessage,
  isExtensionRequest,
  isExtensionResponse,
  isExportBlobKeyBackupResultMessage,
  isFetchThumbnailSourceResultMessage,
  isImportBlobKeyBackupResultMessage,
  isImportEncryptedImageResultMessage,
  isLoadBookmarksResultMessage,
  isLoadBookmarksByIdsResultMessage,
  isLoadLocalSettingsResultMessage,
  isLoadPanelPositionResultMessage,
  isListUrlTemplatesResultMessage,
  isLoadRecallCandidatesResultMessage,
  isAddRecentHistoryResultMessage,
  isLoadRecentHistoryResultMessage,
  isRecallRecordsResultMessage,
  isRemoveBookmarkResultMessage,
  isRemoveBookmarksResultMessage,
  isRemoveRecallBookmarksResultMessage,
  isRemoveRecentHistoryResultMessage,
  isRetrieveBlobResultMessage,
  isSaveBookmarkResultMessage,
  isSaveLocalSettingsResultMessage,
  isSavePanelPositionResultMessage,
  isSaveUrlTemplateResultMessage,
  isDeleteUrlTemplateResultMessage,
  isStatusMessage,
} from '../extension/src/background/messages.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';

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

test('creates panel position messages', () => {
  const load = createLoadPanelPositionMessage('example.test');
  const loadResult = createLoadPanelPositionResultMessage({ ok: true, position: { left: 120, top: 48 } });
  const save = createSavePanelPositionMessage('example.test', { left: 144, top: 72 });
  const saveResult = createSavePanelPositionResultMessage({ ok: true });

  assert.equal(load.type, MessageType.LoadPanelPosition);
  assert.equal(load.payload.hostname, 'example.test');
  assert.equal(isExtensionRequest(load), true);
  assert.equal(isExtensionResponse(loadResult), true);
  assert.equal(isLoadPanelPositionResultMessage(loadResult), true);
  assert.equal(save.type, MessageType.SavePanelPosition);
  assert.deepEqual(save.payload.position, { left: 144, top: 72 });
  assert.equal(isExtensionRequest(save), true);
  assert.equal(isExtensionResponse(saveResult), true);
  assert.equal(isSavePanelPositionResultMessage(saveResult), true);
});

test('creates extension-owned local settings messages', () => {
  const settings = { ...DEFAULT_LOCAL_SETTINGS, visibleBookmarkSoftMax: 12 };
  const load = createLoadLocalSettingsMessage();
  const loadResult = createLoadLocalSettingsResultMessage({ ok: true, settings });
  const save = createSaveLocalSettingsMessage(settings);
  const saveResult = createSaveLocalSettingsResultMessage({ ok: true });

  assert.equal(load.type, MessageType.LoadLocalSettings);
  assert.equal(isExtensionRequest(load), true);
  assert.equal(isExtensionResponse(loadResult), true);
  assert.equal(isLoadLocalSettingsResultMessage(loadResult), true);
  assert.equal(loadResult.payload.ok && loadResult.payload.settings.visibleBookmarkSoftMax, 12);
  assert.equal(save.type, MessageType.SaveLocalSettings);
  assert.deepEqual(save.payload.settings, settings);
  assert.equal(isExtensionRequest(save), true);
  assert.equal(isExtensionResponse(saveResult), true);
  assert.equal(isSaveLocalSettingsResultMessage(saveResult), true);
});

test('creates extension-owned URL template messages', () => {
  const template = {
    id: 'template-001',
    schemaVersion: 1 as const,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image/{query-page}.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape' as const,
      hostname: 'example.test',
      exactPathSignature: 'exact',
      pathShapeSignature: 'shape',
      querySignature: 'page:int',
    },
    fields: [
      {
        id: 'q:0:0',
        label: 'query page',
        placeholder: '{query-page}',
        location: 'query' as const,
        tokenKind: 'int' as const,
        queryIndex: 0,
        queryKey: 'page',
        tokenIndex: 0,
      },
    ],
    hideExcludedFields: false,
    autoApplyEnabled: true,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  const list = createListUrlTemplatesMessage('example.test');
  const listResult = createListUrlTemplatesResultMessage({ ok: true, templates: [template] });
  const save = createSaveUrlTemplateMessage(template);
  const saveResult = createSaveUrlTemplateResultMessage({ ok: true });
  const remove = createDeleteUrlTemplateMessage('example.test', template.id);
  const removeResult = createDeleteUrlTemplateResultMessage({ ok: true });

  assert.equal(list.type, MessageType.ListUrlTemplates);
  assert.equal(isExtensionRequest(list), true);
  assert.equal(isExtensionResponse(listResult), true);
  assert.equal(isListUrlTemplatesResultMessage(listResult), true);
  assert.equal(save.payload.template.id, template.id);
  assert.equal(isExtensionRequest(save), true);
  assert.equal(isExtensionResponse(saveResult), true);
  assert.equal(isSaveUrlTemplateResultMessage(saveResult), true);
  assert.equal(remove.payload.id, template.id);
  assert.equal(isExtensionRequest(remove), true);
  assert.equal(isExtensionResponse(removeResult), true);
  assert.equal(isDeleteUrlTemplateResultMessage(removeResult), true);
});

test('recognizes capture-related messages as extension requests', () => {
  assert.equal(isExtensionRequest(createCaptureImageMessage('https://example.com/a.jpg', 'target')), true);
  assert.equal(isExtensionRequest(createStorageUsageRequestMessage()), true);
  assert.equal(isExtensionRequest(createDeleteBlobMessage('blob-1')), true);
  assert.equal(isExtensionRequest(createRetrieveBlobMessage('blob-1')), true);
  assert.equal(isExtensionRequest(createFetchThumbnailSourceMessage('https://example.com/a.jpg')), true);
  assert.equal(isExtensionRequest(createDownloadImageMessage('https://example.com/a.jpg', 'a.jpg', false)), true);
});

test('creates blob key backup import and export messages', () => {
  const clearRequest = createClearBlobKeyMessage();
  assert.equal(clearRequest.type, MessageType.ClearBlobKey);
  assert.equal(isExtensionRequest(clearRequest), true);

  const exportRequest = createExportBlobKeyBackupMessage('backup-password', 'blob:key-1');
  assert.equal(exportRequest.type, MessageType.ExportBlobKeyBackup);
  assert.equal(exportRequest.payload.password, 'backup-password');
  assert.equal(exportRequest.payload.keyReference, 'blob:key-1');
  assert.equal(isExtensionRequest(exportRequest), true);

  const exportResult = createExportBlobKeyBackupResultMessage({
    ok: true,
    keyReference: 'blob:key-1',
    fileContent: '{"header":{}}',
    fileName: 'image-trail-key-backup-blob-2026-06-20.json',
    message: 'Exported key backup for blob:key-1.',
  });
  assert.equal(exportResult.type, MessageType.ExportBlobKeyBackupResult);
  assert.equal(isExtensionResponse(exportResult), true);
  assert.equal(isExportBlobKeyBackupResultMessage(exportResult), true);

  const importRequest = createImportBlobKeyBackupMessage('{"header":{}}', 'backup-password');
  assert.equal(importRequest.type, MessageType.ImportBlobKeyBackup);
  assert.equal(importRequest.payload.fileContent, '{"header":{}}');
  assert.equal(isExtensionRequest(importRequest), true);

  const importResult = createImportBlobKeyBackupResultMessage({
    ok: true,
    keyReference: 'blob:key-1',
    imported: false,
    message: 'Key backup already imported.',
  });
  assert.equal(importResult.type, MessageType.ImportBlobKeyBackupResult);
  assert.equal(isExtensionResponse(importResult), true);
  assert.equal(isImportBlobKeyBackupResultMessage(importResult), true);
});

test('creates image download messages with save-as intent', () => {
  const request = createDownloadImageMessage('https://cdn.example.com/photo.jpg', 'photo.jpg', true);
  assert.equal(request.type, MessageType.DownloadImage);
  assert.equal(request.payload.url, 'https://cdn.example.com/photo.jpg');
  assert.equal(request.payload.fileName, 'photo.jpg');
  assert.equal(request.payload.saveAs, true);
  assert.equal(isExtensionRequest(request), true);

  const success = createDownloadImageResultMessage({ ok: true, downloadId: 42 });
  assert.equal(success.type, MessageType.DownloadImageResult);
  assert.equal(isExtensionResponse(success), true);
  assert.equal(isDownloadImageResultMessage(success), true);

  const failure = createDownloadImageResultMessage({ ok: false, message: 'Nope.' });
  assert.equal(failure.payload.ok, false);
  assert.equal(isDownloadImageResultMessage(failure), true);
});

test('creates encrypted image import and export messages', () => {
  const exportRequest = createExportEncryptedImageMessage('https://cdn.example.com/photo.jpg', 'photo.jpg', 'blob-1');
  assert.equal(exportRequest.type, MessageType.ExportEncryptedImage);
  assert.equal(exportRequest.payload.url, 'https://cdn.example.com/photo.jpg');
  assert.equal(exportRequest.payload.fileName, 'photo.jpg');
  assert.equal(exportRequest.payload.blobId, 'blob-1');
  assert.equal(isExtensionRequest(exportRequest), true);

  const exportResult = createExportEncryptedImageResultMessage({
    ok: true,
    fileContent: '{"header":{}}',
    fileName: 'photo.jpg.image-trail-encrypted.json',
    message: 'Encrypted image export prepared.',
  });
  assert.equal(exportResult.type, MessageType.ExportEncryptedImageResult);
  assert.equal(isExtensionResponse(exportResult), true);
  assert.equal(isExportEncryptedImageResultMessage(exportResult), true);

  const importRequest = createImportEncryptedImageMessage('{"header":{}}');
  assert.equal(importRequest.type, MessageType.ImportEncryptedImage);
  assert.equal(isExtensionRequest(importRequest), true);

  const importResult = createImportEncryptedImageResultMessage({
    ok: true,
    dataUrl: 'data:image/png;base64,abc',
    fileName: 'photo.png',
    sourceUrl: 'https://cdn.example.com/photo.png',
    mimeType: 'image/png',
    byteLength: 3,
    keyReference: 'blob:key-1',
  });
  assert.equal(importResult.type, MessageType.ImportEncryptedImageResult);
  assert.equal(isExtensionResponse(importResult), true);
  assert.equal(isImportEncryptedImageResultMessage(importResult), true);
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
    sha256: 'a'.repeat(64),
  });
  assert.equal(success.type, MessageType.FetchThumbnailSourceResult);
  assert.equal(success.payload.ok, true);
  assert.equal(success.payload.ok ? success.payload.sha256 : undefined, 'a'.repeat(64));
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
  const loadByIds = createLoadBookmarksByIdsMessage(['bookmark-1']);
  const loadByIdsResult = createLoadBookmarksByIdsResultMessage({ items: [record] });
  const save = createSaveBookmarkMessage(record);
  const saveResult = createSaveBookmarkResultMessage({ ok: true, record });
  const remove = createRemoveBookmarkMessage(record);
  const removeResult = createRemoveBookmarkResultMessage({ ok: true });
  const removeMany = createRemoveBookmarksMessage(['bookmark-1', 'bookmark-2']);
  const removeManyResult = createRemoveBookmarksResultMessage({ ok: true, removedCount: 2 });
  const removeRecall = createRemoveRecallBookmarksMessage({ offset: 30, scope: 'site', currentPageUrl: 'https://example.test/' });
  const removeRecallResult = createRemoveRecallBookmarksResultMessage({ ok: true, removedCount: 3 });

  assert.equal(isExtensionRequest(load), true);
  assert.equal(isExtensionResponse(loadResult), true);
  assert.equal(isLoadBookmarksResultMessage(loadResult), true);
  assert.deepEqual(loadByIds.payload.ids, ['bookmark-1']);
  assert.equal(isExtensionRequest(loadByIds), true);
  assert.equal(isExtensionResponse(loadByIdsResult), true);
  assert.equal(isLoadBookmarksByIdsResultMessage(loadByIdsResult), true);
  assert.equal(isExtensionRequest(save), true);
  assert.equal(isExtensionResponse(saveResult), true);
  assert.equal(isSaveBookmarkResultMessage(saveResult), true);
  assert.equal(isExtensionRequest(remove), true);
  assert.equal(isExtensionResponse(removeResult), true);
  assert.equal(isRemoveBookmarkResultMessage(removeResult), true);
  assert.deepEqual(removeMany.payload.ids, ['bookmark-1', 'bookmark-2']);
  assert.equal(isExtensionRequest(removeMany), true);
  assert.equal(isExtensionResponse(removeManyResult), true);
  assert.equal(isRemoveBookmarksResultMessage(removeManyResult), true);
  assert.equal(removeRecall.payload.offset, 30);
  assert.equal(isExtensionRequest(removeRecall), true);
  assert.equal(isExtensionResponse(removeRecallResult), true);
  assert.equal(isRemoveRecallBookmarksResultMessage(removeRecallResult), true);
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

test('creates recall drawer messages', () => {
  const record = {
    id: 'recall-1',
    url: 'https://example.test/recall.jpg',
    label: 'recall.jpg',
    timestamp: '2026-06-19T00:00:00.000Z',
    source: 'history' as const,
    envelopeCreatedAt: '2026-06-19T00:00:01.000Z',
  };
  const load = createLoadRecallCandidatesMessage({ offset: 30, limit: 100, scope: 'global', currentPageUrl: 'https://example.test/page' });
  const loadResult = createLoadRecallCandidatesResultMessage({
    ok: true,
    candidates: [record],
    total: 1,
    nextOffset: 31,
    hasMore: false,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });
  const recall = createRecallRecordsMessage([record.id]);
  const recallResult = createRecallRecordsResultMessage({ ok: true, records: [record], failedCount: 0, message: 'Recalled 1 record.' });

  assert.equal(isExtensionRequest(load), true);
  assert.equal(isExtensionResponse(loadResult), true);
  assert.equal(isLoadRecallCandidatesResultMessage(loadResult), true);
  assert.equal(isExtensionRequest(recall), true);
  assert.equal(isExtensionResponse(recallResult), true);
  assert.equal(isRecallRecordsResultMessage(recallResult), true);
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
