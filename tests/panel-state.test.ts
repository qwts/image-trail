import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState, setTargetState } from '../extension/src/core/state.js';

test('switching active fields clears a previous failed field marker', () => {
  const failed = { ...createInitialPanelState(), activeFieldId: 'query-src-0', failedFieldId: 'query-src-0' };

  const next = reducePanelAction(failed, { name: 'active-field/set', id: 'query-page-0' });

  assert.equal(next.activeFieldId, 'query-page-0');
  assert.equal(next.failedFieldId, null);
});

test('target changes clear failed field markers', () => {
  const failed = {
    ...createInitialPanelState(),
    failedFieldId: 'query-src-0',
    successfulFieldIds: ['query-src-0'],
    unchangedFieldIds: ['query-page-0'],
    unlockedFieldIds: ['query-src-0'],
    currentImageFingerprint: 'a'.repeat(64),
  };

  const next = setTargetState(failed, {
    mode: 'manual',
    picking: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    message: 'Target selected.',
  });

  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, []);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.equal(next.currentImageFingerprint, null);
});

test('same target load snapshots preserve learned field markers', () => {
  const learned = {
    ...createInitialPanelState(),
    target: {
      mode: 'manual' as const,
      picking: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/image-1.jpg',
      selectedHandleId: 'handle-1',
      selectedDimensions: '100 x 100',
      message: 'Target selected.',
    },
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: ['q:1:0'],
    unlockedFieldIds: ['q:0:0'],
    currentImageFingerprint: 'a'.repeat(64),
  };

  const next = setTargetState(learned, {
    mode: 'manual',
    picking: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image-2.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    message: 'Target loaded.',
  });

  assert.deepEqual(next.successfulFieldIds, ['q:0:0']);
  assert.deepEqual(next.unchangedFieldIds, ['q:1:0']);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0']);
  assert.equal(next.currentImageFingerprint, 'a'.repeat(64));
});

test('unlock toggle only changes successful fields', () => {
  const state = { ...createInitialPanelState(), successfulFieldIds: ['q:0:0'] };

  const unlocked = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(unlocked.unlockedFieldIds, ['q:0:0']);

  const locked = reducePanelAction(unlocked, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(locked.unlockedFieldIds, []);

  const ignored = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:1:0' });
  assert.deepEqual(ignored.unlockedFieldIds, []);
});
