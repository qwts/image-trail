import type { UrlTemplateRecord } from '../../core/url/templates.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';

interface UrlTemplateMetadataRecord extends UrlTemplateRecord {
  readonly key: string;
  readonly kind: 'urlTemplate';
}

const URL_TEMPLATE_KEY_PREFIX = 'url-template:';
const URL_TEMPLATE_HOST_PREFIX = 'url-template-host:';

export class UrlTemplateRepository {
  constructor(private readonly db: IDBDatabase) {}

  async listByHostname(hostname: string): Promise<readonly UrlTemplateRecord[]> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = hostPrefix(hostname);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const records = await requestToPromise<UrlTemplateMetadataRecord[]>(store.getAll(range));
    await transactionDone(transaction);
    return records
      .filter((record) => record.kind === 'urlTemplate')
      .map(stripMetadataKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async put(template: UrlTemplateRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction
      .objectStore(DataStore.Metadata)
      .put({ ...template, key: templateKey(template), kind: 'urlTemplate' } satisfies UrlTemplateMetadataRecord);
    await transactionDone(transaction);
  }

  async delete(hostname: string, id: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).delete(templateKey({ hostname, id }));
    await transactionDone(transaction);
  }
}

function stripMetadataKey(record: UrlTemplateMetadataRecord): UrlTemplateRecord {
  const { key: _key, kind: _kind, ...template } = record;
  return template;
}

function templateKey(template: Pick<UrlTemplateRecord, 'hostname' | 'id'>): string {
  return `${hostPrefix(template.hostname)}${template.id}`;
}

function hostPrefix(hostname: string): string {
  return `${URL_TEMPLATE_KEY_PREFIX}${URL_TEMPLATE_HOST_PREFIX}${hostname.toLowerCase()}:`;
}
