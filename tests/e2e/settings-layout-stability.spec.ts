import type { Locator, Page, Worker } from '@playwright/test';

import { expect, expectPanelOpen, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

// Regression coverage for #367: the attached Settings section is a layout-reserved scroll region,
// so expanding/collapsing a settings group must not move the clicked control out from under the
// pointer or shift the sections rendered below Settings. Each measurement baselines AFTER the
// target control is scrolled into view — the guarantee is about a control the user's pointer is
// already over, not about Playwright's own pre-click scrolling.

async function openPanelWithSettings(page: Page, serviceWorker: Worker): Promise<Locator> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await page.getByRole('button', { name: 'Show settings' }).click();
  const panel = page.getByRole('dialog', { name: 'Image Trail panel' });
  await expect(panel.locator('.image-trail-panel__settings-section')).toBeVisible();
  return panel;
}

function groupSummary(panel: Locator, title: string): Locator {
  return panel.locator('summary.image-trail-panel__settings-utility-summary', { hasText: title });
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x, y: box!.y };
}

// Click a group summary and assert the clicked control and the URL editor (the first section
// rendered below Settings) hold their positions through the toggle.
async function toggleGroupExpectingStability(panel: Locator, title: string): Promise<void> {
  const summary = groupSummary(panel, title);
  await summary.scrollIntoViewIfNeeded();
  const urlEditorHeading = panel.getByRole('heading', { name: 'URL editor' });
  const summaryBefore = await boxOf(summary);
  const urlEditorBefore = await boxOf(urlEditorHeading);

  await summary.click();

  const summaryAfter = await boxOf(summary);
  const urlEditorAfter = await boxOf(urlEditorHeading);
  expect(Math.abs(summaryAfter.y - summaryBefore.y), `${title} summary must not move vertically`).toBeLessThan(1);
  expect(Math.abs(summaryAfter.x - summaryBefore.x), `${title} summary must not move horizontally`).toBeLessThan(1);
  expect(Math.abs(urlEditorAfter.y - urlEditorBefore.y), 'the URL editor below Settings must not move').toBeLessThan(1);
}

test('expanding and collapsing Settings groups keeps the clicked summary and the sections below stationary', async ({
  page,
  serviceWorker,
}) => {
  const panel = await openPanelWithSettings(page, serviceWorker);

  // The settings region reserves its block size up front, so the sections below it hold their
  // positions across every group expand/collapse.
  await toggleGroupExpectingStability(panel, 'Display'); // open
  await toggleGroupExpectingStability(panel, 'Automation'); // open (second group, region already partly full)
  await toggleGroupExpectingStability(panel, 'Display'); // close again
});

test('the Settings scroll position survives the rerender caused by applying a setting', async ({ page, serviceWorker }) => {
  const panel = await openPanelWithSettings(page, serviceWorker);
  const settingsSection = panel.locator('.image-trail-panel__settings-section');

  // Open a few groups so the region has enough content to scroll, then scroll partway down.
  await groupSummary(panel, 'Display').click();
  await groupSummary(panel, 'Automation').click();
  await groupSummary(panel, 'Maintenance').click();
  await settingsSection.evaluate((element) => {
    element.scrollTop = 60;
  });
  const scrolled = await settingsSection.evaluate((element) => element.scrollTop);
  expect(scrolled).toBeGreaterThan(0);

  // Applying a setting dispatches a panel action and swaps the whole panel DOM.
  await panel
    .locator('.image-trail-panel__settings-utility-section', { hasText: 'Display' })
    .first()
    .getByRole('button', { name: 'Apply' })
    .first()
    .click();

  await expect.poll(async () => settingsSection.evaluate((element) => element.scrollTop)).toBe(scrolled);
});
