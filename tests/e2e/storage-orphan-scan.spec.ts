import type { Page, Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, launchPersistentExtensionSession, test } from './fixtures.js';

interface StorageUsageResponse {
  readonly type: 'imageTrail.storageUsageResponse';
  readonly version: number;
  readonly payload: {
    readonly totalBytes: number;
    readonly blobCount: number;
    readonly orphanedBlobCount?: number;
  };
}

interface CleanupOrphanedBlobsResponse {
  readonly type: 'imageTrail.cleanupOrphanedBlobsResult';
  readonly version: number;
  readonly payload: {
    readonly deletedCount: number;
    readonly usage: StorageUsageResponse['payload'];
  };
}

async function sendRequest<Response>(page: Page, type: string): Promise<Response> {
  return page.evaluate((messageType) => chrome.runtime.sendMessage({ type: messageType, version: 1, payload: {} }), type);
}

async function seedOldUnreferencedOriginal(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('image-trail');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(['blobs', 'originalBlobIndex'], 'readwrite');
    transaction.objectStore('blobs').put({
      id: 'e2e-orphan-638',
      kind: 'original',
      schemaVersion: 1,
      algorithm: 'AES-GCM',
      iv: 'AAAAAAAAAAAAAAAA',
      ciphertext: new ArrayBuffer(4_000_000),
      encryptedByteLength: 4_000_000,
      createdAt: '2026-01-01T00:00:00.000Z',
      key: {
        kind: 'blob',
        uuid: '00000000-0000-4000-8000-000000000638',
        reference: 'blob:00000000-0000-4000-8000-000000000638',
      },
      referenceCount: 1,
    });
    transaction.objectStore('originalBlobIndex').put({ id: 'e2e-orphan-638' });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('Orphan seed transaction aborted.'));
    });
    db.close();
  });
}

async function rejectBlobGetAll(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __imageTrailBlobGetAllCalls?: number;
      __imageTrailOriginalGetAll?: typeof IDBObjectStore.prototype.getAll;
    };
    const originalGetAll = IDBObjectStore.prototype.getAll;
    scope.__imageTrailBlobGetAllCalls = 0;
    scope.__imageTrailOriginalGetAll = originalGetAll;
    IDBObjectStore.prototype.getAll = new Proxy(originalGetAll, {
      apply(target, thisArg, args) {
        if ((thisArg as IDBObjectStore).name === 'blobs') {
          scope.__imageTrailBlobGetAllCalls = (scope.__imageTrailBlobGetAllCalls ?? 0) + 1;
          throw new Error('The orphan scan attempted to hydrate the encrypted blob store.');
        }
        return Reflect.apply(target, thisArg, args) as IDBRequest<unknown[]>;
      },
    });
  });
}

async function restoreBlobGetAll(serviceWorker: Worker): Promise<number> {
  return serviceWorker.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __imageTrailBlobGetAllCalls?: number;
      __imageTrailOriginalGetAll?: typeof IDBObjectStore.prototype.getAll;
    };
    const calls = scope.__imageTrailBlobGetAllCalls ?? 0;
    if (scope.__imageTrailOriginalGetAll) IDBObjectStore.prototype.getAll = scope.__imageTrailOriginalGetAll;
    delete scope.__imageTrailBlobGetAllCalls;
    delete scope.__imageTrailOriginalGetAll;
    return calls;
  });
}

test('storage usage and orphan cleanup never materialize encrypted blob values', async ({ headless }) => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'image-trail-storage-orphan-scan-'));
  const { context, serviceWorker } = await launchPersistentExtensionSession(userDataDir, headless);
  const page = await context.newPage();
  let blobGetAllCalls: number | undefined;

  try {
    const extensionId = /^chrome-extension:\/\/(?<id>[^/]+)/u.exec(serviceWorker.url())?.groups?.['id'];
    if (!extensionId) throw new Error(`Could not resolve extension id from ${serviceWorker.url()}`);
    await page.goto(`chrome-extension://${extensionId}/src/preview/preview.html`);
    await sendRequest<StorageUsageResponse>(page, 'imageTrail.storageUsageRequest');
    await seedOldUnreferencedOriginal(serviceWorker);
    await rejectBlobGetAll(serviceWorker);

    const usage = await sendRequest<StorageUsageResponse>(page, 'imageTrail.storageUsageRequest');
    expect(usage).toMatchObject({
      type: 'imageTrail.storageUsageResponse',
      version: 1,
      payload: { blobCount: 1, orphanedBlobCount: 1 },
    });
    expect(usage.payload.totalBytes).toBeGreaterThanOrEqual(4_000_000);

    const cleanup = await sendRequest<CleanupOrphanedBlobsResponse>(page, 'imageTrail.cleanupOrphanedBlobs');
    expect(cleanup).toMatchObject({
      type: 'imageTrail.cleanupOrphanedBlobsResult',
      version: 1,
      payload: { deletedCount: 1, usage: { blobCount: 0, orphanedBlobCount: 0 } },
    });
  } finally {
    try {
      blobGetAllCalls = await restoreBlobGetAll(serviceWorker);
    } finally {
      try {
        await context.close();
      } finally {
        await rm(userDataDir, { recursive: true, force: true });
      }
    }
  }

  expect(blobGetAllCalls).toBe(0);
});
