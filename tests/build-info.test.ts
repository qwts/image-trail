import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildIdentityRows,
  formatBuildIdentityLocalTimestamp,
  formatBuildIdentityTimestamp,
  isBuildIdentity,
  isNonProductionBuildIdentity,
} from '../extension/src/core/build-info.js';

test('validates extension build identity payloads', () => {
  assert.equal(
    isBuildIdentity({
      schemaVersion: 1,
      version: '0.1.0',
      builtAt: '2026-06-28T03:30:00.000Z',
      commit: 'abc123def456',
      branch: 'codex/dev',
      worktree: '7bc4/image-bookmarklet',
      timezone: 'America/Chicago',
      mode: 'local',
    }),
    true,
  );
  assert.equal(isBuildIdentity({ schemaVersion: 1, version: '0.1.0', builtAt: '2026-06-28T03:30:00.000Z', mode: 'local' }), false);
  assert.equal(
    isBuildIdentity({
      schemaVersion: 1,
      version: '0.1.0',
      builtAt: '2026-06-28T03:30:00.000Z',
      commit: null,
      branch: null,
      worktree: null,
      mode: 'release',
    }),
    true,
  );
  assert.equal(
    isBuildIdentity({
      schemaVersion: 1,
      version: '0.1.0',
      builtAt: '2026-06-28T03:30:00.000Z',
      commit: 'abc123def456',
      branch: 'codex/experimental',
      worktree: null,
      mode: 'experimental',
    }),
    true,
  );
});

test('build identity rows include local build identity fields', () => {
  const rows = buildIdentityRows({
    schemaVersion: 1,
    version: '0.1.0',
    builtAt: '2026-06-28T03:30:00.000Z',
    commit: 'abc123def456',
    branch: 'codex/dev',
    worktree: 'image-bookmarklet',
    timezone: 'America/Chicago',
    mode: 'local',
  });

  assert.deepEqual(rows.slice(0, 5), [
    { label: 'Version', value: '0.1.0' },
    { label: 'Mode', value: 'local' },
    { label: 'Commit', value: 'abc123def456' },
    { label: 'Branch', value: 'codex/dev' },
    { label: 'Worktree', value: 'image-bookmarklet' },
  ]);
  assert.equal(rows[5]?.label, 'Built local');
  assert.match(rows[5]?.value ?? '', /^06\/27\/2026, 10:30:00 PM (CDT|GMT-5)$/u);
  assert.deepEqual(rows[6], { label: 'Built UTC', value: '2026-06-28 03:30:00 UTC' });
});

test('build identity timestamp falls back to source text when invalid', () => {
  assert.equal(formatBuildIdentityTimestamp('not-a-date'), 'not-a-date');
  assert.equal(formatBuildIdentityLocalTimestamp('not-a-date', 'America/Chicago'), 'not-a-date');
});

test('non-production build identity gate allows every mode except release', () => {
  assert.equal(
    isNonProductionBuildIdentity({
      schemaVersion: 1,
      version: '0.1.0',
      builtAt: '2026-06-28T03:30:00.000Z',
      commit: 'abc123def456',
      branch: 'codex/dev',
      worktree: 'image-bookmarklet',
      timezone: 'America/Chicago',
      mode: 'local',
    }),
    true,
  );
  assert.equal(
    isNonProductionBuildIdentity({
      schemaVersion: 1,
      version: '0.1.0',
      builtAt: '2026-06-28T03:30:00.000Z',
      commit: null,
      branch: null,
      worktree: null,
      mode: 'unknown',
    }),
    true,
  );
  assert.equal(
    isNonProductionBuildIdentity({
      schemaVersion: 1,
      version: '0.1.0',
      builtAt: '2026-06-28T03:30:00.000Z',
      commit: null,
      branch: null,
      worktree: null,
      mode: 'release',
    }),
    false,
  );
  assert.equal(isNonProductionBuildIdentity(null), false);
});
