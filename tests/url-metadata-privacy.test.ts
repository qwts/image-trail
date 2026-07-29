import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import type { SearchableMetadataMode, SearchableMetadataPolicy } from '../extension/src/core/metadata-policy.js';
import type { ParsedFieldStateRecord, UrlReviewStatusRecord } from '../extension/src/core/types.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { ensureDurableMetadataKey } from '../extension/src/data/durable-metadata-key.js';
import { ParsedFieldStateRepository } from '../extension/src/data/repositories/parsed-field-state-repository.js';
import { KeysRepository } from '../extension/src/data/repositories/keys-repository.js';
import { UrlReviewStatusRepository } from '../extension/src/data/repositories/url-review-status-repository.js';
import { DataStore } from '../extension/src/data/schema.js';
import type { UrlMetadataPrivacyOptions } from '../extension/src/data/url-metadata-privacy.js';
import { openFreshImageTrailDb, requestToPromise, transactionDone } from './indexeddb-test-helpers.js';

test('encrypted URL metadata rows round-trip without plaintext host, page, or image URLs at rest', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const privacy = await encryptedPrivacy();
  const parsed = new ParsedFieldStateRepository(db, privacy);
  const reviews = new UrlReviewStatusRepository(db, privacy);
  const parsedRecord = parsedState();
  const reviewRecord = reviewStatus();

  await parsed.put(parsedRecord);
  await reviews.put(reviewRecord);

  assert.deepEqual(await parsed.get(parsedRecord.hostname, parsedRecord.pageUrl), parsedRecord);
  assert.deepEqual(await parsed.getForSource(parsedRecord.hostname, parsedRecord.selectedUrl!), parsedRecord);
  assert.deepEqual(await reviews.listByHostname(reviewRecord.hostname), [reviewRecord]);

  const records = await metadataRecords(db);
  const privateRows = records.filter((record) => String(record['kind']).endsWith('Encrypted'));
  const serialized = JSON.stringify(privateRows);
  assert.equal(privateRows.length, 2);
  assert.doesNotMatch(serialized, /private\.example|gallery-secret|image-secret|token-secret/iu);
  assert.match(
    String(privateRows.find((record) => record['kind'] === 'parsedFieldStateEncrypted')?.['key']),
    opaqueKeyPattern('parsed-field-state'),
  );
  assert.match(
    String(privateRows.find((record) => record['kind'] === 'urlReviewStatusEncrypted')?.['key']),
    opaqueKeyPattern('url-review-status'),
  );
  assert.equal(
    privateRows.every((record) => record['envelope'] && !('hostname' in record)),
    true,
  );
});

test('policy reconciliation redacts legacy plaintext rows and can restore the selected plaintext representation', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  let activePolicy = policy('plaintext');
  const key = await createSessionKey('metadata', 'metadata-policy-switch');
  const privacy: UrlMetadataPrivacyOptions = {
    getSearchableMetadataPolicy: () => activePolicy,
    getEncryptionKey: () => key,
  };
  const parsed = new ParsedFieldStateRepository(db, privacy);
  const reviews = new UrlReviewStatusRepository(db, privacy);
  const parsedRecord = parsedState();
  const reviewRecord = reviewStatus();
  await parsed.put(parsedRecord);
  await reviews.put(reviewRecord);
  assert.match(JSON.stringify(await metadataRecords(db)), /private\.example/iu);

  activePolicy = policy('encrypted');
  await Promise.all([parsed.reconcilePolicy(activePolicy), reviews.reconcilePolicy(activePolicy)]);

  let records = await metadataRecords(db);
  assert.doesNotMatch(JSON.stringify(records), /private\.example|gallery-secret|image-secret|token-secret/iu);
  assert.equal(
    records.some((record) => record['kind'] === 'parsedFieldState'),
    false,
  );
  assert.equal(
    records.some((record) => record['kind'] === 'urlReviewStatus'),
    false,
  );
  assert.deepEqual(await parsed.get(parsedRecord.hostname, parsedRecord.pageUrl), parsedRecord);
  assert.deepEqual(await reviews.listByHostname(reviewRecord.hostname), [reviewRecord]);

  activePolicy = policy('plaintext');
  await Promise.all([parsed.reconcilePolicy(activePolicy), reviews.reconcilePolicy(activePolicy)]);

  records = await metadataRecords(db);
  assert.match(JSON.stringify(records), /private\.example/iu);
  assert.equal(
    records.some((record) => record['kind'] === 'parsedFieldStateEncrypted'),
    false,
  );
  assert.equal(
    records.some((record) => record['kind'] === 'urlReviewStatusEncrypted'),
    false,
  );
  assert.deepEqual(await parsed.get(parsedRecord.hostname, parsedRecord.pageUrl), parsedRecord);
  assert.deepEqual(await reviews.listByHostname(reviewRecord.hostname), [reviewRecord]);
});

test('encrypted URL review rows preserve stale-write, retention, and clear-filter behavior', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const reviews = new UrlReviewStatusRepository(db, await encryptedPrivacy());
  const records = Array.from({ length: 4 }, (_, index) =>
    reviewStatus({
      pageUrl: `https://private.example.test/${index < 2 ? 'page-a' : 'page-b'}?token=secret-${index}`,
      sourceUrl: `https://cdn.private.example.test/image-secret-${index}.jpg`,
      updatedAt: new Date(Date.UTC(2026, 6, 28, 0, 0, index)).toISOString(),
    }),
  );

  assert.equal(await reviews.putMany(records, { maxRecordsPerHost: 3 }), 4);
  assert.deepEqual(await reviews.listByHostname('private.example.test'), [records[3], records[2], records[1]]);

  await reviews.put({ ...records[3]!, status: 'failed', updatedAt: '2026-07-27T23:59:59.000Z' });
  assert.equal((await reviews.listByHostname('private.example.test'))[0]?.status, 'passed');
  assert.equal(await reviews.clear({ scope: 'page', hostname: 'private.example.test', pageUrl: records[1]!.pageUrl }), 1);
  assert.equal(await reviews.clear({ scope: 'source', hostname: 'private.example.test', sourceUrl: records[2]!.sourceUrl }), 1);
  assert.deepEqual(await reviews.listByHostname('private.example.test'), [records[3]]);
  assert.equal(await reviews.clear({ scope: 'all' }), 1);
  assert.deepEqual(await reviews.listByHostname('private.example.test'), []);
  assert.doesNotMatch(JSON.stringify(await metadataRecords(db)), /private\.example|secret/iu);
});

test('encrypted parsed-field rows preserve source lookup and reject stale saves', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const parsed = new ParsedFieldStateRepository(db, await encryptedPrivacy());
  const first = parsedState();
  const second = parsedState({
    pageUrl: 'https://private.example.test/gallery-other?token=other-secret',
    sourceUrl: 'https://cdn.private.example.test/image-other.jpg',
    updatedAt: '2026-07-28T00:00:02.000Z',
  });
  await parsed.put(first);
  await parsed.put(second);
  await parsed.put({ ...second, sourceUrl: first.sourceUrl, updatedAt: '2026-07-28T00:00:00.000Z' });

  assert.deepEqual(await parsed.get(second.hostname, second.pageUrl), second);
  assert.deepEqual(await parsed.getForSource(first.hostname, first.sourceUrl), first);
  assert.deepEqual(await parsed.getForSource(second.hostname, second.selectedUrl!), second);
  assert.doesNotMatch(JSON.stringify(await metadataRecords(db)), /private\.example|secret/iu);
});

test('encrypted reconciliation deletes malformed legacy URL rows instead of retaining plaintext leaks', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  await putMetadata(db, {
    key: 'parsed-field-state:private.example.test:https%3A%2F%2Fprivate.example.test%2Fsecret',
    kind: 'parsedFieldState',
    hostname: 'private.example.test',
    pageUrl: 'https://private.example.test/secret',
  });
  await putMetadata(db, {
    key: 'url-review-status:private.example.test:https%3A%2F%2Fprivate.example.test%2Fsecret.jpg',
    kind: 'urlReviewStatus',
    hostname: 'private.example.test',
    sourceUrl: 'https://private.example.test/secret.jpg',
  });
  const privacy = await encryptedPrivacy();

  await Promise.all([
    new ParsedFieldStateRepository(db, privacy).reconcilePolicy(policy('encrypted')),
    new UrlReviewStatusRepository(db, privacy).reconcilePolicy(policy('encrypted')),
  ]);

  assert.doesNotMatch(JSON.stringify(await metadataRecords(db)), /private\.example|secret/iu);
});

test('policy changes serialize behind in-flight plaintext saves so reconciliation cannot leave a URL leak', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const key = await createSessionKey('metadata', 'metadata-policy-race');
  const parsedPolicy = deferred<SearchableMetadataPolicy>();
  const reviewPolicy = deferred<SearchableMetadataPolicy>();
  const parsed = new ParsedFieldStateRepository(db, {
    getSearchableMetadataPolicy: () => parsedPolicy.promise,
    getEncryptionKey: () => key,
  });
  const reviews = new UrlReviewStatusRepository(db, {
    getSearchableMetadataPolicy: () => reviewPolicy.promise,
    getEncryptionKey: () => key,
  });

  const saves = [parsed.put(parsedState()), reviews.put(reviewStatus())];
  const reconciliations = [parsed.reconcilePolicy(policy('encrypted')), reviews.reconcilePolicy(policy('encrypted'))];
  parsedPolicy.resolve(policy('plaintext'));
  reviewPolicy.resolve(policy('plaintext'));
  await Promise.all([...saves, ...reconciliations]);

  const serialized = JSON.stringify(await metadataRecords(db));
  assert.doesNotMatch(serialized, /private\.example|gallery-secret|image-secret|token-secret/iu);
  assert.match(serialized, /parsedFieldStateEncrypted/u);
  assert.match(serialized, /urlReviewStatusEncrypted/u);
});

test('durable metadata encryption key is reused from the extension key store', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new KeysRepository(db);

  const first = await ensureDurableMetadataKey(repository);
  const second = await ensureDurableMetadataKey(repository);

  assert.equal(second.reference.reference, first.reference.reference);
  assert.equal((await repository.listByKind('metadata')).length, 1);
});

async function encryptedPrivacy(): Promise<UrlMetadataPrivacyOptions> {
  const key = await createSessionKey('metadata', crypto.randomUUID());
  return {
    getSearchableMetadataPolicy: () => policy('encrypted'),
    getEncryptionKey: () => key,
  };
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let release = (_value: T): void => {
    throw new Error('Deferred promise resolver was not initialized.');
  };
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: (value) => release(value) };
}

function policy(urlDerived: SearchableMetadataMode): SearchableMetadataPolicy {
  return { urlDerived, albumName: 'plaintext', thumbnail: 'encrypted' };
}

function parsedState(overrides: Partial<Pick<ParsedFieldStateRecord, 'pageUrl' | 'sourceUrl' | 'updatedAt'>> = {}): ParsedFieldStateRecord {
  const sourceUrl = overrides.sourceUrl ?? 'https://cdn.private.example.test/image-secret.jpg?token=token-secret';
  return {
    schemaVersion: 1,
    hostname: 'private.example.test',
    pageUrl: overrides.pageUrl ?? 'https://private.example.test/gallery-secret?token=token-secret',
    sourceUrl,
    selectedUrl: sourceUrl,
    selectedHandleId: 'target-1',
    activeFieldId: 'path:0:0',
    failedFieldId: null,
    successfulFieldIds: ['path:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['path:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: null,
    updatedAt: overrides.updatedAt ?? '2026-07-28T00:00:01.000Z',
  };
}

function reviewStatus(overrides: Partial<Pick<UrlReviewStatusRecord, 'pageUrl' | 'sourceUrl' | 'updatedAt'>> = {}): UrlReviewStatusRecord {
  return {
    schemaVersion: 1,
    hostname: 'private.example.test',
    pageUrl: overrides.pageUrl ?? 'https://private.example.test/gallery-secret?token=token-secret',
    sourceUrl: overrides.sourceUrl ?? 'https://cdn.private.example.test/image-secret.jpg?token=token-secret',
    status: 'passed',
    fieldIds: ['path:0:0'],
    activeFieldId: 'path:0:0',
    updatedAt: overrides.updatedAt ?? '2026-07-28T00:00:01.000Z',
  };
}

function opaqueKeyPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}:v2:[0-9a-f]{64}:[0-9a-f]{64}$`, 'u');
}

async function metadataRecords(db: IDBDatabase): Promise<Record<string, unknown>[]> {
  const transaction = db.transaction(DataStore.Metadata, 'readonly');
  const records = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.Metadata).getAll());
  await transactionDone(transaction);
  return records.filter((record): record is Record<string, unknown> => typeof record === 'object' && record !== null);
}

async function putMetadata(db: IDBDatabase, record: Record<string, unknown>): Promise<void> {
  const transaction = db.transaction(DataStore.Metadata, 'readwrite');
  transaction.objectStore(DataStore.Metadata).put(record);
  await transactionDone(transaction);
}
