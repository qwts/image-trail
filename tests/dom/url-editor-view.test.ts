import test from 'node:test';
import assert from 'node:assert/strict';

import { createUrlEditorView } from '../../extension/src/ui/components/url-editor-view.js';
import { PRIVACY_URL_TEXT } from '../../extension/src/ui/components/record-metadata.js';

const CURRENT_URL = 'https://images.example.test/albums/1024/photo_0042.jpg';

function textareaOf(view: HTMLElement): HTMLTextAreaElement {
  const textarea = view.querySelector('textarea');
  assert.ok(textarea, 'expected the URL editor to render a textarea');
  return textarea;
}

function pasteEvent(text: string): ClipboardEvent {
  const clipboardData = new DataTransfer();
  clipboardData.setData('text/plain', text);
  return new ClipboardEvent('paste', { clipboardData, cancelable: true, bubbles: true });
}

test('Enter applies the edited URL and prevents the default newline', () => {
  const applied: string[] = [];
  const view = createUrlEditorView({ url: CURRENT_URL }, { onApply: (url) => applied.push(url) });
  const textarea = textareaOf(view);

  textarea.value = 'https://images.example.test/albums/1024/photo_0043.jpg';
  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  textarea.dispatchEvent(enter);

  assert.deepEqual(applied, ['https://images.example.test/albums/1024/photo_0043.jpg']);
  assert.equal(enter.defaultPrevented, true);
});

test('Apply URL button dispatches the current edited value', () => {
  const applied: string[] = [];
  const view = createUrlEditorView({ url: CURRENT_URL }, { onApply: (url) => applied.push(url) });
  const textarea = textareaOf(view);
  textarea.value = 'https://images.example.test/albums/1024/photo_0044.jpg';

  view.querySelector<HTMLButtonElement>('button')?.click();

  assert.deepEqual(applied, ['https://images.example.test/albums/1024/photo_0044.jpg']);
  assert.match(view.textContent ?? '', /Enter apply URL/u);
});

test('pasting a data: URL is rejected before it reaches the textarea', () => {
  const applied: string[] = [];
  let rejected = 0;
  const view = createUrlEditorView(
    { url: CURRENT_URL },
    { onApply: (url) => applied.push(url), onRejectUnsupportedInput: () => (rejected += 1) },
  );
  const textarea = textareaOf(view);

  const paste = pasteEvent('data:image/png;base64,AAA');
  textarea.dispatchEvent(paste);

  assert.equal(rejected, 1);
  assert.equal(paste.defaultPrevented, true);
  assert.deepEqual(applied, []);
});

test('pasting an https URL is not rejected', () => {
  let rejected = 0;
  const view = createUrlEditorView({ url: CURRENT_URL }, { onApply: () => {}, onRejectUnsupportedInput: () => (rejected += 1) });
  const textarea = textareaOf(view);

  const paste = pasteEvent('https://images.example.test/pasted.jpg');
  textarea.dispatchEvent(paste);

  assert.equal(rejected, 0);
  assert.equal(paste.defaultPrevented, false);
});

test('a data URL disables the editor and Enter does not apply', () => {
  const applied: string[] = [];
  const view = createUrlEditorView({ url: 'data:image/png;base64,AAA', isDataUrl: true }, { onApply: (url) => applied.push(url) });
  const textarea = textareaOf(view);

  assert.equal(textarea.disabled, true);
  assert.equal(textarea.value, 'data URL');

  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.deepEqual(applied, []);
});

test('privacy mode masks the URL and Enter applies the underlying URL, not the masked text', () => {
  const applied: string[] = [];
  const view = createUrlEditorView({ url: CURRENT_URL, privacyMode: true }, { onApply: (url) => applied.push(url) });
  const textarea = textareaOf(view);

  assert.equal(textarea.value, PRIVACY_URL_TEXT);
  assert.equal(textarea.readOnly, true);

  textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.deepEqual(applied, [CURRENT_URL]);
});
