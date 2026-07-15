import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { renderPanel, type PanelLayoutState } from '../../extension/src/ui/render.js';

test('attached workflow follows the handoff order from Host target through Controls', () => {
  const root = document.createElement('div');
  const layoutState: PanelLayoutState = {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    workspaceSections: new Map(),
    collapsibleListScrollTops: new Map(),
    primaryPanelScrollTop: null,
    destinationScrollTops: new Map(),
  };
  renderPanel({ root, dispatch: () => {}, layoutState }, { ...createInitialPanelState(0), visible: true, status: 'ready' });
  const classes = Array.from(root.querySelectorAll<HTMLElement>(':scope > .image-trail-panel__section')).map(
    (section) => section.className,
  );
  const positions = ['target-utility', 'url-editor', 'fields', 'secondary-controls'].map((name) =>
    classes.findIndex((className) => className.includes(`image-trail-panel__${name}`)),
  );
  assert.deepEqual(
    positions,
    [...positions].sort((left, right) => left - right),
  );
  assert.ok(positions.every((position) => position >= 0));

  const targetSummary = root.querySelector<HTMLElement>('.image-trail-panel__target-summary');
  assert.equal(targetSummary?.lastElementChild?.matches('[data-image-trail-detach="target"]'), true);
  const controls = root.querySelector<HTMLElement>('.image-trail-panel__secondary-controls');
  const controlsHeader = controls?.querySelector<HTMLElement>(':scope > .image-trail-panel__section-header');
  assert.equal(controlsHeader?.lastElementChild?.matches('[data-image-trail-detach="controls"]'), true);
  assert.equal(controls?.querySelector('.image-trail-panel__secondary-controls-summary [data-image-trail-detach]'), null);
});
