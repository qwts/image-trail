import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelDestinationId } from '../extension/src/core/types.js';
import { availablePanelDestinations, PANEL_DESTINATIONS, panelDestination } from '../extension/src/ui/destination-registry.js';

const DESTINATIONS: readonly PanelDestinationId[] = ['dashboard', 'gallery', 'recall', 'settings'];

test('destination registry defines every route once in handoff order', () => {
  const state = createInitialPanelState(0);
  assert.deepEqual(
    PANEL_DESTINATIONS.map((destination) => destination.id),
    DESTINATIONS,
  );
  assert.deepEqual(
    availablePanelDestinations(state).map((destination) => destination.id),
    DESTINATIONS,
  );
  assert.equal(new Set(PANEL_DESTINATIONS.map((destination) => destination.id)).size, DESTINATIONS.length);
  for (const destination of PANEL_DESTINATIONS) {
    assert.ok(destination.label);
    assert.ok(destination.description);
    assert.deepEqual(destination.activationAction(), { name: 'destination/select', destination: destination.id });
  }
});

test('only the existing independent Gallery page is open-in-tab eligible before issue #518', () => {
  assert.deepEqual(
    PANEL_DESTINATIONS.filter((destination) => destination.openInTabAction).map((destination) => destination.id),
    ['gallery'],
  );
  assert.deepEqual(panelDestination('gallery').openInTabAction?.(), { name: 'gallery/open' });
});

test('destination selection has one serializable source of truth and reselect closes it', () => {
  let state = createInitialPanelState(0);
  for (const destination of DESTINATIONS) {
    state = reducePanelAction(state, { name: 'destination/select', destination });
    assert.equal(state.activeDestination, destination);
    state = reducePanelAction(state, { name: 'destination/select', destination });
    assert.equal(state.activeDestination, null);
  }
});

test('destination transitions preserve primary workflow and Recall selection until the route closes', () => {
  const initial = {
    ...createInitialPanelState(0),
    draftUrl: 'https://example.test/working.jpg',
    activeDestination: 'recall' as const,
    recall: { ...createInitialPanelState(0).recall, selectedIds: ['offscreen-pin'] },
  };

  const gallery = reducePanelAction(initial, { name: 'destination/select', destination: 'gallery' });
  assert.equal(gallery.activeDestination, 'gallery');
  assert.equal(gallery.draftUrl, initial.draftUrl);
  assert.deepEqual(gallery.recall.selectedIds, ['offscreen-pin']);

  const recall = reducePanelAction(gallery, { name: 'destination/select', destination: 'recall' });
  const closedRecall = reducePanelAction(recall, { name: 'destination/select', destination: 'recall' });
  assert.equal(closedRecall.activeDestination, null);
  assert.deepEqual(closedRecall.recall.selectedIds, []);

  const minimized = reducePanelAction(gallery, { name: 'panel/minimize' });
  assert.equal(minimized.activeDestination, 'gallery');

  const closed = reducePanelAction(minimized, { name: 'close-panel' });
  assert.equal(closed.activeDestination, null);
  assert.equal(closed.visible, false);
});

test('Help and Settings share the route replacement contract', () => {
  const dashboard = reducePanelAction(createInitialPanelState(0), {
    name: 'destination/select',
    destination: 'dashboard',
  });
  const help = reducePanelAction(dashboard, { name: 'help/toggle' });
  assert.equal(help.helpOpen, true);
  assert.equal(help.activeDestination, null);

  const settings = reducePanelAction(help, { name: 'settings/toggle' });
  assert.equal(settings.helpOpen, false);
  assert.equal(settings.activeDestination, 'settings');
});
