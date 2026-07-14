import assert from 'node:assert/strict';
import test from 'node:test';

import { KeyboardRouter } from '../../extension/src/content/keyboard.js';

function dispatchKey(target: EventTarget, key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event);
  return event;
}

test('router handles approved bare keys case-insensitively and leaves modifiers to the browser', () => {
  const actions: string[] = [];
  const router = new KeyboardRouter((action) => {
    actions.push(action);
    return true;
  });
  router.enable();
  try {
    assert.equal(dispatchKey(document, 'C', { shiftKey: true }).defaultPrevented, true);
    assert.equal(dispatchKey(document, '?', { shiftKey: true }).defaultPrevented, true);
    for (const modifiers of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      assert.equal(dispatchKey(document, 'c', modifiers).defaultPrevented, false);
    }
    assert.deepEqual(actions, ['capture-current', 'help-toggle']);
  } finally {
    router.disable();
  }
});

test('router preserves typing controls and native record-row behavior', () => {
  const actions: string[] = [];
  const router = new KeyboardRouter((action) => {
    actions.push(action);
    return true;
  });
  const input = document.createElement('input');
  const row = document.createElement('div');
  row.dataset['imageTrailRowId'] = 'record-1';
  const rowButton = document.createElement('button');
  row.append(rowButton);
  document.body.append(input, row);
  router.enable();
  try {
    assert.equal(dispatchKey(input, 'c').defaultPrevented, false);
    assert.equal(dispatchKey(rowButton, 'ArrowDown').defaultPrevented, false);
    assert.equal(dispatchKey(rowButton, 'p').defaultPrevented, false);
    assert.deepEqual(actions, []);
  } finally {
    router.disable();
    input.remove();
    row.remove();
  }
});

test('an unassigned Down action remains native because the handler declines it', () => {
  const actions: string[] = [];
  const router = new KeyboardRouter((action) => {
    actions.push(action);
    return false;
  });
  router.enable();
  try {
    assert.equal(dispatchKey(document, 'ArrowDown').defaultPrevented, false);
    assert.deepEqual(actions, ['down-arrow']);
  } finally {
    router.disable();
  }
});

test('Escape inside a detached window remains owned by its local restore handler', () => {
  const actions: string[] = [];
  const router = new KeyboardRouter((action) => {
    actions.push(action);
    return true;
  });
  const detachedWindow = document.createElement('aside');
  detachedWindow.dataset['imageTrailDetachedWindow'] = 'history';
  const restore = document.createElement('button');
  detachedWindow.append(restore);
  document.body.append(detachedWindow);
  router.enable();
  try {
    assert.equal(dispatchKey(restore, 'Escape').defaultPrevented, false);
    assert.deepEqual(actions, []);
    assert.equal(dispatchKey(restore, 'g').defaultPrevented, true);
    assert.deepEqual(actions, ['grab-mode-toggle']);
  } finally {
    router.disable();
    detachedWindow.remove();
  }
});
