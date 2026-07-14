import test from 'node:test';
import assert from 'node:assert/strict';
import { PANEL_ACTION_DOMAINS, reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelAction, PanelActionName } from '../extension/src/core/types.js';

type UnroutedPanelActionName = Exclude<PanelActionName | PanelAction['name'], keyof typeof PANEL_ACTION_DOMAINS>;
const unroutedPanelActionNames: readonly UnroutedPanelActionName[] = [];

test('panel action domain registry assigns every action name to one known domain', () => {
  assert.deepEqual(unroutedPanelActionNames, []);
  assert.deepEqual(new Set(Object.values(PANEL_ACTION_DOMAINS)), new Set(['parsed-fields', 'queue-recents', 'settings', 'panel-session']));
  assert.equal(new Set(Object.keys(PANEL_ACTION_DOMAINS)).size, Object.keys(PANEL_ACTION_DOMAINS).length);
});

test('panel action dispatcher reaches each reducer domain', () => {
  const initial = createInitialPanelState();

  const parsedFields = reducePanelAction(initial, { name: 'active-field/set', id: 'q:0:0' });
  assert.equal(parsedFields.activeFieldId, 'q:0:0');

  const queueRecents = reducePanelAction({ ...initial, selectedHistoryIds: ['recent-1'] }, { name: 'history-selection/clear' });
  assert.deepEqual(queueRecents.selectedHistoryIds, []);

  const settings = reducePanelAction(initial, { name: 'settings/toggle' });
  assert.equal(settings.activeDestination, 'settings');

  const panelSession = reducePanelAction(initial, { name: 'panel/minimize' });
  assert.equal(panelSession.minimized, true);
});

test('intentional command-only actions preserve the state reference', () => {
  const state = createInitialPanelState();

  assert.equal(reducePanelAction(state, { name: 'history/load' }), state);
  assert.equal(reducePanelAction(state, { name: 'target/release' }), state);
  assert.equal(reducePanelAction(state, { name: 'settings/reset-panel-position' }), state);
  assert.equal(reducePanelAction(state, { name: 'field/commit-rejected' }), state);
});
