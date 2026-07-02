import * as v from 'valibot';
import { DEFAULT_URL_REVIEW_STATUS_LIMIT } from '../../core/settings.js';
import type { UrlReviewStatusClearFilter, UrlReviewStatusRecord } from '../../core/types.js';
import { urlReviewStatusRecordSchema } from '../../core/types.schema.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { hydrateRecords } from './hydration.js';

interface UrlReviewStatusMetadataRecord extends UrlReviewStatusRecord {
  readonly key: string;
  readonly kind: 'urlReviewStatus';
}

const urlReviewStatusMetadataRecordSchema = v.object({
  ...urlReviewStatusRecordSchema.entries,
  key: v.string(),
  kind: v.literal('urlReviewStatus'),
}) as v.GenericSchema<unknown, UrlReviewStatusMetadataRecord>;

const URL_REVIEW_STATUS_KEY_PREFIX = 'url-review-status:';
export class UrlReviewStatusRepository {
  constructor(private readonly db: IDBDatabase) {}

  async listByHostname(hostname: string): Promise<readonly UrlReviewStatusRecord[]> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = urlReviewStatusHostPrefix(hostname);
    const raw = await requestToPromise<unknown[]>(store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Metadata, urlReviewStatusMetadataRecordSchema, raw)
      .map(stripMetadataKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async put(record: UrlReviewStatusRecord, options: { readonly maxRecordsPerHost?: number } = {}): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const key = urlReviewStatusKey(record.hostname, record.sourceUrl);
    const existing = await requestToPromise<UrlReviewStatusMetadataRecord | undefined>(store.get(key));
    if (existing?.kind === 'urlReviewStatus' && existing.updatedAt > record.updatedAt) {
      await transactionDone(transaction);
      return;
    }
    store.put({ ...record, key, kind: 'urlReviewStatus' } satisfies UrlReviewStatusMetadataRecord);
    await trimHostRecords(store, record.hostname, normalizeLimit(options.maxRecordsPerHost));
    await transactionDone(transaction);
  }

  async putMany(records: readonly UrlReviewStatusRecord[], options: { readonly maxRecordsPerHost?: number } = {}): Promise<number> {
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
    await trimHostRecordsForRecords(store, records, normalizeLimit(options.maxRecordsPerHost));
    await transactionDone(transaction);
    return imported;
  }

  async clear(filter: UrlReviewStatusClearFilter): Promise<number> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const records = await recordsForFilter(store, filter);
    for (const record of records) store.delete(record.key);
    await transactionDone(transaction);
    return records.length;
  }

  async clearHostname(hostname: string): Promise<number> {
    return this.clear({ scope: 'hostname', hostname });
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

async function recordsForFilter(store: IDBObjectStore, filter: UrlReviewStatusClearFilter): Promise<UrlReviewStatusMetadataRecord[]> {
  if (filter.scope === 'all') {
    const records = await requestToPromise<UrlReviewStatusMetadataRecord[]>(
      store.getAll(IDBKeyRange.bound(URL_REVIEW_STATUS_KEY_PREFIX, `${URL_REVIEW_STATUS_KEY_PREFIX}\uffff`)),
    );
    return records.filter((record) => record.kind === 'urlReviewStatus');
  }
  const records = await recordsForHost(store, filter.hostname);
  if (filter.scope === 'hostname') return records;
  if (filter.scope === 'page') return records.filter((record) => record.pageUrl === filter.pageUrl);
  return records.filter((record) => record.sourceUrl === filter.sourceUrl);
}

async function trimHostRecordsForRecords(
  store: IDBObjectStore,
  records: readonly UrlReviewStatusRecord[],
  maxRecordsPerHost: number,
): Promise<void> {
  const hostnames = new Set(records.map((record) => record.hostname));
  for (const hostname of hostnames) await trimHostRecords(store, hostname, maxRecordsPerHost);
}

async function trimHostRecords(store: IDBObjectStore, hostname: string, maxRecordsPerHost: number): Promise<void> {
  const records = await recordsForHost(store, hostname);
  if (records.length <= maxRecordsPerHost) return;
  const staleRecords = records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(maxRecordsPerHost);
  for (const record of staleRecords) store.delete(record.key);
}

function normalizeLimit(limit: number | undefined): number {
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_URL_REVIEW_STATUS_LIMIT;
}
