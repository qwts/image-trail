import type { Page, Worker } from '@playwright/test';

import {
  expect,
  expectPanelOpen,
  fixturePaths,
  openFixturePage,
  openTargetControls,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

test('React destination dock routes existing actions and preserves focus across state renders', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  const dock = page.getByRole('navigation', { name: 'Image Trail destinations' });
  await expect(dock.getByRole('button')).toHaveCount(4);
  await expect(dock.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-pressed', 'true');

  const settings = dock.getByRole('button', { name: 'Show settings' });
  await settings.focus();
  await settings.press('Enter');
  const hideSettings = dock.getByRole('button', { name: 'Hide settings' });
  await expect(page.locator('.image-trail-panel__settings-section')).toBeVisible();
  await expect(hideSettings).toBeFocused();
  await hideSettings.press('Enter');
  await expect(page.locator('.image-trail-panel__settings-section')).toHaveCount(0);
  await expect(dock.getByRole('button', { name: 'Show settings' })).toBeFocused();

  const openRecall = dock.getByRole('button', { name: 'Open Recall' });
  await openRecall.press('Enter');
  const closeRecall = dock.getByRole('button', { name: 'Close Recall' });
  await expect(closeRecall).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.image-trail-panel__recall-drawer')).toBeVisible();
  await expect(closeRecall).toBeFocused();
});

test('React Host target keeps detached focus, actions, and subtree lifecycle stable', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  await page.getByRole('button', { name: 'Detach Host target into a floating window (drag to place)' }).click();
  const targetWindow = page.getByRole('dialog', { name: 'Host target (detached)' });
  await expect(targetWindow).toBeVisible();
  await expect(targetWindow.locator('[data-image-trail-react-root]')).toHaveCount(1);

  await openTargetControls(page);
  const fit = targetWindow.getByRole('combobox', { name: 'Preview object fit' });
  await fit.focus();
  await fit.selectOption('cover');
  await expect(fit).toHaveValue('cover');
  await expect(fit).toBeFocused();
  await expect(page.locator('[data-image-trail-react-root]')).toHaveCount(3);
  await expect(page.locator('.image-trail-page-context-root[data-image-trail-react-root]')).toHaveCount(1);

  await targetWindow.getByRole('button', { name: 'Restore Host target into the panel' }).focus();
  await page.keyboard.press('Escape');
  await expect(targetWindow).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Detach Host target into a floating window (drag to place)' })).toBeFocused();
  await expect(page.locator('[data-image-trail-react-root]')).toHaveCount(3);
});
