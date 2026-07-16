import assert from 'node:assert/strict';
import test from 'node:test';

import { BlobKeySession, type BlobKeySessionStorage } from '../extension/src/data/crypto/blob-key-session.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { generateAesGcmKey } from '../extension/src/data/crypto/webcrypto.js';
import type { SessionUnlockClock } from '../extension/src/data/runtime/session-unlock.js';

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

class MemorySessionStorage implements BlobKeySessionStorage {
  readonly values = new Map<string, unknown>();
  accessLevel: string | null = null;

  get(key: string): Promise<Record<string, unknown>> {
    return Promise.resolve({ [key]: this.values.get(key) });
  }

  set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) this.values.set(key, structuredClone(value));
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.values.delete(key);
    return Promise.resolve();
  }

  setAccessLevel(options: { accessLevel: 'TRUSTED_CONTEXTS' }): Promise<void> {
    this.accessLevel = options.accessLevel;
    return Promise.resolve();
  }
}

test('restores an unwrapped key from memory-only session storage after a worker restart', async () => {
  const clock = new FakeClock();
  const storage = new MemorySessionStorage();
  const reference = createKeyReference('blob', 'worker-restart');
  const firstWorker = new BlobKeySession(clock);
  firstWorker.configureStorage(storage);
  await firstWorker.unlock(reference, await generateAesGcmKey(true), undefined, 10);

  const restartedWorker = new BlobKeySession(clock);
  restartedWorker.configureStorage(storage);
  const restored = await restartedWorker.restore();

  assert.equal(storage.accessLevel, 'TRUSTED_CONTEXTS');
  assert.equal(restored?.reference.reference, reference.reference);
  assert.equal(restored?.key.extractable, false);
});

test('activity extends the persisted session and timeout removes its key material', async () => {
  const clock = new FakeClock();
  const storage = new MemorySessionStorage();
  const session = new BlobKeySession(clock);
  session.configureStorage(storage);
  await session.unlock(createKeyReference('blob', 'timeout'), await generateAesGcmKey(true), undefined, 5);

  clock.advance(4 * 60_000);
  assert.equal(await session.recordActivity(), true);
  clock.advance(5 * 60_000);
  await Promise.resolve();

  assert.deepEqual(session.snapshot, { status: 'locked', reason: 'timeout' });
  assert.equal(storage.values.size, 0);
});

test('manual lock immediately clears the in-memory and session-storage key', async () => {
  const storage = new MemorySessionStorage();
  const session = new BlobKeySession();
  session.configureStorage(storage);
  await session.unlock(createKeyReference('blob', 'manual'), await generateAesGcmKey(true), undefined, 'never');

  await session.lock('manual');

  assert.equal(session.peek(), null);
  assert.deepEqual(session.snapshot, { status: 'locked', reason: 'manual' });
  assert.equal(storage.values.size, 0);
});

test('malformed worker-recovery state fails closed and is erased', async () => {
  const storage = new MemorySessionStorage();
  storage.values.set('imageTrail.activeBlobKey.v1', { version: 1, rawKey: 'not-a-key' });
  const session = new BlobKeySession();
  session.configureStorage(storage);

  assert.equal(await session.restore(), null);
  assert.equal(session.restoreFailed, true);
  assert.equal(storage.values.size, 0);
});
