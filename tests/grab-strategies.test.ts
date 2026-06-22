import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LINKED_PAGE_IMAGE_EXTRACTORS,
  defaultGrabStrategy,
  normalizeGrabStrategy,
  parseExtractorLines,
  serializeExtractorLines,
} from '../extension/src/core/url/grab-strategies.js';

test('grab strategy normalization accepts only known declarative strategies', () => {
  assert.deepEqual(normalizeGrabStrategy({ kind: 'clicked-image', ignored: true }), { kind: 'clicked-image' });
  assert.equal(normalizeGrabStrategy({ kind: 'custom-js', code: 'alert(1)' }), undefined);
  assert.equal(normalizeGrabStrategy(null), undefined);
});

test('linked-page image strategy normalization bounds extraction settings', () => {
  const strategy = normalizeGrabStrategy({
    kind: 'linked-page-image',
    timeoutMs: 99,
    maxBytes: 999_999_999,
    extractors: [
      { selector: 'meta[property="og:image"]', attribute: 'content' },
      { selector: '', attribute: 'src' },
      { selector: '#main-image', attribute: 'on click' },
    ],
  });

  assert.equal(strategy?.kind, 'linked-page-image');
  assert.deepEqual(strategy?.extractors, [{ selector: 'meta[property="og:image"]', attribute: 'content' }]);
  assert.equal(strategy?.timeoutMs, 1000);
  assert.equal(strategy?.maxBytes, 2_097_152);
});

test('extractor text uses selector at attribute lines', () => {
  const extractors = parseExtractorLines('meta[property="og:image"]@content\n#main-image@src\nimg.fullsize');
  assert.deepEqual(extractors, [
    { selector: 'meta[property="og:image"]', attribute: 'content' },
    { selector: '#main-image', attribute: 'src' },
    { selector: 'img.fullsize', attribute: 'src' },
  ]);
  assert.equal(serializeExtractorLines(extractors), 'meta[property="og:image"]@content\n#main-image@src\nimg.fullsize@src');
});

test('default linked-page strategy includes safe fallback extractors', () => {
  const strategy = defaultGrabStrategy('linked-page-image');
  assert.equal(strategy.kind, 'linked-page-image');
  assert.deepEqual(strategy.extractors, DEFAULT_LINKED_PAGE_IMAGE_EXTRACTORS);
});
