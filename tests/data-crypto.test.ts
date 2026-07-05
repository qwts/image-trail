import test from 'node:test';
import assert from 'node:assert/strict';
import { openJsonEnvelope, sealJsonEnvelope } from '../extension/src/data/crypto/envelope.js';
import { createKeyReference } from '../extension/src/data/crypto/key-reference.js';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { DEFAULT_LOCAL_SETTINGS, LocalSettingsRepository } from '../extension/src/data/local-settings.js';
import { SessionUnlockState } from '../extension/src/data/runtime/session-unlock.js';
import { DATA_STORE_NAMES, IMAGE_TRAIL_DB_NAME, IMAGE_TRAIL_DB_VERSION } from '../extension/src/data/schema.js';

test('defines a versioned IndexedDB schema with durable encrypted stores', () => {
  assert.equal(IMAGE_TRAIL_DB_NAME, 'image-trail');
  assert.equal(IMAGE_TRAIL_DB_VERSION, 7);
  assert.deepEqual(DATA_STORE_NAMES, [
    'metadata',
    'keys',
    'history',
    'bookmarks',
    'blobs',
    'downloads',
    'encryptedPins',
    'encryptedPinThumbnails',
  ]);
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

test('supports blob key references for encrypted original storage', () => {
  assert.deepEqual(createKeyReference('blob', 'blob-key-001'), {
    kind: 'blob',
    uuid: 'blob-key-001',
    reference: 'blob:blob-key-001',
  });
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
  assert.equal(repository.load().visibleBookmarkSoftMax, 30);
  assert.equal(repository.load().recentHistoryLimit, 30);
  assert.equal(repository.load().recentHistoryRetainedLimit, 30);
  assert.equal(repository.load().recentHistoryOverflowBehavior, 'drop-oldest');
  assert.equal(repository.load().bookmarkVisibilityScope, 'global');
  assert.equal(repository.load().pinSaveStoragePreference, 'encrypted');
  assert.equal(repository.load().privacyModeEnabled, false);
  assert.equal(repository.load().previewObjectFit, 'contain');
  assert.equal(repository.load().previewFillScreen, true);
  assert.equal(repository.load().urlReviewStatusLimit, 5000);
  assert.equal(repository.load().clearUrlReviewStatusAfterExport, false);
  assert.equal(repository.load().neighborPreloadEnabled, false);
  assert.equal(repository.load().neighborPreloadRadius, 3);
  assert.equal(repository.load().neighborPreloadCacheLimit, 24);
  assert.equal(repository.load().neighborPreloadProbeMethod, 'get');
  assert.equal(repository.load().secondaryControlsOpen, false);
  repository.save({ ...DEFAULT_LOCAL_SETTINGS, pinSaveStoragePreference: 'plaintext' });
  assert.equal(repository.load().pinSaveStoragePreference, 'plaintext');
});

test('migrates secondary controls disclosure local setting safely', () => {
  const open = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ secondaryControlsOpen: true }),
    setItem: () => {},
  });
  const invalid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ secondaryControlsOpen: 'yes' }),
    setItem: () => {},
  });

  assert.equal(open.load().secondaryControlsOpen, true);
  assert.equal(invalid.load().secondaryControlsOpen, false);
});

test('migrates preview preference local settings safely', () => {
  const valid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ previewObjectFit: 'cover', previewFillScreen: false }),
    setItem: () => {},
  });
  const invalid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ previewObjectFit: 'stretch', previewFillScreen: 'no' }),
    setItem: () => {},
  });

  assert.equal(valid.load().previewObjectFit, 'cover');
  assert.equal(valid.load().previewFillScreen, false);
  assert.equal(invalid.load().previewObjectFit, DEFAULT_LOCAL_SETTINGS.previewObjectFit);
  assert.equal(invalid.load().previewFillScreen, DEFAULT_LOCAL_SETTINGS.previewFillScreen);
});

test('migrates build info overlay visibility local settings safely', () => {
  const visible = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ buildInfoOverlayVisible: true }),
    setItem: () => {},
  });
  const hidden = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ buildInfoOverlayVisible: false }),
    setItem: () => {},
  });
  const missing = new LocalSettingsRepository({
    getItem: () => JSON.stringify({}),
    setItem: () => {},
  });

  assert.equal(visible.load().buildInfoOverlayVisible, true);
  assert.equal(hidden.load().buildInfoOverlayVisible, false);
  assert.equal(missing.load().buildInfoOverlayVisible, DEFAULT_LOCAL_SETTINGS.buildInfoOverlayVisible);
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
    getItem: () =>
      JSON.stringify({
        requestThrottleMs: 60_001,
        requestThrottleMaxRequests: 1_001,
        requestThrottleWindowMs: 300_001,
      }),
    setItem: () => {},
  });
  const negative = new LocalSettingsRepository({
    getItem: () =>
      JSON.stringify({
        requestThrottleMs: -1,
        requestThrottleMaxRequests: 0,
        requestThrottleWindowMs: 999,
      }),
    setItem: () => {},
  });
  const valid = new LocalSettingsRepository({
    getItem: () =>
      JSON.stringify({
        requestThrottleMs: 100,
        requestThrottleMaxRequests: 12,
        requestThrottleWindowMs: 5_000,
      }),
    setItem: () => {},
  });
  const fractionalMinimum = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ requestThrottleMs: 100.5 }),
    setItem: () => {},
  });

  assert.equal(high.load().requestThrottleMs, DEFAULT_LOCAL_SETTINGS.requestThrottleMs);
  assert.equal(high.load().requestThrottleMaxRequests, DEFAULT_LOCAL_SETTINGS.requestThrottleMaxRequests);
  assert.equal(high.load().requestThrottleWindowMs, DEFAULT_LOCAL_SETTINGS.requestThrottleWindowMs);
  assert.equal(negative.load().requestThrottleMs, DEFAULT_LOCAL_SETTINGS.requestThrottleMs);
  assert.equal(negative.load().requestThrottleMaxRequests, DEFAULT_LOCAL_SETTINGS.requestThrottleMaxRequests);
  assert.equal(negative.load().requestThrottleWindowMs, DEFAULT_LOCAL_SETTINGS.requestThrottleWindowMs);
  assert.equal(fractionalMinimum.load().requestThrottleMs, DEFAULT_LOCAL_SETTINGS.requestThrottleMs);
  assert.equal(valid.load().requestThrottleMs, 100);
  assert.equal(valid.load().requestThrottleMaxRequests, 12);
  assert.equal(valid.load().requestThrottleWindowMs, 5_000);
});

test('rejects out-of-range bookmark soft max setting migrations', () => {
  const high = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ visibleBookmarkSoftMax: 201 }),
    setItem: () => {},
  });
  const low = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ visibleBookmarkSoftMax: 0 }),
    setItem: () => {},
  });
  const valid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ visibleBookmarkSoftMax: 75 }),
    setItem: () => {},
  });

  assert.equal(high.load().visibleBookmarkSoftMax, DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax);
  assert.equal(low.load().visibleBookmarkSoftMax, DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax);
  assert.equal(valid.load().visibleBookmarkSoftMax, 75);
});

test('migrates recent history retention settings safely', () => {
  const high = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryLimit: 201 }),
    setItem: () => {},
  });
  const low = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryLimit: 0 }),
    setItem: () => {},
  });
  const validDrop = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryLimit: 75, recentHistoryRetainedLimit: 80, recentHistoryOverflowBehavior: 'drop-oldest' }),
    setItem: () => {},
  });
  const validKeep = new LocalSettingsRepository({
    getItem: () =>
      JSON.stringify({ recentHistoryLimit: 12, recentHistoryRetainedLimit: 20, recentHistoryOverflowBehavior: 'keep-session' }),
    setItem: () => {},
  });
  const missingDropRetained = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryLimit: 8, recentHistoryOverflowBehavior: 'drop-oldest' }),
    setItem: () => {},
  });
  const missingKeepRetained = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryLimit: 8, recentHistoryOverflowBehavior: 'keep-session' }),
    setItem: () => {},
  });
  const retainedBelowVisible = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryLimit: 12, recentHistoryRetainedLimit: 6, recentHistoryOverflowBehavior: 'keep-session' }),
    setItem: () => {},
  });
  const invalidRetained = new LocalSettingsRepository({
    getItem: () =>
      JSON.stringify({ recentHistoryLimit: 50, recentHistoryRetainedLimit: 999, recentHistoryOverflowBehavior: 'keep-session' }),
    setItem: () => {},
  });
  const invalidBehavior = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ recentHistoryOverflowBehavior: 'pin-overflow' }),
    setItem: () => {},
  });

  assert.equal(high.load().recentHistoryLimit, DEFAULT_LOCAL_SETTINGS.recentHistoryLimit);
  assert.equal(low.load().recentHistoryLimit, DEFAULT_LOCAL_SETTINGS.recentHistoryLimit);
  assert.equal(validDrop.load().recentHistoryLimit, 75);
  assert.equal(validDrop.load().recentHistoryRetainedLimit, 80);
  assert.equal(validDrop.load().recentHistoryOverflowBehavior, 'drop-oldest');
  assert.equal(validKeep.load().recentHistoryLimit, 12);
  assert.equal(validKeep.load().recentHistoryRetainedLimit, 20);
  assert.equal(validKeep.load().recentHistoryOverflowBehavior, 'keep-session');
  assert.equal(missingDropRetained.load().recentHistoryRetainedLimit, 8);
  assert.equal(missingKeepRetained.load().recentHistoryRetainedLimit, 200);
  assert.equal(retainedBelowVisible.load().recentHistoryRetainedLimit, 12);
  assert.equal(invalidRetained.load().recentHistoryRetainedLimit, 50);
  assert.equal(invalidBehavior.load().recentHistoryOverflowBehavior, DEFAULT_LOCAL_SETTINGS.recentHistoryOverflowBehavior);
});

test('migrates bookmark visibility scope setting safely', () => {
  const site = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ bookmarkVisibilityScope: 'site' }),
    setItem: () => {},
  });
  const invalid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ bookmarkVisibilityScope: 'nearby-domain' }),
    setItem: () => {},
  });

  assert.equal(site.load().bookmarkVisibilityScope, 'site');
  assert.equal(invalid.load().bookmarkVisibilityScope, DEFAULT_LOCAL_SETTINGS.bookmarkVisibilityScope);
});

test('migrates pin save storage preference setting safely', () => {
  const plaintext = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ pinSaveStoragePreference: 'plaintext' }),
    setItem: () => {},
  });
  const encrypted = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ pinSaveStoragePreference: 'encrypted' }),
    setItem: () => {},
  });
  const invalid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ pinSaveStoragePreference: 'private-ish' }),
    setItem: () => {},
  });

  assert.equal(plaintext.load().pinSaveStoragePreference, 'plaintext');
  assert.equal(encrypted.load().pinSaveStoragePreference, 'encrypted');
  assert.equal(invalid.load().pinSaveStoragePreference, DEFAULT_LOCAL_SETTINGS.pinSaveStoragePreference);
});

test('migrates privacy mode setting safely', () => {
  const enabled = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ privacyModeEnabled: true }),
    setItem: () => {},
  });
  const invalid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ privacyModeEnabled: 'yes' }),
    setItem: () => {},
  });

  assert.equal(enabled.load().privacyModeEnabled, true);
  assert.equal(invalid.load().privacyModeEnabled, false);
});

test('migrates URL review status retention settings safely', () => {
  const high = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ urlReviewStatusLimit: 20_001 }),
    setItem: () => {},
  });
  const low = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ urlReviewStatusLimit: 9 }),
    setItem: () => {},
  });
  const valid = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ urlReviewStatusLimit: 250, clearUrlReviewStatusAfterExport: true }),
    setItem: () => {},
  });
  const invalidClear = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ clearUrlReviewStatusAfterExport: 'yes' }),
    setItem: () => {},
  });

  assert.equal(high.load().urlReviewStatusLimit, DEFAULT_LOCAL_SETTINGS.urlReviewStatusLimit);
  assert.equal(low.load().urlReviewStatusLimit, DEFAULT_LOCAL_SETTINGS.urlReviewStatusLimit);
  assert.equal(valid.load().urlReviewStatusLimit, 250);
  assert.equal(valid.load().clearUrlReviewStatusAfterExport, true);
  assert.equal(invalidClear.load().clearUrlReviewStatusAfterExport, false);
});

test('migrates neighbor preload settings safely', () => {
  const high = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ neighborPreloadEnabled: true, neighborPreloadRadius: 6, neighborPreloadCacheLimit: 501 }),
    setItem: () => {},
  });
  const low = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ neighborPreloadEnabled: true, neighborPreloadRadius: -1, neighborPreloadCacheLimit: -1 }),
    setItem: () => {},
  });
  const valid = new LocalSettingsRepository({
    getItem: () =>
      JSON.stringify({
        neighborPreloadEnabled: true,
        neighborPreloadRadius: 3,
        neighborPreloadCacheLimit: 0,
        neighborPreloadProbeMethod: 'head',
      }),
    setItem: () => {},
  });
  const invalidEnabled = new LocalSettingsRepository({
    getItem: () => JSON.stringify({ neighborPreloadEnabled: 'yes', neighborPreloadRadius: 2, neighborPreloadProbeMethod: 'fetch' }),
    setItem: () => {},
  });

  assert.equal(high.load().neighborPreloadRadius, DEFAULT_LOCAL_SETTINGS.neighborPreloadRadius);
  assert.equal(high.load().neighborPreloadCacheLimit, DEFAULT_LOCAL_SETTINGS.neighborPreloadCacheLimit);
  assert.equal(low.load().neighborPreloadRadius, DEFAULT_LOCAL_SETTINGS.neighborPreloadRadius);
  assert.equal(low.load().neighborPreloadCacheLimit, DEFAULT_LOCAL_SETTINGS.neighborPreloadCacheLimit);
  assert.equal(valid.load().neighborPreloadEnabled, true);
  assert.equal(valid.load().neighborPreloadRadius, 3);
  assert.equal(valid.load().neighborPreloadCacheLimit, 0);
  assert.equal(valid.load().neighborPreloadProbeMethod, 'head');
  assert.equal(invalidEnabled.load().neighborPreloadEnabled, false);
  assert.equal(invalidEnabled.load().neighborPreloadProbeMethod, DEFAULT_LOCAL_SETTINGS.neighborPreloadProbeMethod);
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
