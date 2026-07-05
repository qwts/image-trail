import test from 'node:test';
import assert from 'node:assert/strict';

import { isExtensionRequest } from '../extension/src/background/messages.js';
import { createShortcutActionMessage, isShortcutActionMessage } from '../extension/src/background/shortcut-action-message.js';

test('shortcut action message stays scoped to content-script command dispatch', () => {
  const message = createShortcutActionMessage('download-save-as');

  assert.equal(isShortcutActionMessage(message), true);
  assert.equal(message.payload.action, 'download-save-as');
  assert.equal(isExtensionRequest(message), false);
});

test('shortcut action message rejects malformed command payloads', () => {
  const message = createShortcutActionMessage('next');

  assert.equal(isShortcutActionMessage({ ...message, payload: { action: 1 } }), false);
  assert.equal(isShortcutActionMessage({ ...message, version: 0 }), false);
});
