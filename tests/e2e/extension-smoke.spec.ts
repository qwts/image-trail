import {
  expect,
  expectPanelClosed,
  expectPanelOpen,
  fixturePaths,
  openFixturePage,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

test('resolves the extension service worker and id', async ({ extensionId, page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  expect(extensionId).toMatch(/^[a-p]{32}$/u);
  expect(serviceWorker.url()).toBe(`chrome-extension://${extensionId}/src/background/service-worker.js`);
});

test('toggles the panel open and closed from the extension action path', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelClosed(page);
});

test('repeated toggles do not duplicate panel DOM', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.multipleImages);

  for (let count = 0; count < 3; count += 1) {
    await togglePanelFromExtensionAction(page, serviceWorker);
    await expectPanelOpen(page);
    await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);

    await togglePanelFromExtensionAction(page, serviceWorker);
    await expectPanelClosed(page);
  }
});

test('close action removes panel DOM and restores page state', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  const before = await page.locator('#fixture-primary-image').evaluate((image) => ({
    bodyBackground: document.body.style.background,
    documentElementBackground: document.documentElement.style.background,
    imageStyle: image.getAttribute('style'),
  }));

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expectPanelClosed(page);

  const after = await page.locator('#fixture-primary-image').evaluate((image) => ({
    bodyBackground: document.body.style.background,
    documentElementBackground: document.documentElement.style.background,
    imageStyle: image.getAttribute('style'),
  }));
  expect(after).toEqual(before);
});
