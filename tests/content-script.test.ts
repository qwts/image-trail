import test from 'node:test';
import assert from 'node:assert/strict';
import { createPingMessage, createStatusMessage } from '../extension/src/background/messages.js';
import { initContentScript } from '../extension/src/content/content-script.js';

function createRuntime() {
  const listeners = new Set<(...args: never[]) => boolean>();
  const pagehideListeners = new Set<EventListenerOrEventListenerObject>();
  let disconnectCount = 0;

  const panel = {
    get visible() {
      return false;
    },
    get statusMessage() {
      return 'Ready';
    },
    toggle() {
      return { visible: true, message: 'Shown' };
    },
    disconnect() {
      disconnectCount += 1;
    },
  };

  const fakeWindow = {
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === 'pagehide') {
        pagehideListeners.add(listener);
      }
    },
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      if (type === 'pagehide') {
        pagehideListeners.delete(listener);
      }
    },
  } as Window;

  return {
    runtime: {
      window: fakeWindow,
      onMessage: {
        addListener(listener: (...args: never[]) => boolean) {
          listeners.add(listener);
        },
        removeListener(listener: (...args: never[]) => boolean) {
          listeners.delete(listener);
        },
      },
      createPanel() {
        return panel;
      },
    },
    get disconnectCount() {
      return disconnectCount;
    },
    listeners,
    pagehideListeners,
  };
}

test('repeated content-script initialization reuses the existing controller without duplicate message listeners', () => {
  const harness = createRuntime();

  const first = initContentScript(harness.runtime);
  const second = initContentScript(harness.runtime);

  assert.ok(first);
  assert.equal(second, first);
  assert.equal(harness.listeners.size, 1);
  assert.equal(harness.pagehideListeners.size, 1);
});

test('controller destroy removes the message listener and clears the window controller seam', () => {
  const harness = createRuntime();
  const controller = initContentScript(harness.runtime);

  assert.ok(controller);
  assert.equal(harness.listeners.size, 1);
  assert.equal(harness.runtime.window.__imageTrailContentController, controller);

  controller.destroy();

  assert.equal(harness.listeners.size, 0);
  assert.equal(harness.pagehideListeners.size, 0);
  assert.equal(harness.disconnectCount, 1);
  assert.equal(harness.runtime.window.__imageTrailContentController, undefined);
});

test('registered content-script listener responds to extension requests through the test seam', () => {
  const harness = createRuntime();
  initContentScript(harness.runtime);

  const [listener] = harness.listeners;
  let response: unknown;
  const handledAsync = listener(
    createPingMessage() as never,
    {} as never,
    ((value: unknown) => {
      response = value;
    }) as never,
  );

  assert.equal(handledAsync, false);
  assert.deepEqual(response, createStatusMessage(false, 'Ready'));
});
