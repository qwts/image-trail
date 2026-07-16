import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import {
  SessionUnlockState,
  type SessionInactivityTimeoutMinutes,
  type SessionUnlockClock,
} from '../extension/src/data/runtime/session-unlock.js';

class FakeClock implements SessionUnlockClock {
  private nowMs = Date.parse('2026-07-16T00:00:00.000Z');
  private nextId = 1;
  private readonly scheduled = new Map<number, { readonly at: number; readonly callback: () => void }>();

  now(): number {
    return this.nowMs;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.scheduled.set(id, { at: this.nowMs + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.scheduled.delete(handle as number);
  }

  advance(delayMs: number): void {
    const target = this.nowMs + delayMs;
    for (;;) {
      const due = [...this.scheduled.entries()].filter(([, task]) => task.at <= target).sort((left, right) => left[1].at - right[1].at)[0];
      if (!due) break;
      this.scheduled.delete(due[0]);
      this.nowMs = due[1].at;
      due[1].callback();
    }
    this.nowMs = target;
  }
}

async function createHarness(timeoutMinutes: SessionInactivityTimeoutMinutes) {
  const clock = new FakeClock();
  const session = await createSessionKey('blob', `timeout-${String(timeoutMinutes)}`, new Date(clock.now()).toISOString());
  const controller = new SessionUnlockState<'blob'>(clock);
  controller.unlock(session.reference, session.key, clock.now(), timeoutMinutes);
  return { clock, controller, session };
}

for (const timeoutMinutes of [5, 10, 15] as const) {
  test(`locks after ${timeoutMinutes} minutes of inactivity`, async () => {
    const { clock, controller } = await createHarness(timeoutMinutes);
    clock.advance(timeoutMinutes * 60_000 - 1);
    assert.equal(controller.snapshot.status, 'unlocked');
    clock.advance(1);
    assert.deepEqual(controller.snapshot, { status: 'locked', reason: 'timeout' });
  });
}

test('repeated activity resets the inactivity deadline', async () => {
  const { clock, controller } = await createHarness(5);
  clock.advance(4 * 60_000);
  assert.equal(controller.recordActivity(), true);
  clock.advance(4 * 60_000);
  assert.equal(controller.recordActivity(), true);
  clock.advance(5 * 60_000 - 1);
  assert.equal(controller.snapshot.status, 'unlocked');
  clock.advance(1);
  assert.deepEqual(controller.snapshot, { status: 'locked', reason: 'timeout' });
});

test('manual lock cancels the session immediately', async () => {
  const { controller, session } = await createHarness(15);
  controller.lock('manual');
  assert.deepEqual(controller.snapshot, { status: 'locked', reason: 'manual' });
  assert.equal(controller.getActiveKey(session.reference), null);
});

test('Never remains unlocked until an explicit security boundary', async () => {
  const { clock, controller } = await createHarness('never');
  clock.advance(365 * 24 * 60 * 60_000);
  const snapshot = controller.snapshot;
  assert.equal(snapshot.status, 'unlocked');
  if (snapshot.status === 'unlocked') assert.equal(snapshot.expiresAt, null);
});

test('settings changes extend or immediately shorten an active session', async () => {
  const extended = await createHarness(5);
  extended.clock.advance(4 * 60_000);
  assert.equal(extended.controller.updateTimeout(15), true);
  extended.clock.advance(10 * 60_000);
  assert.equal(extended.controller.snapshot.status, 'unlocked');
  extended.clock.advance(60_000);
  assert.deepEqual(extended.controller.snapshot, { status: 'locked', reason: 'timeout' });

  const shortened = await createHarness(15);
  shortened.clock.advance(6 * 60_000);
  assert.equal(shortened.controller.updateTimeout(5), false);
  assert.deepEqual(shortened.controller.snapshot, { status: 'locked', reason: 'timeout' });
});
