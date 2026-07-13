import test from 'node:test';
import assert from 'node:assert/strict';

import type { CaptureStore } from '../extension/src/content/capture-controller.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { CaptureResult } from '../extension/src/core/image/capture-result.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { BookmarkStore, PanelState } from '../extension/src/core/types.js';
import {
  MissingOriginalRepairController,
  type MissingOriginalRepairControllerDeps,
} from '../extension/src/ui/panel/missing-original-repair-controller.js';

const CAPTURED: CaptureResult = { status: 'captured', blobId: 'blob-new', mimeType: 'image/jpeg', byteLength: 2048 };

function pin(id: string, options: { readonly blobId?: string; readonly url?: string; readonly locked?: boolean } = {}): ImageDisplayRecord {
  const blobId = options.blobId;
  return createDisplayRecord({
    id,
    url: options.url ?? `https://example.test/${id}.jpg`,
    source: 'bookmark',
    queueUpdatedAt: `2026-07-13T12:00:0${id.at(-1) ?? '0'}.000Z`,
    privacyStatus: options.locked ? 'locked' : 'unlocked',
    captureStatus: blobId ? 'captured' : undefined,
    blobId,
    storedOriginal: blobId ? { blobId, mimeType: 'image/jpeg', byteLength: 1024, capturedAt: '2026-07-13T12:00:00.000Z' } : undefined,
  });
}

function createHarness(options: {
  readonly records: readonly ImageDisplayRecord[];
  readonly missingBlobIds?: readonly string[];
  readonly verificationError?: string;
  readonly captureResults?: readonly (CaptureResult | null)[];
}) {
  let state: PanelState = { ...createInitialPanelState(0), bookmarks: options.records };
  const log: string[] = [];
  const captureResults = [...(options.captureResults ?? [])];
  const captureStore = {
    requestMissingOriginalBlobIds: async (blobIds: readonly string[]) => {
      log.push(`verify:${blobIds.join(',')}`);
      return options.verificationError
        ? ({ ok: false, reason: 'db-unavailable', message: options.verificationError } as const)
        : ({ ok: true, missingBlobIds: options.missingBlobIds ?? [] } as const);
    },
  } as unknown as CaptureStore;
  const bookmarkStore = {
    loadByIds: async (ids: readonly string[]) => {
      log.push(`load:${ids.join(',')}`);
      return options.records.filter((record) => ids.includes(record.id));
    },
  } as unknown as BookmarkStore;
  const deps: MissingOriginalRepairControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    captureStore: () => captureStore,
    bookmarkStore: () => bookmarkStore,
    captureBookmark: async (record) => {
      log.push(`capture:${record.id}:${record.queueUpdatedAt ?? ''}`);
      return captureResults.shift() ?? CAPTURED;
    },
  };
  return { controller: new MissingOriginalRepairController(deps), log, getState: () => state };
}

test('repairSelected verifies durable records and leaves present originals untouched', async () => {
  const existing = pin('pin-1', { blobId: 'blob-present' });
  const harness = createHarness({ records: [existing] });

  await harness.controller.repairSelected([existing.id]);

  assert.deepEqual(harness.log, ['render', 'load:pin-1', 'verify:blob-present', 'render']);
  assert.equal(harness.getState().message, 'Selected queue originals are already present.');
});

test('repairSelected repairs metadata-only and missing-blob pins in selected order', async () => {
  const metadataOnly = pin('pin-1');
  const missingBlob = pin('pin-2', { blobId: 'blob-missing' });
  const present = pin('pin-3', { blobId: 'blob-present' });
  const harness = createHarness({ records: [metadataOnly, missingBlob, present], missingBlobIds: ['blob-missing'] });

  await harness.controller.repairSelected([metadataOnly.id, missingBlob.id, present.id]);

  assert.deepEqual(
    harness.log.filter((entry) => entry.startsWith('capture:')),
    [`capture:pin-1:${metadataOnly.queueUpdatedAt ?? ''}`, `capture:pin-2:${missingBlob.queueUpdatedAt ?? ''}`],
  );
  assert.equal(harness.getState().message, 'Repaired 2 missing originals without changing queue order.');
});

test('repairSelected stops at a permission boundary so retry context is not overwritten', async () => {
  const permissionNeeded: CaptureResult = {
    status: 'failed',
    reason: 'permission-needed',
    message: 'Permission needed.',
    origin: 'https://cdn.example.test',
  };
  const records = [pin('pin-1'), pin('pin-2')];
  const harness = createHarness({ records, captureResults: [permissionNeeded, CAPTURED] });

  await harness.controller.repairSelected(records.map((record) => record.id));

  assert.equal(harness.log.filter((entry) => entry.startsWith('capture:')).length, 1);
  assert.equal(harness.getState().message, 'Permission needed.');
});

test('repairSelected reports verification failures and unrepairable private rows', async () => {
  const failed = createHarness({ records: [pin('pin-1', { blobId: 'blob-missing' })], verificationError: 'Database unavailable.' });
  await failed.controller.repairSelected(['pin-1']);
  assert.equal(failed.getState().status, 'error');
  assert.equal(failed.getState().message, 'Could not verify selected originals: Database unavailable.');

  const locked = createHarness({ records: [pin('pin-2', { locked: true, url: 'image-trail-private:pin-2' })] });
  await locked.controller.repairSelected(['pin-2']);
  assert.equal(locked.getState().status, 'error');
  assert.equal(locked.getState().message, 'Selected missing originals do not have a repairable image URL.');
});
