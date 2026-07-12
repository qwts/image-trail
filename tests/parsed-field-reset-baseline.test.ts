import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import {
  parsedFieldResetAllAvailable,
  parsedFieldResetBaselineFromState,
  parsedFieldStructureResetAvailable,
  parsedUrlStructuresEqual,
  resetParsedFieldStructureState,
} from '../extension/src/ui/panel/parsed-field-reset-baseline.js';

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

test('parsed URL structure ignores values but detects separators, query shape, and token kinds', () => {
  assert.equal(
    parsedUrlStructuresEqual(parseUrl('https://example.test/image-001?q=2'), parseUrl('https://example.test/image-999?q=7')),
    true,
  );
  assert.equal(
    parsedUrlStructuresEqual(parseUrl('https://example.test/image-001?q=2'), parseUrl('https://example.test/image/001?q=2')),
    false,
  );
  assert.equal(parsedUrlStructuresEqual(parseUrl('https://example.test/image?q=2'), parseUrl('https://example.test/image?q=word')), false);
  assert.equal(parsedUrlStructuresEqual(parseUrl('https://example.test/image?q=2'), parseUrl('https://example.test/image?other=2')), false);
});

test('Reset structure appears only after topology changes', () => {
  const state = stateWithBaseline('https://example.test/image?q=2');
  assert.equal(parsedFieldStructureResetAvailable(state, 'https://example.test/image?q=7'), false);
  assert.equal(parsedFieldStructureResetAvailable(state, 'https://example.test/image?q='), true);
});

test('structure reset preserves valid current settings and keeps the baseline', () => {
  const baselineUrl = 'https://example.test/image?q=12';
  const state = stateWithBaseline(baselineUrl, {
    activeFieldId: 'q:0:0',
    unlockedFieldIds: ['q:0:0', 'missing'],
    manuallyExcludedFieldIds: ['missing'],
    fieldDigitWidthSpecs: [
      { fieldId: 'q:0:0', width: 3, sourceWidth: undefined },
      { fieldId: 'missing', width: 2, sourceWidth: undefined },
    ],
  });
  const result = resetParsedFieldStructureState(state, state.parsedFieldResetBaseline!);
  assert.equal(result.activeFieldId, 'q:0:0');
  assert.deepEqual(result.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(result.manuallyExcludedFieldIds, []);
  assert.deepEqual(
    result.fieldDigitWidthSpecs.map((spec) => spec.fieldId),
    ['q:0:0'],
  );
  assert.equal(result.parsedFieldResetBaseline, state.parsedFieldResetBaseline);
});
