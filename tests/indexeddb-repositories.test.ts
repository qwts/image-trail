import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DataStore } from '../extension/src/data/schema.js';
import { HistoryRepository } from '../extension/src/data/repositories/history-repository.js';
import { BookmarksRepository, type EncryptedBookmarkRecord } from '../extension/src/data/repositories/bookmarks-repository.js';
import { PanelPositionRepository } from '../extension/src/data/repositories/panel-position-repository.js';
import { ParsedFieldStateRepository } from '../extension/src/data/repositories/parsed-field-state-repository.js';
import { UrlTemplateRepository } from '../extension/src/data/repositories/url-template-repository.js';
import { DownloadsRepository } from '../extension/src/data/repositories/downloads-repository.js';
import { EncryptedPinsRepository } from '../extension/src/data/repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from '../extension/src/data/repositories/encrypted-pin-thumbnails-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import { UrlReviewStatusRepository } from '../extension/src/data/repositories/url-review-status-repository.js';
import type { StoredKeyRecord } from '../extension/src/data/crypto/types.js';
import { createAndActivateWrappedBlobKey, lockBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../extension/src/core/url/templates.js';
import { openFreshImageTrailDb, storedKeyRecord, bookmarkRecord, historyRecord } from './indexeddb-test-helpers.js';

test('KeysRepository writes complete transactions and reads records back', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new KeysRepository(db);
  const record = storedKeyRecord();

  await repository.put(record);

  assert.deepEqual(await repository.get(record.reference), record);
  assert.equal(await repository.get('history:missing'), undefined);
});

test('HistoryRepository writes complete transactions and reads encrypted records back', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new HistoryRepository(db);
  const record = historyRecord();

  await repository.putEncrypted(record);

  assert.deepEqual(await repository.getEncrypted(record.uuid), record);
  assert.equal(await repository.getEncrypted('missing-history'), undefined);
});

test('BookmarksRepository writes encrypted records and dedupes by URL index', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const record = bookmarkRecord();

  await repository.putEncrypted(record);

  assert.deepEqual(await repository.getEncrypted(record.uuid), record);
  assert.deepEqual(await repository.listEncrypted(), [record]);
  assert.deepEqual(await repository.getEncryptedByUrl(record.url), record);
  assert.equal(await repository.getEncryptedByUrl('https://example.test/missing.jpg'), undefined);
});

test('BookmarksRepository can index imported data URL bookmarks by a small key', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const session = await createSessionKey('bookmark', 'bookmark-key', '2026-06-20T00:00:00.000Z');
  const dataUrl = `data:image/png;base64,${'a'.repeat(2048)}`;
  const indexUrl = 'image-trail-import:2026-06-20T00:00:00.000Z:photo.png';

  const encrypted = await repository.sealAndPut(
    'imported-photo',
    {
      url: dataUrl,
      title: 'photo.png',
      label: 'photo.png',
      thumbnail: dataUrl,
      bookmarkedAt: '2026-06-20T00:00:00.000Z',
      sourceCompatibility: 'favorites',
    },
    session.key,
    session.reference,
    undefined,
    indexUrl,
  );

  assert.equal(encrypted.url, indexUrl);
  assert.deepEqual(await repository.getEncryptedByUrl(indexUrl), encrypted);
  assert.equal(await repository.getEncryptedByUrl(dataUrl), undefined);
  assert.equal((await repository.openRecord(encrypted, session.key)).url, dataUrl);
});

test('EncryptedPinsRepository seals private pin metadata with the active blob key', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'pin-password',
    uuid: 'protected-pin-key',
    now: '2026-06-21T00:00:00.000Z',
  });
  t.after(() => lockBlobKey());
  const repository = new EncryptedPinsRepository(db);

  const record = await repository.sealAndPut({
    id: 'encrypted-pin-1',
    plainPinId: 'plain-pin-1',
    urlHash: 'a'.repeat(64),
    queueUpdatedAt: '2026-06-21T00:00:02.000Z',
    payload: {
      url: 'https://secret.example.test/private.jpg',
      title: 'private title',
      label: 'private label',
      bookmarkedAt: '2026-06-21T00:00:01.000Z',
      thumbnailId: 'thumbnail-1',
    },
    key: wrapped.active.key,
    keyReference: wrapped.active.reference,
  });

  assert.equal(record.envelope.key.reference, 'blob:protected-pin-key');
  assert.equal(JSON.stringify(record).includes('private title'), false);
  assert.deepEqual(await repository.getByPlainPinId('plain-pin-1'), record);
  assert.deepEqual(await repository.getByUrlHash('a'.repeat(64)), record);
  assert.deepEqual(await repository.getStorageUsage(), {
    totalBytes: new TextEncoder().encode(JSON.stringify(record.envelope)).byteLength,
    blobCount: 1,
  });
  assert.deepEqual(await repository.openRecord(record, wrapped.active.key), {
    url: 'https://secret.example.test/private.jpg',
    title: 'private title',
    label: 'private label',
    bookmarkedAt: '2026-06-21T00:00:01.000Z',
    thumbnailId: 'thumbnail-1',
  });
});

test('EncryptedPinThumbnailsRepository stores encrypted thumbnail bytes and usage', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const wrapped = await createAndActivateWrappedBlobKey({
    password: 'thumb-password',
    uuid: 'protected-thumb-key',
    now: '2026-06-21T00:00:00.000Z',
  });
  t.after(() => lockBlobKey());
  const repository = new EncryptedPinThumbnailsRepository(db);
  const bytes = new TextEncoder().encode('thumbnail bytes').buffer;

  const record = await repository.sealAndPut({
    id: 'thumb-1',
    pinId: 'plain-pin-1',
    mimeType: 'image/png',
    bytes,
    key: wrapped.active.key,
    keyReference: wrapped.active.reference,
    now: '2026-06-21T00:00:03.000Z',
  });

  assert.equal(record.pinId, 'plain-pin-1');
  assert.equal(record.byteLength, bytes.byteLength);
  assert.equal(JSON.stringify(record).includes('thumbnail bytes'), false);
  assert.deepEqual(await repository.openRecord(record, wrapped.active.key), {
    dataUrl: 'data:image/png;base64,dGh1bWJuYWlsIGJ5dGVz',
    mimeType: 'image/png',
    byteLength: bytes.byteLength,
  });
  assert.deepEqual(await repository.getStorageUsage(), { totalBytes: record.encryptedByteLength, blobCount: 1 });
});

test('DownloadsRepository writes encrypted records newest first and checks duplicates after decrypting', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new DownloadsRepository(db);
  const session = await createSessionKey('download', 'download-key', '2026-06-19T00:00:00.000Z');

  await repository.sealAndPut(
    'download-old',
    {
      sourceUrl: 'https://example.test/old.jpg',
      filename: 'old.jpg',
      fingerprint: 'a'.repeat(64),
      downloadedAt: '2026-06-19T00:00:01.000Z',
    },
    session.key,
    session.reference,
  );
  await repository.sealAndPut(
    'download-new',
    {
      sourceUrl: 'https://example.test/new.jpg',
      filename: 'new.jpg',
      fingerprint: 'b'.repeat(64),
      downloadedAt: '2026-06-19T00:00:02.000Z',
    },
    session.key,
    session.reference,
  );

  assert.deepEqual(
    (await repository.listEncryptedNewestFirst()).map((record) => record.uuid),
    ['download-new', 'download-old'],
  );

  const fingerprintDuplicate = await repository.findDuplicate(
    { sourceUrl: 'https://example.test/copy.jpg', fingerprint: 'b'.repeat(64) },
    session.key,
  );
  assert.equal(fingerprintDuplicate?.record.uuid, 'download-new');
  assert.equal(fingerprintDuplicate?.matchedBy, 'fingerprint');

  const urlDuplicate = await repository.findDuplicate({ sourceUrl: 'https://example.test/old.jpg' }, session.key);
  assert.equal(urlDuplicate?.record.uuid, 'download-old');
  assert.equal(urlDuplicate?.matchedBy, 'url');
});

test('BookmarksRepository pages encrypted records newest first', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);

  await repository.putEncrypted(bookmarkRecord('bookmark-old'));
  await repository.putEncrypted({
    ...bookmarkRecord('bookmark-new'),
    url: 'https://example.test/new.jpg',
    queueUpdatedAt: '2026-06-17T00:00:03.000Z',
    envelope: { ...bookmarkRecord('bookmark-new').envelope, updatedAt: '2026-06-17T00:00:03.000Z' },
  });
  await repository.putEncrypted({
    ...bookmarkRecord('bookmark-middle'),
    url: 'https://example.test/middle.jpg',
    queueUpdatedAt: '2026-06-17T00:00:02.000Z',
    envelope: { ...bookmarkRecord('bookmark-middle').envelope, updatedAt: '2026-06-17T00:00:02.000Z' },
  });

  assert.equal(await repository.countEncrypted(), 3);
  assert.deepEqual(
    (await repository.listEncryptedPage({ offset: 0, limit: 2 })).map((record) => record.uuid),
    ['bookmark-new', 'bookmark-middle'],
  );
  assert.deepEqual(
    (await repository.listEncryptedPage({ offset: 2, limit: 2 })).map((record) => record.uuid),
    ['bookmark-old'],
  );
});

test('BookmarksRepository paging offsets count valid records only, so a quarantined row cannot dup/skip pages', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  t.mock.method(console, 'warn', () => {});
  const repository = new BookmarksRepository(db);

  const at = (uuid: string, when: string): EncryptedBookmarkRecord => ({
    ...bookmarkRecord(uuid),
    url: `https://example.test/${uuid}.jpg`,
    queueUpdatedAt: when,
    envelope: { ...bookmarkRecord(uuid).envelope, updatedAt: when },
  });
  await repository.putEncrypted(at('bookmark-new', '2026-06-17T00:00:04.000Z'));
  await repository.putEncrypted(at('bookmark-middle', '2026-06-17T00:00:02.000Z'));
  await repository.putEncrypted(at('bookmark-old', '2026-06-17T00:00:01.000Z'));

  // A corrupted row (schemaVersion 2) that sorts between new and middle in the queue index.
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(DataStore.Bookmarks, 'readwrite');
    transaction.objectStore(DataStore.Bookmarks).put({
      uuid: 'corrupt',
      url: 'https://example.test/corrupt.jpg',
      queueUpdatedAt: '2026-06-17T00:00:03.000Z',
      envelope: { schemaVersion: 2 },
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });

  // Page 1 collects the first two valid records; the quarantined row is invisible to paging.
  assert.deepEqual(
    (await repository.listEncryptedPage({ offset: 0, limit: 2 })).map((record) => record.uuid),
    ['bookmark-new', 'bookmark-middle'],
  );
  // Page 2 at offset 2 resumes at the third valid record — it must not re-read 'bookmark-middle'
  // (raw-row offset counting would have skipped past the corrupt row and duplicated it).
  assert.deepEqual(
    (await repository.listEncryptedPage({ offset: 2, limit: 2 })).map((record) => record.uuid),
    ['bookmark-old'],
  );
});

test('BookmarksRepository reports durable queue storage usage', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const session = await createSessionKey('bookmark', 'bookmark-usage-key', '2026-06-20T00:00:00.000Z');
  const thumbnail = 'data:image/png;base64,dGh1bWJuYWls';

  await repository.sealAndPut(
    'bookmark-usage',
    {
      url: 'https://example.test/usage.jpg',
      thumbnail,
      bookmarkedAt: '2026-06-20T00:00:00.000Z',
      sourceCompatibility: 'favorites',
    },
    session.key,
    session.reference,
  );

  const usage = await repository.getStorageUsage(session.key);
  assert.equal(usage.blobCount, 1);
  assert.ok(usage.totalBytes > 0);
  assert.deepEqual(usage.thumbnails, { count: 1, totalBytes: new TextEncoder().encode(thumbnail).byteLength });
});

test('BookmarksRepository exposes one older page after the bookmark soft max is exceeded', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const limit = DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax;

  for (let index = 0; index <= limit; index += 1) {
    const id = `bookmark-${String(index).padStart(2, '0')}`;
    await repository.putEncrypted({
      ...bookmarkRecord(id),
      url: `https://example.test/${id}.jpg`,
      envelope: {
        ...bookmarkRecord(id).envelope,
        updatedAt: `2026-06-17T00:00:${String(index).padStart(2, '0')}.000Z`,
      },
    });
  }

  const newestPage = await repository.listEncryptedPage({ offset: 0, limit });
  const olderPage = await repository.listEncryptedPage({ offset: limit, limit });
  const newerAgain = await repository.listEncryptedPage({ offset: 0, limit });

  assert.equal(await repository.countEncrypted(), limit + 1);
  assert.equal(newestPage.length, limit);
  assert.equal(newestPage[0]?.uuid, `bookmark-${String(limit).padStart(2, '0')}`);
  assert.equal(newestPage.at(-1)?.uuid, 'bookmark-01');
  assert.deepEqual(
    olderPage.map((record) => record.uuid),
    ['bookmark-00'],
  );
  assert.deepEqual(
    newerAgain.map((record) => record.uuid),
    newestPage.map((record) => record.uuid),
  );
});

test('PanelPositionRepository saves positions per hostname', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new PanelPositionRepository(db);

  await repository.put('example.test', { left: 120, top: 48 });
  await repository.put('other.test', { left: 24, top: 36 });

  assert.deepEqual(await repository.get('example.test'), { left: 120, top: 48 });
  assert.deepEqual(await repository.get('other.test'), { left: 24, top: 36 });
  assert.equal(await repository.get('missing.test'), null);
  await repository.delete('example.test');
  assert.equal(await repository.get('example.test'), null);
  assert.deepEqual(await repository.get('other.test'), { left: 24, top: 36 });
});

test('ParsedFieldStateRepository saves parsed field resume state per hostname and page', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new ParsedFieldStateRepository(db);
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'path:0:0',
    failedFieldId: 'query:1:0',
    successfulFieldIds: ['path:0:0'],
    unchangedFieldIds: ['query:0:0'],
    unlockedFieldIds: ['path:0:0'],
    manuallyExcludedFieldIds: ['query:2:0'],
    fieldSplitSpecs: [
      {
        baseFieldId: 'query:0:0',
        location: 'query' as const,
        queryIndex: 0,
        tokenIndex: 0,
        lengths: [2, 2],
        pattern: '2-2',
      },
    ],
    fieldDigitWidthSpecs: [{ fieldId: 'path:0:0', width: 5 }],
    activeUrlTemplateId: 'template-123',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  await repository.put(record);
  await repository.put({ ...record, pageUrl: 'https://example.test/other', activeFieldId: 'query:9:0' });

  assert.deepEqual(await repository.get('example.test', 'https://example.test/gallery'), record);
  assert.equal((await repository.get('example.test', 'https://example.test/other'))?.activeFieldId, 'query:9:0');
  assert.equal(await repository.get('other.test', 'https://example.test/gallery'), null);
});

test('ParsedFieldStateRepository ignores stale parsed field resume saves', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new ParsedFieldStateRepository(db);
  const newer = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0003.jpg',
    selectedUrl: 'https://cdn.example.test/image-0003.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'path:0:0',
    failedFieldId: null,
    successfulFieldIds: ['path:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['path:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-123',
    updatedAt: '2026-06-22T00:00:03.000Z',
  };
  const stale = {
    ...newer,
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0002.jpg',
    updatedAt: '2026-06-22T00:00:02.000Z',
  };

  await repository.put(newer);
  await repository.put(stale);

  assert.deepEqual(await repository.get('example.test', 'https://example.test/gallery'), newer);
});

test('ParsedFieldStateRepository finds resume state by selected image source', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new ParsedFieldStateRepository(db);
  const originalPageRecord = {
    schemaVersion: 1 as const,
    hostname: 'external-content.duckduckgo.com',
    pageUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0001.jpg',
    sourceUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    selectedUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    selectedHandleId: 'image-trail-target-1',
    activeFieldId: 'q:0:1',
    failedFieldId: null,
    successfulFieldIds: ['q:0:1'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:1'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-123',
    updatedAt: '2026-06-22T00:00:03.000Z',
  };
  const olderRecord = {
    ...originalPageRecord,
    pageUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fold.jpg',
    updatedAt: '2026-06-22T00:00:02.000Z',
  };

  await repository.put(olderRecord);
  await repository.put(originalPageRecord);

  assert.deepEqual(
    await repository.getForSource(
      'external-content.duckduckgo.com',
      'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    ),
    originalPageRecord,
  );
  assert.deepEqual(await repository.getForSource('external-content.duckduckgo.com', originalPageRecord.pageUrl), originalPageRecord);
  assert.equal(await repository.getForSource('other.test', originalPageRecord.sourceUrl), null);
});

test('UrlReviewStatusRepository saves, lists, and imports URL review state per hostname', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new UrlReviewStatusRepository(db);
  const passed = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://example.test/image-0002.jpg',
    status: 'passed' as const,
    fieldIds: ['path:0:0'],
    activeFieldId: 'path:0:0',
    updatedAt: '2026-06-23T00:00:02.000Z',
  };
  const failed = {
    ...passed,
    sourceUrl: 'https://example.test/image-0003.jpg',
    status: 'failed' as const,
    reason: 'Image failed to load: HTTP 404',
    updatedAt: '2026-06-23T00:00:03.000Z',
  };
  const otherHost = {
    ...passed,
    hostname: 'other.test',
    sourceUrl: 'https://other.test/image-0002.jpg',
    updatedAt: '2026-06-23T00:00:04.000Z',
  };

  await repository.put(passed);
  await repository.put(failed);
  await repository.put(otherHost);

  assert.deepEqual(await repository.listByHostname('example.test'), [failed, passed]);
  assert.deepEqual(await repository.listByHostname('other.test'), [otherHost]);

  const stale = { ...failed, status: 'passed' as const, updatedAt: '2026-06-23T00:00:01.000Z' };
  const unchanged = {
    ...failed,
    status: 'unchanged' as const,
    reason: 'Image loaded but did not change.',
    updatedAt: '2026-06-23T00:00:05.000Z',
  };
  assert.equal(await repository.putMany([stale, unchanged]), 1);
  assert.deepEqual(await repository.listByHostname('example.test'), [unchanged, passed]);

  assert.equal(await repository.clear({ scope: 'page', hostname: 'example.test', pageUrl: 'https://example.test/missing' }), 0);
  assert.equal(await repository.clear({ scope: 'source', hostname: 'example.test', sourceUrl: unchanged.sourceUrl }), 1);
  assert.deepEqual(await repository.listByHostname('example.test'), [passed]);
  assert.equal(await repository.clearHostname('example.test'), 1);
  assert.deepEqual(await repository.listByHostname('example.test'), []);
  assert.deepEqual(await repository.listByHostname('other.test'), [otherHost]);
  assert.equal(await repository.clear({ scope: 'all' }), 1);
  assert.deepEqual(await repository.listByHostname('other.test'), []);
});

test('UrlReviewStatusRepository caps URL review state per hostname with configurable retention', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new UrlReviewStatusRepository(db);
  const records = Array.from({ length: 4 }, (_, index) => ({
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: `https://example.test/image-${String(index).padStart(4, '0')}.jpg`,
    status: 'passed' as const,
    fieldIds: ['path:0:0'],
    activeFieldId: 'path:0:0',
    updatedAt: new Date(Date.UTC(2026, 5, 23, 0, 0, index)).toISOString(),
  }));

  assert.equal(await repository.putMany(records, { maxRecordsPerHost: 3 }), 4);
  const stored = await repository.listByHostname('example.test');

  assert.equal(stored.length, 3);
  assert.equal(
    stored.some((record) => record.sourceUrl.endsWith('image-0000.jpg')),
    false,
  );
  assert.equal(stored[0]?.sourceUrl.endsWith('image-0003.jpg'), true);
});

test('UrlTemplateRepository saves templates per hostname', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new UrlTemplateRepository(db);
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 1,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image/{query-page}.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
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
        location: 'query',
        tokenKind: 'int',
        queryIndex: 0,
        queryKey: 'page',
        tokenIndex: 0,
      },
    ],
    hideExcludedFields: false,
    autoApplyEnabled: true,
    grabStrategy: {
      kind: 'linked-page-image',
      timeoutMs: 5000,
      maxBytes: 1_048_576,
      extractors: [{ selector: 'meta[property="og:image"]', attribute: 'content' }],
    },
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };
  const pattern: GrabSourcePattern = {
    id: 'grab-source-001',
    schemaVersion: 1,
    hostname: 'example.test',
    patternUrl: 'https://example.test/post/123',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactPathSignature: 'post:int',
      pathShapeSignature: 'post:int',
      querySignature: '',
    },
    grabStrategy: {
      kind: 'linked-page-image',
      timeoutMs: 5000,
      maxBytes: 1_048_576,
      extractors: [{ selector: 'meta[property="og:image"]', attribute: 'content' }],
    },
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  await repository.put(template);
  await repository.put({ ...template, id: 'other-template', hostname: 'other.test' });
  await repository.putGrabSourcePattern(pattern);
  await repository.putGrabSourcePattern({ ...pattern, id: 'other-pattern', hostname: 'other.test' });

  assert.deepEqual(await repository.listByHostname('example.test'), [template]);
  assert.deepEqual(await repository.listByHostname('other.test'), [{ ...template, id: 'other-template', hostname: 'other.test' }]);
  assert.deepEqual(await repository.listGrabSourcePatternsByHostname('example.test'), [pattern]);
  assert.deepEqual(await repository.listGrabSourcePatternsByHostname('other.test'), [
    { ...pattern, id: 'other-pattern', hostname: 'other.test' },
  ]);
  await repository.deleteGrabSourcePattern('example.test', 'grab-source-001');
  assert.deepEqual(await repository.listGrabSourcePatternsByHostname('example.test'), []);
  await repository.delete('example.test', 'template-001');
  assert.deepEqual(await repository.listByHostname('example.test'), []);
});

test('repository transaction failures are surfaced to callers', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new KeysRepository(db);
  const uncloneableRecord = {
    ...storedKeyRecord('history:uncloneable', 'uncloneable'),
    wrapping: {
      mode: 'session',
      algorithm: 'none',
      wrappedKey: () => 'not structured-cloneable',
    },
  } as unknown as StoredKeyRecord<'history'>;

  await assert.rejects(repository.put(uncloneableRecord), (error) => error instanceof DOMException || error instanceof Error);
});
