import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  INTEROP_GOOGLE_DRIVE_OWNER,
  INTEROP_PROVIDER_LIBRARY_ID,
  INTEROP_PROVIDER_LOGICAL_ROOT,
  INTEROP_PROVIDER_ROOT_NAME,
} from '../extension/src/core/interop/provider-root.js';

test('runtime provider-root constants match the checksum-pinned canonical contract', () => {
  const contract = JSON.parse(readFileSync('contracts/interop/v1/provider-root.json', 'utf8')) as unknown;
  assert.deepEqual(contract, {
    schemaVersion: 1,
    pathSemantics: 'provider-relative',
    rootName: INTEROP_PROVIDER_ROOT_NAME,
    libraryId: INTEROP_PROVIDER_LIBRARY_ID,
    logicalPath: INTEROP_PROVIDER_LOGICAL_ROOT,
    googleDriveOwner: INTEROP_GOOGLE_DRIVE_OWNER,
  });
  assert.equal(INTEROP_PROVIDER_LOGICAL_ROOT, 'Overlook Interop/v1');
  assert.doesNotMatch(INTEROP_PROVIDER_LOGICAL_ROOT, /^\//u);
});
