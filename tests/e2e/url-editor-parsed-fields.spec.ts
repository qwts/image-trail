import { readFile } from 'node:fs/promises';

import type { Download, Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  expect,
  expectPanelClosed,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixturePaths,
  fixtureUrl,
  imageNavigationSnapshot,
  openFixturePage,
  panelStatus,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

const dynamicImagePattern = /\/dynamic-image\.svg\?frame=/u;
const primaryImage = '#fixture-primary-image';

function dynamicSvg(frame: string): string {
  const hue = (Number(frame) * 47) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120" viewBox="0 0 180 120"><rect width="180" height="120" fill="hsl(${hue} 58% 36%)"/><text x="90" y="68" text-anchor="middle" fill="white" font-size="24">Frame ${frame}</text></svg>`;
}

async function installDynamicImageRoute(page: Page, failedFrames: readonly string[] = []): Promise<void> {
  const failures = new Set(failedFrames);
  await page.context().route(dynamicImagePattern, async (route) => {
    const frame = new URL(route.request().url()).searchParams.get('frame') ?? 'unknown';
    if (failures.has(frame)) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing fixture frame' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: dynamicSvg(frame),
    });
  });
}

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

async function openParsedFields(page: Page): Promise<void> {
  const fields = page.locator('.image-trail-panel__fields');
  if (!(await fields.evaluate((element) => element.hasAttribute('open')))) {
    await page.locator('.image-trail-panel__fields-summary').click();
  }
}

async function openManualControls(page: Page): Promise<void> {
  const controls = page.locator('.image-trail-panel__secondary-controls');
  if (!(await controls.evaluate((element) => element.hasAttribute('open')))) {
    await page.locator('.image-trail-panel__secondary-controls-summary').click();
  }
}

async function openSettingsGroup(page: Page, name: string): Promise<void> {
  const showSettings = page.getByRole('button', { name: 'Show settings' });
  if ((await showSettings.count()) > 0) await showSettings.click();
  const group = page.getByRole('heading', { name }).locator('xpath=ancestor::details[1]');
  if (!(await group.evaluate((element) => element.hasAttribute('open')))) {
    await page.getByRole('heading', { name }).click();
  }
}

async function openImportExport(page: Page): Promise<void> {
  await openSettingsGroup(page, 'Import / Export');
}

async function openUrlLearning(page: Page): Promise<void> {
  await openSettingsGroup(page, 'URL learning');
}

async function setRequestThrottle(
  page: Page,
  values: { readonly minimumIntervalMs: string; readonly maxRequests: string; readonly windowMs: string },
): Promise<void> {
  await openSettingsGroup(page, 'Automation');
  const throttle = page
    .getByRole('heading', { name: 'Request throttle' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await throttle.getByLabel('Min interval').fill(values.minimumIntervalMs);
  await throttle.getByLabel('Max requests').fill(values.maxRequests);
  await throttle.getByLabel('Window ms').fill(values.windowMs);
  await throttle.getByRole('button', { name: 'Apply' }).click();
}

async function closeSettingsIfOpen(page: Page): Promise<void> {
  const hideSettings = page.getByRole('button', { name: 'Hide settings' });
  if ((await hideSettings.count()) > 0) await hideSettings.click();
}

async function deleteVisibleRecents(page: Page): Promise<void> {
  const deleteRecents = page.getByRole('button', { name: /Delete recents/u });
  if ((await deleteRecents.count()) > 0) await deleteRecents.click();
}

async function clearAllUrlReviewStatus(page: Page): Promise<void> {
  await openImportExport(page);
  await page.getByRole('button', { name: 'Clear all review status' }).click();
  await expectPanelStatusMessage(page, /Cleared \d+ URL review status records? for all sites\./u);
}

async function ensureQueryFrameIncluded(page: Page): Promise<void> {
  const include = page.getByRole('button', { name: /Include .*frame/u });
  if ((await include.count()) > 0) await include.click();
  await expect(page.getByRole('button', { name: /Exclude .*frame/u })).toBeVisible();
}

type UrlReviewStatusRecord = {
  readonly activeFieldId: string | null;
  readonly fieldIds: readonly string[];
  readonly hostname: string;
  readonly pageUrl: string;
  readonly status: string;
  readonly sourceUrl: string;
  readonly updatedAt: string;
};

function normalizeUrlReviewRecords(records: readonly UrlReviewStatusRecord[]): UrlReviewStatusRecord[] {
  return records
    .map((record) => ({
      activeFieldId: record.activeFieldId,
      fieldIds: [...record.fieldIds].sort(),
      hostname: record.hostname,
      pageUrl: record.pageUrl,
      status: record.status,
      sourceUrl: record.sourceUrl,
      updatedAt: record.updatedAt,
    }))
    .sort((a, b) => a.status.localeCompare(b.status) || a.sourceUrl.localeCompare(b.sourceUrl));
}

async function exportUrlReviewStatus(
  page: Page,
): Promise<{ readonly download: Download; readonly fileContent: string; readonly records: UrlReviewStatusRecord[] }> {
  await openImportExport(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export URL review status' }).click(),
  ]);
  const filePath = await download.path();
  expect(filePath).not.toBeNull();
  const fileContent = await readFile(filePath!, 'utf8');
  await expectPanelStatusMessage(page, /Exported \d+ URL review status record\(s\)\./u);
  const exported = JSON.parse(fileContent) as { readonly records: readonly UrlReviewStatusRecord[] };
  return { download, fileContent, records: normalizeUrlReviewRecords(exported.records) };
}

async function importUrlReviewStatus(page: Page, fileContent: string): Promise<void> {
  await openImportExport(page);
  const importExport = page.locator('.image-trail-panel__import-export');
  await importExport
    .locator('input[type="file"][accept=".json"]')
    .setInputFiles({ name: 'url-review-status.json', mimeType: 'application/json', buffer: Buffer.from(fileContent) });
  await importExport.getByRole('button', { name: 'Import URL review status' }).click();
  await expect(importExport.locator('.image-trail-panel__restore-preview')).toContainText('URL review status');
  await importExport.getByRole('button', { name: 'Confirm import' }).click();
  await expectPanelStatusMessage(page, /Imported \d+ URL review status record\(s\).* saved to extension state\./u);
}

async function expectFrame(page: Page, frame: string): Promise<void> {
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(`/dynamic-image.svg?frame=${frame}`));
  const snapshot = await imageNavigationSnapshot(page, primaryImage);
  expect(snapshot.src).toMatch(/^data:image\/svg\+xml;base64,/u);
}

test('URL editor and parsed fields load, fail closed, navigate, learn templates, and restore same-image context', async ({
  page,
  serviceWorker,
}) => {
  await installDynamicImageRoute(page, ['404']);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  await closeSettingsIfOpen(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=1'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=1/u);
  await expectFrame(page, '1');

  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=2/u);
  await expectFrame(page, '2');

  const recentCountBeforeFailure = await page.locator('.image-trail-panel__history-item').count();
  await page.getByLabel(/Edit .*frame/u).fill('404');
  await page.getByLabel(/Edit .*frame/u).press('Enter');
  await expect(panelStatus(page)).toHaveClass(/is-error/u);
  await expectPanelStatusMessage(page, /HTTP 404/u);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(recentCountBeforeFailure);

  await page.getByLabel(/Edit .*frame/u).fill('2');
  await page.getByLabel(/Edit .*frame/u).press('Enter');
  await expectPanelStatusMessage(page, /Image loaded but did not change\.|Loaded .*dynamic-image\.svg\?frame=2/u);
  await ensureQueryFrameIncluded(page);

  await openManualControls(page);
  await page.getByRole('button', { name: '◀ Prev' }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=1/u);
  await expectFrame(page, '1');
  await page.getByRole('button', { name: 'Next ▶' }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=2/u);
  await expectFrame(page, '2');

  await openUrlLearning(page);
  await expect(page.locator('.image-trail-panel__settings-template-url')).toContainText('/dynamic-image.svg?frame={query-frame}');

  await page.getByRole('button', { name: 'Close panel' }).click();
  await expectPanelClosed(page);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await openUrlLearning(page);
  await expect(page.locator('.image-trail-panel__settings-template-url')).toContainText('/dynamic-image.svg?frame={query-frame}');
  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=2'));
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=2/u);
  await closeSettingsIfOpen(page);
  await openParsedFields(page);
  await expect(page.getByLabel(/Edit .*frame/u)).toHaveValue('2');
});

test('URL review status export/import round trips without image-record side effects', async ({ page, serviceWorker }) => {
  await installDynamicImageRoute(page, ['404']);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  await clearAllUrlReviewStatus(page);
  await closeSettingsIfOpen(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=1'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=1/u);
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=2/u);
  await page.getByLabel(/Edit .*frame/u).fill('404');
  await page.getByLabel(/Edit .*frame/u).press('Enter');
  await expectPanelStatusMessage(page, /HTTP 404/u);

  const recentCountBeforeExport = await page.locator('.image-trail-panel__history-item').count();
  const { download, fileContent, records: exportedRecords } = await exportUrlReviewStatus(page);
  expect(download.suggestedFilename()).toMatch(/^image-trail-url-review-status-\d{4}-\d{2}-\d{2}\.json$/u);
  expect(exportedRecords.map((record) => record.status)).toEqual(['failed', 'passed']);
  expect(exportedRecords.map((record) => record.sourceUrl).sort()).toEqual([
    fixtureUrl('/dynamic-image.svg?frame=2'),
    fixtureUrl('/dynamic-image.svg?frame=404'),
  ]);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(recentCountBeforeExport);

  await clearAllUrlReviewStatus(page);
  await deleteVisibleRecents(page);
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__recall-drawer')).toHaveCount(0);
  const storageUsage = page.locator('.image-trail-panel__storage-usage');
  const storageUsageBeforeImport = (await storageUsage.count()) > 0 ? await storageUsage.textContent() : null;

  await importUrlReviewStatus(page, fileContent);

  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__recall-drawer')).toHaveCount(0);
  if (storageUsageBeforeImport === null) {
    await expect(page.locator('.image-trail-panel__storage-usage')).toHaveCount(0);
  } else {
    await expect(page.locator('.image-trail-panel__storage-usage')).toHaveText(storageUsageBeforeImport);
  }

  await openImportExport(page);
  const [roundTripDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export URL review status' }).click(),
  ]);
  expect(roundTripDownload.suggestedFilename()).toMatch(/^image-trail-url-review-status-\d{4}-\d{2}-\d{2}\.json$/u);
  const roundTripPath = await roundTripDownload.path();
  expect(roundTripPath).not.toBeNull();
  const roundTripContent = await readFile(roundTripPath!, 'utf8');
  const roundTripped = JSON.parse(roundTripContent) as { readonly records: readonly UrlReviewStatusRecord[] };
  expect(normalizeUrlReviewRecords(roundTripped.records)).toEqual(exportedRecords);
});
