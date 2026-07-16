import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSecureSessionChangeMessage,
  isSecureSessionChangeMessage,
} from '../extension/src/background/secure-session-change-message.js';
import {
  connectBlobKeySessionChangeNotifier,
  createSecureSessionChangeNotifier,
} from '../extension/src/background/secure-session-change-notifier.js';
import { createSecureSessionClient } from '../extension/src/content/secure-session-client.js';
import type { SessionUnlockSnapshot } from '../extension/src/data/runtime/session-unlock.js';

test('secure-session change messages validate the complete locked and unlocked states', () => {
  const locked = createSecureSessionChangeMessage(
    {
      unlocked: false,
      keyReference: null,
      hasKey: true,
      reason: 'timeout',
      message: 'Encrypted storage locked.',
    },
    42,
  );
  const unlocked = createSecureSessionChangeMessage({ unlocked: true, keyReference: 'blob:key', hasKey: true }, 43);
  assert.equal(isSecureSessionChangeMessage(locked), true);
  assert.equal(isSecureSessionChangeMessage(unlocked), true);
  assert.equal(isSecureSessionChangeMessage({ ...locked, payload: { ...locked.payload, keyReference: 'blob:key' } }), false);
  assert.equal(isSecureSessionChangeMessage({ ...unlocked, payload: { ...unlocked.payload, hasKey: false } }), false);
});

test('secure-session notifier broadcasts to extension pages and every injected tab', async () => {
  const runtimeMessages: unknown[] = [];
  const tabMessages: Array<{ readonly tabId: number; readonly message: unknown }> = [];
  const notify = createSecureSessionChangeNotifier(
    {
      lastError: undefined,
      sendMessage(message, callback) {
        runtimeMessages.push(message);
        callback?.();
      },
    },
    {
      query: async () => [{ id: 7 }, { id: 8 }, {}],
      sendMessage: async (tabId, message) => {
        tabMessages.push({ tabId, message });
      },
    },
  );
  notify({ unlocked: false, keyReference: null, hasKey: true, reason: 'manual' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runtimeMessages.length, 1);
  assert.deepEqual(
    tabMessages.map((entry) => entry.tabId),
    [7, 8],
  );
  assert.equal(
    tabMessages.every((entry) => isSecureSessionChangeMessage(entry.message)),
    true,
  );
});

test('blob-session snapshots map to privacy-safe cross-context status', () => {
  let listener: ((snapshot: SessionUnlockSnapshot<'blob'>) => void) | undefined;
  const statuses: unknown[] = [];
  connectBlobKeySessionChangeNotifier(
    (next) => {
      listener = next;
    },
    (status) => statuses.push(status),
  );
  listener?.({ status: 'locked', reason: 'timeout' });
  listener?.({
    status: 'unlocked',
    keyReference: { kind: 'blob', uuid: 'key', reference: 'blob:key' },
    unlockedAt: '2026-07-16T00:00:00.000Z',
    lastActivityAt: '2026-07-16T00:00:00.000Z',
    timeoutMinutes: 10,
    expiresAt: '2026-07-16T00:10:00.000Z',
  });
  assert.deepEqual(statuses, [
    {
      unlocked: false,
      keyReference: null,
      hasKey: true,
      reason: 'timeout',
      message: 'Encrypted storage locked after the configured inactivity period. Unlock to continue.',
    },
    { unlocked: true, keyReference: 'blob:key', hasKey: true },
  ]);
});

test('secure-session client relays status changes and removes its listener', async () => {
  const listeners = new Set<(message: unknown) => boolean>();
  const client = createSecureSessionClient(
    {
      requestBlobKeyStatus: async () => ({ unlocked: false, keyReference: null, hasKey: true, reason: 'manual' }),
      unlockBlobKey: async (password) =>
        password === 'correct'
          ? { ok: true, keyReference: 'blob:key', message: 'Unlocked.' }
          : { ok: false, reason: 'wrong-password', message: 'Wrong password.' },
      lockBlobKey: async () => ({ ok: true, keyReference: '', message: 'Locked.' }),
    },
    {
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
      },
    },
  );
  assert.deepEqual(await client.status(), { unlocked: false, keyReference: null, hasKey: true, reason: 'manual' });
  assert.equal((await client.unlock('wrong')).ok, false);
  assert.equal((await client.unlock('correct')).ok, true);
  assert.equal((await client.lock()).ok, true);
  const observed: unknown[] = [];
  const unsubscribe = client.subscribe((status) => observed.push(status));
  for (const listener of listeners) {
    listener(createSecureSessionChangeMessage({ unlocked: true, keyReference: 'blob:key', hasKey: true }));
  }
  assert.deepEqual(observed, [{ unlocked: true, keyReference: 'blob:key', hasKey: true, changedAt: observedChangedAt(observed) }]);
  unsubscribe();
  assert.equal(listeners.size, 0);
});

function observedChangedAt(observed: readonly unknown[]): number {
  const status = observed[0] as { readonly changedAt?: unknown };
  assert.equal(typeof status.changedAt, 'number');
  return status.changedAt as number;
}
