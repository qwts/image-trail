import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Download, Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  clearDownloadRequestLog,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  imageNavigationSnapshot,
  installDownloadRequestLog,
  openFixturePage,
  readDownloadRequestLog,
  test,
  togglePanelFromExtensionAction,
  type ExtensionDownloadRequest,
} from './fixtures.js';

const primaryImage = '#fixture-primary-image';
const password = 'correct horse battery staple';
const wrongPassword = 'wrong horse battery staple';

const oversizedAssetRoute = '/assets/generated-oversized.svg';
// Just past DEFAULT_MAX_ORIGINAL_BYTES (25 MiB), so the background capture fetch
// must refuse the original on its declared Content-Length.
const oversizedAssetBytes = 26 * 1024 * 1024;

test.beforeAll(async () => {
  const assetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pages', oversizedAssetRoute);
  const existing = await stat(assetPath).catch(() => null);
  if (existing && existing.size >= oversizedAssetBytes) return;
  const head = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#7744aa"/><!--';
  const tail = '--></svg>';
  await writeFile(assetPath, head + 'x'.repeat(oversizedAssetBytes - head.length - tail.length) + tail);
});

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

async function showSettings(page: Page): Promise<void> {
  const showSettingsButton = page.getByRole('button', { name: 'Show settings' });
  if ((await showSettingsButton.count()) > 0) await showSettingsButton.click();
}

async function openSettingsGroup(page: Page, name: string): Promise<void> {
  await showSettings(page);
  const group = page.getByRole('heading', { name }).locator('xpath=ancestor::details[1]');
  if (!(await group.evaluate((element) => element.hasAttribute('open')))) await page.getByRole('heading', { name }).click();
}

async function openImageUtilities(page: Page): Promise<void> {
  await openSettingsGroup(page, 'Image utilities');
}

async function setVisiblePins(page: Page, value: string, expectedVisibleCount: number): Promise<void> {
  await openSettingsGroup(page, 'Display');
  const pins = page
    .getByRole('heading', { name: 'Pins' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await pins.locator('input[type="number"]').fill(value);
  await pins.locator('button', { hasText: 'Apply' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(expectedVisibleCount);
}

async function openEncryptedOriginals(page: Page): Promise<void> {
  await openSettingsGroup(page, 'Encrypted originals');
}

async function openQueueMenu(page: Page): Promise<void> {
  const queueMenu = page.getByTitle('Queue scope and maintenance actions.');
  if ((await queueMenu.getAttribute('aria-expanded')) !== 'true') await queueMenu.click();
}

async function deleteVisibleRecents(page: Page): Promise<void> {
  const deleteRecents = page.getByRole('button', { name: /Delete recents/u });
  if ((await deleteRecents.count()) > 0) await deleteRecents.click();
}

async function deleteVisibleQueueRows(page: Page): Promise<void> {
  for (;;) {
    const rows = page.locator('.image-trail-panel__bookmark-item');
    const count = await rows.count();
    if (count === 0) return;
    await rows.first().getByRole('button', { name: 'Delete', exact: true }).click({ force: true });
    await expect(rows).toHaveCount(count - 1);
  }
}

async function setupEncryptedOriginals(page: Page, value = password): Promise<void> {
  await openEncryptedOriginals(page);
  await page.getByLabel('New encrypted originals password').fill(value);
  await page.getByRole('button', { name: 'Create first key' }).click();
  await expectPanelStatusMessage(page, /Encrypted blob storage unlocked with blob:[a-f0-9-]+\./u);
  await expect(page.locator('.image-trail-panel__encryption-badge')).toHaveText('Unlocked');
}

async function clearEncryptedOriginalsKey(page: Page): Promise<void> {
  await openEncryptedOriginals(page);
  await page.getByRole('button', { name: 'Clear key' }).click();
  await page.getByRole('button', { name: 'Confirm clear key' }).click();
  await expectPanelStatusMessage(page, /Encrypted blob key cleared\. Import a key backup to recover encrypted originals\./u);
}

async function exportImages(page: Page, serviceWorker: Worker, options: { readonly saveAs?: boolean } = {}): Promise<void> {
  await openImageUtilities(page);
  await clearDownloadRequestLog(serviceWorker);
  await page.getByRole('button', { name: /Export images/u }).click({ modifiers: options.saveAs ? ['Shift'] : [] });
  await expectPanelStatusMessage(page, /Image export started\.|Started \d+ image downloads\./u);
}

async function exportEncryptedImage(page: Page): Promise<{ readonly download: Download; readonly fileContent: string }> {
  await openImageUtilities(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export encrypted/u }).click()]);
  const path = await download.path();
  expect(path).not.toBeNull();
  await expectPanelStatusMessage(page, /Encrypted image export started\./u);
  return { download, fileContent: await readFile(path!, 'utf8') };
}

async function importEncryptedImage(page: Page, fileContent: string, fileName = 'asset-one.image-trail-encrypted.json'): Promise<void> {
  await openImageUtilities(page);
  const imageUtilities = page.locator('.image-trail-panel__image-transfer');
  await imageUtilities
    .locator('input[type="file"][accept=".json,.image-trail-encrypted.json"]')
    .setInputFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(fileContent) });
  await imageUtilities.getByRole('button', { name: 'Import encrypted' }).click();
}

async function waitForDownloadRequests(serviceWorker: Worker, count: number) {
  let snapshot: ExtensionDownloadRequest[] = [];
  await expect
    .poll(async () => {
      snapshot = await readDownloadRequestLog(serviceWorker);
      return snapshot.length;
    })
    .toBe(count);
  return snapshot;
}

async function encryptedOriginalsStorageText(page: Page): Promise<string> {
  await openSettingsGroup(page, 'Maintenance');
  const usage = page
    .locator('.image-trail-panel__storage-health dt', { hasText: 'Encrypted originals' })
    .locator('xpath=following-sibling::dd[1]');
  return (await usage.textContent()) ?? '';
}

async function clearSelectedQueueRows(page: Page) {
  const selectedQueueRows = page.locator('.image-trail-panel__bookmark-item.is-selected');
  while ((await selectedQueueRows.count()) > 0) {
    await selectedQueueRows.first().dispatchEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  }
}

test('exports the current host image and records shifted Save As metadata', async ({ page, serviceWorker }) => {
  await installDownloadRequestLog(serviceWorker);
  await openPanel(page, serviceWorker);

  await exportImages(page, serviceWorker, { saveAs: true });

  const downloads = await waitForDownloadRequests(serviceWorker, 1);
  expect(downloads[0]).toMatchObject({
    url: fixtureUrl(fixtureAssetPaths.assetOne),
    filename: 'asset-one.svg',
    saveAs: true,
    conflictAction: 'uniquify',
  });
});

test('exports selected recents, queue rows, and Recall rows in UI order', async ({ page, serviceWorker }) => {
  test.setTimeout(60_000);
  await installDownloadRequestLog(serviceWorker);
  await openPanel(page, serviceWorker);
  await deleteVisibleRecents(page);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetOne));
  await expectPanelStatusMessage(page, /Loaded .*asset-one\.svg|Image loaded but did not change\./u);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetThree));
  await expectPanelStatusMessage(page, /Loaded .*asset-three\.svg/u);

  await page.getByRole('button', { name: 'Select all recents' }).click();
  await exportImages(page, serviceWorker);
  let downloads = await waitForDownloadRequests(serviceWorker, 3);
  expect(downloads.map((download) => download.filename)).toEqual(['asset-three.svg', 'asset-two.svg', 'asset-one.svg']);

  await page.locator('.image-trail-panel__history-item', { hasText: 'asset-three.svg' }).click();
  await page.getByRole('button', { name: 'Pin current' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-three.svg' })).toBeVisible();
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await page.getByRole('button', { name: 'Pin current' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-two.svg' })).toBeVisible();
  await openQueueMenu(page);
  await page.getByRole('button', { name: 'Select all queue' }).click();
  await exportImages(page, serviceWorker);
  downloads = await waitForDownloadRequests(serviceWorker, 2);
  expect(downloads.map((download) => download.filename)).toEqual(['asset-two.svg', 'asset-three.svg']);
  await clearSelectedQueueRows(page);
  await expect(page.locator('.image-trail-panel__bookmark-item.is-selected')).toHaveCount(0);

  await setVisiblePins(page, '1', 1);
  await page.getByRole('button', { name: 'Recall' }).click();
  await expect(page.getByRole('dialog', { name: 'Recall' })).toBeVisible();
  await page.getByRole('button', { name: 'Select all Recall' }).click();
  await exportImages(page, serviceWorker);
  downloads = await waitForDownloadRequests(serviceWorker, 1);
  expect(downloads.map((download) => download.filename)).toEqual(['asset-three.svg']);

  await page.getByRole('dialog', { name: 'Recall' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('dialog', { name: 'Recall' })).toHaveCount(0);
  await setVisiblePins(page, '30', 2);
});

test('captures originals, prefers stored bytes for export, and round-trips encrypted image files fail closed', async ({
  page,
  serviceWorker,
}) => {
  test.setTimeout(60_000);
  await installDownloadRequestLog(serviceWorker);
  await openPanel(page, serviceWorker);
  await setupEncryptedOriginals(page);

  await page.getByRole('button', { name: 'Pin current' }).click();
  const queueRow = page.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-one.svg' });
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole('button', { name: 'Capture' }).click();
  await expectPanelStatusMessage(page, /Captured \d+\.\d KB image\./u);
  await expect(queueRow.locator('.image-trail-panel__stored-original-dot')).toHaveAttribute('title', 'Original stored');

  await openQueueMenu(page);
  await page.getByRole('button', { name: 'Select captured bookmarks' }).click();
  await openImageUtilities(page);
  await expect(page.getByRole('button', { name: 'Export images (1)' })).toBeVisible();
  await exportImages(page, serviceWorker);
  const plainDownloads = await waitForDownloadRequests(serviceWorker, 1);
  expect(plainDownloads[0]?.url).toMatch(/^data:image\/svg\+xml;base64,/u);
  expect(plainDownloads[0]?.filename).toBe('asset-one.svg');

  const { download, fileContent } = await exportEncryptedImage(page);
  expect(download.suggestedFilename()).toBe('asset-one.svg.image-trail-encrypted.json');
  const encryptedExport = JSON.parse(fileContent) as { readonly header: { readonly payloadType: string; readonly recordCount: number } };
  expect(encryptedExport.header).toMatchObject({ payloadType: 'image', recordCount: 1 });

  const bookmarkCountBeforeFailures = await page.locator('.image-trail-panel__bookmark-item').count();
  await importEncryptedImage(page, fileContent);
  await expectPanelStatusMessage(page, /Imported 1 encrypted image into bookmarks and recent history\./u);
  const bookmarkCountAfterImport = await page.locator('.image-trail-panel__bookmark-item').count();
  expect(bookmarkCountAfterImport).toBeGreaterThanOrEqual(bookmarkCountBeforeFailures);
  await page.locator('.image-trail-panel__history-item', { hasText: 'asset-one.svg' }).first().click();
  const imported = await imageNavigationSnapshot(page, primaryImage);
  expect(imported.src).toMatch(/^data:image\/svg\+xml;base64,/u);

  const historyCountBeforeWrongType = await page.locator('.image-trail-panel__history-item').count();
  await importEncryptedImage(page, JSON.stringify({ header: { payloadType: 'bookmarks' }, payload: '' }), 'wrong-type.json');
  await expectPanelStatusMessage(page, /Invalid export file|Unexpected payload type/u);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(bookmarkCountAfterImport);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(historyCountBeforeWrongType);

  await deleteVisibleQueueRows(page);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
  await clearEncryptedOriginalsKey(page);
  await setupEncryptedOriginals(page, wrongPassword);
  const historyCountBeforeWrongKey = await page.locator('.image-trail-panel__history-item').count();
  await importEncryptedImage(page, fileContent);
  await expectPanelStatusMessage(page, /Unlock blob:[a-f0-9-]+ before importing this encrypted image\./u);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(historyCountBeforeWrongKey);
});

test('refuses to store oversized originals and keeps stored-original usage bounded', async ({ page, serviceWorker }) => {
  test.setTimeout(60_000);
  await openPanel(page, serviceWorker);
  // The extension context is shared across tests in this file: earlier tests can
  // leave a key (locked with another password) and orphaned blobs behind.
  await openEncryptedOriginals(page);
  if ((await page.getByRole('button', { name: 'Clear key' }).count()) > 0) await clearEncryptedOriginalsKey(page);
  await setupEncryptedOriginals(page);

  await page.getByRole('button', { name: 'Pin current' }).click();
  const baselineRow = page.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-one.svg' });
  await expect(baselineRow).toBeVisible();
  await baselineRow.getByRole('button', { name: 'Capture' }).click();
  await expectPanelStatusMessage(page, /Captured \d+\.\d KB image\./u);
  await expect(baselineRow.locator('.image-trail-panel__stored-original-dot')).toHaveAttribute('title', 'Original stored');
  // The capture flow refreshes storage usage after every attempt, so the
  // Storage health readout is current after each capture completes.
  const baselineUsage = await encryptedOriginalsStorageText(page);
  expect(baselineUsage).toMatch(/^1 record ·/u);

  // The acceptance flow captures the host page's own oversized image: the panel's
  // URL editor already refuses oversized loads, so navigate to a fixture whose
  // single image is the oversized asset and let panel open auto-select it.
  await openFixturePage(page, fixturePaths.oversizedImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  const oversizedRecent = page.locator('.image-trail-panel__history-item', { hasText: 'generated-oversized.svg' });
  await expect(oversizedRecent).toBeVisible();

  await oversizedRecent.getByRole('button', { name: 'Capture', exact: true }).click();
  // Capture failures surface through the status toast, not the header status line.
  await expect(page.locator('.image-trail-panel__toast-message')).toHaveText(/exceeds limit|exceeds the 25 MB size limit/u);
  // The refused record stays a valid recents row without a stored-original marker,
  // and the originals count/bytes stay at the pre-attempt baseline.
  await expect(oversizedRecent).toBeVisible();
  await expect(oversizedRecent).not.toContainText('Captured original');
  expect(await encryptedOriginalsStorageText(page)).toBe(baselineUsage);

  // The extension context is shared with later spec files: drop the queue rows
  // this test pinned so their exports keep their expected record counts.
  await deleteVisibleQueueRows(page);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
});
