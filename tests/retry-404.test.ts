import test from 'node:test';
import assert from 'node:assert/strict';
import { Retry404 } from '../extension/src/core/automation/retry-404.js';

test('retry starts in idle phase', () => {
  const retry = new Retry404(
    async () => true,
    () => {},
    () => {},
  );
  assert.equal(retry.currentPhase, 'idle');
  assert.equal(retry.retriesUsed, 0);
});

test('retry transitions to running on start', () => {
  const phases: string[] = [];
  const retry = new Retry404(
    async () => {
      await new Promise((r) => setTimeout(r, 500));
      return true;
    },
    () => {},
    (phase) => {
      phases.push(phase);
    },
  );
  retry.start();
  assert.equal(retry.currentPhase, 'running');
  retry.stop();
});

test('retry stops and transitions to stopped', () => {
  const phases: string[] = [];
  const retry = new Retry404(
    async () => {
      await new Promise((r) => setTimeout(r, 500));
      return false;
    },
    () => {},
    (phase) => {
      phases.push(phase);
    },
  );
  retry.start();
  retry.stop();
  assert.equal(retry.currentPhase, 'stopped');
  assert.ok(phases.includes('stopped'));
});

test('retry resolves to idle on successful load', async () => {
  const phases: string[] = [];
  const retry = new Retry404(
    async () => true,
    () => {},
    (phase) => {
      phases.push(phase);
    },
    { maxRetries: 3, retryDelayMs: 10, advanceOnExhaust: false },
  );
  retry.start();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(retry.currentPhase, 'idle');
  assert.equal(retry.retriesUsed, 1);
});

test('retry exhausts after maxRetries failures', async () => {
  const phases: string[] = [];
  let advanceCalled = false;
  const retry = new Retry404(
    async () => false,
    () => {
      advanceCalled = true;
    },
    (phase) => {
      phases.push(phase);
    },
    { maxRetries: 2, retryDelayMs: 10, advanceOnExhaust: true },
  );
  retry.start();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(retry.currentPhase, 'exhausted');
  assert.equal(retry.retriesUsed, 2);
  assert.ok(advanceCalled, 'should advance on exhaust');
});

test('stop prevents stale completion from overwriting phase', async () => {
  let resolveLoad: (v: boolean) => void = () => {};
  const retry = new Retry404(
    () =>
      new Promise<boolean>((r) => {
        resolveLoad = r;
      }),
    () => {},
    () => {},
    { maxRetries: 3, retryDelayMs: 10, advanceOnExhaust: false },
  );
  retry.start();
  await new Promise((r) => setTimeout(r, 10));
  retry.stop();
  assert.equal(retry.currentPhase, 'stopped');
  resolveLoad(true);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(retry.currentPhase, 'stopped');
});

test('destroy resets to idle', () => {
  const retry = new Retry404(
    async () => true,
    () => {},
    () => {},
  );
  retry.start();
  retry.destroy();
  assert.equal(retry.currentPhase, 'idle');
  assert.equal(retry.retriesUsed, 0);
});
