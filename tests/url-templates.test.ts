import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import { createUrlTemplateRecord, templateMatchesModel, updateTemplateSettings } from '../extension/src/core/url/templates.js';

test('url templates replace included fields with readable placeholders', () => {
  const model = parseUrl('https://example.test/gallery/page/0007.jpg?chapter=12&size=large');
  const fields = collectUrlFields(model);
  const chapter = fields.find((field) => field.label === 'query chapter');
  const file = fields.find((field) => field.label === 'file 0');
  assert.ok(chapter);
  assert.ok(file);

  const template = createUrlTemplateRecord({
    model,
    fields,
    includedFieldIds: [chapter.id, file.id],
    now: '2026-06-21T00:00:00.000Z',
  });

  assert.ok(template);
  assert.equal(template.hostname, 'example.test');
  assert.equal(template.templateUrl, 'https://example.test/gallery/page/{file-0}.jpg?chapter={query-chapter}&size=large');
  assert.deepEqual(
    template.fields.map((field) => field.placeholder),
    ['{file-0}', '{query-chapter}'],
  );
});

test('url template match modes are explicit instead of opaque confidence scores', () => {
  const source = parseUrl('https://example.test/gallery/page/0007.jpg?chapter=12&size=large');
  const sameShape = parseUrl('https://example.test/gallery/page/0008.jpg?chapter=13&size=large');
  const differentPathLiteral = parseUrl('https://example.test/gallery/other/0008.jpg?chapter=13&size=large');
  const fields = collectUrlFields(source);
  const chapter = fields.find((field) => field.label === 'query chapter');
  assert.ok(chapter);

  const template = createUrlTemplateRecord({
    model: source,
    fields,
    includedFieldIds: [chapter.id],
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.ok(template);

  assert.equal(templateMatchesModel(template, sameShape), true);
  assert.equal(templateMatchesModel(template, differentPathLiteral), false);
  const pathShape = updateTemplateSettings(template, { matchMode: 'same-path-query-shape', now: '2026-06-21T00:00:01.000Z' });
  assert.equal(templateMatchesModel(pathShape, sameShape), true);
  assert.equal(templateMatchesModel(pathShape, differentPathLiteral), true);
  const broad = updateTemplateSettings(template, { matchMode: 'broad-site', now: '2026-06-21T00:00:02.000Z' });
  assert.equal(templateMatchesModel(broad, differentPathLiteral), true);
  assert.equal(templateMatchesModel(broad, parseUrl('https://elsewhere.test/gallery/page/0008.jpg?chapter=13&size=large')), false);
});
