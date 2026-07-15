import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../../extension/src/core/actions.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelAction, PanelDestinationId, PanelState, RecallCandidate } from '../../extension/src/core/types.js';
import { renderPanel, renderRecallDestination, type PanelLayoutState, type PanelRenderTarget } from '../../extension/src/ui/render.js';

const DESTINATIONS: readonly PanelDestinationId[] = ['dashboard', 'gallery', 'recall', 'settings'];

function layoutState(): PanelLayoutState {
  return {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    workspaceSections: new Map(),
    collapsibleListScrollTops: new Map(),
    primaryPanelScrollTop: null,
    destinationScrollTops: new Map(),
  };
}

function recallCandidate(id: string): RecallCandidate {
  return {
    id,
    url: `https://images.example.test/${id}.jpg`,
    timestamp: '2026-07-14T12:00:00.000Z',
    source: 'bookmark',
    envelopeCreatedAt: '2026-07-14T12:00:00.000Z',
  };
}

function createTarget(dispatch: (action: PanelAction) => void): PanelRenderTarget {
  const root = document.createElement('div');
  const detachedRoot = document.createElement('div');
  document.body.append(root, detachedRoot);
  return { root, detachedRoot, dispatch, layoutState: layoutState() };
}

function cleanupTarget(target: PanelRenderTarget): void {
  target.root.remove();
  target.detachedRoot?.remove();
}

test('all four routes render one active surface over the unchanged primary workflow', () => {
  const target = createTarget(() => {});
  try {
    for (const destination of DESTINATIONS) {
      const state = { ...createInitialPanelState(0), visible: true, activeDestination: destination };
      renderPanel(target, state);

      assert.equal(target.root.dataset['destination'], destination);
      assert.equal(target.root.querySelectorAll('.image-trail-panel__destination-surface').length, 1);
      assert.equal(target.root.querySelector('.image-trail-panel__destination-surface')?.getAttribute('data-destination'), destination);
      assert.equal(target.root.querySelector(`[data-image-trail-destination="${destination}"]`)?.getAttribute('aria-pressed'), 'true');
      assert.ok(target.root.querySelector('.image-trail-panel__target-utility'), 'primary Target remains mounted behind the route');
    }
  } finally {
    cleanupTarget(target);
  }
});

test('dock plain clicks select in-panel routes while modifier-click opens every real destination page', () => {
  const actions: PanelAction[] = [];
  const target = createTarget((action) => actions.push(action));
  try {
    renderPanel(target, { ...createInitialPanelState(0), visible: true });
    const dashboard = target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="dashboard"]');
    const gallery = target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="gallery"]');
    const recall = target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="recall"]');
    assert.ok(dashboard && gallery && recall);

    dashboard.click();
    gallery.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    recall.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));

    assert.deepEqual(actions, [
      { name: 'destination/select', destination: 'dashboard' },
      { name: 'destination/open-tab', destination: 'gallery' },
      { name: 'destination/open-tab', destination: 'recall' },
    ]);
  } finally {
    cleanupTarget(target);
  }
});

test('destination close restores dock focus and per-route scroll survives switches', async () => {
  let state: PanelState = { ...createInitialPanelState(0), visible: true };
  let render = (): void => {};
  const target = createTarget((action) => {
    state = reducePanelAction(state, action);
    render();
  });
  render = () => renderPanel(target, state);
  try {
    render();
    target.root.scrollTop = 54;
    target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="gallery"]')?.click();
    assert.equal(target.root.scrollTop, 0, 'a destination owns a zeroed panel scrollport');
    const galleryBody = target.root.querySelector<HTMLElement>('.image-trail-panel__destination-body[data-destination="gallery"]');
    assert.ok(galleryBody);
    galleryBody.scrollTop = 74;

    target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="dashboard"]')?.click();
    target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="gallery"]')?.click();
    await Promise.resolve();
    assert.equal(target.root.querySelector<HTMLElement>('.image-trail-panel__destination-body[data-destination="gallery"]')?.scrollTop, 74);

    target.root.querySelector<HTMLButtonElement>('.image-trail-panel__destination-close')?.click();
    await Promise.resolve();
    const galleryDock = target.root.querySelector<HTMLButtonElement>('[data-image-trail-destination="gallery"]');
    assert.equal(state.activeDestination, null);
    assert.equal(target.root.scrollTop, 54, 'closing restores the primary workflow scroll offset');
    assert.equal(document.activeElement, galleryDock);
  } finally {
    cleanupTarget(target);
  }
});

test('detached Settings renders once, with a route placeholder and one authoritative floating surface', () => {
  const target = createTarget(() => {});
  try {
    renderPanel(target, {
      ...createInitialPanelState(0),
      visible: true,
      activeDestination: 'settings',
      detachedSections: ['settings'],
    });

    assert.ok(target.root.querySelector('[data-image-trail-detached-placeholder="settings"]'));
    assert.equal(target.root.querySelectorAll('.image-trail-panel__settings-section').length, 0);
    assert.equal(target.detachedRoot?.querySelectorAll('.image-trail-panel__settings-section').length, 1);
  } finally {
    cleanupTarget(target);
  }
});

test('Recall targeted refresh preserves the route chrome and list scroll', async () => {
  const target = createTarget(() => {});
  try {
    const initial = {
      ...createInitialPanelState(0),
      visible: true,
      activeDestination: 'recall' as const,
      recall: {
        ...createInitialPanelState(0).recall,
        candidates: [recallCandidate('pin-1'), recallCandidate('pin-2')],
        total: 2,
        nextOffset: 2,
      },
    };
    renderPanel(target, initial);
    const header = target.root.querySelector('.image-trail-panel__destination-header');
    const list = target.root.querySelector<HTMLElement>('.image-trail-panel__recall-list');
    assert.ok(header && list);
    list.scrollTop = 38;

    const updated = reducePanelAction(initial, {
      name: 'recall/load-complete',
      candidates: [...initial.recall.candidates, recallCandidate('pin-3')],
      append: false,
      offset: 0,
      nextOffset: 3,
      hasMore: false,
      total: 3,
      failedCount: 0,
      message: 'Loaded 3 recall records.',
    });
    renderRecallDestination(target, updated);
    await Promise.resolve();

    assert.equal(target.root.querySelector('.image-trail-panel__destination-header'), header);
    assert.equal(target.root.querySelectorAll('.image-trail-panel__recall-list > li').length, 3);
    assert.equal(target.root.querySelector<HTMLElement>('.image-trail-panel__recall-list')?.scrollTop, 38);
  } finally {
    cleanupTarget(target);
  }
});
