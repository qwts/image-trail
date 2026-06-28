import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { applyFieldSplitSpecs, createFieldSplitSpec } from '../extension/src/core/url/field-splits.js';
import { rebuildUrl, bumpUrlField } from '../extension/src/core/url/rebuild-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import { applyTransform, findTransform, applicableTransforms, FIELD_TRANSFORMS } from '../extension/src/core/url/field-transforms.js';

test('increment transform matches bumpUrlField(delta=1) exactly', () => {
  const model = parseUrl('https://example.test/images/image-042.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '042');
  assert.ok(field);

  const legacy = rebuildUrl(bumpUrlField(model, field, 1));
  const result = applyTransform(model, field, 'increment', '');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), legacy);
});

test('decrement transform matches bumpUrlField(delta=-1) exactly', () => {
  const model = parseUrl('https://example.test/images/image-042.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '042');
  assert.ok(field);

  const legacy = rebuildUrl(bumpUrlField(model, field, -1));
  const result = applyTransform(model, field, 'decrement', '');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), legacy);
});

test('increment clamps at zero', () => {
  const model = parseUrl('https://example.test/images/image-000.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '000');
  assert.ok(field);

  const result = applyTransform(model, field, 'decrement', '');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/images/image-000.jpg');
});

test('increment preserves zero-padded width', () => {
  const model = parseUrl('https://example.test/images/image-001.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '001');
  assert.ok(field);

  const result = applyTransform(model, field, 'increment', '');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/images/image-002.jpg');
});

test('multiply transform scales a field value', () => {
  const model = parseUrl('https://example.test/images/image-005.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '005');
  assert.ok(field);

  const result = applyTransform(model, field, 'multiply', '3');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/images/image-015.jpg');
});

test('divide transform divides a field value', () => {
  const model = parseUrl('https://example.test/images/image-015.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '015');
  assert.ok(field);

  const result = applyTransform(model, field, 'divide', '3');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/images/image-005.jpg');
});

test('divide by zero returns an error', () => {
  const model = parseUrl('https://example.test/images/image-015.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '015');
  assert.ok(field);

  const result = applyTransform(model, field, 'divide', '0');
  assert.ok(!result.ok);
  assert.equal(result.message, 'Cannot divide by zero.');
});

test('multiply with non-integer param returns an error', () => {
  const model = parseUrl('https://example.test/images/image-005.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '005');
  assert.ok(field);

  const result = applyTransform(model, field, 'multiply', 'abc');
  assert.ok(!result.ok);
  assert.match(result.message, /requires a valid integer/u);
});

test('set-value transform applies to any field', () => {
  const model = parseUrl('https://example.test/images/image-042.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '042');
  assert.ok(field);

  const result = applyTransform(model, field, 'set-value', '999');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/images/image-999.jpg');
});

test('set-value applies to text fields too', () => {
  const model = parseUrl('https://example.test/page?label=hello');
  const fields = collectUrlFields(model);
  const textField = fields.find((f) => f.tokenKind === 'text' && f.value === 'hello');
  assert.ok(textField);

  const result = applyTransform(model, textField, 'set-value', 'world');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/page?label=world');
});

test('numeric transforms do not apply to text fields', () => {
  const model = parseUrl('https://example.test/images/hello.jpg');
  const fields = collectUrlFields(model);
  const textField = fields.find((f) => f.tokenKind === 'text');
  assert.ok(textField);

  const applicable = applicableTransforms(textField);
  assert.ok(applicable.every((t) => t.group !== 'step'));
  assert.ok(applicable.some((t) => t.id === 'set-value'));
});

test('unknown transform id returns an error', () => {
  const model = parseUrl('https://example.test/images/image-042.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '042');
  assert.ok(field);

  const result = applyTransform(model, field, 'nonexistent', '');
  assert.ok(!result.ok);
  assert.match(result.message, /Unknown transform/u);
});

test('hex field increment preserves case and padding', () => {
  const model = parseUrl('https://example.test/image?id=00ff');
  const fields = collectUrlFields(model);
  const hexField = fields.find((f) => f.tokenKind === 'hex');
  assert.ok(hexField);

  const result = applyTransform(model, hexField, 'increment', '');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/image?id=0100');
});

test('hex field multiply preserves width', () => {
  const model = parseUrl('https://example.test/image?id=0010');
  const fields = collectUrlFields(model);
  const hexField = fields.find((f) => f.tokenKind === 'hex' || f.tokenKind === 'int');
  assert.ok(hexField);

  const result = applyTransform(model, hexField, 'multiply', '2');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/image?id=0020');
});

test('findTransform returns undefined for missing id', () => {
  assert.equal(findTransform('bogus'), undefined);
});

test('FIELD_TRANSFORMS contains all expected ids', () => {
  const ids = FIELD_TRANSFORMS.map((t) => t.id);
  assert.ok(ids.includes('increment'));
  assert.ok(ids.includes('decrement'));
  assert.ok(ids.includes('multiply'));
  assert.ok(ids.includes('divide'));
  assert.ok(ids.includes('set-value'));
});

test('increment on query field matches bumpUrlField exactly', () => {
  const model = parseUrl('https://example.test/page?num=42&other=hello');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '42' && f.location === 'query');
  assert.ok(field);

  const legacy = rebuildUrl(bumpUrlField(model, field, 1));
  const result = applyTransform(model, field, 'increment', '');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), legacy);
  assert.equal(rebuildUrl(result.model), 'https://example.test/page?num=43&other=hello');
});

test('multiply on split fields works on individual parts', () => {
  const model = parseUrl('https://example.test/image?date=01012001');
  const dateField = collectUrlFields(model).find((f) => f.label === 'query date');
  assert.ok(dateField);
  const spec = createFieldSplitSpec(dateField, '2-2-4');
  assert.ok(!('ok' in spec));

  const splitModel = applyFieldSplitSpecs(model, [spec]);
  const fields = collectUrlFields(splitModel);
  const yearField = fields.find((f) => f.id === 'q:0:2');
  assert.ok(yearField);

  const result = applyTransform(splitModel, yearField, 'multiply', '2');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/image?date=01014002');
});

test('divide truncates integer division (BigInt behavior)', () => {
  const model = parseUrl('https://example.test/images/image-007.jpg');
  const fields = collectUrlFields(model);
  const field = fields.find((f) => f.value === '007');
  assert.ok(field);

  const result = applyTransform(model, field, 'divide', '2');
  assert.ok(result.ok);
  assert.equal(rebuildUrl(result.model), 'https://example.test/images/image-003.jpg');
});
