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

const IDENTITY_KEY = '42'.repeat(32);

test('url templates redact excluded URL material and replace included fields with readable placeholders', () => {
  const model = parseUrl('https://example.test/private/gallery/0007.jpg?chapter=12&secret=large#access_token=hidden');
  const fields = collectUrlFields(model);
  const chapter = fields.find((field) => field.label === 'query chapter');
  const file = fields.find((field) => field.label === 'file 0');
  assert.ok(chapter);
  assert.ok(file);

  const template = createUrlTemplateRecord({
    model,
    fields,
    includedFieldIds: [chapter.id, file.id],
    identityKey: IDENTITY_KEY,
    now: '2026-06-21T00:00:00.000Z',
  });

  assert.ok(template);
  assert.equal(template.hostname, 'example.test');
  assert.equal(template.autoApplyEnabled, true);
  assert.equal(template.templateUrl, 'https://example.test/{path-segment}/{path-segment}/{file-0}.jpg?chapter={query-chapter}');
  assert.doesNotMatch(template.templateUrl, /private|gallery|secret|large|access_token|hidden/u);
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
    identityKey: IDENTITY_KEY,
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.ok(template);

  assert.equal(templateMatchesModel(template, sameShape, { identityKey: IDENTITY_KEY }), true);
  assert.equal(templateMatchesModel(template, differentPathLiteral, { identityKey: IDENTITY_KEY }), false);
  const pathShape = updateTemplateSettings(template, { matchMode: 'same-path-query-shape', now: '2026-06-21T00:00:01.000Z' });
  assert.equal(templateMatchesModel(pathShape, sameShape, { identityKey: IDENTITY_KEY }), true);
  assert.equal(templateMatchesModel(pathShape, differentPathLiteral, { identityKey: IDENTITY_KEY }), true);
  const broad = updateTemplateSettings(template, { matchMode: 'broad-site', now: '2026-06-21T00:00:02.000Z' });
  assert.equal(templateMatchesModel(broad, differentPathLiteral, { identityKey: IDENTITY_KEY }), true);
  assert.equal(
    templateMatchesModel(broad, parseUrl('https://elsewhere.test/gallery/page/0008.jpg?chapter=13&size=large'), {
      identityKey: IDENTITY_KEY,
    }),
    false,
  );
  const disabled = updateTemplateSettings(broad, { autoApplyEnabled: false, now: '2026-06-21T00:00:03.000Z' });
  assert.equal(templateMatchesModel(disabled, sameShape, { identityKey: IDENTITY_KEY }), false);
  assert.equal(findBestMatchingTemplate([disabled], sameShape, { identityKey: IDENTITY_KEY }), null);
  assert.equal(findBestMatchingTemplate([disabled], sameShape, { identityKey: IDENTITY_KEY, includeDisabled: true })?.id, disabled.id);
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
    identityKey: IDENTITY_KEY,
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
    identityKey: IDENTITY_KEY,
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
  assert.equal(
    updateTemplateFields({
      template: configured,
      model,
      fields,
      includedFieldIds: [],
      identityKey: IDENTITY_KEY,
      now: '2026-06-21T00:00:03.000Z',
    }),
    null,
  );
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
    identityKey: IDENTITY_KEY,
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
    identityKey: IDENTITY_KEY,
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
    identityKey: IDENTITY_KEY,
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.ok(template);

  const pattern = upsertGrabSourcePattern([], {
    model: parseUrl('https://example.test/post/12345?src=feed'),
    identityKey: IDENTITY_KEY,
    now: '2026-06-21T00:00:01.000Z',
  });
  assert.equal(pattern.patternUrl, 'https://example.test/{path-segment}/{path-segment}');
  assert.doesNotMatch(pattern.patternUrl, /post|12345|src|feed/u);
  assert.equal(pattern.hostname, 'example.test');
  assert.equal(pattern.grabStrategy, undefined);
  assert.equal(grabSourcePatternMatches(pattern, parseUrl('https://example.test/post/67890?src=feed'), IDENTITY_KEY), true);
  assert.equal(grabSourcePatternMatches(pattern, parseUrl('https://example.test/other/67890?src=feed'), IDENTITY_KEY), false);

  const configured = updateGrabSourcePatternSettings(pattern, {
    grabStrategy: defaultGrabStrategy('linked-page-image'),
    now: '2026-06-21T00:00:02.000Z',
  });
  assert.equal(configured.grabStrategy?.kind, 'linked-page-image');

  const match = findBestMatchingGrabSourcePattern([configured], parseUrl('https://example.test/post/67890?src=feed'), IDENTITY_KEY);
  assert.equal(match?.id, pattern.id);

  assert.equal(
    findBestMatchingTemplate([template], parseUrl('https://example.test/post/67890?src=feed'), { identityKey: IDENTITY_KEY }),
    null,
  );
});

test('url templates rebuild multiple included tokens in one query parameter', () => {
  const model = parseUrl('https://example.test/private/image.jpg?size=1920x1080&token=hidden#secret');
  const fields = collectUrlFields(model);
  const sizeFields = fields.filter((field) => field.label === 'query size' && field.tokenKind === 'int');
  assert.equal(sizeFields.length, 2);

  const template = createUrlTemplateRecord({
    model,
    fields,
    includedFieldIds: sizeFields.map((field) => field.id),
    identityKey: IDENTITY_KEY,
    now: '2026-07-30T00:00:00.000Z',
  });

  assert.ok(template);
  assert.equal(template.templateUrl, 'https://example.test/{path-segment}/{path-segment}?size={query-size}x{query-size}');
  assert.equal(template.templateUrl.match(/size=/gu)?.length, 1);
  assert.doesNotMatch(template.templateUrl, /private|image|token|hidden|secret/u);
});

test('exact identities separate literal routes and query-key layouts without persisting them', () => {
  const post = parseUrl('https://example.test/post/123?source=feed');
  const admin = parseUrl('https://example.test/admin/456?token=feed');
  const postField = collectUrlFields(post).find((field) => field.tokenKind === 'int');
  const adminField = collectUrlFields(admin).find((field) => field.tokenKind === 'int');
  assert.ok(postField);
  assert.ok(adminField);

  const postTemplate = createUrlTemplateRecord({
    model: post,
    fields: collectUrlFields(post),
    includedFieldIds: [postField.id],
    identityKey: IDENTITY_KEY,
  });
  const adminTemplate = createUrlTemplateRecord({
    model: admin,
    fields: collectUrlFields(admin),
    includedFieldIds: [adminField.id],
    identityKey: IDENTITY_KEY,
  });
  assert.ok(postTemplate);
  assert.ok(adminTemplate);

  assert.notEqual(postTemplate.id, adminTemplate.id);
  assert.notEqual(postTemplate.matchRules.exactIdentity, adminTemplate.matchRules.exactIdentity);
  assert.doesNotMatch(JSON.stringify(postTemplate.matchRules), /post|source/u);
  assert.doesNotMatch(JSON.stringify(adminTemplate.matchRules), /admin|token/u);
  assert.equal(templateMatchesModel(postTemplate, admin, { identityKey: IDENTITY_KEY }), false);
  assert.equal(
    templateMatchesModel(updateTemplateSettings(postTemplate, { matchMode: 'same-path-query-shape' }), admin, {
      identityKey: IDENTITY_KEY,
    }),
    true,
  );
});
