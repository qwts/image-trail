import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MessageType,
  createClearUrlReviewStatusMessage,
  createClearUrlReviewStatusResultMessage,
  createImportUrlReviewStatusMessage,
  createImportUrlReviewStatusResultMessage,
  createListUrlReviewStatusMessage,
  createListUrlReviewStatusResultMessage,
  createSaveUrlReviewStatusMessage,
  createSaveUrlReviewStatusResultMessage,
  isClearUrlReviewStatusResultMessage,
  isExtensionRequest,
  isExtensionResponse,
  isImportUrlReviewStatusResultMessage,
  isListUrlReviewStatusResultMessage,
  isSaveUrlReviewStatusResultMessage,
} from '../extension/src/background/messages.js';

test('creates URL review status messages for one site or the full Settings history', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://example.test/image-0002.jpg',
    status: 'passed' as const,
    fieldIds: ['path:0:0'],
    activeFieldId: 'path:0:0',
    updatedAt: '2026-06-23T00:00:00.000Z',
  };
  const list = createListUrlReviewStatusMessage('example.test');
  const listAll = createListUrlReviewStatusMessage(null);
  const listResult = createListUrlReviewStatusResultMessage({ ok: true, records: [record] });
  const save = createSaveUrlReviewStatusMessage(record);
  const saveResult = createSaveUrlReviewStatusResultMessage({ ok: true });
  const importRequest = createImportUrlReviewStatusMessage([record]);
  const importResult = createImportUrlReviewStatusResultMessage({ ok: true, importedCount: 1 });
  const clear = createClearUrlReviewStatusMessage({ scope: 'hostname', hostname: 'example.test' });
  const clearResult = createClearUrlReviewStatusResultMessage({ ok: true, deletedCount: 1 });

  assert.equal(list.type, MessageType.ListUrlReviewStatus);
  assert.equal(list.payload.hostname, 'example.test');
  assert.equal(listAll.payload.hostname, null);
  assert.equal(isExtensionRequest(list), true);
  assert.equal(isExtensionRequest(listAll), true);
  assert.equal(isExtensionResponse(listResult), true);
  assert.equal(isListUrlReviewStatusResultMessage(listResult), true);
  assert.equal(save.type, MessageType.SaveUrlReviewStatus);
  assert.deepEqual(save.payload.record, record);
  assert.equal(isExtensionRequest(save), true);
  assert.equal(isExtensionResponse(saveResult), true);
  assert.equal(isSaveUrlReviewStatusResultMessage(saveResult), true);
  assert.equal(importRequest.type, MessageType.ImportUrlReviewStatus);
  assert.deepEqual(importRequest.payload.records, [record]);
  assert.equal(isExtensionRequest(importRequest), true);
  assert.equal(isExtensionResponse(importResult), true);
  assert.equal(isImportUrlReviewStatusResultMessage(importResult), true);
  assert.equal(clear.type, MessageType.ClearUrlReviewStatus);
  assert.deepEqual(clear.payload.filter, { scope: 'hostname', hostname: 'example.test' });
  assert.equal(isExtensionRequest(clear), true);
  assert.equal(isExtensionResponse(clearResult), true);
  assert.equal(isClearUrlReviewStatusResultMessage(clearResult), true);
});
