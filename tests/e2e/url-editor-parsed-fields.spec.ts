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
  setLoadFailureFeedback,
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

async function installRetokenizingPathRoute(page: Page): Promise<void> {
  await page.context().route(/\/parsed-field(?:\/.*)?$/u, async (route) => {
    const frame = new URL(route.request().url()).pathname.replace(/\D/gu, '') || '0';
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: dynamicSvg(frame) });
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
  // An image load already in flight can re-add a recent right after the delete (worker
  // contention makes this reliable on CI runners); re-delete until the list stays empty.
  await expect(async () => {
    const deleteRecents = page.getByRole('button', { name: /Delete recents/u });
    if ((await deleteRecents.count()) > 0) await deleteRecents.click();
    await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

async function clearAllUrlReviewStatus(page: Page): Promise<void> {
  await openImportExport(page);
  await page.getByRole('button', { name: 'Clear all review status' }).click();
  await expectPanelStatusMessage(page, /Cleared \d+ URL review status records? for all sites\./u);
}

async function ensureQueryFieldIncluded(page: Page, fieldName: string): Promise<void> {
  // Escape regex metacharacters and require word boundaries so e.g. "set" cannot match "asset".
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const include = page.getByRole('button', { name: new RegExp(String.raw`Include .*\b${escaped}\b`, 'u') });
  if ((await include.count()) > 0) await include.click();
  await expect(page.getByRole('button', { name: new RegExp(String.raw`Exclude .*\b${escaped}\b`, 'u') })).toBeVisible();
}

async function ensureQueryFrameIncluded(page: Page): Promise<void> {
  await ensureQueryFieldIncluded(page, 'frame');
}

// Serves any /dynamic-image.svg?... URL, rendering distinct content from the combined set + frame
// params so each combined-step URL yields a visibly different image.
async function installMultiParamImageRoute(page: Page): Promise<void> {
  await page.context().route(/\/dynamic-image\.svg\?/u, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const combined = `${params.get('set') ?? ''}-${params.get('frame') ?? ''}`;
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: dynamicSvg(combined.replace(/\D/gu, '') || '0') });
  });
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

test('a delimiter-changing numeric field commit reparses the projected Field Editors', async ({ page, serviceWorker }) => {
  await installRetokenizingPathRoute(page);
  await openPanel(page, serviceWorker);
  await applyUrlInEditor(page, fixtureUrl('/parsed-field/400'));
  await openParsedFields(page);

  const field = page.getByLabel('Edit path 3.0');
  await field.click();
  await expect(field.locator('xpath=ancestor::div[contains(@class, "image-trail-panel__field-row")][1]')).toHaveClass(/is-active/u);
  await page.getByLabel('Edit path 3.0').fill('400/53');
  await page.getByLabel('Edit path 3.0').press('Enter');

  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl('/parsed-field/400/53'));
  await expect(page.getByLabel('Edit path 3.0')).toHaveValue('400');
  await expect(page.getByLabel('Edit path 5.0')).toHaveValue('53');
});

test('URL editor and parsed fields load, fail closed, navigate, learn templates, and restore same-image context', async ({
  page,
  serviceWorker,
}) => {
  await installDynamicImageRoute(page, ['404']);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  // Alert mode so the direct fail-closed apply below still surfaces the red status + HTTP error (#450).
  await setLoadFailureFeedback(page, 'alert');
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

test('Reset all stays available across successful steps instead of flickering away (#429)', async ({ page, serviceWorker }) => {
  await installMultiParamImageRoute(page);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  await closeSettingsIfOpen(page);

  // Distinct values from this serial spec's other tests, so the load is a real state change.
  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?set=30&frame=70'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?set=30&frame=70/u);
  await openParsedFields(page);

  // The first edit captures the session baseline; Reset all appears.
  await page.getByRole('button', { name: /Increment .*set/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=31&frame=70/u);
  const resetAll = page.getByRole('button', { name: /Reset (all parsed fields|private parsed fields)/u });
  await expect(resetAll).toBeVisible();

  // Further SUCCESSFUL loads (each triggers the post-load field-state restore) must not stomp the
  // session baseline: Reset all stays available until the user resets or the target changes.
  await page.getByRole('button', { name: /Increment .*set/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=32&frame=70/u);
  await expect(resetAll).toBeVisible();
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=32&frame=71/u);
  await expect(resetAll).toBeVisible();

  // Reset all returns to the baseline URL and then disappears — the session is closed.
  await resetAll.click();
  await expectPanelStatusMessage(page, /Parsed fields reset\.|(?:Loaded|Applied) .*dynamic-image\.svg\?set=30&frame=70/u);
  await expect(page.getByRole('button', { name: /Reset (all parsed fields|private parsed fields)/u })).toHaveCount(0);
});

test('previewing a recent clears the red failed-field marker left by a failed step (#429)', async ({ page, serviceWorker }) => {
  await installMultiParamImageRoute(page);
  // Registered after the catch-all so it wins: frame=99 is a dead neighbor.
  await page.context().route(/\/dynamic-image\.svg\?set=50&frame=99/u, async (route) => {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing frame' });
  });
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  // Display mode so the failed step paints the red field ring this test then clears (#450).
  await setLoadFailureFeedback(page, 'display');
  await closeSettingsIfOpen(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?set=50&frame=97'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?set=50&frame=97/u);
  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?set=50&frame=98'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?set=50&frame=98/u);

  // Step the frame field into the dead neighbor: the field goes red and the draft holds the URL.
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expect(page.locator('.image-trail-panel__field-row.is-error')).toHaveCount(1);
  await expect(page.locator('.image-trail-panel__full-url-input')).toHaveValue(fixtureUrl('/dynamic-image.svg?set=50&frame=99'));

  // Double-click projecting an earlier recent loads through the same pipeline as the URL editor
  // and +/- steps: the editor, the parsed fields, AND the failure marker all follow the record.
  // Recents rows show the filename; match the target row by its URL title.
  const frame97Recent = page
    .locator('.image-trail-panel__history-item')
    .filter({ has: page.locator('[title*="frame=97"]') })
    .first();
  await frame97Recent.dblclick();
  await expect(page.locator('.image-trail-panel__full-url-input')).toHaveValue(fixtureUrl('/dynamic-image.svg?set=50&frame=97'));
  await expect(page.locator('.image-trail-panel__field-row.is-error')).toHaveCount(0);
});

test('a Next step that skips a dead run leaves no stray red field outline on the last-good value (#447)', async ({
  page,
  serviceWorker,
}) => {
  // Unique high frame numbers no other test in this shared-worker spec touches, so a warm/cached
  // success can never shadow the dead run: frames 500-501 load, everything from 502 up is a dead
  // run. Stepping into it skips, then the drain stops with the field resting on the last-good value.
  await page.context().route(/\/dynamic-image\.svg\?frame=/u, async (route) => {
    const frame = Number(new URL(route.request().url()).searchParams.get('frame') ?? '0');
    if (frame >= 502) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing fixture frame' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: dynamicSvg(String(frame)) });
  });
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  // Display mode: the red ring CAN appear while skipping, so this test meaningfully proves it is
  // reconciled away at rest rather than trivially absent (Mute would hide it either way) (#450).
  await setLoadFailureFeedback(page, 'display');
  await closeSettingsIfOpen(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=500'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=500/u);

  // A successful step makes the field lockable; lock it so Next drives it. This rests on frame 501.
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=501/u);
  await ensureQueryFrameIncluded(page);

  // Next steps into frames 502+ — all dead — so the drain gives up after skipping them.
  await openManualControls(page);
  await page.getByRole('button', { name: 'Next ▶' }).click();
  await expectPanelStatusMessage(page, /Stopped after skipping \d+ unavailable images?/u);

  // The field rests on the last-good value and carries no stranded red outline.
  await expect(page.locator('.image-trail-panel__field-row.is-error')).toHaveCount(0);
  await expectFrame(page, '501');
});

test('Mute (default) hides the red ring and error status a failed apply would show in Alert (#450)', async ({ page, serviceWorker }) => {
  // Frames 404 and 405 are dead; the mode governs whether their failure is visible.
  await installDynamicImageRoute(page, ['404', '405']);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  await closeSettingsIfOpen(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=1'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=1/u);
  await openParsedFields(page);

  // Default Mute: a failed apply surfaces nothing — no red field ring, no error status.
  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=404'));
  await expect(page.locator('.image-trail-panel__field-row.is-error')).toHaveCount(0);
  await expect(panelStatus(page)).not.toHaveClass(/is-error/u);

  // The same class of failure in Alert DOES surface, proving Mute suppressed real feedback (not a
  // no-op): a distinct dead frame so no cached success can shadow it.
  await setLoadFailureFeedback(page, 'alert');
  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=405'));
  await expect(panelStatus(page)).toHaveClass(/is-error/u);
  await expectPanelStatusMessage(page, /HTTP 404/u);
});

test('Prev/Next steps every included field together into one combined URL', async ({ page, serviceWorker }) => {
  // #263: prev/next (and arrows) are the automation tier — one press applies the same ±1 step to
  // ALL included fields at once, the same result as clicking each field's +/- individually.
  await installMultiParamImageRoute(page);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  await closeSettingsIfOpen(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?set=3&frame=7'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?set=3&frame=7/u);

  // Discovery phase: step each field once with its "+" — a successful stepped load is what makes a
  // field lockable (the Include control only renders for successful fields).
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*set/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=4&frame=7/u);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=4&frame=8/u);

  // Lock both fields into the trail.
  await ensureQueryFieldIncluded(page, 'set');
  await ensureQueryFieldIncluded(page, 'frame');

  // One press steps BOTH included fields together in a single combined URL.
  await openManualControls(page);
  await page.getByRole('button', { name: '◀ Prev' }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=3&frame=7/u);
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl('/dynamic-image.svg?set=3&frame=7'));

  await page.getByRole('button', { name: 'Next ▶' }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?set=4&frame=8/u);
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl('/dynamic-image.svg?set=4&frame=8'));
});

test('URL review status export/import round trips without image-record side effects', async ({ page, serviceWorker }) => {
  await installDynamicImageRoute(page, ['404']);
  await openPanel(page, serviceWorker);
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '100', windowMs: '1000' });
  // Alert mode so the fail-closed apply surfaces the HTTP-error status this test waits on (#450).
  await setLoadFailureFeedback(page, 'alert');
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
  // Baseline-relative: the browser profile is worker-scoped (fixtures.ts), so durable pins from
  // other spec files sharing this worker may legitimately exist. The invariant under test is that
  // export/import causes no image-record side effects — not that the profile is virgin.
  const queueCountBeforeImport = await page.locator('.image-trail-panel__bookmark-item').count();
  await expect(page.locator('.image-trail-panel__recall-drawer')).toHaveCount(0);
  const storageUsage = page.locator('.image-trail-panel__storage-usage');
  const storageUsageBeforeImport = (await storageUsage.count()) > 0 ? await storageUsage.textContent() : null;

  await importUrlReviewStatus(page, fileContent);

  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(queueCountBeforeImport);
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
