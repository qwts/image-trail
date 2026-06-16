import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestThrottle } from '../extension/src/content/request-throttle.js';

test('throttles rapid manual navigation requests', () => {
  const throttle = new RequestThrottle(250);
  let count = 0;

  assert.equal(throttle.run(() => { count += 1; return 'first'; }, 1000), 'first');
  assert.equal(throttle.run(() => { count += 1; return 'blocked'; }, 1100), null);
  assert.equal(throttle.run(() => { count += 1; return 'second'; }, 1250), 'second');
  assert.equal(count, 2);
});
