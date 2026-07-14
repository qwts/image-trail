import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BINDINGS,
  classifyTarget,
  matchesKeyCodeShortcut,
  shouldRouteKeyboardShortcut,
} from '../extension/src/content/keyboard.js';

function fakeEvent(overrides: Record<string, unknown> = {}): KeyboardEvent {
  return { target: null, ...overrides } as unknown as KeyboardEvent;
}

test('classifyTarget returns page for null target', () => {
  assert.equal(classifyTarget(fakeEvent({ target: null })), 'page');
});

test('classifyTarget returns typing for INPUT element', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'INPUT' } })), 'typing');
});

test('classifyTarget uses composed path for shadow DOM inputs', () => {
  const host = {
    tagName: 'DIV',
    closest: (selector: string) => (selector === '#image-trail-panel-root' ? {} : null),
  };
  const input = { tagName: 'INPUT' };
  assert.equal(classifyTarget(fakeEvent({ target: host, composedPath: () => [input, host] })), 'typing');
});

test('classifyTarget returns typing for TEXTAREA element', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'TEXTAREA' } })), 'typing');
});

test('classifyTarget returns typing for SELECT element', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'SELECT' } })), 'typing');
});

test('classifyTarget returns typing for contentEditable element', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'DIV', isContentEditable: true } })), 'typing');
});

test('classifyTarget returns button for BUTTON element', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'BUTTON' } })), 'button');
});

test('classifyTarget returns page for generic DIV', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'DIV' } })), 'page');
});

test('classifyTarget returns panel for element inside panel root', () => {
  const mockElement = {
    tagName: 'SPAN',
    closest: (selector: string) => (selector === '#image-trail-panel-root' ? {} : null),
  };
  assert.equal(classifyTarget(fakeEvent({ target: mockElement })), 'panel');
});

test('classifyTarget returns panel for shadow DOM elements inside panel host', () => {
  const row = { tagName: 'LI' };
  const host = { tagName: 'DIV', id: 'image-trail-panel-root' };
  assert.equal(classifyTarget(fakeEvent({ target: host, composedPath: () => [row, host] })), 'panel');
});

test('classifyTarget returns record-row for row shortcuts inside the panel', () => {
  const row = { tagName: 'LI', dataset: { imageTrailRowId: 'recent-1' } };
  const host = { tagName: 'DIV', id: 'image-trail-panel-root' };
  assert.equal(classifyTarget(fakeEvent({ target: host, composedPath: () => [row, host] })), 'record-row');
});

test('classifyTarget identifies controls inside detached windows before generic buttons', () => {
  const button = { tagName: 'BUTTON' };
  const detachedWindow = { tagName: 'ASIDE', dataset: { imageTrailDetachedWindow: 'history' } };
  assert.equal(classifyTarget(fakeEvent({ target: button, composedPath: () => [button, detachedWindow] })), 'detached-window');
});

test('default keyboard bindings are the exact approved bare-key registry', () => {
  assert.deepEqual(
    DEFAULT_BINDINGS.map(({ key, shift, action }) => ({ key, shift, action })),
    [
      { key: 'ArrowRight', shift: false, action: 'next' },
      { key: 'ArrowLeft', shift: false, action: 'previous' },
      { key: 'c', shift: undefined, action: 'capture-current' },
      { key: 'p', shift: undefined, action: 'pin-current' },
      { key: 'b', shift: undefined, action: 'capture-and-bookmark' },
      { key: 'g', shift: undefined, action: 'grab-mode-toggle' },
      { key: 'ArrowDown', shift: false, action: 'down-arrow' },
      { key: '?', shift: true, action: 'help-toggle' },
      { key: ',', shift: false, action: 'settings-toggle' },
      { key: 'Escape', shift: false, action: 'close-surface' },
    ],
  );
});

test('legacy page-only automation and download keys are no longer intercepted', () => {
  for (const action of ['slideshow-toggle', 'download', 'download-save-as', 'retry', 'buffer-debug-toggle', 'panel-toggle']) {
    assert.equal(
      DEFAULT_BINDINGS.some((binding) => binding.action === action),
      false,
      `${action} remains browser-command-only`,
    );
  }
});

test('key code shortcuts survive Option-modified Mac key values', () => {
  assert.equal(
    matchesKeyCodeShortcut(fakeEvent({ key: '∫', code: 'KeyB', shiftKey: true, altKey: true }), { code: 'KeyB', shift: true, alt: true }),
    true,
  );
  assert.equal(
    matchesKeyCodeShortcut(fakeEvent({ key: 'B', code: 'KeyB', shiftKey: true, altKey: true, metaKey: true }), {
      code: 'KeyB',
      shift: true,
      alt: true,
    }),
    false,
  );
});

test('keyboard shortcuts route from panel controls but not typing targets', () => {
  assert.equal(shouldRouteKeyboardShortcut('typing', 'download'), false);
  assert.equal(shouldRouteKeyboardShortcut('button', 'capture-current'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'next'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'previous'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'grab-mode-toggle'), true);
  assert.equal(shouldRouteKeyboardShortcut('record-row', 'down-arrow', 'ArrowDown'), false);
  assert.equal(shouldRouteKeyboardShortcut('record-row', 'capture-current', 'c'), false);
  assert.equal(shouldRouteKeyboardShortcut('detached-window', 'close-surface', 'Escape'), false);
  assert.equal(shouldRouteKeyboardShortcut('detached-window', 'grab-mode-toggle', 'g'), true);
  assert.equal(shouldRouteKeyboardShortcut('panel', 'help-toggle'), true);
  assert.equal(shouldRouteKeyboardShortcut('page', 'capture-current'), true);
});
