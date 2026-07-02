import * as v from 'valibot';
import type { ParsedFieldStateRecord } from '../../core/types.js';
import { parsedFieldStateRecordSchema } from '../../core/types.schema.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { hydrateRecord, hydrateRecords } from './hydration.js';

interface ParsedFieldStateMetadataRecord extends ParsedFieldStateRecord {
  readonly key: string;
  readonly kind: 'parsedFieldState';
}

const parsedFieldStateMetadataRecordSchema = v.object({
  ...parsedFieldStateRecordSchema.entries,
  key: v.string(),
  kind: v.literal('parsedFieldState'),
}) as v.GenericSchema<unknown, ParsedFieldStateMetadataRecord>;

const PARSED_FIELD_STATE_KEY_PREFIX = 'parsed-field-state:';

export class ParsedFieldStateRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(hostname: string, pageUrl: string): Promise<ParsedFieldStateRecord | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const raw = await requestToPromise<unknown>(transaction.objectStore(DataStore.Metadata).get(parsedFieldStateKey(hostname, pageUrl)));
    await transactionDone(transaction);
    const record = hydrateRecord(DataStore.Metadata, parsedFieldStateMetadataRecordSchema, raw);
    return record ? stripMetadataKey(record) : null;
  }

  async getForSource(hostname: string, sourceUrl: string): Promise<ParsedFieldStateRecord | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = parsedFieldStateHostPrefix(hostname);
    const raw = await requestToPromise<unknown[]>(store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
    await transactionDone(transaction);
    const latest = hydrateRecords(DataStore.Metadata, parsedFieldStateMetadataRecordSchema, raw)
      .filter((record) => record.sourceUrl === sourceUrl || record.selectedUrl === sourceUrl || record.pageUrl === sourceUrl)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    return latest ? stripMetadataKey(latest) : null;
  }

  async put(record: ParsedFieldStateRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const key = parsedFieldStateKey(record.hostname, record.pageUrl);
    const existing = await requestToPromise<ParsedFieldStateMetadataRecord | undefined>(store.get(key));
    if (existing?.kind === 'parsedFieldState' && existing.updatedAt > record.updatedAt) {
      await transactionDone(transaction);
      return;
    }
    store.put({
      ...record,
      key,
      kind: 'parsedFieldState',
    } satisfies ParsedFieldStateMetadataRecord);
    await transactionDone(transaction);
  }
}

function stripMetadataKey(record: ParsedFieldStateMetadataRecord): ParsedFieldStateRecord {
  const { key: _key, kind: _kind, ...state } = record;
  return state;
}

function parsedFieldStateKey(hostname: string, pageUrl: string): string {
  return `${parsedFieldStateHostPrefix(hostname)}${encodeURIComponent(pageUrl)}`;
}

function parsedFieldStateHostPrefix(hostname: string): string {
  return `${PARSED_FIELD_STATE_KEY_PREFIX}${hostname.toLowerCase()}:`;
}
