import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';

const REQUEST = {
  url: 'https://cdn.example.test/image.jpg',
  sourceType: 'history' as const,
  sourceRecordId: 'recent-1',
};

test('capture retry context survives permission denial and clears on dismissal', () => {
  let state = reducePanelAction(createInitialPanelState(0), { name: 'capture/start', request: REQUEST });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: {
      status: 'remote-only',
      reason: 'permission-needed',
      message: 'Permission needed.',
      origin: 'https://cdn.example.test',
    },
  });
  assert.deepEqual(state.captureRetryRequest, REQUEST);

  state = reducePanelAction(state, { name: 'capture/clear' });
  assert.equal(state.captureResult, null);
  assert.equal(state.captureRetryRequest, null);
});

test('capture retry context clears for non-permission and successful results', () => {
  let state = reducePanelAction(createInitialPanelState(0), { name: 'capture/start', request: REQUEST });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'failed', reason: 'network-error', message: 'Network down.' },
  });
  assert.equal(state.captureRetryRequest, null);

  state = reducePanelAction(state, { name: 'capture/start', request: REQUEST });
  state = reducePanelAction(state, {
    name: 'capture/complete',
    result: { status: 'captured', blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 1024 },
  });
  assert.equal(state.captureRetryRequest, null);
});
