import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../../extension/src/core/actions.js';
import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createHelpView } from '../../extension/src/ui/components/help-view.js';

// The in-panel Help surface (#352): shared shortcut registry + static feature guide.

test('help/toggle flips helpOpen on and off', () => {
  const initial = createInitialPanelState(0);
  assert.equal(initial.helpOpen, false);
  const opened = reducePanelAction(initial, { name: 'help/toggle' });
  assert.equal(opened.helpOpen, true);
  const closed = reducePanelAction(opened, { name: 'help/toggle' });
  assert.equal(closed.helpOpen, false);
});

test('opening Help closes Settings so destinations replace each other', () => {
  const state = { ...createInitialPanelState(0), activeDestination: 'settings' as const };
  const opened = reducePanelAction(state, { name: 'help/toggle' });

  assert.equal(opened.helpOpen, true);
  assert.equal(opened.activeDestination, null);
});

test('the Help view renders the grouped handoff shortcut reference and browser-command split', () => {
  const view = createHelpView();
  assert.ok(view.classList.contains('image-trail-ds__help'));
  assert.ok(view.classList.contains('image-trail-ds__settings-surface'));
  assert.ok(view.querySelector('.image-trail-ds__section-header'));
  const headings = [...view.querySelectorAll('h5')].map((heading) => heading.textContent);
  assert.deepEqual(headings, ['Trail navigation', 'Capture', 'Panel']);
  // The rows come from the same registry the keyboard router uses — kbd chips must render.
  assert.ok(view.querySelectorAll('kbd').length > 0, 'shortcut key chips render');
  assert.equal(view.querySelectorAll('kbd').length, view.querySelectorAll('.image-trail-ds__kbd').length);
  const text = view.textContent ?? '';
  assert.ok(text.includes("Capture the current image's original"), 'shortcut labels come from the shared registry');
  assert.ok(text.includes('Step to the previous / next image in the trail'), 'paired arrows use the handoff presentation');
  assert.ok(text.includes('are browser commands you rebind'), 'browser commands are distinguished');
  assert.ok(text.includes('Settings › Automation'), 'Down assignment location is accurate');
});

test('Help content is static and privacy-inert — no URLs or record values can leak through it', () => {
  const view = createHelpView();
  const text = view.textContent ?? '';
  assert.ok(!/https?:\/\//u.test(text), 'no URL values appear in Help copy');
  assert.ok(!text.includes('blob:'), 'no blob references appear in Help copy');
});
