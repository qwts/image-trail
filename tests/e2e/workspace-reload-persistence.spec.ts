import { test as base, expect, type Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fixturePaths, fixtureUrl, launchPersistentExtensionSession } from './fixtures.js';
import {
  detachHistory,
  keyboardSnapLeft,
  openWorkspacePanel,
  openWorkspaceSystemSettings,
  workspaceViewport,
} from './workspace-test-helpers.js';

base('packaged extension restart restores private workspace state and reset removes it', async ({ headless }) => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'image-trail-workspace-reload-'));
  const first = await launchPersistentExtensionSession(userDataDir, headless);
  try {
    const page = await first.context.newPage();
    await page.setViewportSize(workspaceViewport);
    await page.goto(`${fixtureUrl(fixturePaths.workspaceHostMatrix)}?case=responsive&record=private-value`);
    await openWorkspacePanel(page, first.serviceWorker);
    await openWorkspaceSystemSettings(page);
    await page.getByLabel('Restore workspace layout per site').check();
    await page.getByRole('button', { name: 'Hide settings' }).click();
    await keyboardSnapLeft(page, await detachHistory(page));
    await page.waitForTimeout(700);

    const records = await workspaceMetadata(first.serviceWorker);
    const layout = records.find((record) => record['kind'] === 'workspaceLayoutV2');
    expect(String(layout?.['key'])).toMatch(/^workspace-layout:v2:[A-Za-z0-9_-]{43}$/u);
    expect(JSON.stringify(records)).not.toMatch(/127\.0\.0\.1|workspace-host-matrix|private-value|asset-one/iu);
    await page.close();
  } finally {
    await first.context.close();
  }

  const second = await launchPersistentExtensionSession(userDataDir, headless);
  try {
    const page = await second.context.newPage();
    await page.setViewportSize(workspaceViewport);
    await page.goto(`${fixtureUrl(fixturePaths.workspaceHostMatrix)}?case=responsive&record=another-private-value`);
    await openWorkspacePanel(page, second.serviceWorker);
    const rail = page.locator('.image-trail-workspace__rail[data-edge="left"]');
    await expect(rail).toBeVisible();
    await expect(rail.locator('[data-image-trail-detached-window="history"]')).toBeVisible();

    await openWorkspaceSystemSettings(page);
    await page.getByRole('button', { name: 'Reset workspace layout' }).click();
    await expect(rail).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Detach Recent history into a floating window (drag to place)' })).toBeVisible();
    expect((await workspaceMetadata(second.serviceWorker)).some((record) => record['kind'] === 'workspaceLayoutV2')).toBe(false);
  } finally {
    await second.context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

async function workspaceMetadata(worker: Worker): Promise<Record<string, unknown>[]> {
  return worker.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('image-trail', 9);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const transaction = db.transaction('metadata', 'readonly');
        const request = transaction.objectStore('metadata').getAll();
        request.onsuccess = () =>
          resolve((request.result as Record<string, unknown>[]).filter((record) => String(record['kind']).startsWith('workspaceLayout')));
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}
