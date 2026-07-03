import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestThrottle } from '../extension/src/content/request-throttle.js';

test('throttles rapid manual navigation requests', () => {
  let now = 1000;
  const throttle = new RequestThrottle(250, () => now);
  let count = 0;

  assert.equal(
    throttle.run(() => {
      count += 1;
      return 'first';
    }),
    'first',
  );

  now = 1100;
  assert.equal(
    throttle.run(() => {
      count += 1;
      return 'blocked';
    }),
    null,
  );

  now = 1250;
  assert.equal(
    throttle.run(() => {
      count += 1;
      return 'second';
    }),
    'second',
  );

  assert.equal(count, 2);
});
