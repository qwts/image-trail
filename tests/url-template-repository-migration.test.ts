import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { collectUrlFields, tokenValue } from '../extension/src/core/url/tokenize-fields.js';
import { createUrlTemplateRecord, grabSourcePatternMatches, templateMatchesModel } from '../extension/src/core/url/templates.js';
import type { ParsedUrlModel } from '../extension/src/core/url/types.js';
import { transactionDone } from '../extension/src/data/idb-helpers.js';
import { UrlTemplateRepository } from '../extension/src/data/repositories/url-template-repository.js';
import { DataStore } from '../extension/src/data/schema.js';
import { openFreshImageTrailDb } from './indexeddb-test-helpers.js';

test('UrlTemplateRepository migrates v1 templates and grab patterns without exposing or losing exact identity', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new UrlTemplateRepository(db);
  const identityKey = '42'.repeat(32);
  const templateUrl = 'https://example.test/private/gallery/0007.jpg?chapter=12&secret=hidden#access_token=oauth';
  const patternUrl = 'https://example.test/post/12345?src=feed#token=hidden';
  const templateModel = parseUrl(templateUrl);
  const patternModel = parseUrl(patternUrl);
  const fields = collectUrlFields(templateModel);
  const chapter = fields.find((field) => field.label === 'query chapter');
  const file = fields.find((field) => field.label === 'file 0');
  assert.ok(chapter);
  assert.ok(file);
  const freshTemplate = createUrlTemplateRecord({
    model: templateModel,
    fields,
    includedFieldIds: [file.id, chapter.id],
    identityKey,
  });
  assert.ok(freshTemplate);

  const transaction = db.transaction(DataStore.Metadata, 'readwrite');
  const store = transaction.objectStore(DataStore.Metadata);
  store.put({
    key: 'url-template-identity-key:v1',
    kind: 'urlTemplateIdentityKey',
    identityKey,
    createdAt: '2026-07-30T00:00:00.000Z',
  });
  store.put({
    ...freshTemplate,
    key: 'url-template:url-template-host:example.test:legacy-template',
    kind: 'urlTemplate',
    id: 'legacy-template',
    schemaVersion: 1,
    templateUrl: 'https://example.test/private/gallery/{file-0}.jpg?chapter={query-chapter}&secret=hidden#access_token=oauth',
    matchRules: legacyMatchRules(templateModel),
  });
  store.put({
    key: 'grab-source-pattern:grab-source-pattern-host:example.test:legacy-pattern',
    kind: 'grabSourcePattern',
    id: 'legacy-pattern',
    schemaVersion: 1,
    hostname: 'example.test',
    patternUrl,
    matchRules: legacyMatchRules(patternModel),
    createdAt: '2026-07-30T00:00:00.000Z',
    updatedAt: '2026-07-30T00:00:00.000Z',
    useCount: 1,
  });
  await transactionDone(transaction);

  const [templates, patterns] = await Promise.all([
    repository.listByHostname('example.test'),
    repository.listGrabSourcePatternsByHostname('example.test'),
  ]);
  const migratedTemplate = templates[0];
  const migratedPattern = patterns[0];
  assert.ok(migratedTemplate);
  assert.ok(migratedPattern);
  assert.equal(migratedTemplate.schemaVersion, 2);
  assert.equal(migratedPattern.schemaVersion, 2);
  assert.equal(migratedTemplate.id, 'legacy-template');
  assert.equal(migratedPattern.id, 'legacy-pattern');
  assert.equal(templateMatchesModel(migratedTemplate, templateModel, { identityKey }), true);
  assert.equal(grabSourcePatternMatches(migratedPattern, patternModel, identityKey), true);
  assertNoSensitiveUrlMaterial(JSON.stringify([migratedTemplate, migratedPattern]));

  const verify = db.transaction(DataStore.Metadata, 'readonly');
  const persisted = await new Promise<unknown[]>((resolve, reject) => {
    const request = verify.objectStore(DataStore.Metadata).getAll();
    request.onsuccess = () => resolve(request.result as unknown[]);
    request.onerror = () => reject(request.error);
  });
  await transactionDone(verify);
  const migratedRows = persisted.filter(
    (record): record is Record<string, unknown> =>
      typeof record === 'object' &&
      record !== null &&
      ['urlTemplate', 'grabSourcePattern'].includes(String((record as Record<string, unknown>)['kind'])),
  );
  assert.equal(migratedRows.length, 2);
  assertNoSensitiveUrlMaterial(JSON.stringify(migratedRows));
  assert.equal(
    migratedRows.every((record) => record['schemaVersion'] === 2),
    true,
  );
});

function assertNoSensitiveUrlMaterial(value: string): void {
  for (const sensitive of ['private', 'gallery', 'secret=', 'hidden', 'access_token', 'oauth', '/post/', 'src=', 'feed', '#token']) {
    assert.equal(value.includes(sensitive), false, `expected migrated metadata to omit ${sensitive}`);
  }
}

function legacyMatchRules(model: ParsedUrlModel) {
  return {
    mode: 'exact-page-shape' as const,
    hostname: new URL(`${model.protocol}//${model.host}`).hostname.toLowerCase(),
    exactPathSignature: model.pathParts
      .map((part) => {
        if (part.type === 'sep') return `/${part.raw}`;
        return `s:${part.tokens.map((token) => (token.kind === 'text' ? `text:${tokenValue(token)}` : `field:${token.kind}`)).join(',')}`;
      })
      .join('|'),
    pathShapeSignature: model.pathParts
      .map((part) => (part.type === 'sep' ? `/${part.raw}` : `s:${part.tokens.map((token) => token.kind).join(',')}`))
      .join('|'),
    querySignature: model.queryFields.map((field) => `${field.key}:${field.valueTokens.map((token) => token.kind).join(',')}`).join('&'),
  };
}
