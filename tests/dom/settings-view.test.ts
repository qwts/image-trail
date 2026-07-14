import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../../extension/src/core/types.js';
import { createSettingsView } from '../../extension/src/ui/components/settings-view.js';

function build(utilityChildren: readonly HTMLElement[] = [], actions: PanelAction[] = []): HTMLElement {
  return createSettingsView(
    30,
    { limit: 2, retainedLimit: 3, overflowBehavior: 'keep-session', sparseRowDisplayMode: 'adaptive' },
    false,
    { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' },
    [],
    [],
    null,
    [],
    { pinSaveStoragePreference: 'encrypted', blobKeyUnlocked: false, blobKeyAvailable: false },
    { visibleQueueCount: 0, recallCount: 0, busy: false },
    null,
    { identity: null, overlayVisible: true },
    { limit: 5_000, clearAfterExport: false },
    { minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 },
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' },
    'capture',
    false,
    { privacy: [], utilities: utilityChildren },
    (action) => actions.push(action),
  );
}

test('settings orchestrator preserves group and section order', () => {
  const view = build();
  assert.ok(view.classList.contains('image-trail-ds__settings'));
  assert.ok(view.classList.contains('image-trail-ds__settings-surface'));
  assert.equal(view.querySelectorAll(':scope > .image-trail-ds__settings-group').length, 5);
  assert.equal(view.querySelectorAll(':scope > details .image-trail-ds__settings-group-header').length, 5);
  assert.ok(view.querySelectorAll('.image-trail-ds__input, .image-trail-ds__select, .image-trail-ds__toggle').length > 0);
  assert.deepEqual(
    Array.from(view.querySelectorAll(':scope > details > summary h4')).map((heading) => heading.textContent),
    ['Display', 'Privacy', 'Automation', 'Utilities', 'System'],
  );
  assert.deepEqual(
    Array.from(view.querySelectorAll(':scope > details')).map((group) =>
      Array.from(group.querySelectorAll(':scope > .image-trail-panel__settings-utility-body > div > h4')).map(
        (heading) => heading.textContent,
      ),
    ),
    [
      ['Pins', 'Recents'],
      ['Private pins', 'Privacy', 'Searchable metadata'],
      ['Keybindings', 'Request throttle', 'Preload', 'URL review status', 'Stepping presets', 'URL templates', 'Grab patterns'],
      [],
      ['Panel layout', 'Build identity', 'Storage health', 'Delete pins'],
    ],
  );
  assert.equal(view.querySelector<HTMLSelectElement>('[aria-label="Down arrow action"]')?.value, 'capture');
});

test('Automation persists the assignable Down arrow through the named settings action', () => {
  const actions: PanelAction[] = [];
  const view = build([], actions);
  const select = view.querySelector<HTMLSelectElement>('[aria-label="Down arrow action"]');
  assert.ok(select);
  select.value = 'download';
  select.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'settings/update-down-arrow-action', value: 'download' }]);
});

test('settings group open state survives a reconstructed view', () => {
  const view = build();
  const automation = Array.from(view.querySelectorAll<HTMLDetailsElement>(':scope > details')).find((group) =>
    group.querySelector('summary')?.textContent?.includes('Automation'),
  );
  assert.ok(automation);
  automation.open = true;
  automation.dispatchEvent(new Event('toggle'));
  const rebuilt = build();
  const rebuiltAutomation = Array.from(rebuilt.querySelectorAll<HTMLDetailsElement>(':scope > details')).find((group) =>
    group.querySelector('summary')?.textContent?.includes('Automation'),
  );
  assert.equal(rebuiltAutomation?.open, true);
  automation.open = false;
  automation.dispatchEvent(new Event('toggle'));
});

test('utility children remain inside the Utilities group and use the shared dispatch', () => {
  const utility = document.createElement('details');
  utility.dataset['testUtility'] = 'true';
  const actions: PanelAction[] = [];
  const view = build([utility], actions);
  const utilities = Array.from(view.querySelectorAll<HTMLDetailsElement>(':scope > details')).find((group) =>
    group.querySelector('summary')?.textContent?.includes('Utilities'),
  );
  assert.equal(utilities?.querySelector(':scope > .image-trail-panel__settings-utility-body')?.lastElementChild, utility);
  const privacy = Array.from(view.querySelectorAll('label')).find((label) => label.textContent?.includes('Privacy mode'));
  const input = privacy?.querySelector('input');
  assert.ok(input);
  input.checked = true;
  input.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'settings/update-privacy-mode', enabled: true }]);
});
