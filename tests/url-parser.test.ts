import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
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

test('decodes ampersand entities only for query-shaped separators', () => {
  const model = parseUrl('https://example.test/fish&ampchips?src=a&amp;b=2');
  assert.deepEqual(
    model.queryFields.map((field) => field.key),
    ['src', 'b'],
  );
  const pathSegment = model.pathParts.find((part) => part.type === 'segment');
  assert.equal(pathSegment?.raw, 'fish&ampchips');
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
