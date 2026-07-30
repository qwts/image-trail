import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../extension/src/core/types.js';
import { dispatchPanelAction } from '../extension/src/ui/panel/action-dispatch.js';
import type { PanelActionDeps } from '../extension/src/ui/panel/actions/deps.js';
import { buildRecallActionEntries } from '../extension/src/ui/panel/actions/recall-actions.js';

test('Recall-local actions reduce then refresh only the Recall destination', () => {
  const log: string[] = [];
  const deps = {
    reduce: () => log.push('reduce'),
    render: () => log.push('render'),
    renderRecallOnly: () => log.push('renderRecallOnly'),
  } as unknown as PanelActionDeps;
  const registry = buildRecallActionEntries(deps);
  const actions: readonly PanelAction[] = [
    { name: 'recall-selection/toggle', id: 'recall-1' },
    { name: 'recall-selection/select', ids: ['recall-1'] },
    { name: 'recall-selection/clear' },
    { name: 'recall/clear-results' },
  ];

  for (const action of actions) {
    dispatchPanelAction(registry, action, () => assert.fail('unexpected fallback'));
  }

  assert.deepEqual(log, [
    'reduce',
    'renderRecallOnly',
    'reduce',
    'renderRecallOnly',
    'reduce',
    'renderRecallOnly',
    'reduce',
    'renderRecallOnly',
  ]);
});
