import test from 'node:test';
import assert from 'node:assert/strict';
import { openJsonEnvelope, sealJsonEnvelope } from '../extension/src/data/crypto/envelope.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { DEFAULT_LOCAL_SETTINGS, LocalSettingsRepository } from '../extension/src/data/local-settings.js';
import { SessionUnlockState } from '../extension/src/data/runtime/session-unlock.js';
import { DATA_STORE_NAMES, IMAGE_TRAIL_DB_NAME, IMAGE_TRAIL_DB_VERSION } from '../extension/src/data/schema.js';

test('defines a versioned IndexedDB schema with durable M04 stores', () => {
  assert.equal(IMAGE_TRAIL_DB_NAME, 'image-trail');
  assert.equal(IMAGE_TRAIL_DB_VERSION, 2);
  assert.deepEqual(DATA_STORE_NAMES, ['metadata', 'keys', 'history', 'bookmarks']);
});

test('seals and opens a versioned AES-GCM JSON envelope with authenticated metadata', async () => {
  const session = await createSessionKey('history', 'test-key', '2026-06-16T00:00:00.000Z');
  const payload = {
    url: 'https://example.test/001.jpg',
    capturedAt: '2026-06-16T00:00:00.000Z',
    captureStatus: 'remote-only' as const,
  };
  const envelope = await sealJsonEnvelope({
    payload,
    payloadVersion: 1,
    key: session.key,
    keyReference: session.reference,
    authenticatedMetadata: { recordType: 'history' },
    now: '2026-06-16T00:00:00.000Z',
  });

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.algorithm, 'AES-GCM');
  assert.equal(envelope.key.reference, 'history:test-key');
  assert.deepEqual(await openJsonEnvelope(envelope, session.key), payload);
});

test('rejects envelopes when authenticated metadata is tampered with', async () => {
  const session = await createSessionKey('history', 'tamper-key', '2026-06-16T00:00:00.000Z');
  const envelope = await sealJsonEnvelope({
    payload: { url: 'https://example.test/002.jpg' },
    payloadVersion: 1,
    key: session.key,
    keyReference: session.reference,
    authenticatedMetadata: { recordType: 'history' },
  });

  await assert.rejects(
    openJsonEnvelope({ ...envelope, authenticatedMetadata: { recordType: 'bookmark' } }, session.key),
    /operation failed|decrypt|authentication/i,
  );
});

test('derives and validates key reference strings from kind and uuid', async () => {
  const session = await createSessionKey('history', 'derived-key', '2026-06-16T00:00:00.000Z');
  assert.deepEqual(session.reference, createKeyReference('history', 'derived-key'));
  await assert.rejects(
    sealJsonEnvelope({
      payload: { url: 'https://example.test/bad-key.jpg' },
      payloadVersion: 1,
      key: session.key,
      keyReference: { ...session.reference, reference: 'history:other-key' },
      authenticatedMetadata: { recordType: 'history' },
    }),
    /Key reference must be derived/,
  );
});

test('loads typed plaintext local settings through defaults and migrations', () => {
  const values = new Map<string, string>();
  const repository = new LocalSettingsRepository({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  });

  assert.deepEqual(repository.load(), DEFAULT_LOCAL_SETTINGS);
  repository.save({ ...DEFAULT_LOCAL_SETTINGS, showHistoryThumbnails: true, panelDock: 'left' });
  assert.equal(repository.load().showHistoryThumbnails, true);
  assert.equal(repository.load().panelDock, 'left');
});

test('falls back to plaintext local setting defaults when storage is corrupt', () => {
  const repository = new LocalSettingsRepository({
    getItem: () => '{not-json',
    setItem: () => {},
  });

  assert.deepEqual(repository.load(), DEFAULT_LOCAL_SETTINGS);
});

test('rejects out-of-range request throttle setting migrations', () => {
  const high = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ requestThrottleMs: 60_001 }),
    setItem: () => {},
  });
  const negative = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ requestThrottleMs: -1 }),
    setItem: () => {},
  });

  assert.equal(high.load().requestThrottleMs, DEFAULT_LOCAL_SETTINGS.requestThrottleMs);
  assert.equal(negative.load().requestThrottleMs, DEFAULT_LOCAL_SETTINGS.requestThrottleMs);
});

test('tracks session unlock state without persisting key material', async () => {
  const session = await createSessionKey('history', 'unlock-key', '2026-06-16T00:00:00.000Z');
  const unlock = new SessionUnlockState();

  assert.deepEqual(unlock.snapshot, { status: 'locked' });
  unlock.unlock(session.reference, session.key, '2026-06-16T00:00:00.000Z');
  assert.deepEqual(unlock.snapshot, {
    status: 'unlocked',
    keyReference: session.reference,
    unlockedAt: '2026-06-16T00:00:00.000Z',
  });
  assert.equal(unlock.getActiveKey(session.reference), session.key);
  unlock.lock();
  assert.deepEqual(unlock.snapshot, { status: 'locked' });
});
