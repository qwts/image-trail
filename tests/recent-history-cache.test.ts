import test from 'node:test';
import assert from 'node:assert/strict';
import { RecentHistoryCache, recentHistoryPageKey, recentHistorySiteKey } from '../extension/src/background/recent-history-cache.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';

function record(id: string, url = `https://example.test/${id}.jpg`): ImageDisplayRecord {
  return { id, url, label: `${id}.jpg`, timestamp: '2026-01-01T00:00:00.000Z' };
}

test('recent history keys use hostname for sites and origin/path for pages', () => {
  assert.equal(recentHistorySiteKey('https://example.test/page'), 'example.test');
  assert.equal(recentHistoryPageKey('https://example.test/page?view=one#row'), 'https://example.test/page');
  assert.equal(recentHistorySiteKey('not a url'), 'unknown');
  assert.equal(recentHistoryPageKey('not a url'), 'unknown');
});

test('RecentHistoryCache.add is newest-first, deduped by url/id, and scoped per site', () => {
  const cache = new RecentHistoryCache();
  cache.add('https://a.test/page', record('1'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://a.test/page', record('2'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://b.test/other', record('3'), DEFAULT_LOCAL_SETTINGS);

  assert.deepEqual(
    cache.load('https://a.test/page', DEFAULT_LOCAL_SETTINGS, true).map((item) => item.id),
    ['2', '1'],
  );
  assert.deepEqual(
    cache.load('https://b.test/other', DEFAULT_LOCAL_SETTINGS, true).map((item) => item.id),
    ['3'],
  );

  // Re-adding the same url replaces (not duplicates) the entry and moves it to the front.
  cache.add('https://a.test/page', record('1b', 'https://example.test/1.jpg'), DEFAULT_LOCAL_SETTINGS);
  assert.deepEqual(
    cache.load('https://a.test/page', DEFAULT_LOCAL_SETTINGS, true).map((item) => item.id),
    ['1b', '2'],
  );
});

test('RecentHistoryCache exposes page, site, and all-site views without per-path buckets', () => {
  const cache = new RecentHistoryCache();
  cache.add('https://a.test/gallery?first=1', record('1'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://a.test/gallery?second=1', record('2'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://b.test/other', record('3'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://a.test/details', record('4'), DEFAULT_LOCAL_SETTINGS);

  assert.deepEqual(
    cache.load('https://a.test/gallery?ignored=1', DEFAULT_LOCAL_SETTINGS, true, 'page').map((item) => item.id),
    ['2', '1'],
    'page scope uses origin + path and ignores query/hash fragmentation',
  );
  assert.deepEqual(
    cache.load('https://a.test/gallery', DEFAULT_LOCAL_SETTINGS, true, 'site').map((item) => item.id),
    ['4', '2', '1'],
  );
  assert.deepEqual(
    cache.load('https://a.test/gallery', DEFAULT_LOCAL_SETTINGS, true, 'all').map((item) => item.id),
    ['4', '3', '2', '1'],
    'all-site scope preserves global insertion order',
  );
});

test('RecentHistoryCache all-site view dedupes cross-site records and removes the visible identity globally', () => {
  const cache = new RecentHistoryCache();
  const sharedUrl = 'https://images.test/shared.jpg';
  cache.add('https://a.test/gallery', record('a', sharedUrl), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://b.test/gallery', record('b', sharedUrl), DEFAULT_LOCAL_SETTINGS);

  assert.deepEqual(
    cache.load('https://a.test/gallery', DEFAULT_LOCAL_SETTINGS, true, 'all').map((item) => item.id),
    ['b'],
  );
  assert.deepEqual(cache.remove('https://a.test/gallery', 'b', DEFAULT_LOCAL_SETTINGS, 'all'), []);
  assert.deepEqual([...cache.values()].flat(), []);
});

test('RecentHistoryCache.update preserves the original page, site, and insertion sequence', () => {
  const cache = new RecentHistoryCache();
  cache.add('https://a.test/gallery', record('a'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://b.test/other', record('b'), DEFAULT_LOCAL_SETTINGS);

  const pinned = { ...record('b'), pinnedRecordId: 'pin-b', pinnedAt: '2026-07-15T00:00:00.000Z' };
  cache.update('https://a.test/gallery', pinned, DEFAULT_LOCAL_SETTINGS, 'all');

  assert.deepEqual(
    cache.load('https://a.test/gallery', DEFAULT_LOCAL_SETTINGS, true, 'all').map((item) => item.id),
    ['b', 'a'],
    'metadata updates retain global insertion order',
  );
  assert.deepEqual(
    cache.load('https://b.test/other', DEFAULT_LOCAL_SETTINGS, true, 'site'),
    [pinned],
    'the updated row stays in its original site bucket',
  );
  assert.deepEqual(
    cache.load('https://a.test/gallery', DEFAULT_LOCAL_SETTINGS, true, 'site').map((item) => item.id),
    ['a'],
    'the current site does not adopt an off-site row',
  );
});

test('RecentHistoryCache page removal leaves other pages in the site bucket intact', () => {
  const cache = new RecentHistoryCache();
  cache.add('https://a.test/gallery', record('1'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://a.test/details', record('2'), DEFAULT_LOCAL_SETTINGS);

  assert.deepEqual(cache.remove('https://a.test/gallery', '1', DEFAULT_LOCAL_SETTINGS, 'page'), []);
  assert.deepEqual(
    cache.load('https://a.test/details', DEFAULT_LOCAL_SETTINGS, true, 'site').map((item) => item.id),
    ['2'],
  );
});

test('RecentHistoryCache.load without includeRetained is bounded by recentHistoryLimit, even when more is retained', () => {
  const cache = new RecentHistoryCache();
  // In 'keep-session' mode, storage retains more than recentHistoryLimit (up to
  // recentHistoryRetainedLimit); only the visible (non-retained) view is bounded by recentHistoryLimit. Under the
  // default 'drop-oldest' mode the two caps are the same number, so this distinction only shows up
  // in 'keep-session' mode.
  const settings = {
    ...DEFAULT_LOCAL_SETTINGS,
    recentHistoryLimit: 2,
    recentHistoryRetainedLimit: 3,
    recentHistoryOverflowBehavior: 'keep-session' as const,
  };
  cache.add('https://a.test/page', record('1'), settings);
  cache.add('https://a.test/page', record('2'), settings);
  cache.add('https://a.test/page', record('3'), settings);

  assert.equal(cache.load('https://a.test/page', settings, false).length, 2);
  assert.equal(cache.load('https://a.test/page', settings, true).length, 3);
});

test('RecentHistoryCache.add caps retained hidden rows at recentHistoryRetainedLimit in keep-session mode', () => {
  const cache = new RecentHistoryCache();
  const settings = {
    ...DEFAULT_LOCAL_SETTINGS,
    recentHistoryLimit: 2,
    recentHistoryRetainedLimit: 3,
    recentHistoryOverflowBehavior: 'keep-session' as const,
  };

  for (const id of ['1', '2', '3', '4']) {
    cache.add('https://a.test/page', record(id), settings);
  }

  assert.deepEqual(
    cache.load('https://a.test/page', settings, false).map((item) => item.id),
    ['4', '3'],
  );
  assert.deepEqual(
    cache.load('https://a.test/page', settings, true).map((item) => item.id),
    ['4', '3', '2'],
  );
});

test('RecentHistoryCache.remove drops only the matching id', () => {
  const cache = new RecentHistoryCache();
  cache.add('https://a.test/page', record('1'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://a.test/page', record('2'), DEFAULT_LOCAL_SETTINGS);

  const remaining = cache.remove('https://a.test/page', '1', DEFAULT_LOCAL_SETTINGS);
  assert.deepEqual(
    remaining.map((item) => item.id),
    ['2'],
  );
});

test('RecentHistoryCache.pruneForSettings trims every site down to the active retained limit', () => {
  const cache = new RecentHistoryCache();
  const roomy = { ...DEFAULT_LOCAL_SETTINGS, recentHistoryLimit: 30, recentHistoryOverflowBehavior: 'drop-oldest' as const };
  cache.add('https://a.test/page', record('1'), roomy);
  cache.add('https://a.test/page', record('2'), roomy);
  cache.add('https://b.test/page', record('3'), roomy);

  const keepSession = { ...roomy, recentHistoryRetainedLimit: 1, recentHistoryOverflowBehavior: 'keep-session' as const };
  cache.pruneForSettings(keepSession);
  assert.equal(cache.load('https://a.test/page', keepSession, true).length, 1, 'keep-session prunes down to max kept recents');

  const tight = { ...roomy, recentHistoryLimit: 1 };
  cache.pruneForSettings(tight);
  assert.equal(cache.load('https://a.test/page', tight, true).length, 1);
  assert.equal(cache.load('https://b.test/page', tight, true).length, 1);
});

test('RecentHistoryCache.values() exposes every cached site for cross-site sweeps (e.g. blob reference counting)', () => {
  const cache = new RecentHistoryCache();
  cache.add('https://a.test/page', record('1'), DEFAULT_LOCAL_SETTINGS);
  cache.add('https://b.test/page', record('2'), DEFAULT_LOCAL_SETTINGS);

  const allIds = [...cache.values()]
    .flat()
    .map((item) => item.id)
    .sort();
  assert.deepEqual(allIds, ['1', '2']);
});
