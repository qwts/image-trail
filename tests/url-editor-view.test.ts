import test from 'node:test';
import assert from 'node:assert/strict';
import { createUrlEditorView } from '../extension/src/ui/components/url-editor-view.js';

class FakeElement {
  className = '';
  textContent: string | null = '';
  rows = 0;
  wrap = '';
  spellcheck = true;
  disabled = false;
  readOnly = false;
  value = '';
  title = '';
  placeholder = '';
  readonly children: FakeElement[] = [];
  readonly classList = {
    add: (className: string): void => {
      this.className = this.className ? `${this.className} ${className}` : className;
    },
  };
  readonly listeners = new Map<string, EventListenerOrEventListenerObject>();

  constructor(readonly tagName: string) {}

  append(...children: FakeElement[]): void {
    this.children.push(...children);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.listeners.set(type, listener);
  }

  dispatchFakeEvent(type: string, event: { readonly key?: string; preventDefault: () => void }): void {
    const listener = this.listeners.get(type);
    if (typeof listener === 'function') listener(event as unknown as Event);
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

test('URL editor disables data URLs and does not apply them on Enter', () => {
  let appliedUrl: string | null = null;
  const view = createUrlEditorView(
    { url: 'data:image/png;base64,abc', isDataUrl: true },
    {
      onApply: (url) => {
        appliedUrl = url;
      },
    },
  ) as unknown as FakeElement;
  const input = view.children[1]!;
  let prevented = false;

  input.dispatchFakeEvent('keydown', {
    key: 'Enter',
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(input.value, 'data URL');
  assert.equal(input.disabled, true);
  assert.equal(input.rows, 1);
  assert.equal(prevented, true);
  assert.equal(appliedUrl, null);
});
