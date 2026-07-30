import { expect, expectPanelOpen, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

const interopEnabled = process.env['IMAGE_TRAIL_ENABLE_INTEROP'] === '1';

test('the baseline package omits native messaging and unfinished Transfer & Sync entry points', async ({
  extensionId,
  page,
  serviceWorker,
}) => {
  test.skip(interopEnabled, 'Baseline-only assertion.');

  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions ?? []).not.toContain('nativeMessaging');
  const pairingImportShipped = await serviceWorker.evaluate(async () => {
    try {
      return (await fetch(chrome.runtime.getURL('src/interop-pairing/import.html'))).ok;
    } catch {
      return false;
    }
  });
  expect(pairingImportShipped).toBe(false);

  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await page.getByRole('button', { name: 'Pin current' }).click();
  const panel = page.getByRole('dialog', { name: 'Image Trail panel' });
  const row = panel.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-one.svg' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: 'Move / Sync' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Transfer & Sync' })).toHaveCount(0);

  await panel.locator('[data-image-trail-destination="gallery"]').click();
  await expect(panel.locator('.image-trail-panel__destination-surface[data-destination="gallery"]')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Transfer & Sync' })).toHaveCount(0);

  await page.goto(`chrome-extension://${extensionId}/src/gallery/gallery.html`);
  const response = await page.evaluate(() => {
    return chrome.runtime.sendMessage({
      type: 'imageTrail.interopRuntime',
      version: 1,
      payload: {
        context: { entry: 'bookmark', total: 1, recordIds: ['baseline-probe'], locked: false },
        action: { name: 'status' },
      },
    });
  });
  expect(response).toEqual({
    type: 'imageTrail.unknown',
    version: 1,
    payload: { reason: 'Transfer & Sync is not enabled in this build.' },
  });
});

test('an enabled experimental build opens Transfer & Sync without reordering the Queue', async ({ extensionId, page, serviceWorker }) => {
  test.skip(!interopEnabled, 'Experimental interop-only assertion.');

  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions ?? []).toContain('nativeMessaging');

  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await page.getByRole('button', { name: 'Pin current' }).click();
  const row = page.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-one.svg' });
  await expect(row).toBeVisible();
  const orderBefore = await page
    .locator('.image-trail-panel__bookmark-item')
    .evaluateAll((rows) => rows.map((candidate) => candidate.getAttribute('data-image-trail-row-id')));

  await row.getByRole('button', { name: 'Move / Sync' }).click();
  const dialog = page.getByRole('dialog', { name: 'Transfer and Sync' });
  await expect(dialog).toContainText('bookmark · Queued');
  await expect(dialog).toContainText('pCloud');
  await expect(dialog.getByLabel('Transfer provider')).toHaveValue('pcloud');
  await expect(dialog.getByText('extension-owned page')).toBeVisible();
  await expect(dialog.getByLabel('Overlook pairing key')).toHaveCount(0);
  await expect(dialog.getByLabel('Pairing key password')).toHaveCount(0);
  const importPairing = dialog.getByRole('button', { name: 'Open secure pairing import' });
  await expect(importPairing).toBeVisible();
  const pairingPagePromise = page.context().waitForEvent('page');
  await importPairing.click();
  const pairingPage = await pairingPagePromise;
  await pairingPage.waitForLoadState();
  expect(pairingPage.url()).toBe(`chrome-extension://${extensionId}/src/interop-pairing/import.html`);
  await expect(pairingPage.getByLabel('Overlook pairing key')).toBeVisible();
  await expect(pairingPage.getByLabel('Pairing key password')).toBeVisible();
  await pairingPage.close();
  await expect(dialog).toContainText('0 / 1 processed · 0 acknowledged · 0 finalized');
  await expect(dialog.getByRole('button', { name: 'Start move' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  const orderAfter = await page
    .locator('.image-trail-panel__bookmark-item')
    .evaluateAll((rows) => rows.map((candidate) => candidate.getAttribute('data-image-trail-row-id')));
  expect(orderAfter).toEqual(orderBefore);
});
