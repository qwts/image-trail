import test from 'node:test';
import assert from 'node:assert/strict';
import { createFilePickerField, createPasswordField } from '../extension/src/ui/components/form-controls.js';

class FakeElement {
  id = '';
  className = '';
  textContent: string | null = '';
  type = '';
  placeholder = '';
  autocomplete = '';
  disabled = false;
  accept = '';
  multiple = false;
  htmlFor = '';
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, EventListenerOrEventListenerObject>();

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, listener);
  }
}

const originalDocument = globalThis.document;

test.beforeEach(() => {
  globalThis.document = {
    createElement: (tagName: string) => new FakeElement(tagName),
  } as unknown as Document;
});

test.afterEach(() => {
  globalThis.document = originalDocument;
});

test('password fields connect a visible label and description to the input', () => {
  const { field, input } = createPasswordField({
    label: 'Encrypted export password',
    description: 'Protects exported records.',
    placeholder: 'Export password',
    autocomplete: 'new-password',
  });
  const fakeField = field as unknown as FakeElement;
  const fakeInput = input as unknown as FakeElement;
  const label = fakeField.children[0]!;
  const description = fakeField.children[2]!;

  assert.equal(label.tagName, 'label');
  assert.equal(label.textContent, 'Encrypted export password');
  assert.equal(label.htmlFor, fakeInput.id);
  assert.equal(fakeInput.type, 'password');
  assert.equal(fakeInput.placeholder, 'Export password');
  assert.equal(fakeInput.autocomplete, 'new-password');
  assert.equal(fakeInput.getAttribute('aria-describedby'), description.id);
  assert.equal(description.textContent, 'Protects exported records.');
});

test('file picker fields expose purpose, help text, and selected-file status', () => {
  const { field, input } = createFilePickerField({
    label: 'Import JSON file',
    description: 'Choose an Image Trail JSON file.',
    buttonText: 'Choose JSON',
    noFileText: 'No file selected',
    accept: '.json',
    disabled: true,
  });
  const fakeField = field as unknown as FakeElement;
  const fakeInput = input as unknown as FakeElement;
  const label = fakeField.children[0]!;
  const picker = fakeField.children[1]!;
  const description = fakeField.children[2]!;
  const button = picker.children[1]!;
  const selectedName = picker.children[2]!;

  assert.equal(label.textContent, 'Import JSON file');
  assert.equal(fakeInput.type, 'file');
  assert.equal(fakeInput.accept, '.json');
  assert.equal(fakeInput.disabled, true);
  assert.equal(button.htmlFor, fakeInput.id);
  assert.equal(button.textContent, 'Choose JSON');
  assert.equal(selectedName.textContent, 'No file selected');
  assert.equal(selectedName.getAttribute('aria-live'), 'polite');
  assert.equal(fakeInput.getAttribute('aria-labelledby'), `${label.id} ${button.id}`);
  assert.equal(fakeInput.getAttribute('aria-describedby'), `${description.id} ${selectedName.id}`);
});
