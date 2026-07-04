import type { Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  clearDownloadRequestLog,
  expect,
  expectPanelClosed,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  installDownloadRequestLog,
  openFixturePage,
  readDownloadRequestLog,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

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

async function openQueueMenu(page: Page): Promise<void> {
  const queueMenu = page.getByTitle('Queue scope and maintenance actions.');
  if ((await queueMenu.getAttribute('aria-expanded')) !== 'true') await queueMenu.click();
}

async function setVisiblePins(page: Page, value: string, expectedVisibleCount?: number): Promise<void> {
  await openSettingsGroup(page, 'Display');
  const pins = page
    .getByRole('heading', { name: 'Pins' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await pins.locator('input[type="number"]').fill(value);
  await pins.locator('button', { hasText: 'Apply' }).click();
  if (expectedVisibleCount !== undefined) {
    await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(expectedVisibleCount);
  }
}

async function setVisibleRecents(
  page: Page,
  input: { readonly limit: string; readonly overflow: 'Drop oldest' | 'Keep hidden this session'; readonly expectedVisibleCount?: number },
): Promise<void> {
  await openSettingsGroup(page, 'Display');
  const recents = page
    .getByRole('heading', { name: 'Recents' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await recents.locator('input[type="number"]').fill(input.limit);
  await recents.locator('select').selectOption({ label: input.overflow });
  await recents.locator('button', { hasText: 'Apply' }).click();
  if (input.expectedVisibleCount !== undefined) {
    await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(input.expectedVisibleCount);
  }
}

async function showHiddenRecents(page: Page, expectedVisibleCount: number): Promise<void> {
  await openSettingsGroup(page, 'Display');
  await page.getByRole('button', { name: 'Show hidden recents' }).click();
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(expectedVisibleCount);
}

async function deleteVisibleRecents(page: Page): Promise<void> {
  const deleteRecents = page.getByRole('button', { name: /Delete recents/u });
  if ((await deleteRecents.count()) > 0) await deleteRecents.click();
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
}

async function deleteAllDurableQueueRows(page: Page): Promise<void> {
  await openSettingsGroup(page, 'Maintenance');
  const deleteCurrent = page.getByRole('button', { name: /^Delete current queue \(\d+\)$/u });
  if ((await deleteCurrent.count()) > 0 && !(await deleteCurrent.isDisabled())) {
    await deleteCurrent.click();
    await page.getByRole('button', { name: /^Confirm Delete current queue \(\d+\)$/u }).click();
  }
  const deleteRecall = page.getByRole('button', { name: /^Delete Recall items \(\d+\)$/u });
  if ((await deleteRecall.count()) > 0 && !(await deleteRecall.isDisabled())) {
    await deleteRecall.click();
    await page.getByRole('button', { name: /^Confirm Delete Recall items \(\d+\)$/u }).click();
  }
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
}

async function pinCurrent(page: Page, filename: string): Promise<void> {
  await page.getByRole('button', { name: 'Pin current' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item', { hasText: filename })).toBeVisible();
}

async function exportImages(page: Page, serviceWorker: Worker): Promise<void> {
  await openImageUtilities(page);
  await clearDownloadRequestLog(serviceWorker);
  await page.getByRole('button', { name: /Export images/u }).click();
  await expectPanelStatusMessage(page, /Image export started\.|Started \d+ image downloads\./u);
}

async function waitForDownloadCount(serviceWorker: Worker, count: number): Promise<readonly string[]> {
  let filenames: readonly string[] = [];
  await expect
    .poll(async () => {
      filenames = (await readDownloadRequestLog(serviceWorker)).map((download) => download.filename ?? '');
      return filenames.length;
    })
    .toBe(count);
  return filenames;
}

async function clearSelectedQueueRows(page: Page): Promise<void> {
  const selectedQueueRows = page.locator('.image-trail-panel__bookmark-item.is-selected');
  while ((await selectedQueueRows.count()) > 0) {
    await selectedQueueRows.first().dispatchEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  }
}

async function clearSelectedRecentRows(page: Page): Promise<void> {
  const selectedRecentRows = page.locator('.image-trail-panel__history-item.is-selected');
  while ((await selectedRecentRows.count()) > 0) {
    await selectedRecentRows.first().dispatchEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
  }
}

function escapedFilenameFromAssetPath(assetPath: string): string {
  const filename = assetPath.split('/').pop();
  if (!filename) throw new Error(`Could not resolve filename from ${assetPath}`);
  return filename.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function filenameFromAssetPath(assetPath: string): string {
  const filename = assetPath.split('/').pop();
  if (!filename) throw new Error(`Could not resolve filename from ${assetPath}`);
  return filename;
}

test('successful loads add Recents while failed loads do not', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);
  await deleteVisibleRecents(page);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetOne));
  await expectPanelStatusMessage(page, /Loaded .*asset-one\.svg|Image loaded but did not change\.|Applied .*asset-one\.svg/u);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(1);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.missingImage));
  await expectPanelStatusMessage(page, /Image failed to load: HTTP 404/u);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(1);
  await expect(page.locator('.image-trail-panel__history-item', { hasText: 'missing-image.png' })).toHaveCount(0);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(2);
});

test('Recents retention settings hide overflow rows without persisting them', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);
  await deleteVisibleRecents(page);
  await setVisibleRecents(page, { limit: '2', overflow: 'Keep hidden this session' });

  for (const assetPath of [fixtureAssetPaths.assetOne, fixtureAssetPaths.assetTwo, fixtureAssetPaths.assetThree]) {
    await applyUrlInEditor(page, fixtureUrl(assetPath));
    await expectPanelStatusMessage(page, new RegExp(`Loaded .*${escapedFilenameFromAssetPath(assetPath)}`, 'u'));
  }

  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(2);
  await expect(page.locator('.image-trail-panel__history-item').first()).toContainText('asset-three.svg');
  await expect(page.locator('.image-trail-panel__history-item', { hasText: 'asset-one.svg' })).toHaveCount(0);

  await showHiddenRecents(page, 3);
  await expect(page.locator('.image-trail-panel__history-item', { hasText: 'asset-one.svg' })).toHaveCount(1);
});

test('pins persist across panel reopen and Recall recalls offscreen durable rows to the capped queue', async ({ page, serviceWorker }) => {
  test.setTimeout(60_000);
  await openPanel(page, serviceWorker);
  await setVisiblePins(page, '30');
  await deleteAllDurableQueueRows(page);
  await deleteVisibleRecents(page);

  for (const assetPath of [fixtureAssetPaths.assetOne, fixtureAssetPaths.assetTwo, fixtureAssetPaths.assetThree]) {
    await applyUrlInEditor(page, fixtureUrl(assetPath));
    await expectPanelStatusMessage(page, new RegExp(`Loaded .*${escapedFilenameFromAssetPath(assetPath)}`, 'u'));
    await pinCurrent(page, filenameFromAssetPath(assetPath));
  }
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(3);

  await page.getByRole('button', { name: 'Close panel' }).click();
  await expectPanelClosed(page);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(3);

  await setVisiblePins(page, '1', 1);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Recall', exact: true }).click();
  const recall = page.getByRole('dialog', { name: 'Recall' });
  await expect(recall).toBeVisible();
  await expect(recall.locator('.image-trail-panel__recall-list > li')).toHaveCount(2);
  await expect(recall.locator('.image-trail-panel__recall-list > li').first()).toContainText('asset-two.svg');

  await recall.locator('.image-trail-panel__recall-list > li', { hasText: 'asset-two.svg' }).click();
  await recall.getByRole('button', { name: 'Recall selected (1)' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(1);
  await expect(page.locator('.image-trail-panel__bookmark-item').first()).toContainText('asset-two.svg');
  await expect(recall.locator('.image-trail-panel__recall-list > li')).toHaveCount(2);

  await recall.getByRole('button', { name: 'Clear results' }).click();
  await expect(recall.locator('.image-trail-panel__recall-list > li')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(1);
  await recall.getByRole('button', { name: 'Close' }).click();
  await expect(recall).toHaveCount(0);
  await page.getByRole('button', { name: 'Recall', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Recall' }).locator('.image-trail-panel__recall-list > li')).toHaveCount(2);
});

test('select-all scopes export to visible Recents, visible queue rows, and loaded Recall rows only', async ({ page, serviceWorker }) => {
  test.setTimeout(60_000);
  await installDownloadRequestLog(serviceWorker);
  await openPanel(page, serviceWorker);
  await setVisiblePins(page, '30');
  await deleteAllDurableQueueRows(page);
  await deleteVisibleRecents(page);

  for (const assetPath of [fixtureAssetPaths.assetOne, fixtureAssetPaths.assetTwo, fixtureAssetPaths.assetThree]) {
    await applyUrlInEditor(page, fixtureUrl(assetPath));
    await expectPanelStatusMessage(page, new RegExp(`Loaded .*${escapedFilenameFromAssetPath(assetPath)}`, 'u'));
  }

  await page.getByRole('button', { name: 'Select all recents' }).click();
  await exportImages(page, serviceWorker);
  await expect(await waitForDownloadCount(serviceWorker, 3)).toEqual(['asset-three.svg', 'asset-two.svg', 'asset-one.svg']);
  await clearSelectedRecentRows(page);

  for (const filename of ['asset-three.svg', 'asset-two.svg', 'asset-one.svg']) {
    const recent = page.locator('.image-trail-panel__history-item', { hasText: filename });
    await recent.getByRole('button', { name: 'Pin' }).click();
    await expect(page.locator('.image-trail-panel__bookmark-item', { hasText: filename })).toBeVisible();
  }
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(3);
  await setVisiblePins(page, '1', 1);

  await openQueueMenu(page);
  await page.getByRole('button', { name: 'Select all queue' }).click();
  await exportImages(page, serviceWorker);
  await expect(await waitForDownloadCount(serviceWorker, 1)).toEqual(['asset-one.svg']);
  await clearSelectedQueueRows(page);

  await page.getByRole('button', { name: 'Recall', exact: true }).click();
  const recall = page.getByRole('dialog', { name: 'Recall' });
  await expect(recall.locator('.image-trail-panel__recall-list > li')).toHaveCount(2);
  await recall.getByRole('button', { name: 'Select all Recall' }).click();
  await exportImages(page, serviceWorker);
  await expect(await waitForDownloadCount(serviceWorker, 2)).toEqual(['asset-two.svg', 'asset-three.svg']);

  await recall.getByRole('button', { name: 'Close' }).click();
  await setVisiblePins(page, '30', 3);
  await deleteAllDurableQueueRows(page);
});
