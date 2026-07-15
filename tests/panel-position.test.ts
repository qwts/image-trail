import test from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelPosition, clampPanelPositionWithinInsets } from '../extension/src/ui/panel-position.js';

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

test('rail insets clamp the panel into the remaining extension-owned corridor', () => {
  assert.deepEqual(
    clampPanelPositionWithinInsets(
      { left: 12, top: 12 },
      { width: 420, height: 524 },
      { width: 1280, height: 800 },
      { left: 368, right: 12, top: 264, bottom: 12 },
    ),
    { left: 368, top: 264 },
  );
});
