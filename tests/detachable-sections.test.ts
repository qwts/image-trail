import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';

test('section/detach adds the section to detachedSections', () => {
  const state = createInitialPanelState(0);

  const next = reducePanelAction(state, { name: 'section/detach', sectionId: 'history' });

  assert.deepEqual(next.detachedSections, ['history']);
});

test('section/detach is idempotent for an already detached section', () => {
  const detached = reducePanelAction(createInitialPanelState(0), { name: 'section/detach', sectionId: 'history' });

  const next = reducePanelAction(detached, { name: 'section/detach', sectionId: 'history' });

  assert.equal(next, detached, 'a repeat detach must return the same state object');
});

test('section/restore removes the section from detachedSections', () => {
  const detached = reducePanelAction(createInitialPanelState(0), { name: 'section/detach', sectionId: 'history' });

  const next = reducePanelAction(detached, { name: 'section/restore', sectionId: 'history' });

  assert.deepEqual(next.detachedSections, []);
});

test('section/restore is a no-op when the section is not detached', () => {
  const state = createInitialPanelState(0);

  const next = reducePanelAction(state, { name: 'section/restore', sectionId: 'history' });

  assert.equal(next, state, 'restoring an attached section must return the same state object');
});
