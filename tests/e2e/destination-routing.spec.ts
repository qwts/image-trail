import type { Locator, Page, TestInfo, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  closeSettings,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  openFixturePage,
  openSettingsGroup,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

const referenceViewport = { width: 924, height: 540 };
const narrowViewport = { width: 360, height: 740 };

async function openPanel(page: Page, serviceWorker: Worker): Promise<Locator> {
  await page.setViewportSize(referenceViewport);
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  const overlay = page.locator('#image-trail-build-identity-overlay');
  if ((await overlay.count()) > 0) await overlay.evaluate((element) => element.remove());
  return page.getByRole('dialog', { name: 'Image Trail panel' });
}

async function captureArtifact(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function clearDurableQueue(page: Page): Promise<void> {
  await openSettingsGroup(page, 'System');
  const current = page.getByRole('button', { name: /^Delete current queue \(\d+\)$/u });
  if ((await current.count()) > 0 && !(await current.isDisabled())) {
    await current.click();
    await page.getByRole('button', { name: /^Confirm Delete current queue \(\d+\)$/u }).click();
  }
  const recall = page.getByRole('button', { name: /^Delete Recall items \(\d+\)$/u });
  if ((await recall.count()) > 0 && !(await recall.isDisabled())) {
    await recall.click();
    await page.getByRole('button', { name: /^Confirm Delete Recall items \(\d+\)$/u }).click();
  }
  await closeSettings(page);
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);
}

async function pinUrl(page: Page, url: string, expectedCount: number): Promise<void> {
  await applyUrlInEditor(page, url);
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  await expectPanelStatusMessage(page, new RegExp(`(Loaded|Applied|Image loaded but did not change).*${escaped}`, 'u'));
  await page.getByRole('button', { name: 'Pin current' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(expectedCount);
}

async function setVisiblePinLimit(page: Page, limit: string): Promise<void> {
  await openSettingsGroup(page, 'Display');
  const pins = page
    .getByRole('heading', { name: 'Pins' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await pins.locator('input[type="number"]').fill(limit);
  await pins.locator('button', { hasText: 'Apply' }).click();
  await closeSettings(page);
}

async function expectActiveDestination(panel: Locator, destination: string): Promise<Locator> {
  const surface = panel.locator(`.image-trail-panel__destination-surface[data-destination="${destination}"]`);
  await expect(surface).toBeVisible();
  await expect(surface).toHaveCSS('opacity', '1');
  await expect(panel.locator(`[data-image-trail-destination="${destination}"]`)).toHaveAttribute('aria-pressed', 'true');
  const geometry = await surface.evaluate((element) => {
    const panelRoot = element.closest<HTMLElement>('.image-trail-panel');
    if (!panelRoot) throw new Error('Destination surface is outside the panel root.');
    const surfaceRect = element.getBoundingClientRect();
    const panelRect = panelRoot.getBoundingClientRect();
    const root = element.getRootNode() as ShadowRoot;
    const hit = root.elementFromPoint(surfaceRect.left + 8, surfaceRect.top + 8);
    return {
      hitInside: element.contains(hit),
      pageScrollTop: window.scrollY,
      panelBottom: panelRect.bottom,
      panelLeft: panelRect.left,
      panelScrollLeft: panelRoot.scrollLeft,
      panelScrollTop: panelRoot.scrollTop,
      panelTop: panelRect.top,
      panelWidth: panelRect.width,
      position: getComputedStyle(element.parentElement as HTMLElement).position,
      surfaceBottom: surfaceRect.bottom,
      surfaceHeight: surfaceRect.height,
      surfaceTop: surfaceRect.top,
      zIndex: getComputedStyle(element.parentElement as HTMLElement).zIndex,
    };
  });
  expect(geometry.surfaceHeight, JSON.stringify(geometry)).toBeGreaterThan(100);
  expect(geometry.surfaceTop, JSON.stringify(geometry)).toBeLessThan(geometry.panelBottom);
  expect(geometry.surfaceBottom, JSON.stringify(geometry)).toBeLessThanOrEqual(geometry.panelBottom + 1);
  expect(geometry.hitInside, JSON.stringify(geometry)).toBe(true);
  expect(geometry.panelLeft, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
  expect(geometry.panelScrollLeft, JSON.stringify(geometry)).toBe(0);
  expect(geometry.panelScrollTop, JSON.stringify(geometry)).toBe(0);
  expect(geometry.panelTop, JSON.stringify(geometry)).toBeGreaterThanOrEqual(0);
  expect(geometry.panelWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(420);
  expect(geometry.pageScrollTop, JSON.stringify(geometry)).toBe(0);
  return surface;
}

function destinationButton(panel: Locator, destination: string): Locator {
  return panel.locator(`[data-image-trail-destination="${destination}"]`);
}

test('all four in-panel destinations match the fixed handoff states', async ({ page, serviceWorker }, testInfo) => {
  test.setTimeout(60_000);
  const panel = await openPanel(page, serviceWorker);
  await clearDurableQueue(page);
  await pinUrl(page, fixtureUrl(fixtureAssetPaths.assetOne), 1);
  await pinUrl(page, fixtureUrl(fixtureAssetPaths.assetTwo), 2);

  await destinationButton(panel, 'dashboard').click();
  const dashboard = await expectActiveDestination(panel, 'dashboard');
  await expect(dashboard).toContainText('Pins');
  await expect(dashboard).toContainText('Bookmarks');
  await captureArtifact(page, testInfo, '04-dashboard');

  await destinationButton(panel, 'gallery').click();
  const gallery = await expectActiveDestination(panel, 'gallery');
  await expect(gallery.locator('.image-trail-panel__gallery-tile')).toHaveCount(2);
  await captureArtifact(page, testInfo, '05-gallery');

  await panel.getByRole('button', { name: 'Show settings' }).click();
  const settings = await expectActiveDestination(panel, 'settings');
  await expect(settings.locator('.image-trail-panel__settings-section > details > summary')).toHaveText([
    'Display',
    'Privacy',
    'Automation',
    'Utilities',
    'System',
  ]);
  await settings.locator('.image-trail-panel__destination-body').evaluate((element) => {
    element.scrollTop = 0;
  });
  await captureArtifact(page, testInfo, '07-settings');
  await panel.getByRole('button', { name: 'Hide settings' }).click();

  await pinUrl(page, fixtureUrl(fixtureAssetPaths.assetThree), 3);
  await pinUrl(page, `${fixtureUrl(fixtureAssetPaths.assetOne)}?variant=recall`, 4);
  await setVisiblePinLimit(page, '1');

  await panel.getByRole('button', { name: 'Open Recall' }).click();
  const recall = await expectActiveDestination(panel, 'recall');
  await expect(recall.locator('.image-trail-panel__recall-list > li')).toHaveCount(3);
  await captureArtifact(page, testInfo, '06-recall');

  await page.setViewportSize(narrowViewport);
  await expect.poll(async () => (await panel.boundingBox())?.width ?? 0).toBeLessThanOrEqual(336);
  expect(await recall.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('keyboard close, route scroll, minimize, and panel close preserve the destination contract', async ({ page, serviceWorker }) => {
  const panel = await openPanel(page, serviceWorker);
  const settingsDock = destinationButton(panel, 'settings');
  await settingsDock.focus();
  await settingsDock.press('Enter');
  const settings = await expectActiveDestination(panel, 'settings');
  const scrollOwner = settings.locator('.image-trail-panel__settings-section');
  for (const group of await settings.locator('.image-trail-panel__settings-section > details').all()) {
    if ((await group.getAttribute('open')) === null) await group.locator(':scope > summary').click();
  }
  await expect.poll(async () => scrollOwner.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await scrollOwner.evaluate((element) => {
    element.scrollTop = 24;
  });

  await destinationButton(panel, 'dashboard').click();
  await destinationButton(panel, 'settings').click();
  await expect.poll(async () => scrollOwner.evaluate((element) => element.scrollTop)).toBe(24);

  await settings.getByRole('button', { name: 'Close Settings' }).press('Enter');
  await expect(settings).toHaveCount(0);
  await expect(settingsDock).toBeFocused();

  await destinationButton(panel, 'dashboard').click();
  await panel.getByRole('button', { name: 'Minimize panel' }).click();
  await expect(page.getByRole('button', { name: 'Expand Image Trail panel' })).toBeVisible();
  await page.getByRole('button', { name: 'Expand Image Trail panel' }).click();
  await expectActiveDestination(panel, 'dashboard');

  await panel.getByRole('button', { name: 'Close panel' }).click();
  await expect(panel).toHaveCount(0);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await expect(page.locator('.image-trail-panel__destination-surface')).toHaveCount(0);
});

test('Gallery exposes explicit and modifier-key real-tab paths without closing its panel route', async ({ page, serviceWorker }) => {
  const panel = await openPanel(page, serviceWorker);
  const galleryDock = destinationButton(panel, 'gallery');
  await galleryDock.click();
  const gallery = await expectActiveDestination(panel, 'gallery');

  const explicitPagePromise = page.context().waitForEvent('page');
  await gallery.getByRole('button', { name: 'Open Gallery in tab' }).click();
  const explicitPage = await explicitPagePromise;
  await explicitPage.waitForLoadState('domcontentloaded');
  expect(explicitPage.url()).toContain('/src/gallery/gallery.html');
  await explicitPage.close();

  const modifierPagePromise = page.context().waitForEvent('page');
  await galleryDock.click({ modifiers: ['Meta'] });
  const modifierPage = await modifierPagePromise;
  await modifierPage.waitForLoadState('domcontentloaded');
  expect(modifierPage.url()).toContain('/src/gallery/gallery.html');
  await expect(gallery).toBeVisible();
  await modifierPage.close();
});
