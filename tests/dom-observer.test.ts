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

test('observes a custom root and ignores mutation batches rejected by the filter', async () => {
  let mutationCallback: MutationCallback | null = null;
  let observedRoot: Node | null = null;
  let observedOptions: MutationObserverInit | null = null;
  let refreshes = 0;
  const forwarded: Array<readonly MutationRecord[]> = [];
  const root = {} as Node;

  class FakeMutationObserver {
    constructor(callback: MutationCallback) {
      mutationCallback = callback;
    }

    observe(target: Node, options: MutationObserverInit): void {
      observedRoot = target;
      observedOptions = options;
    }

    disconnect(): void {}
  }

  globalThis.MutationObserver = FakeMutationObserver as unknown as typeof MutationObserver;
  globalThis.window = {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  } as Window & typeof globalThis;

  const observer = new DomObserver(
    () => {
      refreshes += 1;
    },
    {
      debounceMs: 0,
      root: () => root,
      observe: { attributes: true, attributeFilter: ['src'], childList: true, subtree: true },
      mutationFilter: (records) => records.some((record) => record.attributeName === 'src'),
      onMutations: (records) => forwarded.push(records),
    },
  );
  observer.start();

  assert.equal(observedRoot, root);
  assert.deepEqual(observedOptions, {
    attributes: true,
    attributeFilter: ['src'],
    childList: true,
    subtree: true,
  });
  assert.ok(mutationCallback);
  const fireMutation = mutationCallback as MutationCallback;
  const irrelevant = [{ attributeName: 'class', type: 'attributes' }] as MutationRecord[];
  const relevant = [{ attributeName: 'src', type: 'attributes' }] as MutationRecord[];

  fireMutation(irrelevant, {} as MutationObserver);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(refreshes, 0);
  assert.deepEqual(forwarded, []);

  fireMutation(relevant, {} as MutationObserver);
  fireMutation(relevant, {} as MutationObserver);
  await Promise.resolve();
  assert.equal(refreshes, 1);
  assert.deepEqual(forwarded, [relevant, relevant]);

  fireMutation(relevant, {} as MutationObserver);
  observer.stop();
  await Promise.resolve();
  assert.equal(refreshes, 1);
});
