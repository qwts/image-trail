import test from 'node:test';
import assert from 'node:assert/strict';

import { isBuildIdentity } from '../extension/src/core/build-info.js';

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
});
