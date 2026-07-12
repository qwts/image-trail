import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../../extension/src/core/types.js';
import { defaultGrabStrategy } from '../../extension/src/core/url/grab-strategies.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../../extension/src/core/url/tokenize-fields.js';
import { createGrabSourcePattern, createUrlTemplateRecord } from '../../extension/src/core/url/templates.js';
import {
  createGrabSourcePatternSettingsView,
  createTemplateSettingsView,
} from '../../extension/src/ui/components/url-learning-settings-view.js';

const model = parseUrl('https://images.example.test/albums/1024/photo_0042.jpg');
const fields = collectUrlFields(model);
const template = createUrlTemplateRecord({ model, fields, includedFieldIds: [fields[0]!.id], now: '2026-07-12T12:00:00.000Z' });
assert.ok(template);

test('URL learning empty states retain their labels', () => {
  assert.match(createTemplateSettingsView([], null, [], () => {}).textContent ?? '', /No learned templates/);
  assert.match(createGrabSourcePatternSettingsView([], () => {}).textContent ?? '', /Cmd-click an image or link/);
});

test('active template controls preserve order and dispatch setting and removal actions once', () => {
  const actions: PanelAction[] = [];
  const view = createTemplateSettingsView([template], template.id, fields, (action) => actions.push(action));
  const item = view.querySelector('li');
  assert.ok(item);
  assert.ok(item.classList.contains('is-active'));
  assert.match(item.textContent ?? '', /Exact page shape/);
  assert.match(item.textContent ?? '', /active/);
  const controls = item.querySelector('.image-trail-panel__settings-template-controls');
  assert.ok(controls);
  assert.deepEqual(
    Array.from(controls.children).map((child) => child.textContent?.trim()),
    ['MatchExact page shapeSame path/query shapeBroad site match', 'Auto-apply', 'Hide excluded fields', 'Clear'],
  );
  const match = controls.querySelector('select');
  assert.ok(match);
  match.value = 'broad-site';
  match.dispatchEvent(new Event('change'));
  const checkboxes = controls.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  checkboxes[0]!.checked = false;
  checkboxes[0]!.dispatchEvent(new Event('change'));
  controls.querySelector<HTMLButtonElement>('button')!.click();
  assert.deepEqual(actions, [
    { name: 'url-template/update-settings', id: template.id, matchMode: 'broad-site' },
    { name: 'url-template/update-settings', id: template.id, autoApplyEnabled: false },
    { name: 'url-template/remove', id: template.id },
  ]);
});

test('active template field selection dispatches all checked numeric field ids in DOM order', () => {
  const actions: PanelAction[] = [];
  const view = createTemplateSettingsView([template], template.id, fields, (action) => actions.push(action));
  const fieldControls = Array.from(view.querySelectorAll<HTMLElement>('.image-trail-panel__settings-template-fields')).at(-1);
  assert.ok(fieldControls);
  const checkboxes = fieldControls.querySelectorAll<HTMLInputElement>('input[data-template-field-id]');
  assert.ok(checkboxes.length >= 2);
  checkboxes[1]!.checked = true;
  checkboxes[1]!.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [
    {
      name: 'url-template/update-fields',
      id: template.id,
      includedFieldIds: Array.from(checkboxes)
        .filter((input) => input.checked)
        .map((input) => input.dataset['templateFieldId']),
    },
  ]);
});

test('template linked-page extractors parse on change', () => {
  const actions: PanelAction[] = [];
  const linkedGrabStrategy = defaultGrabStrategy('linked-page-image');
  assert.equal(linkedGrabStrategy.kind, 'linked-page-image');
  const linked = {
    ...template,
    grabStrategy: {
      ...linkedGrabStrategy,
      extractors: [{ kind: 'selector-attribute' as const, selector: 'img.hero', attribute: 'src' }],
    },
  };
  const view = createTemplateSettingsView([linked], linked.id, fields, (action) => actions.push(action));
  const textarea = view.querySelector('textarea');
  assert.ok(textarea);
  textarea.value = 'meta[property="og:image"]@content';
  textarea.dispatchEvent(new Event('change'));
  assert.equal(actions[0]?.name, 'url-template/update-settings');
  assert.deepEqual((actions[0] as Extract<PanelAction, { name: 'url-template/update-settings' }>).grabStrategy, {
    kind: 'linked-page-image',
    extractors: [{ selector: 'meta[property="og:image"]', attribute: 'content' }],
    timeoutMs: 5_000,
    maxBytes: 1_048_576,
  });
});

test('grab pattern controls dispatch match, strategy, extractor, and removal actions', () => {
  const actions: PanelAction[] = [];
  const linkedGrabStrategy = defaultGrabStrategy('linked-page-image');
  assert.equal(linkedGrabStrategy.kind, 'linked-page-image');
  const pattern = {
    ...createGrabSourcePattern({ model, now: '2026-07-12T12:00:00.000Z' }),
    grabStrategy: {
      ...linkedGrabStrategy,
      extractors: [{ kind: 'selector-attribute' as const, selector: 'img', attribute: 'src' }],
    },
  };
  const view = createGrabSourcePatternSettingsView([pattern], (action) => actions.push(action));
  const selects = view.querySelectorAll<HTMLSelectElement>('select');
  selects[0]!.value = 'same-path-query-shape';
  selects[0]!.dispatchEvent(new Event('change'));
  selects[1]!.value = 'clicked-image';
  selects[1]!.dispatchEvent(new Event('change'));
  const textarea = view.querySelector('textarea');
  assert.ok(textarea);
  textarea.value = 'img.thumb::data-src';
  textarea.dispatchEvent(new Event('change'));
  view.querySelector<HTMLButtonElement>('button')!.click();
  assert.deepEqual(
    actions.map((action) => action.name),
    [
      'grab-source-pattern/update-settings',
      'grab-source-pattern/update-settings',
      'grab-source-pattern/update-settings',
      'grab-source-pattern/remove',
    ],
  );
});
