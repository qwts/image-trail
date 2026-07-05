import type { Page, Worker } from '@playwright/test';

import { expect, expectPanelOpen, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

const detachHistoryName = 'Detach Recent history into a floating window (drag to place)';
const historyWindowName = 'Recent history (detached)';

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

test('detaching Recent history opens a floating dialog with a panel placeholder and restore paths work', async ({
  page,
  serviceWorker,
}) => {
  await openPanel(page, serviceWorker);

  await page.getByRole('button', { name: detachHistoryName }).click();

  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  await expect(page.getByText('Recent history is open in a floating window.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Image Trail panel' }).locator('.image-trail-panel__history-section')).toHaveCount(0);

  // Minimize collapses to the title bar; the window stays.
  await windowEl.getByRole('button', { name: 'Minimize Recent history window' }).click();
  await expect(windowEl.locator('.image-trail-panel__detached-body')).toBeHidden();
  await windowEl.getByRole('button', { name: 'Expand Recent history window' }).click();
  await expect(windowEl.locator('.image-trail-panel__detached-body')).toBeVisible();

  // Close (X) restores the section into the panel and focuses the detach control.
  await windowEl.getByRole('button', { name: 'Restore Recent history into the panel' }).click();
  await expect(windowEl).toHaveCount(0);
  const detachControl = page.getByRole('button', { name: detachHistoryName });
  await expect(detachControl).toBeVisible();
  await expect(detachControl).toBeFocused();
});

test('dragging the detach control places the window at the drop point and Escape restores it', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  const detachControl = page.getByRole('button', { name: detachHistoryName });
  const box = await detachControl.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 200, startY + 160, { steps: 5 });
  await page.mouse.up();

  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const windowBox = await windowEl.boundingBox();
  expect(windowBox).not.toBeNull();
  // The window opens at the drop position (pointer minus the small grab offset, before clamping).
  // Tolerance covers sub-pixel pointer coordinates and the window's border box.
  expect(Math.abs(windowBox!.x - (startX + 200 - 24))).toBeLessThanOrEqual(4);
  expect(Math.abs(windowBox!.y - (startY + 160 - 12))).toBeLessThanOrEqual(4);

  await windowEl.press('Escape');
  await expect(windowEl).toHaveCount(0);
  await expect(page.getByRole('button', { name: detachHistoryName })).toBeVisible();
});

test('detached Settings follows the gear toggle without duplicating the surface', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  await page.getByRole('button', { name: 'Show settings' }).click();
  await page.getByRole('button', { name: 'Detach Settings into a floating window (drag to place)' }).click();

  const settingsWindow = page.getByRole('dialog', { name: 'Settings (detached)' });
  await expect(settingsWindow).toBeVisible();
  await expect(page.locator('.image-trail-panel__settings-section')).toHaveCount(1, {
    timeout: 5000,
  });

  // The gear hides the window (Settings closed) and shows it again — never a duplicate.
  await page.getByRole('button', { name: 'Hide settings' }).click();
  await expect(settingsWindow).toHaveCount(0);
  await page.getByRole('button', { name: 'Show settings' }).click();
  await expect(settingsWindow).toBeVisible();
  await expect(page.locator('.image-trail-panel__settings-section')).toHaveCount(1);

  await settingsWindow.getByRole('button', { name: 'Restore Settings into the panel' }).click();
  await expect(settingsWindow).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Image Trail panel' }).locator('.image-trail-panel__settings-section')).toHaveCount(1);
});
