import test from 'node:test';
import assert from 'node:assert/strict';

import { TargetRecoveryController, targetRecoveryMutationAffectsRecovery } from '../../extension/src/content/target-recovery-controller.js';
import type { TargetImageLocator } from '../../extension/src/content/target-image.js';

const locator: TargetImageLocator = {
  originalUrl: 'https://images.example.test/original.jpg',
  selector: '#target',
};

function createManualObserver() {
  let refresh = (): void => {};
  let active = false;
  return {
    create(onRefresh: () => void) {
      refresh = onRefresh;
      return {
        start: () => {
          active = true;
        },
        stop: () => {
          active = false;
        },
      };
    },
    trigger() {
      if (active) refresh();
    },
    isActive: () => active,
  };
}

test('caps failed recovery batches and re-arms the budget for a new selection', () => {
  const observer = createManualObserver();
  let attempts = 0;
  const controller = new TargetRecoveryController({
    createObserver: (refresh) => observer.create(refresh),
    failedBatchLimit: 3,
    onRecovered: () => assert.fail('unexpected replacement'),
    recover: () => {
      attempts += 1;
      return null;
    },
    shouldRecover: () => true,
  });

  controller.start(locator);
  for (let index = 0; index < 5; index += 1) observer.trigger();
  assert.equal(attempts, 3);
  assert.equal(observer.isActive(), false);

  controller.start(locator);
  observer.trigger();
  assert.equal(attempts, 4);
  assert.equal(observer.isActive(), true);
  controller.stop();
});

test('successful recovery resets the failed-batch budget', () => {
  const observer = createManualObserver();
  const replacement = document.createElement('img');
  const results: Array<HTMLImageElement | null> = [null, replacement, null, null];
  const recovered: HTMLImageElement[] = [];
  const controller = new TargetRecoveryController({
    createObserver: (refresh) => observer.create(refresh),
    failedBatchLimit: 2,
    onRecovered: (image) => recovered.push(image),
    recover: () => results.shift() ?? null,
    shouldRecover: () => true,
  });

  controller.start(locator);
  observer.trigger();
  observer.trigger();
  assert.deepEqual(recovered, [replacement]);

  observer.trigger();
  assert.equal(observer.isActive(), true);
  observer.trigger();
  assert.equal(observer.isActive(), false);
});

test('filters host-page mutation batches that cannot contain a replacement image', () => {
  const text = document.createElement('span');
  const wrapper = document.createElement('section');
  wrapper.append(document.createElement('img'));
  const record = (node: Node): MutationRecord =>
    ({
      addedNodes: [node],
      removedNodes: [],
      target: document.body,
      type: 'childList',
    }) as unknown as MutationRecord;

  assert.equal(targetRecoveryMutationAffectsRecovery([record(text)]), false);
  assert.equal(targetRecoveryMutationAffectsRecovery([record(wrapper)]), true);
});
