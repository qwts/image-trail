import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjacentParsedFieldUrlCandidates,
  adjacentParsedFieldUrls,
  fieldsById,
  selectActiveNavigationNeighborCandidate,
  selectWarmedNeighborCandidate,
  skipKnownFailedNeighborCandidate,
} from '../extension/src/core/url/preload-neighbors.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';

test('adjacentParsedFieldUrls warms bounded URLs on both sides of current parsed field', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const urls = adjacentParsedFieldUrls(model, [field], 1);

  assert.deepEqual(urls, ['https://example.test/gallery?image=9', 'https://example.test/gallery?image=11']);
});

test('adjacentParsedFieldUrls respects radius and de-duplicates generated URLs', () => {
  const model = parseUrl('https://example.test/gallery?image=010');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const urls = adjacentParsedFieldUrls(model, [field], 2);

  assert.deepEqual(urls, [
    'https://example.test/gallery?image=009',
    'https://example.test/gallery?image=011',
    'https://example.test/gallery?image=008',
    'https://example.test/gallery?image=012',
  ]);
});

test('fieldsById preserves field order and ignores unknown ids', () => {
  const model = parseUrl('https://example.test/gallery?image=10&chapter=2');
  const fields = collectUrlFields(model).filter((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');

  assert.deepEqual(fieldsById(fields, [fields[1]?.id ?? '', 'missing']), fields.slice(1, 2));
});

test('adjacentParsedFieldUrlCandidates records direction and distance for short-circuiting', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const candidates = adjacentParsedFieldUrlCandidates(model, [field], 2);

  assert.deepEqual(candidates, [
    { url: 'https://example.test/gallery?image=9', direction: -1, distance: 1 },
    { url: 'https://example.test/gallery?image=11', direction: 1, distance: 1 },
    { url: 'https://example.test/gallery?image=8', direction: -1, distance: 2 },
    { url: 'https://example.test/gallery?image=12', direction: 1, distance: 2 },
  ]);
});

test('adjacentParsedFieldUrlCandidates orders nearest neighbors before farther candidates', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const candidates = adjacentParsedFieldUrlCandidates(model, [field], 5);

  assert.deepEqual(
    candidates.slice(0, 6).map((candidate) => candidate.distance),
    [1, 1, 2, 2, 3, 3],
  );
});

test('skipKnownFailedNeighborCandidate jumps to the first non-failed URL in the requested direction', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const candidates = adjacentParsedFieldUrlCandidates(model, [field], 5);
  const skipped = skipKnownFailedNeighborCandidate(
    candidates,
    1,
    (url) =>
      url === 'https://example.test/gallery?image=11' ||
      url === 'https://example.test/gallery?image=12' ||
      url === 'https://example.test/gallery?image=13' ||
      url === 'https://example.test/gallery?image=14',
  );

  assert.deepEqual(skipped, { url: 'https://example.test/gallery?image=15', direction: 1, distance: 5 });
});

test('skipKnownFailedNeighborCandidate leaves normal one-step navigation alone without known failures', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const skipped = skipKnownFailedNeighborCandidate(adjacentParsedFieldUrlCandidates(model, [field], 5), 1, () => false);

  assert.equal(skipped, null);
});

test('selectWarmedNeighborCandidate jumps over unknown or failed URLs to warmed successes', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const candidates = adjacentParsedFieldUrlCandidates(model, [field], 5);
  const warmed = selectWarmedNeighborCandidate(candidates, 1, (url) => {
    if (url === 'https://example.test/gallery?image=11') return 'failed';
    if (url === 'https://example.test/gallery?image=12') return 'unknown';
    if (url === 'https://example.test/gallery?image=13') return 'failed';
    if (url === 'https://example.test/gallery?image=14') return 'unknown';
    if (url === 'https://example.test/gallery?image=15') return 'loaded';
    return 'unknown';
  });

  assert.deepEqual(warmed, { url: 'https://example.test/gallery?image=15', direction: 1, distance: 5 });
});

test('selectWarmedNeighborCandidate returns the nearest warmed URL when it is already warm', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const warmed = selectWarmedNeighborCandidate(adjacentParsedFieldUrlCandidates(model, [field], 5), 1, (url) =>
    url === 'https://example.test/gallery?image=11' ? 'loaded' : 'unknown',
  );

  assert.deepEqual(warmed, { url: 'https://example.test/gallery?image=11', direction: 1, distance: 1 });
});

test('selectWarmedNeighborCandidate does not choose unknown URLs', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const warmed = selectWarmedNeighborCandidate(adjacentParsedFieldUrlCandidates(model, [field], 5), 1, (url) =>
    url === 'https://example.test/gallery?image=11' ? 'failed' : 'unknown',
  );

  assert.equal(warmed, null);
});

test('selectActiveNavigationNeighborCandidate falls forward to the first unknown after known failures', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const selected = selectActiveNavigationNeighborCandidate(adjacentParsedFieldUrlCandidates(model, [field], 5), 1, (url) => {
    if (url === 'https://example.test/gallery?image=11') return 'failed';
    return 'unknown';
  });

  assert.deepEqual(selected, { url: 'https://example.test/gallery?image=12', direction: 1, distance: 2 });
});

test('selectActiveNavigationNeighborCandidate tries the first non-failed URL before farther warmed URLs', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const selected = selectActiveNavigationNeighborCandidate(adjacentParsedFieldUrlCandidates(model, [field], 5), 1, (url) => {
    if (url === 'https://example.test/gallery?image=11') return 'failed';
    if (url === 'https://example.test/gallery?image=15') return 'loaded';
    return 'unknown';
  });

  assert.deepEqual(selected, { url: 'https://example.test/gallery?image=12', direction: 1, distance: 2 });
});

test('selectActiveNavigationNeighborCandidate keeps one-step navigation when no failures or warmed candidates exist', () => {
  const model = parseUrl('https://example.test/gallery?image=10');
  const field = collectUrlFields(model).find((candidate) => candidate.location === 'query' && candidate.tokenKind === 'int');
  assert.ok(field);

  const selected = selectActiveNavigationNeighborCandidate(adjacentParsedFieldUrlCandidates(model, [field], 5), 1, () => 'unknown');

  assert.equal(selected, null);
});
