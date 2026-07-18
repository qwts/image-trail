import {
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixturePaths,
  openFixturePage,
  openSettingsGroup,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

test('re-pinning a captured bookmark preserves its stored original', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await openSettingsGroup(page, 'Encrypted originals');
  await page.getByLabel('New encrypted originals password').fill('bookmark-original-preservation-password');
  await page.getByRole('button', { name: 'Create first key' }).click();
  await expect(page.locator('.image-trail-panel__encryption-badge')).toHaveText('Unlocked');
  await page.getByRole('button', { name: 'Close settings' }).click();

  await page.getByRole('button', { name: 'Pin current' }).click();
  const queueRow = page.locator('.image-trail-panel__bookmark-item', { hasText: 'asset-one.svg' });
  await expect(queueRow).toBeVisible();
  await queueRow.getByRole('button', { name: 'Capture' }).click();
  await expectPanelStatusMessage(page, /Captured \d+\.\d KB image\./u);
  await expect(queueRow.locator('.image-trail-panel__stored-original-dot')).toHaveAttribute('title', 'Original stored');

  await page.getByRole('button', { name: 'Pin current' }).click();
  await expect(queueRow.locator('.image-trail-panel__stored-original-dot')).toHaveAttribute('title', 'Original stored');
});
