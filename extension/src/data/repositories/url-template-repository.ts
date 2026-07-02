import * as v from 'valibot';
import type { GrabSourcePattern, UrlTemplateRecord } from '../../core/url/templates.js';
import { grabSourcePatternSchema, urlTemplateRecordSchema } from '../../core/url/templates.schema.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';
import { hydrateRecords } from './hydration.js';

interface UrlTemplateMetadataRecord extends UrlTemplateRecord {
  readonly key: string;
  readonly kind: 'urlTemplate';
}

interface GrabSourcePatternMetadataRecord extends GrabSourcePattern {
  readonly key: string;
  readonly kind: 'grabSourcePattern';
}

const urlTemplateMetadataRecordSchema = v.object({
  ...urlTemplateRecordSchema.entries,
  key: v.string(),
  kind: v.literal('urlTemplate'),
}) as v.GenericSchema<unknown, UrlTemplateMetadataRecord>;

const grabSourcePatternMetadataRecordSchema = v.object({
  ...grabSourcePatternSchema.entries,
  key: v.string(),
  kind: v.literal('grabSourcePattern'),
}) as v.GenericSchema<unknown, GrabSourcePatternMetadataRecord>;

const URL_TEMPLATE_KEY_PREFIX = 'url-template:';
const URL_TEMPLATE_HOST_PREFIX = 'url-template-host:';
const GRAB_SOURCE_PATTERN_KEY_PREFIX = 'grab-source-pattern:';
const GRAB_SOURCE_PATTERN_HOST_PREFIX = 'grab-source-pattern-host:';

export class UrlTemplateRepository {
  constructor(private readonly db: IDBDatabase) {}

  async listByHostname(hostname: string): Promise<readonly UrlTemplateRecord[]> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = templateHostPrefix(hostname);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const raw = await requestToPromise<unknown[]>(store.getAll(range));
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Metadata, urlTemplateMetadataRecordSchema, raw)
      .map(stripTemplateMetadataKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listGrabSourcePatternsByHostname(hostname: string): Promise<readonly GrabSourcePattern[]> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readonly');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = grabSourcePatternHostPrefix(hostname);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const raw = await requestToPromise<unknown[]>(store.getAll(range));
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Metadata, grabSourcePatternMetadataRecordSchema, raw)
      .map(stripGrabSourcePatternMetadataKey)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async put(template: UrlTemplateRecord): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction
      .objectStore(DataStore.Metadata)
      .put({ ...template, key: templateKey(template), kind: 'urlTemplate' } satisfies UrlTemplateMetadataRecord);
    await transactionDone(transaction);
  }

  async putGrabSourcePattern(pattern: GrabSourcePattern): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).put({
      ...pattern,
      key: grabSourcePatternKey(pattern),
      kind: 'grabSourcePattern',
    } satisfies GrabSourcePatternMetadataRecord);
    await transactionDone(transaction);
  }

  async delete(hostname: string, id: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).delete(templateKey({ hostname, id }));
    await transactionDone(transaction);
  }

  async deleteGrabSourcePattern(hostname: string, id: string): Promise<void> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    transaction.objectStore(DataStore.Metadata).delete(grabSourcePatternKey({ hostname, id }));
    await transactionDone(transaction);
  }
}

function stripTemplateMetadataKey(record: UrlTemplateMetadataRecord): UrlTemplateRecord {
  const { key: _key, kind: _kind, ...template } = record;
  return template;
}

function stripGrabSourcePatternMetadataKey(record: GrabSourcePatternMetadataRecord): GrabSourcePattern {
  const { key: _key, kind: _kind, ...pattern } = record;
  return pattern;
}

function templateKey(template: Pick<UrlTemplateRecord, 'hostname' | 'id'>): string {
  return `${templateHostPrefix(template.hostname)}${template.id}`;
}

function grabSourcePatternKey(pattern: Pick<GrabSourcePattern, 'hostname' | 'id'>): string {
  return `${grabSourcePatternHostPrefix(pattern.hostname)}${pattern.id}`;
}

function templateHostPrefix(hostname: string): string {
  return `${URL_TEMPLATE_KEY_PREFIX}${URL_TEMPLATE_HOST_PREFIX}${hostname.toLowerCase()}:`;
}

function grabSourcePatternHostPrefix(hostname: string): string {
  return `${GRAB_SOURCE_PATTERN_KEY_PREFIX}${GRAB_SOURCE_PATTERN_HOST_PREFIX}${hostname.toLowerCase()}:`;
}
