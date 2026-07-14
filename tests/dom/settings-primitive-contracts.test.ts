import test from 'node:test';
import assert from 'node:assert/strict';

import { applySettingsPrimitiveContracts } from '../../extension/src/ui/components/settings-primitive-contracts.js';

test('Settings contracts preserve native controls while applying shared primitive semantics', () => {
  const root = document.createElement('section');
  root.innerHTML = `
    <button class="image-trail-panel__primary-action">Save</button>
    <button class="is-danger">Delete</button>
    <button class="is-waiting">Working</button>
    <input type="text" value="kept">
    <input type="file">
    <label class="image-trail-panel__settings-checkbox"><input type="checkbox">Enabled</label>
    <select><option>One</option></select>
  `;

  const controls = [...root.querySelectorAll('button, input, select')];
  applySettingsPrimitiveContracts(root);

  assert.ok(root.classList.contains('image-trail-ds__settings-surface'));
  assert.deepEqual(
    [...root.querySelectorAll('button')].map((button) => button.dataset['variant']),
    ['primary', 'danger', 'ghost'],
  );
  assert.equal(root.querySelector('.is-waiting')?.getAttribute('aria-busy'), 'true');
  assert.ok(root.querySelector('input[type="text"]')?.classList.contains('image-trail-ds__input'));
  assert.ok(!root.querySelector('input[type="file"]')?.classList.contains('image-trail-ds__input'));
  assert.ok(root.querySelector('select')?.classList.contains('image-trail-ds__select'));
  assert.ok(root.querySelector('label')?.classList.contains('image-trail-ds__toggle'));
  assert.deepEqual([...root.querySelectorAll('button, input, select')], controls, 'stateful native controls are not replaced');
});

test('Settings contracts map provider integrations onto shared status semantics', () => {
  const root = document.createElement('section');
  root.innerHTML = `
    <details class="image-trail-panel__settings-utility-section"></details>
    <span class="image-trail-panel__cloud-provider-status is-busy">Connecting</span>
  `;

  applySettingsPrimitiveContracts(root);

  assert.ok(root.querySelector('details')?.classList.contains('image-trail-ds__settings-integration'));
  const status = root.querySelector<HTMLElement>('.image-trail-panel__cloud-provider-status');
  assert.ok(status?.classList.contains('image-trail-ds__status-pill'));
  assert.equal(status?.dataset['tone'], 'busy');
  assert.equal(status?.getAttribute('aria-busy'), 'true');
});
