import * as v from 'valibot';
import type { GrabSourcePattern, UrlTemplateRecord } from '../../core/url/templates.js';
import {
  grabSourcePatternSchema,
  legacyGrabSourcePatternSchema,
  legacyUrlTemplateRecordSchema,
  urlTemplateRecordSchema,
} from '../../core/url/templates.schema.js';
import { createUrlTemplateIdentityKey, deriveUrlTemplateIdentity, isUrlTemplateIdentityKey } from '../../core/url/template-identity.js';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore } from '../schema.js';

type LegacyUrlTemplateRecord = v.InferOutput<typeof legacyUrlTemplateRecordSchema>;
type LegacyGrabSourcePattern = v.InferOutput<typeof legacyGrabSourcePatternSchema>;
type LegacyUrlTemplateMetadataRecord = LegacyUrlTemplateRecord & { readonly key: string; readonly kind: 'urlTemplate' };
type LegacyGrabSourcePatternMetadataRecord = LegacyGrabSourcePattern & { readonly key: string; readonly kind: 'grabSourcePattern' };

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

const legacyUrlTemplateMetadataRecordSchema = v.object({
  ...legacyUrlTemplateRecordSchema.entries,
  key: v.string(),
  kind: v.literal('urlTemplate'),
});

const legacyGrabSourcePatternMetadataRecordSchema = v.object({
  ...legacyGrabSourcePatternSchema.entries,
  key: v.string(),
  kind: v.literal('grabSourcePattern'),
});

interface UrlTemplateIdentityKeyRecord {
  readonly key: typeof URL_TEMPLATE_IDENTITY_KEY;
  readonly kind: 'urlTemplateIdentityKey';
  readonly identityKey: string;
  readonly createdAt: string;
}

const urlTemplateIdentityKeyRecordSchema = v.object({
  key: v.literal('url-template-identity-key:v1'),
  kind: v.literal('urlTemplateIdentityKey'),
  identityKey: v.string(),
  createdAt: v.string(),
});

const URL_TEMPLATE_KEY_PREFIX = 'url-template:';
const URL_TEMPLATE_HOST_PREFIX = 'url-template-host:';
const GRAB_SOURCE_PATTERN_KEY_PREFIX = 'grab-source-pattern:';
const GRAB_SOURCE_PATTERN_HOST_PREFIX = 'grab-source-pattern-host:';
const URL_TEMPLATE_IDENTITY_KEY = 'url-template-identity-key:v1';

export class UrlTemplateRepository {
  constructor(private readonly db: IDBDatabase) {}

  async listByHostname(hostname: string): Promise<readonly UrlTemplateRecord[]> {
    const identityKey = await this.identityKey();
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = templateHostPrefix(hostname);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const raw = await requestToPromise<unknown[]>(store.getAll(range));
    const templates = migrateTemplates(raw, identityKey, store);
    await transactionDone(transaction);
    return templates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listGrabSourcePatternsByHostname(hostname: string): Promise<readonly GrabSourcePattern[]> {
    const identityKey = await this.identityKey();
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const prefix = grabSourcePatternHostPrefix(hostname);
    const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
    const raw = await requestToPromise<unknown[]>(store.getAll(range));
    const patterns = migrateGrabSourcePatterns(raw, identityKey, store);
    await transactionDone(transaction);
    return patterns.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async identityKey(): Promise<string> {
    const transaction = this.db.transaction(DataStore.Metadata, 'readwrite');
    const store = transaction.objectStore(DataStore.Metadata);
    const raw = await requestToPromise<unknown>(store.get(URL_TEMPLATE_IDENTITY_KEY));
    if (v.is(urlTemplateIdentityKeyRecordSchema, raw) && isUrlTemplateIdentityKey(raw.identityKey)) {
      await transactionDone(transaction);
      return raw.identityKey;
    }
    const identityKey = createUrlTemplateIdentityKey();
    store.put({
      key: URL_TEMPLATE_IDENTITY_KEY,
      kind: 'urlTemplateIdentityKey',
      identityKey,
      createdAt: new Date().toISOString(),
    } satisfies UrlTemplateIdentityKeyRecord);
    await transactionDone(transaction);
    return identityKey;
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

function migrateTemplates(raw: readonly unknown[], identityKey: string, store: IDBObjectStore): UrlTemplateRecord[] {
  const templates: UrlTemplateRecord[] = [];
  let quarantined = 0;
  for (const row of raw) {
    if (v.is(urlTemplateMetadataRecordSchema, row)) {
      templates.push(stripTemplateMetadataKey(row as UrlTemplateMetadataRecord));
      continue;
    }
    if (v.is(legacyUrlTemplateMetadataRecordSchema, row)) {
      const legacy = row as LegacyUrlTemplateMetadataRecord;
      const migrated = migrateTemplate(legacy, identityKey);
      store.put({ ...migrated, key: legacy.key, kind: 'urlTemplate' } satisfies UrlTemplateMetadataRecord);
      templates.push(migrated);
      continue;
    }
    quarantined += 1;
  }
  logQuarantined(quarantined);
  return templates;
}

function migrateGrabSourcePatterns(raw: readonly unknown[], identityKey: string, store: IDBObjectStore): GrabSourcePattern[] {
  const patterns: GrabSourcePattern[] = [];
  let quarantined = 0;
  for (const row of raw) {
    if (v.is(grabSourcePatternMetadataRecordSchema, row)) {
      patterns.push(stripGrabSourcePatternMetadataKey(row as GrabSourcePatternMetadataRecord));
      continue;
    }
    if (v.is(legacyGrabSourcePatternMetadataRecordSchema, row)) {
      const legacy = row as LegacyGrabSourcePatternMetadataRecord;
      const migrated = migrateGrabSourcePattern(legacy, identityKey);
      store.put({ ...migrated, key: legacy.key, kind: 'grabSourcePattern' } satisfies GrabSourcePatternMetadataRecord);
      patterns.push(migrated);
      continue;
    }
    quarantined += 1;
  }
  logQuarantined(quarantined);
  return patterns;
}

function migrateTemplate(template: LegacyUrlTemplateRecord, identityKey: string): UrlTemplateRecord {
  return {
    ...template,
    schemaVersion: 2,
    templateUrl: redactLegacyTemplateUrl(template.templateUrl),
    matchRules: migrateMatchRules(template.matchRules, identityKey),
  };
}

function migrateGrabSourcePattern(pattern: LegacyGrabSourcePattern, identityKey: string): GrabSourcePattern {
  return {
    ...pattern,
    schemaVersion: 2,
    patternUrl: redactLegacyPatternUrl(pattern.patternUrl),
    matchRules: migrateMatchRules(pattern.matchRules, identityKey),
  };
}

function migrateMatchRules(rules: LegacyUrlTemplateRecord['matchRules'], identityKey: string): UrlTemplateRecord['matchRules'] {
  return {
    mode: rules.mode,
    hostname: rules.hostname,
    exactIdentity: deriveUrlTemplateIdentity(identityKey, `${rules.exactPathSignature}?${rules.querySignature}`),
    pathShapeSignature: rules.pathShapeSignature,
    queryShapeSignature: legacyQueryShapeSignature(rules.querySignature),
  };
}

function legacyQueryShapeSignature(signature: string): string {
  if (!signature) return '';
  return signature
    .split('&')
    .map((field, index) => `${index}:${field.slice(field.lastIndexOf(':') + 1)}`)
    .join('&');
}

function redactLegacyTemplateUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const path = redactLegacyPath(url.pathname, true);
    const query = [...url.searchParams.entries()]
      .filter(([, value]) => /\{[^{}]+\}/u.test(value))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeTemplateValue(redactLiteralParts(value, 'query-literal'))}`)
      .join('&');
    return `${url.protocol}//${url.host}${path}${query ? `?${query}` : ''}`;
  } catch {
    return 'Private URL hidden';
  }
}

function redactLegacyPatternUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${redactLegacyPath(url.pathname, false)}`;
  } catch {
    return 'Private URL hidden';
  }
}

function redactLegacyPath(pathname: string, preservePlaceholders: boolean): string {
  const segments = pathname.split('/').map((segment) => {
    if (!segment) return '';
    const decoded = safeDecodeURIComponent(segment);
    return preservePlaceholders && /\{[^{}]+\}/u.test(decoded) ? redactLiteralParts(decoded, 'path-literal') : '{path-segment}';
  });
  return segments.join('/') || '/';
}

function redactLiteralParts(value: string, label: string): string {
  return value
    .split(/(\{[^{}]+\})/u)
    .filter(Boolean)
    .map((part) => (/^\{[^{}]+\}$/u.test(part) ? part : `{${label}}`))
    .join('');
}

function encodeTemplateValue(value: string): string {
  return encodeURIComponent(value).replace(/%7B([^%]+)%7D/giu, '{$1}');
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function logQuarantined(count: number): void {
  if (count > 0) console.warn(`[image-trail] Quarantined ${count} corrupted record(s) in the "${DataStore.Metadata}" store.`);
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
