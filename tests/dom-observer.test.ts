import test from 'node:test';
import assert from 'node:assert/strict';
import { DomObserver } from '../extension/src/content/dom-observer.js';

test('refreshes on the trailing edge of a mutation burst', async () => {
  let mutationCallback: (() => void) | null = null;
  let observed = false;
  let disconnected = false;
  let refreshes = 0;

  class FakeMutationObserver {
    constructor(callback: () => void) {
      mutationCallback = callback;
    }

    observe(): void {
      observed = true;
    }

    disconnect(): void {
      disconnected = true;
    }
  }

  globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  globalThis.document = { documentElement: {} } as Document;
  globalThis.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  } as Window & typeof globalThis;

  const observer = new DomObserver(() => {
    refreshes += 1;
  });

  observer.start();
  assert.equal(observed, true);
  assert.ok(mutationCallback);
  const fireMutation = mutationCallback as () => void;

  fireMutation();
  await new Promise((resolve) => setTimeout(resolve, 25));
  fireMutation();
  await new Promise((resolve) => setTimeout(resolve, 25));
  fireMutation();

  await new Promise((resolve) => setTimeout(resolve, 75));
  assert.equal(refreshes, 1);

  observer.stop();
  assert.equal(disconnected, true);
});
