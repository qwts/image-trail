import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelPosition } from '../extension/src/ui/panel-position.js';

test('clampPanelPosition keeps restored panel coordinates onscreen', () => {
  assert.deepEqual(clampPanelPosition({ left: 900, top: -40 }, { width: 300, height: 200 }, { width: 1024, height: 768 }), {
    left: 712,
    top: 12,
  });
});

test('clampPanelPosition handles panels wider than the viewport', () => {
  assert.deepEqual(clampPanelPosition({ left: 400, top: 400 }, { width: 600, height: 500 }, { width: 320, height: 480 }), {
    left: 0,
    top: 0,
  });
});
