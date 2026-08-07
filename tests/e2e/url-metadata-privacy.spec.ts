import type { Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  closeSettings,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixturePaths,
  fixtureUrl,
  openFixturePage,
  openSettingsGroup,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

const privateToken = 'private-url-metadata-641';

async function openParsedFields(page: Page): Promise<void> {
  const fields = page.locator('.image-trail-panel__fields');
  if ((await fields.getAttribute('open')) === null) await page.getByRole('button', { name: 'Show Field Editor' }).click();
}

async function urlMetadataRows(worker: Worker): Promise<Record<string, unknown>[]> {
  return worker.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('image-trail');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const transaction = db.transaction('metadata', 'readonly');
        const request = transaction.objectStore('metadata').getAll();
        request.onsuccess = () =>
          resolve(
            (request.result as Record<string, unknown>[]).filter((record) =>
              ['parsedFieldState', 'parsedFieldStateEncrypted', 'urlReviewStatus', 'urlReviewStatusEncrypted'].includes(
                String(record['kind']),
              ),
            ),
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  });
}

async function metadataMode(worker: Worker): Promise<string | null> {
  return worker.evaluate(async () => {
    const raw = (await chrome.storage.local.get('imageTrail.localSettings'))['imageTrail.localSettings'];
    const settings = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? {}) as Record<string, unknown>);
    const policy = settings['searchableMetadataPolicy'] as { urlDerived?: unknown } | undefined;
    return typeof policy?.urlDerived === 'string' ? policy.urlDerived : null;
  });
}

test('packaged policy toggle encrypts URL workflow rows and preserves new saves', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await applyUrlInEditor(page, fixtureUrl(`/assets/asset-one.svg?frame=641&token=${privateToken}`));
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*asset-one\.svg\?frame=641/u);
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /Image loaded but did not change\.|(?:Loaded|Applied) .*asset-one\.svg\?frame=642/u);

  await expect
    .poll(() => metadataRowState(serviceWorker, 'plaintext'))
    .toEqual({
      hasParsedState: true,
      hasReviewStatus: true,
      onlyExpectedMode: true,
    });
  expect(JSON.stringify(await urlMetadataRows(serviceWorker))).toContain(privateToken);

  await openSettingsGroup(page, 'Privacy');
  await page.getByLabel('Image URLs').selectOption('encrypted');
  await expect.poll(() => metadataMode(serviceWorker)).toBe('encrypted');
  await expect
    .poll(() => metadataRowState(serviceWorker, 'encrypted'))
    .toEqual({
      hasParsedState: true,
      hasReviewStatus: true,
      onlyExpectedMode: true,
    });

  await closeSettings(page);
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /Image loaded but did not change\.|(?:Loaded|Applied) .*asset-one\.svg\?frame=643/u);

  const encryptedRows = await urlMetadataRows(serviceWorker);
  const serialized = JSON.stringify(encryptedRows);
  expect(encryptedRows.some((record) => record['kind'] === 'parsedFieldStateEncrypted')).toBe(true);
  expect(encryptedRows.some((record) => record['kind'] === 'urlReviewStatusEncrypted')).toBe(true);
  expect(serialized).not.toMatch(/127\.0\.0\.1|asset-one|private-url-metadata|frame=64/iu);
  for (const record of encryptedRows) {
    expect(String(record['key'])).toMatch(/^(?:parsed-field-state|url-review-status):v2:[0-9a-f]{64}:[0-9a-f]{64}$/u);
  }
});

async function metadataRowState(
  worker: Worker,
  mode: 'plaintext' | 'encrypted',
): Promise<{ readonly hasParsedState: boolean; readonly hasReviewStatus: boolean; readonly onlyExpectedMode: boolean }> {
  const rows = await urlMetadataRows(worker);
  const parsedKind = mode === 'plaintext' ? 'parsedFieldState' : 'parsedFieldStateEncrypted';
  const reviewKind = mode === 'plaintext' ? 'urlReviewStatus' : 'urlReviewStatusEncrypted';
  return {
    hasParsedState: rows.some((record) => record['kind'] === parsedKind),
    hasReviewStatus: rows.some((record) => record['kind'] === reviewKind),
    onlyExpectedMode: rows.every((record) => record['kind'] === parsedKind || record['kind'] === reviewKind),
  };
}
