import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { applyFieldSplitSpecs, createFieldSplitSpec, parseFieldSplitPattern } from '../extension/src/core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../extension/src/core/url/field-widths.js';
import { bumpUrlField, rebuildUrl } from '../extension/src/core/url/rebuild-url.js';
import { collectUrlFields, selectDefaultField } from '../extension/src/core/url/tokenize-fields.js';
import type { UrlField } from '../extension/src/core/url/types.js';
import { urlFixtures } from '../extension/src/test-fixtures/urls.js';

test('round-trips M03 URL fixtures without changing non-edited parts', () => {
  for (const fixture of urlFixtures) {
    assert.equal(rebuildUrl(parseUrl(fixture.input)), fixture.expectedRebuild ?? canonicalExpectedRebuild(fixture.input), fixture.label);
  }
});

test('bumps fixture fields with BigInt, width preservation, and clamping', () => {
  for (const fixture of urlFixtures) {
    for (const incrementCase of fixture.incrementCases ?? []) {
      const model = parseUrl(fixture.input);
      const fields = collectUrlFields(model);
      const field = selectField(fields, incrementCase.fieldHint);
      assert.ok(field, `${fixture.label}: ${incrementCase.fieldHint}`);
      assert.equal(
        rebuildUrl(bumpUrlField(model, field, incrementCase.delta)),
        incrementCase.expectedUrl,
        `${fixture.label}: ${incrementCase.fieldHint}`,
      );
    }
  }
});

test('selects the first numeric field by default before hex fields', () => {
  const numeric = selectDefaultField(collectUrlFields(parseUrl('https://example.test/path/abc123/004.jpg')));
  assert.equal(numeric?.tokenKind, 'int');
  assert.equal(numeric?.value, '004');

  const hexOnly = selectDefaultField(collectUrlFields(parseUrl('https://example.test/path/a1b2c3.jpg')));
  assert.equal(hexOnly?.tokenKind, 'hex');
});

test('integer fields only preserve padding when leading zeroes or explicit digit width are present', () => {
  const naturalModel = parseUrl('https://example.test/images/image-1000.jpg');
  const naturalField = collectUrlFields(naturalModel).find((candidate) => candidate.value === '1000');
  assert.ok(naturalField);
  assert.equal(rebuildUrl(bumpUrlField(naturalModel, naturalField, -1)), 'https://example.test/images/image-999.jpg');

  const paddedModel = parseUrl('https://example.test/images/image-001.jpg');
  const paddedField = collectUrlFields(paddedModel).find((candidate) => candidate.value === '001');
  assert.ok(paddedField);
  assert.equal(rebuildUrl(bumpUrlField(paddedModel, paddedField, 1)), 'https://example.test/images/image-002.jpg');

  const explicitBaseModel = parseUrl('https://example.test/images/image-999.jpg');
  const explicitBaseField = collectUrlFields(explicitBaseModel).find((candidate) => candidate.value === '999');
  assert.ok(explicitBaseField);
  const explicitWidthModel = applyFieldDigitWidthSpecs(explicitBaseModel, [{ fieldId: explicitBaseField.id, width: 5 }]);
  const explicitWidthField = collectUrlFields(explicitWidthModel).find((candidate) => candidate.value === '00999');
  assert.ok(explicitWidthField);
  assert.equal(rebuildUrl(explicitWidthModel), 'https://example.test/images/image-00999.jpg');
  assert.equal(rebuildUrl(bumpUrlField(explicitWidthModel, explicitWidthField, -1)), 'https://example.test/images/image-00998.jpg');
});

test('decodes ampersand entities only for query-shaped separators', () => {
  const model = parseUrl('https://example.test/fish&ampchips?src=a&amp;b=2');
  assert.deepEqual(
    model.queryFields.map((field) => field.key),
    ['src', 'b'],
  );
  const pathSegment = model.pathParts.find((part) => part.type === 'segment');
  assert.equal(pathSegment?.raw, 'fish&ampchips');
});

test('splits a URL token by length pattern without changing rebuilt URL', () => {
  const model = parseUrl('https://example.test/image?date=01012001');
  const field = collectUrlFields(model).find((candidate) => candidate.label === 'query date');
  assert.ok(field);
  const spec = createFieldSplitSpec(field, '2-2-4');
  assert.ok(!('ok' in spec));

  const splitModel = applyFieldSplitSpecs(model, [spec]);
  const fields = collectUrlFields(splitModel);

  assert.deepEqual(
    fields.filter((candidate) => candidate.location === 'query').map((candidate) => candidate.value),
    ['01', '01', '2001'],
  );
  assert.equal(rebuildUrl(splitModel), 'https://example.test/image?date=01012001');
});

test('bumps split URL token parts while preserving contiguous URL format', () => {
  const model = parseUrl('https://example.test/image?date=01012001');
  const dateField = collectUrlFields(model).find((candidate) => candidate.label === 'query date');
  assert.ok(dateField);
  const spec = createFieldSplitSpec(dateField, '2-2-4');
  assert.ok(!('ok' in spec));

  const splitModel = applyFieldSplitSpecs(model, [spec]);
  const fields = collectUrlFields(splitModel);
  const month = fields.find((candidate) => candidate.id === 'q:0:0');
  const year = fields.find((candidate) => candidate.id === 'q:0:2');
  assert.ok(month);
  assert.ok(year);

  assert.equal(rebuildUrl(bumpUrlField(splitModel, month, 1)), 'https://example.test/image?date=02012001');
  assert.equal(rebuildUrl(bumpUrlField(splitModel, year, 1)), 'https://example.test/image?date=01012002');

  const reparsed = applyFieldSplitSpecs(parseUrl('https://example.test/image?date=02012001'), [spec]);
  assert.deepEqual(
    collectUrlFields(reparsed)
      .filter((candidate) => candidate.location === 'query')
      .map((candidate) => candidate.value),
    ['02', '01', '2001'],
  );
});

test('applies later split specs against original token indexes after earlier splits', () => {
  const model = parseUrl('https://example.test/image?v=1111x2222');
  const firstField = collectUrlFields(model).find((candidate) => candidate.value === '1111');
  assert.ok(firstField);
  const firstSpec = createFieldSplitSpec(firstField, '2-2');
  assert.ok(!('ok' in firstSpec));

  const firstSplitModel = applyFieldSplitSpecs(model, [firstSpec]);
  const shiftedSecondField = collectUrlFields(firstSplitModel).find((candidate) => candidate.value === '2222');
  assert.ok(shiftedSecondField);
  assert.equal(shiftedSecondField.id, 'q:0:3');
  const secondSpec = createFieldSplitSpec(shiftedSecondField, '2-2');
  assert.ok(!('ok' in secondSpec));
  assert.equal(secondSpec.tokenIndex, 2);

  const bothSplitModel = applyFieldSplitSpecs(model, [firstSpec, secondSpec]);
  const fields = collectUrlFields(bothSplitModel);

  assert.deepEqual(
    fields.filter((candidate) => candidate.location === 'query').map((candidate) => candidate.value),
    ['11', '11', 'x', '22', '22'],
  );
  assert.equal(rebuildUrl(bothSplitModel), 'https://example.test/image?v=1111x2222');
});

test('rejects invalid split patterns', () => {
  assert.deepEqual(parseFieldSplitPattern('2-2', 8), {
    ok: false,
    message: 'Split pattern totals 4, but the field is 8 characters.',
  });
  assert.deepEqual(parseFieldSplitPattern('2-0-6', 8), {
    ok: false,
    message: 'Split pattern can only contain positive lengths.',
  });
});

function selectField(fields: UrlField[], hint: string): UrlField {
  const lowerHint = hint.toLowerCase();
  const queryKey = lowerHint.match(/query\s+([\w.-]+)/u)?.[1];
  if (queryKey) {
    const field = fields.find((candidate) => candidate.location === 'query' && candidate.label.toLowerCase() === `query ${queryKey}`);
    if (field) return field;
  }

  const interestingValues = lowerHint.match(/(?:0x)?[0-9a-f]+/gu) ?? [];
  for (const value of interestingValues.sort((a, b) => b.length - a.length)) {
    const field = fields.find((candidate) => candidate.value.toLowerCase() === value);
    if (field) return field;
  }

  const numericFallback = fields.find((candidate) => candidate.tokenKind === 'int' || candidate.tokenKind === 'hex');
  const fallback = numericFallback ?? fields[0];
  assert.ok(fallback, `No fields found for ${hint}`);
  return fallback;
}

function canonicalExpectedRebuild(input: string): string {
  return input.replace(/%2f/giu, '%2F');
}
