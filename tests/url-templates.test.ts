import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { defaultGrabStrategy } from '../extension/src/core/url/grab-strategies.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import {
  createUrlTemplateRecord,
  findBestMatchingGrabSourcePattern,
  findBestMatchingTemplate,
  grabSourcePatternMatches,
  templateMatchesModel,
  updateTemplateFields,
  updateGrabSourcePatternSettings,
  updateTemplateSettings,
  upsertGrabSourcePattern,
} from '../extension/src/core/url/templates.js';

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
  assert.equal(template.autoApplyEnabled, true);
  assert.equal(template.templateUrl, 'https://example.test/{path-segment}/{path-segment}/{file-0}.jpg?chapter={query-chapter}');
  assert.deepEqual(
    template.fields.map((field) => field.placeholder),
    ['{file-0}', '{query-chapter}'],
  );
});

test('url templates redact excluded path and query literals before durable storage', () => {
  const model = parseUrl(
    'https://cdn.example/private/alice/img-0001.jpg?page=1&token=SECRET&X-Amz-Signature=SIGSECRET&album=summer-private',
  );
  const fields = collectUrlFields(model);
  const page = fields.find((field) => field.label === 'query page');
  const file = fields.find((field) => field.label === 'file 1');
  assert.ok(page);
  assert.ok(file);

  const template = createUrlTemplateRecord({
    model,
    fields,
    includedFieldIds: [file.id, page.id],
    now: '2026-06-21T00:00:00.000Z',
  });

  assert.ok(template);
  assert.equal(template.templateUrl, 'https://cdn.example/{path-segment}/{path-segment}/img-{file-1}.jpg?page={query-page}');
  assert.equal(template.templateUrl.includes('SECRET'), false);
  assert.equal(template.templateUrl.includes('alice'), false);
  assert.equal(template.templateUrl.includes('X-Amz-Signature'), false);
  assert.equal(template.matchRules.exactPathSignature.includes('alice'), false);
  assert.equal(template.matchRules.querySignature.includes('token'), false);
  assert.equal(template.matchRules.querySignature.includes('X-Amz-Signature'), false);
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
  assert.equal(templateMatchesModel(template, differentPathLiteral), true);
  const pathShape = updateTemplateSettings(template, { matchMode: 'same-path-query-shape', now: '2026-06-21T00:00:01.000Z' });
  assert.equal(templateMatchesModel(pathShape, sameShape), true);
  assert.equal(templateMatchesModel(pathShape, differentPathLiteral), true);
  const broad = updateTemplateSettings(template, { matchMode: 'broad-site', now: '2026-06-21T00:00:02.000Z' });
  assert.equal(templateMatchesModel(broad, differentPathLiteral), true);
  assert.equal(templateMatchesModel(broad, parseUrl('https://elsewhere.test/gallery/page/0008.jpg?chapter=13&size=large')), false);
  const disabled = updateTemplateSettings(broad, { autoApplyEnabled: false, now: '2026-06-21T00:00:03.000Z' });
  assert.equal(templateMatchesModel(disabled, sameShape), false);
  assert.equal(findBestMatchingTemplate([disabled], sameShape), null);
  assert.equal(findBestMatchingTemplate([disabled], sameShape, { includeDisabled: true })?.id, disabled.id);
});

test('url template field updates preserve review settings and use count', () => {
  const model = parseUrl('https://example.test/gallery/page/0007.jpg?chapter=12&size=large');
  const fields = collectUrlFields(model);
  const chapter = fields.find((field) => field.label === 'query chapter');
  const file = fields.find((field) => field.label === 'file 0');
  assert.ok(chapter);
  assert.ok(file);

  const template = createUrlTemplateRecord({
    model,
    fields,
    includedFieldIds: [chapter.id],
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.ok(template);
  const configured = updateTemplateSettings(template, {
    matchMode: 'same-path-query-shape',
    hideExcludedFields: true,
    now: '2026-06-21T00:00:01.000Z',
  });

  const updated = updateTemplateFields({
    template: configured,
    model,
    fields,
    includedFieldIds: [file.id],
    now: '2026-06-21T00:00:02.000Z',
  });

  assert.ok(updated);
  assert.equal(updated.useCount, configured.useCount);
  assert.equal(updated.hideExcludedFields, true);
  assert.equal(updated.matchRules.mode, 'same-path-query-shape');
  assert.deepEqual(
    updated.fields.map((field) => field.id),
    [file.id],
  );
  assert.equal(updated.templateUrl, 'https://example.test/{path-segment}/{path-segment}/{file-0}.jpg');
  assert.equal(updateTemplateFields({ template: configured, model, fields, includedFieldIds: [], now: '2026-06-21T00:00:03.000Z' }), null);
});

test('url template settings preserve declarative grab strategy configuration', () => {
  const model = parseUrl('https://example.test/gallery/page/0007.jpg?chapter=12&size=large');
  const fields = collectUrlFields(model);
  const chapter = fields.find((field) => field.label === 'query chapter');
  const file = fields.find((field) => field.label === 'file 0');
  assert.ok(chapter);
  assert.ok(file);

  const template = createUrlTemplateRecord({
    model,
    fields,
    includedFieldIds: [chapter.id],
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.ok(template);

  const linked = updateTemplateSettings(template, {
    grabStrategy: defaultGrabStrategy('linked-page-image'),
    now: '2026-06-21T00:00:01.000Z',
  });
  assert.equal(linked.grabStrategy?.kind, 'linked-page-image');

  const updatedFields = updateTemplateFields({
    template: linked,
    model,
    fields,
    includedFieldIds: [file.id],
    now: '2026-06-21T00:00:02.000Z',
  });
  assert.equal(updatedFields?.grabStrategy?.kind, 'linked-page-image');

  const cleared = updateTemplateSettings(linked, { grabStrategy: null, now: '2026-06-21T00:00:03.000Z' });
  assert.equal(cleared.grabStrategy, undefined);
});

test('grab source patterns match clicked targets independently from image URL templates', () => {
  const imageModel = parseUrl('https://cdn.example.test/images/0007.jpg');
  const imageFields = collectUrlFields(imageModel);
  const imageField = imageFields.find((field) => field.label === 'file 0');
  assert.ok(imageField);

  const template = createUrlTemplateRecord({
    model: imageModel,
    fields: imageFields,
    includedFieldIds: [imageField.id],
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.ok(template);

  const pattern = upsertGrabSourcePattern([], {
    model: parseUrl('https://example.test/post/12345?src=feed'),
    now: '2026-06-21T00:00:01.000Z',
  });
  assert.equal(pattern.patternUrl, 'https://example.test/post/12345?src=feed');
  assert.equal(pattern.hostname, 'example.test');
  assert.equal(pattern.grabStrategy, undefined);
  assert.equal(grabSourcePatternMatches(pattern, parseUrl('https://example.test/post/67890?src=feed')), true);
  assert.equal(grabSourcePatternMatches(pattern, parseUrl('https://example.test/other/67890?src=feed')), true);

  const configured = updateGrabSourcePatternSettings(pattern, {
    grabStrategy: defaultGrabStrategy('linked-page-image'),
    now: '2026-06-21T00:00:02.000Z',
  });
  assert.equal(configured.grabStrategy?.kind, 'linked-page-image');

  const match = findBestMatchingGrabSourcePattern([configured], parseUrl('https://example.test/post/67890?src=feed'));
  assert.equal(match?.id, pattern.id);

  assert.equal(findBestMatchingTemplate([template], parseUrl('https://example.test/post/67890?src=feed')), null);
});
