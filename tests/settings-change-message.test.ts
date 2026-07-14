import test from 'node:test';
import assert from 'node:assert/strict';

import { createSettingsChangeMessage, isSettingsChangeMessage } from '../extension/src/background/settings-change-message.js';

test('settings change messages are versioned and reject malformed payloads', () => {
  assert.deepEqual(createSettingsChangeMessage(42), {
    type: 'imageTrail.settingsChanged',
    version: 1,
    payload: { changedAt: 42 },
  });
  assert.equal(isSettingsChangeMessage(createSettingsChangeMessage(42)), true);
  assert.equal(isSettingsChangeMessage({ type: 'imageTrail.settingsChanged', version: 1, payload: {} }), false);
  assert.equal(isSettingsChangeMessage({ type: 'imageTrail.settingsChanged', version: 2, payload: { changedAt: 42 } }), false);
});
