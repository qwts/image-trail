import {
  applyUrlInEditor,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixturePaths,
  fixtureUrl,
  openFixturePage,
  panelStatus,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

function dynamicSvg(frame: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120" viewBox="0 0 180 120"><rect width="180" height="120" fill="#204c73"/><text x="90" y="66" text-anchor="middle" fill="white" font-size="24">Frame ${frame}</text></svg>`;
}

async function openPanel(page: Parameters<typeof openFixturePage>[0], serviceWorker: Parameters<typeof togglePanelFromExtensionAction>[1]) {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

async function installDynamicImageRoute(page: Parameters<typeof openFixturePage>[0]): Promise<void> {
  await page.context().route(/\/dynamic-image\.svg\?frame=/u, async (route) => {
    const frame = new URL(route.request().url()).searchParams.get('frame') ?? 'unknown';
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: dynamicSvg(frame),
    });
  });
}

async function setRequestThrottle(
  page: Parameters<typeof openFixturePage>[0],
  values: { readonly minimumIntervalMs: string; readonly maxRequests: string; readonly windowMs: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Show settings' }).click();
  await page.getByRole('heading', { name: 'Automation' }).click();
  const throttle = page
    .getByRole('heading', { name: 'Request throttle' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await throttle.getByLabel('Min interval').fill(values.minimumIntervalMs);
  await throttle.getByLabel('Max requests').fill(values.maxRequests);
  await throttle.getByLabel('Window ms').fill(values.windowMs);
  await throttle.getByRole('button', { name: 'Apply' }).click();
}

async function blurFocusedElement(page: Parameters<typeof openFixturePage>[0]): Promise<void> {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

async function openParsedFields(page: Parameters<typeof openFixturePage>[0]): Promise<void> {
  const fields = page.locator('.image-trail-panel__fields');
  const isOpen = await fields.evaluate((element) => element.hasAttribute('open'));
  if (!isOpen) await page.locator('.image-trail-panel__fields-summary').click();
}

async function openManualControls(page: Parameters<typeof openFixturePage>[0]): Promise<void> {
  const controls = page.locator('.image-trail-panel__secondary-controls');
  const isOpen = await controls.evaluate((element) => element.hasAttribute('open'));
  if (!isOpen) await page.locator('.image-trail-panel__secondary-controls-summary').click();
}

async function ensureQueryFrameIncluded(page: Parameters<typeof openFixturePage>[0]): Promise<void> {
  const include = page.getByRole('button', { name: /Include query frame/u });
  if ((await include.count()) > 0) await include.click();
  await expect(page.getByRole('button', { name: /Exclude query frame/u })).toBeVisible();
}

test('keyboard automation shortcuts preserve typing targets and route image downloads globally', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);
  await page.evaluate(() => {
    const win = window as typeof window & { imageTrailUnhandledKeys?: string[] };
    win.imageTrailUnhandledKeys = [];
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'd' && event.key !== 'D') return;
      win.imageTrailUnhandledKeys?.push(event.key);
    });
  });

  const editor = page.locator('.image-trail-panel__full-url-input');
  await editor.focus();
  await page.keyboard.press('End');
  await page.keyboard.press('d');
  await page.keyboard.press('Shift+D');
  await expect(editor).toHaveValue(/dD$/u);
  await expect(panelStatus(page)).not.toHaveAttribute('title', /export|download/u);
  await page.evaluate(() => {
    (window as typeof window & { imageTrailUnhandledKeys?: string[] }).imageTrailUnhandledKeys = [];
  });

  await blurFocusedElement(page);
  await page.keyboard.press('d');
  await page.keyboard.press('Shift+D');
  expect(await page.evaluate(() => (window as typeof window & { imageTrailUnhandledKeys?: string[] }).imageTrailUnhandledKeys)).toEqual([]);
});

test('slideshow keyboard controls pause, resume, and stop on opposite manual navigation', async ({ page, serviceWorker }) => {
  await installDynamicImageRoute(page);
  await openPanel(page, serviceWorker);
  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=1'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=1/u);
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=2/u);
  await ensureQueryFrameIncluded(page);

  await blurFocusedElement(page);
  await page.keyboard.press('Space');
  await expect(page.locator('.image-trail-panel__automation-status', { hasText: 'Slideshow: running' })).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.locator('.image-trail-panel__automation-status', { hasText: 'Slideshow: paused' })).toBeVisible();

  await page.keyboard.press('Space');
  await expect(page.locator('.image-trail-panel__automation-status', { hasText: 'Slideshow: running' })).toBeVisible();

  await openManualControls(page);
  await page.getByRole('button', { name: '◀ Prev' }).click();
  await expect(page.locator('.image-trail-panel__automation-status', { hasText: 'Slideshow: stopped' })).toBeVisible();
});

test('request-governor status surfaces bounded automation recovery', async ({ page, serviceWorker }) => {
  await installDynamicImageRoute(page);
  await openPanel(page, serviceWorker);

  await applyUrlInEditor(page, fixtureUrl('/dynamic-image.svg?frame=1'));
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=1/u);
  await openParsedFields(page);
  await page.getByRole('button', { name: /Increment .*frame/u }).click();
  await expectPanelStatusMessage(page, /Loaded .*dynamic-image\.svg\?frame=2/u);
  await ensureQueryFrameIncluded(page);
  await openManualControls(page);
  await expect(page.getByRole('button', { name: 'Retry 404' })).toBeVisible();
  await setRequestThrottle(page, { minimumIntervalMs: '0', maxRequests: '1', windowMs: '60000' });

  await blurFocusedElement(page);
  await page.keyboard.press('Space');
  await expect(page.locator('.image-trail-panel__automation-status', { hasText: 'Rate limit: capped' })).toBeVisible({
    timeout: 6_000,
  });
});
