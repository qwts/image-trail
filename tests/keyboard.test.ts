import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BINDINGS, classifyTarget, shouldRouteKeyboardShortcut } from '../extension/src/content/keyboard.js';

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

test('default keyboard bindings map d to download and shifted shortcuts to save-as download', () => {
  assert.ok(DEFAULT_BINDINGS.some((binding) => binding.key === 'd' && binding.action === 'download'));
  assert.ok(DEFAULT_BINDINGS.some((binding) => binding.key === 'ArrowDown' && binding.action === 'download'));
  assert.ok(DEFAULT_BINDINGS.some((binding) => binding.key === 'D' && binding.shift === true && binding.action === 'download-save-as'));
  assert.ok(DEFAULT_BINDINGS.some((binding) => binding.key === 'G' && binding.shift === true && binding.action === 'grab-mode-toggle'));
  assert.ok(DEFAULT_BINDINGS.some((binding) => binding.key === 'Enter' && binding.shift === true && binding.action === 'download-save-as'));
});

test('keyboard shortcuts route from panel controls but not typing targets', () => {
  assert.equal(shouldRouteKeyboardShortcut('typing', 'download'), false);
  assert.equal(shouldRouteKeyboardShortcut('button', 'slideshow-toggle'), false);
  assert.equal(shouldRouteKeyboardShortcut('button', 'next'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'previous'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'download'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'download-save-as'), true);
  assert.equal(shouldRouteKeyboardShortcut('button', 'grab-mode-toggle'), true);
  assert.equal(shouldRouteKeyboardShortcut('panel', 'slideshow-toggle'), true);
  assert.equal(shouldRouteKeyboardShortcut('page', 'download'), true);
});
