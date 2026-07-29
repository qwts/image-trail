import type { Page, Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, launchPersistentExtensionSession, test } from './fixtures.js';

interface BlobKeyStatusResponse {
  readonly type: string;
  readonly version: number;
  readonly payload: {
    readonly unlocked: boolean;
    readonly keyReference: string | null;
    readonly hasKey: boolean;
  };
}

async function seedBlockedUpgrade(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const globalScope = globalThis as typeof globalThis & { __imageTrailBlockedDb?: IDBDatabase };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('image-trail');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Could not reset the recovery-test database.'));
    });

    const blockingDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('image-trail', 12);
      request.onupgradeneeded = () => {
        const metadata = request.result.createObjectStore('metadata', { keyPath: 'key' });
        metadata.put({ key: 'schema', databaseVersion: 12, migratedAt: '2026-01-01T00:00:00.000Z' });
        const keys = request.result.createObjectStore('keys', { keyPath: 'reference' });
        keys.createIndex('keys.byKind', 'kind', { unique: false });
        keys.createIndex('keys.byUuid', 'uuid', { unique: true });
        keys.createIndex('keys.byReference', 'reference', { unique: true });
        keys.put({
          kind: 'blob',
          uuid: '00000000-0000-4000-8000-000000000637',
          reference: 'blob:00000000-0000-4000-8000-000000000637',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          wrapping: { mode: 'password', algorithm: 'AES-GCM', salt: 'AA==', iv: 'AA==', iterations: 1, wrappedKey: 'AA==' },
          extractable: false,
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    blockingDb.onversionchange = () => undefined;
    globalScope.__imageTrailBlockedDb = blockingDb;
  });
}

async function closeBlockedUpgrade(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(() => {
    const globalScope = globalThis as typeof globalThis & { __imageTrailBlockedDb?: IDBDatabase };
    globalScope.__imageTrailBlockedDb?.close();
    delete globalScope.__imageTrailBlockedDb;
  });
}

async function blobKeyStatus(page: Page): Promise<BlobKeyStatusResponse> {
  return page.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'imageTrail.blobKeyStatus',
      version: 1,
      payload: {},
    }),
  );
}

test('a blocked IndexedDB upgrade retries after the blocker closes without restarting the worker', async ({ headless }) => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'image-trail-database-recovery-'));
  const { context, serviceWorker } = await launchPersistentExtensionSession(userDataDir, headless);
  const page = await context.newPage();

  try {
    const extensionId = /^chrome-extension:\/\/(?<id>[^/]+)/u.exec(serviceWorker.url())?.groups?.['id'];
    if (!extensionId) throw new Error(`Could not resolve extension id from ${serviceWorker.url()}`);
    await seedBlockedUpgrade(serviceWorker);
    await page.goto(`chrome-extension://${extensionId}/src/preview/preview.html`);
    await expect(page.locator('#status')).toHaveText('Preview token is missing.');

    await closeBlockedUpgrade(serviceWorker);

    await expect
      .poll(async () => {
        const status = await blobKeyStatus(page);
        expect(status).toMatchObject({ type: 'imageTrail.blobKeyStatusResult', version: 1 });
        return status.payload.hasKey;
      })
      .toBe(true);
  } finally {
    try {
      await closeBlockedUpgrade(serviceWorker);
    } finally {
      try {
        await context.close();
      } finally {
        await rm(userDataDir, { recursive: true, force: true });
      }
    }
  }
});
