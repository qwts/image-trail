import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_PROTOCOL_VERSION,
  MessageType,
  createPingMessage,
  createStatusMessage,
  createTogglePanelMessage,
  createUnknownMessageResponse,
  isExtensionRequest,
  isExtensionResponse,
  isStatusMessage,
} from '../extension/src/background/messages.js';

test('recognizes only versioned extension requests as requests', () => {
  assert.equal(isExtensionRequest(createTogglePanelMessage()), true);
  assert.equal(isExtensionRequest(createPingMessage()), true);
  assert.equal(isExtensionRequest(createStatusMessage(false, 'hidden')), false);
  assert.equal(isExtensionRequest({ type: MessageType.Ping, version: 0, payload: {} }), false);
  assert.equal(isExtensionRequest({ type: MessageType.Ping, version: MESSAGE_PROTOCOL_VERSION }), false);
});

test('recognizes status and unknown responses separately from requests', () => {
  const status = createStatusMessage(true, 'ready');
  const unknown = createUnknownMessageResponse('unsupported');

  assert.equal(isExtensionResponse(status), true);
  assert.equal(isExtensionResponse(unknown), true);
  assert.equal(isExtensionResponse(createPingMessage()), false);
  assert.equal(isStatusMessage(status), true);
  assert.equal(isStatusMessage(unknown), false);
  assert.equal(isStatusMessage({ ...status, payload: { panelVisible: 'yes', status: 'ready' } }), false);
});
