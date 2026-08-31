import assert from 'node:assert/strict';
import test from 'node:test';

import { hasConfiguredDriveOAuth } from '../extension/src/background/interop-runtime-chrome.js';

test('Google Drive is enabled only for a non-empty drive.file OAuth manifest', () => {
  assert.equal(hasConfiguredDriveOAuth({}), false);
  assert.equal(hasConfiguredDriveOAuth({ oauth2: { client_id: '', scopes: ['https://www.googleapis.com/auth/drive.file'] } }), false);
  assert.equal(hasConfiguredDriveOAuth({ oauth2: { client_id: 'client-id', scopes: ['openid'] } }), false);
  assert.equal(
    hasConfiguredDriveOAuth({
      oauth2: { client_id: 'client-id', scopes: ['https://www.googleapis.com/auth/drive.file'] },
    }),
    true,
  );
});
