import type { ParsedFieldStateRecord } from '../../core/types.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';

interface ParsedFieldStateMetadataRecord extends ParsedFieldStateRecord {
  readonly key: string;
  readonly kind: 'parsedFieldState';
}

const PARSED_FIELD_STATE_KEY_PREFIX = 'parsed-field-state:';

export class ParsedFieldStateRepository {
  constructor(private readonly db: IDBDatabase) {}

  async get(hostname: string, pageUrl: string): Promise<ParsedFieldStateRecord | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const record = await requestToPromise<ParsedFieldStateMetadataRecord | undefined>(
      transaction.objectStore(DataStore.Metadata).get(parsedFieldStateKey(hostname, pageUrl)),
    );
    await transactionDone(transaction);
    return record?.kind === 'parsedFieldState' ? stripMetadataKey(record) : null;
  }

  async getForSource(hostname: string, sourceUrl: string): Promise<ParsedFieldStateRecord | null> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = parsedFieldStateHostPrefix(hostname);
    const records = await requestToPromise<ParsedFieldStateMetadataRecord[]>(store.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`)));
    await transactionDone(transaction);
    const latest = records
      .filter(
        (record) =>
          record.kind === 'parsedFieldState' &&
          (record.sourceUrl === sourceUrl || record.selectedUrl === sourceUrl || record.pageUrl === sourceUrl),
      )
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
