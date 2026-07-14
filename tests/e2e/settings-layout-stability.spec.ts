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
  return panel
    .locator('.image-trail-panel__settings-section > details.image-trail-ds__settings-group', { hasText: title })
    .first()
    .locator(':scope > summary');
}

async function openGroup(panel: Locator, title: string): Promise<void> {
  const summary = groupSummary(panel, title);
  const group = summary.locator('xpath=..');
  if ((await group.getAttribute('open')) === null) await summary.click();
}

async function boxOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x, y: box!.y };
}

// Click a group summary and assert the clicked control and reserved Settings surface hold their
// positions through the toggle. The covered top-level groups are already visible in the reserved
// surface, so the assertion does not introduce a synthetic scroll before the click.
async function toggleGroupExpectingStability(panel: Locator, title: string): Promise<void> {
  const summary = groupSummary(panel, title);
  const settings = panel.locator('.image-trail-panel__settings-section');
  await summary.scrollIntoViewIfNeeded();
  const summaryBefore = await boxOf(summary);
  const settingsBefore = await settings.boundingBox();
  expect(settingsBefore).not.toBeNull();

  await summary.click();

  const summaryAfter = await boxOf(summary);
  const settingsAfter = await settings.boundingBox();
  expect(settingsAfter).not.toBeNull();
  expect(Math.abs(summaryAfter.y - summaryBefore.y), `${title} summary must not move vertically`).toBeLessThan(1);
  expect(Math.abs(summaryAfter.x - summaryBefore.x), `${title} summary must not move horizontally`).toBeLessThan(1);
  expect(Math.abs(settingsAfter!.y - settingsBefore!.y), 'the Settings surface must not move').toBeLessThan(1);
  expect(Math.abs(settingsAfter!.height - settingsBefore!.height), 'the Settings surface must keep its reserved height').toBeLessThan(1);
}

test('expanding and collapsing Settings groups keeps the clicked summary and the sections below stationary', async ({
  page,
  serviceWorker,
}) => {
  const panel = await openPanelWithSettings(page, serviceWorker);

  // The settings region reserves its block size up front, so its overlay geometry stays fixed
  // across every group expand/collapse.
  await toggleGroupExpectingStability(panel, 'Display'); // close the default-open group
  await toggleGroupExpectingStability(panel, 'Automation'); // open (second group, region already partly full)
  await toggleGroupExpectingStability(panel, 'Display'); // open again
});

test('the Settings scroll position survives the rerender caused by applying a setting', async ({ page, serviceWorker }) => {
  const panel = await openPanelWithSettings(page, serviceWorker);
  const settingsSection = panel.locator('.image-trail-panel__settings-section');

  // Open a few groups so the region has enough content to scroll, then scroll partway down.
  await openGroup(panel, 'Display');
  await openGroup(panel, 'Automation');
  await openGroup(panel, 'System');
  await settingsSection.evaluate((element) => {
    element.scrollTop = 60;
  });
  const scrolled = await settingsSection.evaluate((element) => element.scrollTop);
  expect(scrolled).toBeGreaterThan(0);

  // Applying a setting dispatches a panel action and swaps the whole panel DOM. The value must
  // actually CHANGE: applying the unchanged default short-circuits before rendering
  // (updateVisibleBookmarkSoftMax returns early on an equal value), which would let this test pass
  // without exercising rerender-time scroll restoration at all.
  const displayGroup = panel.locator('.image-trail-panel__settings-utility-section', { hasText: 'Display' }).first();
  const visiblePinsInput = displayGroup.locator('input[type="number"]').first();
  const currentValue = await visiblePinsInput.inputValue();
  const changedValue = String(Number(currentValue) + 1);
  await visiblePinsInput.fill(changedValue);
  await displayGroup.getByRole('button', { name: 'Apply' }).first().click();
  // The rerender happened (the input rebuilt with the new applied value) ...
  await expect(displayGroup.locator('input[type="number"]').first()).toHaveValue(changedValue);
  // ... and the Settings region kept its scroll position through it.
  await expect.poll(async () => settingsSection.evaluate((element) => element.scrollTop)).toBe(scrolled);
});
