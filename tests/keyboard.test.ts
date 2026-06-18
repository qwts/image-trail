import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTarget } from '../extension/src/content/keyboard.js';

function fakeEvent(overrides: Record<string, unknown> = {}): KeyboardEvent {
  return { target: null, ...overrides } as unknown as KeyboardEvent;
}

test('classifyTarget returns page for null target', () => {
  assert.equal(classifyTarget(fakeEvent({ target: null })), 'page');
});

test('classifyTarget returns typing for INPUT element', () => {
  assert.equal(classifyTarget(fakeEvent({ target: { tagName: 'INPUT' } })), 'typing');
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
