import test from 'node:test';
import assert from 'node:assert/strict';

import { createFilePickerField } from '../../extension/src/ui/components/form-controls.js';

test.afterEach(() => {
  document.body.replaceChildren();
});

test('file chooser activation restores ancestor scroll after focus and selection', async () => {
  const scrollContainer = document.createElement('div');
  const { field, input } = createFilePickerField({
    label: 'Key backup file',
    description: 'Choose a key backup.',
    buttonText: 'Choose key backup',
    noFileText: 'No key backup selected',
    accept: '.json,application/json',
  });
  scrollContainer.append(field);
  document.body.append(scrollContainer);

  const buttonLabel = field.querySelector<HTMLLabelElement>('.image-trail-panel__file-picker-button');
  assert.ok(buttonLabel);
  scrollContainer.scrollTop = 180;
  scrollContainer.scrollLeft = 12;
  buttonLabel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

  scrollContainer.scrollTop = 640;
  scrollContainer.scrollLeft = 44;
  input.dispatchEvent(new FocusEvent('focus'));
  assert.equal(scrollContainer.scrollTop, 180);
  assert.equal(scrollContainer.scrollLeft, 12);

  scrollContainer.scrollTop = 720;
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['{}'], 'image-trail-key-backup.json', { type: 'application/json' })],
  });
  input.dispatchEvent(new Event('change'));
  await Promise.resolve();
  assert.equal(scrollContainer.scrollTop, 180);
  assert.equal(scrollContainer.scrollLeft, 12);
  assert.equal(field.querySelector('.image-trail-panel__file-picker-name')?.textContent, 'image-trail-key-backup.json');
});

test('file chooser cancellation restores the pre-activation scroll position', async () => {
  const scrollContainer = document.createElement('div');
  const { field, input } = createFilePickerField({
    label: 'Key backup file',
    description: 'Choose a key backup.',
    buttonText: 'Choose key backup',
    noFileText: 'No key backup selected',
    accept: '.json,application/json',
  });
  scrollContainer.append(field);
  document.body.append(scrollContainer);

  const buttonLabel = field.querySelector<HTMLLabelElement>('.image-trail-panel__file-picker-button');
  assert.ok(buttonLabel);
  scrollContainer.scrollTop = 96;
  buttonLabel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  scrollContainer.scrollTop = 500;
  input.dispatchEvent(new Event('cancel'));
  await Promise.resolve();

  assert.equal(scrollContainer.scrollTop, 96);
});
