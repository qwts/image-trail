import test from 'node:test';
import assert from 'node:assert/strict';
import type { ParsedFieldStateRecord } from '../extension/src/core/types.js';
import {
  createLegacyFieldIdMigration,
  migrateParsedFieldStateRecord,
  migrateUrlTemplateRecord,
  STABLE_FIELD_ID_VERSION,
} from '../extension/src/core/url/field-id-migration.js';
import { applyFieldSplitSpecs } from '../extension/src/core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../extension/src/core/url/field-widths.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { rebuildUrl } from '../extension/src/core/url/rebuild-url.js';
import { createUrlTemplateRecord } from '../extension/src/core/url/templates.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import type { UrlFieldSplitSpec } from '../extension/src/core/url/types.js';

const DATE_URL = 'https://example.test/image?date=01012001';
const DATE_SPLIT: UrlFieldSplitSpec = {
  baseFieldId: 'q:0:0',
  location: 'query',
  queryIndex: 0,
  tokenIndex: 0,
  lengths: [2, 2, 4],
  pattern: '2-2-4',
};

function legacyRecord(): ParsedFieldStateRecord {
  return {
    schemaVersion: 1,
    hostname: 'example.test',
    pageUrl: 'https://example.test/image',
    sourceUrl: DATE_URL,
    selectedUrl: DATE_URL,
    selectedHandleId: 'legacy-target',
    activeFieldId: 'q:0:1',
    failedFieldId: 'q:0:2',
    successfulFieldIds: ['q:0:0', 'q:0:1'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:1'],
    manuallyExcludedFieldIds: ['q:0:2'],
    fieldSplitSpecs: [DATE_SPLIT],
    fieldDigitWidthSpecs: [{ fieldId: 'q:0:2', width: 6 }],
    activeUrlTemplateId: null,
    updatedAt: '2026-07-29T00:00:00.000Z',
  };
}

test('legacy split-child state migrates to stable base and part ids before width application', () => {
  const record = legacyRecord();
  const migration = createLegacyFieldIdMigration(record.sourceUrl, record.fieldSplitSpecs);
  const migrated = migrateParsedFieldStateRecord(record, migration);

  assert.equal(migrated.fieldIdVersion, STABLE_FIELD_ID_VERSION);
  assert.equal(migrated.activeFieldId, 'q:0:0:s:1');
  assert.equal(migrated.failedFieldId, 'q:0:0:s:2');
  assert.deepEqual(migrated.successfulFieldIds, ['q:0:0:s:0', 'q:0:0:s:1']);
  assert.deepEqual(migrated.unlockedFieldIds, ['q:0:0:s:1']);
  assert.deepEqual(migrated.manuallyExcludedFieldIds, ['q:0:0:s:2']);
  assert.deepEqual(migrated.fieldDigitWidthSpecs, [{ fieldId: 'q:0:0:s:2', width: 6 }]);
  assert.equal(
    rebuildUrl(
      applyFieldDigitWidthSpecs(
        applyFieldSplitSpecs(parseUrl(record.sourceUrl), migrated.fieldSplitSpecs),
        migrated.fieldDigitWidthSpecs ?? [],
      ),
    ),
    'https://example.test/image?date=0101002001',
  );
});

test('legacy migration preserves a retained pre-split id and remaps an unambiguous shifted id', () => {
  const sourceUrl = 'https://example.test/gallery/2024-456-789/photo.jpg';
  const migration = createLegacyFieldIdMigration(sourceUrl, [
    {
      baseFieldId: 'p:3:0',
      location: 'path',
      partIndex: 3,
      tokenIndex: 0,
      lengths: [1, 1, 2],
      pattern: '1-1-2',
    },
  ]);

  assert.equal(migration.normalize('p:3:1'), 'p:3:0:s:1');
  assert.equal(migration.normalize('p:3:4'), 'p:3:4');
  assert.equal(migration.normalize('p:3:6'), 'p:3:4');
});

test('legacy template split-child ids migrate with the parsed-state split map', () => {
  const model = applyFieldSplitSpecs(parseUrl(DATE_URL), [DATE_SPLIT]);
  const fields = collectUrlFields(model);
  const month = fields.find((field) => field.id === 'q:0:0:s:1');
  assert.ok(month);
  const stable = createUrlTemplateRecord({ model, fields, includedFieldIds: [month.id], identityKey: '42'.repeat(32) });
  assert.ok(stable);
  const legacy = {
    ...stable,
    fieldIdVersion: undefined,
    fields: stable.fields.map((field) => ({ ...field, id: 'q:0:1' })),
  };

  const migrated = migrateUrlTemplateRecord(legacy, createLegacyFieldIdMigration(DATE_URL, [DATE_SPLIT]));

  assert.equal(migrated.fieldIdVersion, STABLE_FIELD_ID_VERSION);
  assert.deepEqual(
    migrated.fields.map((field) => field.id),
    ['q:0:0:s:1'],
  );
});
