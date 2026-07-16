import { expect, expectPanelOpen, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

test('a Queue record opens an honest blocked transfer review without reordering the Queue', async ({ page, serviceWorker }) => {
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
  await expect(dialog).toContainText('No interop provider');
  await expect(dialog).toContainText('0 / 1 processed · 0 acknowledged · 0 finalized');
  await expect(dialog.getByRole('button', { name: 'Start move' })).toBeDisabled();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  const orderAfter = await page
    .locator('.image-trail-panel__bookmark-item')
    .evaluateAll((rows) => rows.map((candidate) => candidate.getAttribute('data-image-trail-row-id')));
  expect(orderAfter).toEqual(orderBefore);
});
