import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestGovernor } from '../extension/src/content/request-governor.js';

test('allows first request when governor is idle', () => {
  const gov = new RequestGovernor();
  const now = Date.now();
  const result = gov.request(() => 'ok', now);
  assert.deepEqual(result, { value: 'ok', status: 'ok' });
});

test('throttles request within minimum interval', () => {
  const gov = new RequestGovernor({ minimumIntervalMs: 200, maxRequestsPerMinute: 60 });
  const now = Date.now();
  gov.request(() => 'first', now);
  const result = gov.request(() => 'second', now + 100);
  assert.deepEqual(result, { value: null, status: 'throttled' });
});

test('allows request after minimum interval elapses', () => {
  const gov = new RequestGovernor({ minimumIntervalMs: 200, maxRequestsPerMinute: 60 });
  const now = Date.now();
  gov.request(() => 'first', now);
  const result = gov.request(() => 'second', now + 200);
  assert.deepEqual(result, { value: 'second', status: 'ok' });
});

test('caps requests per minute', () => {
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequestsPerMinute: 3 });
  const now = Date.now();
  gov.request(() => 1, now);
  gov.request(() => 2, now + 1);
  gov.request(() => 3, now + 2);
  const result = gov.request(() => 4, now + 3);
  assert.deepEqual(result, { value: null, status: 'capped' });
});

test('uncaps after timestamps age out past 60 seconds', () => {
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequestsPerMinute: 2 });
  const now = Date.now();
  gov.request(() => 1, now);
  gov.request(() => 2, now + 1);
  const result = gov.request(() => 3, now + 60_001);
  assert.deepEqual(result, { value: 3, status: 'ok' });
});

test('requestsInLastMinute counts correctly', () => {
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequestsPerMinute: 100 });
  const now = Date.now();
  gov.request(() => 1, now);
  gov.request(() => 2, now + 1);
  gov.request(() => 3, now + 2);
  assert.equal(gov.requestsInLastMinute(now + 3), 3);
  assert.equal(gov.requestsInLastMinute(now + 60_001), 2);
  assert.equal(gov.requestsInLastMinute(now + 60_003), 0);
});

test('reset clears all state', () => {
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequestsPerMinute: 1 });
  const now = Date.now();
  gov.request(() => 1, now);
  assert.equal(gov.canRequest(now + 1), false);
  gov.reset();
  assert.equal(gov.canRequest(now + 1), true);
});
