import type { Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  closeSettings,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixturePaths,
  fixtureUrl,
  openFixturePage,
  openSettingsGroup,
  setLoadFailureFeedback,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

function dynamicSvg(frame: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#245"/><text x="90" y="68" text-anchor="middle" fill="white">${frame}</text></svg>`;
}

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

async function enableNeighborPreloading(page: Page): Promise<void> {
  await openSettingsGroup(page, 'Automation');
  const preload = () =>
    page
      .getByRole('heading', { name: 'Preload' })
      .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  const enabled = preload().getByRole('checkbox', { name: 'Warm adjacent parsed-field images' });
  if (!(await enabled.isChecked())) await enabled.check();
  await preload().getByLabel('Ahead/behind').fill('2');
  await preload().getByRole('button', { name: 'Apply' }).click();
  await closeSettings(page);
  await setLoadFailureFeedback(page, 'display');
}

async function openParsedFields(page: Page): Promise<void> {
  const fields = page.locator('.image-trail-panel__fields');
  if (!(await fields.evaluate((element) => element.hasAttribute('open')))) {
    await page.locator('.image-trail-panel__fields-summary').click();
  }
}

async function includeFrameField(page: Page): Promise<void> {
  const include = page.getByRole('button', { name: /Include .*frame/u });
  if ((await include.count()) > 0) await include.click();
  await expect(page.getByRole('button', { name: /Exclude .*frame/u })).toBeVisible();
}

async function openManualControls(page: Page): Promise<void> {
  const controls = page.locator('.image-trail-panel__secondary-controls-details');
  if (!(await controls.evaluate((element) => element.hasAttribute('open')))) {
    await page.locator('.image-trail-panel__secondary-controls-summary').click();
  }
}

test('neighbor status distinguishes warmed, failed, and traversed skipped candidates without exposing URLs (#208)', async ({
  page,
  serviceWorker,
}) => {
  await page.context().route(/\/dynamic-image\.svg\?frame=/u, async (route) => {
    const frame = new URL(route.request().url()).searchParams.get('frame') ?? 'unknown';
    if (frame === '502') {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing fixture frame' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: dynamicSvg(frame) });
  });
  await openPanel(page, serviceWorker);
  await enableNeighborPreloading(page);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=500'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=500/u);
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=501/u);
  await includeFrameField(page);

  const neighborStatus = page.locator('.image-trail-panel__neighbor-status');
  await expect(neighborStatus).toContainText('warmed');
  await expect(neighborStatus).toContainText('failed');
  await expect(neighborStatus).not.toContainText(fixtureUrl('/dynamic-image.svg'));

  await openManualControls(page);
  await page.getByRole('button', { name: 'Next ▶' }).click();
  await expectPanelStatusMessage(page, /(?:Loaded|Applied) .*dynamic-image\.svg\?frame=503/u);
  await expect(neighborStatus).toContainText('skipped');
  await expect(neighborStatus).not.toContainText(/https?:|blob:|image=/u);

  await setLoadFailureFeedback(page, 'mute');
  await expect(neighborStatus).not.toContainText(/failed|skipped/u);

  await openSettingsGroup(page, 'Automation');
  const preload = page
    .getByRole('heading', { name: 'Preload' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await preload.getByRole('checkbox', { name: 'Warm adjacent parsed-field images' }).uncheck();
  await preload.getByRole('button', { name: 'Apply' }).click();
  await closeSettings(page);
  await expect(neighborStatus).toHaveCount(0);
});
