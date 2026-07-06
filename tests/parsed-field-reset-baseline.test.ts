import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { parsedFieldResetAllAvailable, parsedFieldResetBaselineFromState } from '../extension/src/ui/panel/parsed-field-reset-baseline.js';

const SOURCE_URL = 'https://images.example.test/gallery/photo-001.jpg';

function stateWithBaseline(sourceUrl: string, overrides: Partial<PanelState> = {}): PanelState {
  const base = { ...createInitialPanelState(), ...overrides };
  return { ...base, parsedFieldResetBaseline: parsedFieldResetBaselineFromState(base, sourceUrl) };
}

test('Reset all is unavailable without a baseline or when nothing changed since it', () => {
  assert.equal(parsedFieldResetAllAvailable(createInitialPanelState(), SOURCE_URL), false);
  assert.equal(parsedFieldResetAllAvailable(stateWithBaseline(SOURCE_URL), SOURCE_URL), false);
});

test('Reset all stays hidden for a relative-vs-absolute variant of the same image URL', () => {
  // The restore path compares resolved image URLs (`imageResourceUrlsEqual`); a raw string compare
  // here made a restored baseline look "navigated away" and showed Reset all with nothing changed.
  const state = stateWithBaseline(SOURCE_URL);
  const previousLocation = globalThis.location;
  Object.defineProperty(globalThis, 'location', {
    value: { href: 'https://images.example.test/gallery/' },
    configurable: true,
  });
  try {
    assert.equal(parsedFieldResetAllAvailable(state, 'photo-001.jpg'), false);
    assert.equal(parsedFieldResetAllAvailable(state, '/gallery/photo-001.jpg'), false);
  } finally {
    if (previousLocation === undefined) delete (globalThis as { location?: unknown }).location;
    else Object.defineProperty(globalThis, 'location', { value: previousLocation, configurable: true });
  }
});

test('Reset all appears after navigating to a different image or changing field state', () => {
  const navigated = stateWithBaseline(SOURCE_URL);
  assert.equal(parsedFieldResetAllAvailable(navigated, 'https://images.example.test/gallery/photo-002.jpg'), true);

  const edited = stateWithBaseline(SOURCE_URL);
  assert.equal(parsedFieldResetAllAvailable({ ...edited, unlockedFieldIds: ['p:2:0'] }, SOURCE_URL), true);
});
