import type { UrlReviewStatusRecord } from '../../core/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';

interface UrlReviewStatusMetadataRecord extends UrlReviewStatusRecord {
  readonly key: string;
  readonly kind: 'urlReviewStatus';
}

const URL_REVIEW_STATUS_KEY_PREFIX = 'url-review-status:';
const MAX_URL_REVIEW_STATUS_RECORDS_PER_HOST = 5_000;

export class UrlReviewStatusRepository {
  constructor(private readonly db: IDBDatabase) {}

  async listByHostname(hostname: string): Promise<readonly UrlReviewStatusRecord[]> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = urlReviewStatusHostPrefix(hostname);
    const records = await requestToPromise<UrlReviewStatusMetadataRecord[]>(store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
    await transactionDone(transaction);
    return records
      .filter((record) => record.kind === 'urlReviewStatus')
      .map(stripMetadataKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async put(record: UrlReviewStatusRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const key = urlReviewStatusKey(record.hostname, record.sourceUrl);
    const existing = await requestToPromise<UrlReviewStatusMetadataRecord | undefined>(store.get(key));
    if (existing?.kind === 'urlReviewStatus' && existing.updatedAt > record.updatedAt) {
      await transactionDone(transaction);
      return;
    }
    store.put({ ...record, key, kind: 'urlReviewStatus' } satisfies UrlReviewStatusMetadataRecord);
    await trimHostRecords(store, record.hostname);
    await transactionDone(transaction);
  }

  async putMany(records: readonly UrlReviewStatusRecord[]): Promise<number> {
    if (records.length === 0) return 0;
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    let imported = 0;
    for (const record of records) {
      const key = urlReviewStatusKey(record.hostname, record.sourceUrl);
      const existing = await requestToPromise<UrlReviewStatusMetadataRecord | undefined>(store.get(key));
      if (existing?.kind === 'urlReviewStatus' && existing.updatedAt > record.updatedAt) continue;
      store.put({ ...record, key, kind: 'urlReviewStatus' } satisfies UrlReviewStatusMetadataRecord);
      imported += 1;
    }
    await trimHostRecordsForRecords(store, records);
    await transactionDone(transaction);
    return imported;
  }

  async clearHostname(hostname: string): Promise<number> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const records = await recordsForHost(store, hostname);
    for (const record of records) store.delete(record.key);
    await transactionDone(transaction);
    return records.length;
  }
}

function stripMetadataKey(record: UrlReviewStatusMetadataRecord): UrlReviewStatusRecord {
  const { key: _key, kind: _kind, ...status } = record;
  return status;
}

function urlReviewStatusKey(hostname: string, sourceUrl: string): string {
  return `${urlReviewStatusHostPrefix(hostname)}${encodeURIComponent(sourceUrl)}`;
}

function urlReviewStatusHostPrefix(hostname: string): string {
  return `${URL_REVIEW_STATUS_KEY_PREFIX}${hostname.toLowerCase()}:`;
}

async function recordsForHost(store: IDBObjectStore, hostname: string): Promise<UrlReviewStatusMetadataRecord[]> {
  const prefix = urlReviewStatusHostPrefix(hostname);
  const records = await requestToPromise<UrlReviewStatusMetadataRecord[]>(store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
  return records.filter((record) => record.kind === 'urlReviewStatus');
}

async function trimHostRecordsForRecords(store: IDBObjectStore, records: readonly UrlReviewStatusRecord[]): Promise<void> {
  const hostnames = new Set(records.map((record) => record.hostname));
  for (const hostname of hostnames) await trimHostRecords(store, hostname);
}

async function trimHostRecords(store: IDBObjectStore, hostname: string): Promise<void> {
  const records = await recordsForHost(store, hostname);
  if (records.length <= MAX_URL_REVIEW_STATUS_RECORDS_PER_HOST) return;
  const staleRecords = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(MAX_URL_REVIEW_STATUS_RECORDS_PER_HOST);
  for (const record of staleRecords) store.delete(record.key);
}
