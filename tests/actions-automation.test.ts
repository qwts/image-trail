import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';

test('slideshow-start sets slideshowPhase to running', () => {
  const state = createInitialPanelState();
  const next = reducePanelAction(state, { name: 'slideshow-start' });
  assert.equal(next.automation.slideshowPhase, 'running');
  assert.equal(next.automation.slideshowCount, 0);
});

test('slideshow-pause sets slideshowPhase to paused', () => {
  let state = createInitialPanelState();
  state = reducePanelAction(state, { name: 'slideshow-start' });
  const next = reducePanelAction(state, { name: 'slideshow-pause' });
  assert.equal(next.automation.slideshowPhase, 'paused');
});

test('slideshow-resume sets slideshowPhase to running', () => {
  let state = createInitialPanelState();
  state = reducePanelAction(state, { name: 'slideshow-start' });
  state = reducePanelAction(state, { name: 'slideshow-pause' });
  const next = reducePanelAction(state, { name: 'slideshow-resume' });
  assert.equal(next.automation.slideshowPhase, 'running');
});

test('slideshow-stop sets slideshowPhase to stopped', () => {
  let state = createInitialPanelState();
  state = reducePanelAction(state, { name: 'slideshow-start' });
  const next = reducePanelAction(state, { name: 'slideshow-stop' });
  assert.equal(next.automation.slideshowPhase, 'stopped');
});

test('retry-start sets retryPhase to running', () => {
  const state = createInitialPanelState();
  const next = reducePanelAction(state, { name: 'retry-start' });
  assert.equal(next.automation.retryPhase, 'running');
  assert.equal(next.automation.retriesUsed, 0);
});

test('retry-stop sets retryPhase to stopped', () => {
  let state = createInitialPanelState();
  state = reducePanelAction(state, { name: 'retry-start' });
  const next = reducePanelAction(state, { name: 'retry-stop' });
  assert.equal(next.automation.retryPhase, 'stopped');
});

test('stop-all resets all automation state', () => {
  let state = createInitialPanelState();
  state = reducePanelAction(state, { name: 'slideshow-start' });
  state = reducePanelAction(state, { name: 'retry-start' });
  const next = reducePanelAction(state, { name: 'stop-all' });
  assert.equal(next.automation.slideshowPhase, 'idle');
  assert.equal(next.automation.retryPhase, 'idle');
  assert.equal(next.automation.slideshowCount, 0);
  assert.equal(next.automation.retriesUsed, 0);
});

test('navigate-next and navigate-previous are no-ops in reducer', () => {
  const state = createInitialPanelState();
  const next1 = reducePanelAction(state, { name: 'navigate-next' });
  const next2 = reducePanelAction(state, { name: 'navigate-previous' });
  assert.equal(next1, state);
  assert.equal(next2, state);
});
