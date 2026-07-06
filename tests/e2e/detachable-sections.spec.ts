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

  // Drag up-left into open space so the drop point sits inside the viewport clamp.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY - 160, { steps: 5 });
  await page.mouse.up();

  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const windowBox = await windowEl.boundingBox();
  expect(windowBox).not.toBeNull();
  // The window opens at the drop position (pointer minus the small grab offset, before clamping).
  // Tolerance covers sub-pixel pointer coordinates and the window's border box.
  expect(Math.abs(windowBox!.x - (startX + 120 - 24))).toBeLessThanOrEqual(4);
  expect(Math.abs(windowBox!.y - (startY - 160 - 12))).toBeLessThanOrEqual(4);

  await windowEl.press('Escape');
  await expect(windowEl).toHaveCount(0);
  await expect(page.getByRole('button', { name: detachHistoryName })).toBeVisible();
});

test('dragging a section by its heading detaches at the drop point, and Escape cancels a live drag', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  const heading = page.locator('.image-trail-panel__history-section .image-trail-panel__section-header h3');
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  // Escape mid-drag cancels: the ghost disappears and nothing detaches.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 150, startY - 120, { steps: 4 });
  await expect(page.locator('.image-trail-panel__detach-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.image-trail-panel__detach-ghost')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: historyWindowName })).toHaveCount(0);

  // The same gesture released normally detaches at the drop point.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 180, startY - 200, { steps: 4 });
  await page.mouse.up();
  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const windowBox = await windowEl.boundingBox();
  expect(windowBox).not.toBeNull();
  expect(Math.abs(windowBox!.x - (startX + 180 - 24))).toBeLessThanOrEqual(4);
  expect(Math.abs(windowBox!.y - (startY - 200 - 12))).toBeLessThanOrEqual(4);
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

test('the per-site workspace layout persists across a reload when opted in, and reset reattaches everything', async ({
  page,
  serviceWorker,
}) => {
  await openPanel(page, serviceWorker);

  const openMaintenanceGroup = async (): Promise<void> => {
    const showSettingsButton = page.getByRole('button', { name: 'Show settings' });
    if ((await showSettingsButton.count()) > 0) await showSettingsButton.click();
    const heading = page.getByRole('heading', { name: 'Maintenance' });
    const group = heading.locator('xpath=ancestor::details[1]');
    if (!(await group.evaluate((element) => element.hasAttribute('open')))) await heading.click();
  };

  // Opt in (Maintenance → Panel layout), then close settings to leave a clean panel.
  await openMaintenanceGroup();
  const restoreToggle = page.getByLabel('Restore workspace layout per site');
  await restoreToggle.check();
  await page.getByRole('button', { name: 'Hide settings' }).click();

  // Detach Recent history, drag its window to a distinctive spot, and minimize it.
  await page.getByRole('button', { name: detachHistoryName }).click();
  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const header = windowEl.locator('.image-trail-panel__detached-header');
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  // Park the window at the far left, well clear of the right-docked panel, so the restored
  // (minimized) title bar can never sit over the panel's controls and intercept later clicks.
  await page.mouse.move(headerBox!.x + 40, headerBox!.y + headerBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(90, 420, { steps: 8 });
  await page.mouse.up();
  const movedBox = await windowEl.boundingBox();
  expect(movedBox).not.toBeNull();
  await windowEl.getByRole('button', { name: 'Minimize Recent history window' }).click();
  // Let the debounced save (400ms) flush before reloading.
  await page.waitForTimeout(700);

  await page.reload();
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  // The saved workspace restores: Recent history opens detached, at the dragged spot, still minimized.
  const restoredWindow = page.getByRole('dialog', { name: historyWindowName });
  await expect(restoredWindow).toBeVisible();
  const restoredBox = await restoredWindow.boundingBox();
  expect(restoredBox).not.toBeNull();
  expect(Math.abs(restoredBox!.x - movedBox!.x)).toBeLessThanOrEqual(4);
  expect(Math.abs(restoredBox!.y - movedBox!.y)).toBeLessThanOrEqual(4);
  await expect(restoredWindow.locator('.image-trail-panel__detached-body')).toBeHidden();

  // Reset clears the saved layout for the site and reattaches the section.
  await openMaintenanceGroup();
  await page.getByRole('button', { name: 'Reset workspace layout' }).click();
  await expect(restoredWindow).toHaveCount(0);
  await expect(page.getByRole('button', { name: detachHistoryName })).toBeVisible();

  // Leave the shared profile the way we found it: opt back out.
  await page.getByLabel('Restore workspace layout per site').uncheck();
});
