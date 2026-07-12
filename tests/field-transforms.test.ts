import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FIELD_TRANSFORM_REGISTRY,
  applyFieldDigitWidthTransform,
  applyResetFieldTransform,
  applyFieldSplitTransform,
  applySetFieldValueTransform,
  applyStepFieldValueTransform,
  clearFieldSplitTransform,
  fieldTransformDefinition,
} from '../extension/src/core/url/field-transforms.js';
import { fieldDigitWidthSpecsEqual } from '../extension/src/core/url/field-widths.js';
import { applyFieldSplitSpecs } from '../extension/src/core/url/field-splits.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';

test('field transform registry defines current parsed-field behaviors', () => {
  assert.deepEqual(
    FIELD_TRANSFORM_REGISTRY.map((definition) => definition.id),
    ['set-value', 'step', 'digit-width', 'split-apply', 'split-clear', 'reset-field', 'reset-structure', 'reset-all'],
  );
  assert.equal(fieldTransformDefinition('set-value').kind, 'url');
  assert.equal(fieldTransformDefinition('split-clear').kind, 'state');
});

test('reset-field transform rebuilds the current URL from the baseline token', () => {
  const currentModel = parseUrl('https://example.test/image?p=6');
  const baselineModel = parseUrl('https://example.test/image?p=5');
  const field = collectUrlFields(currentModel).find((candidate) => candidate.label === 'query p');
  assert.ok(field);

  const result = applyResetFieldTransform(currentModel, field, baselineModel);

  assert.equal(result.ok, true);
  assert.equal(result.id, 'reset-field');
  assert.equal(result.url, 'https://example.test/image?p=5');
  assert.deepEqual(result.attemptedFieldIds, []);
  assert.equal(result.resetBaseFieldId, field.id);
});

test('reset-field transform resets a split child through its base token', () => {
  const splitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query' as const,
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2, 4],
    pattern: '2-2-4',
  };
  const currentBaseModel = parseUrl('https://example.test/image?date=99012001');
  const currentSplitModel = applyFieldSplitSpecs(currentBaseModel, [splitSpec]);
  const baselineBaseModel = parseUrl('https://example.test/image?date=01012001');
  const splitChild = collectUrlFields(currentSplitModel).find((candidate) => candidate.id === 'q:0:1');
  assert.ok(splitChild);

  const result = applyResetFieldTransform(currentBaseModel, splitChild, baselineBaseModel);

  assert.equal(result.ok, true);
  assert.equal(result.url, 'https://example.test/image?date=01012001');
  assert.equal(result.resetBaseFieldId, 'q:0:0');
});

test('set-value transform preserves URL rebuild behavior', () => {
  const model = parseUrl('https://example.test/images/image-001.jpg?size=320');
  const field = collectUrlFields(model).find((candidate) => candidate.value === '001');
  assert.ok(field);

  const result = applySetFieldValueTransform(model, field, '010');

  assert.equal(result.ok, true);
  assert.equal(result.id, 'set-value');
  assert.deepEqual(result.attemptedFieldIds, [field.id]);
  assert.equal(result.url, 'https://example.test/images/image-010.jpg?size=320');
});

test('set-value transform reports same URL when value is unchanged', () => {
  const url = 'https://example.test/images/image-001.jpg?size=320';
  const model = parseUrl(url);
  const field = collectUrlFields(model).find((candidate) => candidate.value === '001');
  assert.ok(field);

  const result = applySetFieldValueTransform(model, field, '001');

  assert.equal(result.url, url);
  assert.deepEqual(result.attemptedFieldIds, [field.id]);
});

test('set-value accepts empty text and lets the reparsed URL define the resulting fields', () => {
  const pathModel = parseUrl('https://example.test/images/word');
  const pathField = collectUrlFields(pathModel).find((candidate) => candidate.value === 'word');
  assert.ok(pathField);
  const emptyPath = applySetFieldValueTransform(pathModel, pathField, '   ');
  assert.equal(emptyPath.url, 'https://example.test/images/');
  assert.equal(
    collectUrlFields(parseUrl(emptyPath.url)).some((candidate) => candidate.value === 'word'),
    false,
  );

  const queryModel = parseUrl('https://example.test/image?q=word');
  const queryField = collectUrlFields(queryModel).find((candidate) => candidate.label === 'query q');
  assert.ok(queryField);
  const emptyQuery = applySetFieldValueTransform(queryModel, queryField, '');
  assert.equal(emptyQuery.url, 'https://example.test/image?q=');
  assert.equal(collectUrlFields(parseUrl(emptyQuery.url))[1]?.value, '');
});

test('set-value accepts raw and encoded delimiters through location-specific rebuilding', () => {
  const pathModel = parseUrl('https://example.test/images/400');
  const pathField = collectUrlFields(pathModel).find((candidate) => candidate.value === '400');
  assert.ok(pathField);
  const splitPath = applySetFieldValueTransform(pathModel, pathField, '400/53');
  assert.equal(splitPath.url, 'https://example.test/images/400/53');
  assert.deepEqual(
    collectUrlFields(parseUrl(splitPath.url)).map((field) => field.value),
    ['images', '400', '53'],
  );
  assert.equal(applySetFieldValueTransform(pathModel, pathField, '%2F').url, 'https://example.test/images/%2F');
  assert.equal(applySetFieldValueTransform(pathModel, pathField, '400?size=53').url, 'https://example.test/images/400?size=53');
  assert.equal(applySetFieldValueTransform(pathModel, pathField, '400#53').url, 'https://example.test/images/400#53');

  const queryModel = parseUrl('https://example.test/image?q=word');
  const queryField = collectUrlFields(queryModel).find((candidate) => candidate.label === 'query q');
  assert.ok(queryField);
  assert.equal(
    applySetFieldValueTransform(queryModel, queryField, 'word&size=53#part').url,
    'https://example.test/image?q=word&size=53#part',
  );
  assert.equal(applySetFieldValueTransform(queryModel, queryField, 'word=53').url, 'https://example.test/image?q=word=53');
  assert.equal(applySetFieldValueTransform(queryModel, queryField, '%26size%3D53').url, 'https://example.test/image?q=%26size%3D53');
});

test('step transform preserves numeric padding and clamping', () => {
  const model = parseUrl('https://example.test/images/image-000.jpg');
  const field = collectUrlFields(model).find((candidate) => candidate.value === '000');
  assert.ok(field);

  const incremented = applyStepFieldValueTransform(model, field, 1);
  const clamped = applyStepFieldValueTransform(model, field, -1);

  assert.equal(incremented.id, 'step');
  assert.equal(incremented.url, 'https://example.test/images/image-001.jpg');
  assert.equal(clamped.url, 'https://example.test/images/image-000.jpg');
});

test('step transform reports same URL when clamped at boundary', () => {
  const url = 'https://example.test/images/image-000.jpg';
  const model = parseUrl(url);
  const field = collectUrlFields(model).find((candidate) => candidate.value === '000');
  assert.ok(field);

  const result = applyStepFieldValueTransform(model, field, -1);

  assert.equal(result.url, url);
  assert.deepEqual(result.attemptedFieldIds, [field.id]);
});

test('digit-width transform validates and updates width specs with rebuilt URL', () => {
  const model = parseUrl('https://example.test/images/image-9.jpg');
  const field = collectUrlFields(model).find((candidate) => candidate.value === '9');
  assert.ok(field);

  const invalid = applyFieldDigitWidthTransform(model, field.id, '99', []);
  assert.deepEqual(invalid, {
    ok: false,
    id: 'digit-width',
    kind: 'url',
    message: 'Digit width must be between 1 and 64.',
  });

  const applied = applyFieldDigitWidthTransform(model, field.id, '4', []);
  assert.equal(applied.ok, true);
  assert.equal(applied.id, 'digit-width');
  assert.deepEqual(applied.fieldDigitWidthSpecs, [{ fieldId: field.id, width: 4 }]);
  assert.equal(applied.url, 'https://example.test/images/image-0009.jpg');

  const projectedModel = parseUrl(applied.url);
  const cleared = applyFieldDigitWidthTransform(projectedModel, field.id, '', applied.fieldDigitWidthSpecs);
  assert.equal(cleared.ok, true);
  assert.deepEqual(cleared.fieldDigitWidthSpecs, []);
  assert.equal(cleared.url, 'https://example.test/images/image-9.jpg');
});

test('digit-width clear restores natural source padding after projection', () => {
  const model = parseUrl('https://example.test/images/image-009.jpg');
  const field = collectUrlFields(model).find((candidate) => candidate.value === '009');
  assert.ok(field);

  const applied = applyFieldDigitWidthTransform(model, field.id, '5', []);
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.fieldDigitWidthSpecs, [{ fieldId: field.id, width: 5, sourceWidth: 3 }]);
  assert.equal(applied.url, 'https://example.test/images/image-00009.jpg');

  const projectedModel = parseUrl(applied.url);
  const cleared = applyFieldDigitWidthTransform(projectedModel, field.id, '', applied.fieldDigitWidthSpecs);
  assert.equal(cleared.ok, true);
  assert.deepEqual(cleared.fieldDigitWidthSpecs, []);
  assert.equal(cleared.url, 'https://example.test/images/image-009.jpg');
});

test('digit-width transform can shrink a previous width override after projection', () => {
  const model = parseUrl('https://example.test/images/image-123.jpg');
  const field = collectUrlFields(model).find((candidate) => candidate.value === '123');
  assert.ok(field);

  const widened = applyFieldDigitWidthTransform(model, field.id, '5', []);
  assert.equal(widened.ok, true);
  assert.equal(widened.url, 'https://example.test/images/image-00123.jpg');

  const projectedModel = parseUrl(widened.url);
  const shrunk = applyFieldDigitWidthTransform(projectedModel, field.id, '3', widened.fieldDigitWidthSpecs);
  assert.equal(shrunk.ok, true);
  assert.deepEqual(shrunk.fieldDigitWidthSpecs, [{ fieldId: field.id, width: 3 }]);
  assert.equal(shrunk.url, 'https://example.test/images/image-123.jpg');
});

test('digit-width spec equality ignores storage order', () => {
  assert.equal(
    fieldDigitWidthSpecsEqual(
      [
        { fieldId: 'q:0:0', width: 3, sourceWidth: 1 },
        { fieldId: 'q:1:0', width: 4 },
      ],
      [
        { fieldId: 'q:1:0', width: 4 },
        { fieldId: 'q:0:0', width: 3, sourceWidth: 1 },
      ],
    ),
    true,
  );
  assert.equal(fieldDigitWidthSpecsEqual([{ fieldId: 'q:0:0', width: 3 }], [{ fieldId: 'q:0:0', width: 4 }]), false);
});

test('split transforms adapt current split apply and clear behavior', () => {
  const model = parseUrl('https://example.test/image?date=01012001');
  const field = collectUrlFields(model).find((candidate) => candidate.label === 'query date');
  assert.ok(field);

  const split = applyFieldSplitTransform(field, '2-2-4');
  assert.equal(split.ok, true);
  assert.equal(split.kind, 'state');
  assert.equal(split.splitSpec.baseFieldId, field.id);
  assert.deepEqual(split.splitSpec.lengths, [2, 2, 4]);
  assert.equal(split.splitSpec.pattern, '2-2-4');

  assert.deepEqual(applyFieldSplitTransform(field, '2-2'), {
    ok: false,
    id: 'split-apply',
    kind: 'state',
    message: 'Split pattern totals 4, but the field is 8 characters.',
  });
  assert.deepEqual(clearFieldSplitTransform(field.id), {
    ok: true,
    id: 'split-clear',
    kind: 'state',
    baseFieldId: field.id,
  });
});
