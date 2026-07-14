import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PAGE_CONTEXT_OVERRIDE_LIMIT,
  normalizePageContextScope,
  resolvePageContextState,
  sanitizePageContextOverrides,
  updatePageContextOverrides,
} from '../extension/src/core/page-context.js';

test('resolves an available override without changing automatic detection evidence', () => {
  const resolved = resolvePageContextState({ detected: 'feed', available: ['single', 'gallery', 'feed'], imageCount: 8 }, 'gallery');
  assert.deepEqual(resolved, {
    detected: 'feed',
    effective: 'gallery',
    override: 'gallery',
    available: ['single', 'gallery', 'feed'],
    imageCount: 8,
  });
});

test('keeps an unavailable saved override inactive until the page supports it', () => {
  const resolved = resolvePageContextState({ detected: 'single', available: ['single'], imageCount: 1 }, 'feed');
  assert.equal(resolved.effective, 'single');
  assert.equal(resolved.override, 'feed');
});

test('normalizes hostname scopes and retains only the newest valid bounded records', () => {
  assert.equal(normalizePageContextScope(' .Example.COM. '), 'example.com');
  assert.equal(normalizePageContextScope('bad host/path'), null);
  const records = Object.fromEntries(
    Array.from({ length: PAGE_CONTEXT_OVERRIDE_LIMIT + 2 }, (_, index) => [
      `host-${index}.test`,
      { context: index % 2 === 0 ? 'gallery' : 'feed', updatedAt: index },
    ]),
  );
  const sanitized = sanitizePageContextOverrides({
    ...records,
    'Example.COM': { context: 'feed', updatedAt: 10 },
    'example.com': { context: 'gallery', updatedAt: 20 },
    invalid: { context: 'unknown', updatedAt: 30 },
  });
  assert.equal(Object.keys(sanitized).length, PAGE_CONTEXT_OVERRIDE_LIMIT);
  assert.deepEqual(sanitized['example.com'], { context: 'gallery', updatedAt: 20 });
  assert.equal(sanitized['host-0.test'], undefined);
});

test('updates and clears one normalized scope without mutating the input', () => {
  const initial = { 'other.test': { context: 'feed' as const, updatedAt: 1 } };
  const updated = updatePageContextOverrides(initial, 'Example.TEST', 'gallery', 2);
  assert.equal('example.test' in initial, false);
  assert.deepEqual(updated['example.test'], { context: 'gallery', updatedAt: 2 });
  assert.deepEqual(updatePageContextOverrides(updated, 'example.test', null, 3), initial);
});
