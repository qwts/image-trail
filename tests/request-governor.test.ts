import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestGovernor } from '../extension/src/content/request-governor.js';

// Fixed epoch for the injected fake clock. Comfortably larger than any interval
// or window used below so the initial lastRunAt=0 never causes a spurious throttle.
const START = 1_000_000;

test('allows first request when governor is idle', () => {
  const now = START;
  const gov = new RequestGovernor(undefined, () => now);
  const result = gov.request(() => 'ok');
  assert.deepEqual(result, { value: 'ok', status: 'ok' });
});

test('throttles request within minimum interval', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 200, maxRequests: 60, windowMs: 60_000 }, () => now);
  gov.request(() => 'first');
  now = START + 100;
  const result = gov.request(() => 'second');
  assert.deepEqual(result, { value: null, status: 'throttled' });
});

test('allows request after minimum interval elapses', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 200, maxRequests: 60, windowMs: 60_000 }, () => now);
  gov.request(() => 'first');
  now = START + 200;
  const result = gov.request(() => 'second');
  assert.deepEqual(result, { value: 'second', status: 'ok' });
});

test('caps requests per minute', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequests: 3, windowMs: 60_000 }, () => now);
  gov.request(() => 1);
  now = START + 1;
  gov.request(() => 2);
  now = START + 2;
  gov.request(() => 3);
  now = START + 3;
  const result = gov.request(() => 4);
  assert.deepEqual(result, { value: null, status: 'capped' });
});

test('uncaps after timestamps age out past 60 seconds', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequests: 2, windowMs: 60_000 }, () => now);
  gov.request(() => 1);
  now = START + 1;
  gov.request(() => 2);
  now = START + 60_001;
  const result = gov.request(() => 3);
  assert.deepEqual(result, { value: 3, status: 'ok' });
});

test('requestsInWindow counts correctly', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequests: 100, windowMs: 60_000 }, () => now);
  gov.request(() => 1);
  now = START + 1;
  gov.request(() => 2);
  now = START + 2;
  gov.request(() => 3);
  now = START + 3;
  assert.equal(gov.requestsInWindow(), 3);
  now = START + 60_001;
  assert.equal(gov.requestsInWindow(), 2);
  now = START + 60_003;
  assert.equal(gov.requestsInWindow(), 0);
});

test('reset clears all state', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequests: 1, windowMs: 60_000 }, () => now);
  gov.request(() => 1);
  now = START + 1;
  assert.equal(gov.canRequest(), false);
  gov.reset();
  assert.equal(gov.canRequest(), true);
});

test('uses configurable request count window', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 0, maxRequests: 2, windowMs: 1_000 }, () => now);
  gov.request(() => 1);
  now = START + 1;
  gov.request(() => 2);

  now = START + 999;
  assert.deepEqual(
    gov.request(() => 3),
    { value: null, status: 'capped' },
  );
  now = START + 1_001;
  assert.deepEqual(
    gov.request(() => 4),
    { value: 4, status: 'ok' },
  );
});

test('reports delay until the next request can start', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 200, maxRequests: 2, windowMs: 1_000 }, () => now);
  gov.request(() => 1);

  now = START + 50;
  assert.equal(gov.nextReadyDelayMs(), 150);
  now = START + 200;
  assert.equal(gov.nextReadyDelayMs(), 0);

  gov.request(() => 2);
  now = START + 400;
  assert.equal(gov.nextReadyDelayMs(), 600);
});

test('status getter reads the injected clock', () => {
  let now = START;
  const gov = new RequestGovernor({ minimumIntervalMs: 200, maxRequests: 2, windowMs: 60_000 }, () => now);

  assert.equal(gov.status, 'ready');
  gov.record();
  assert.equal(gov.status, 'throttled');
  now = START + 200;
  assert.equal(gov.status, 'ready');
  gov.record();
  now = START + 400;
  assert.equal(gov.status, 'capped');
});
