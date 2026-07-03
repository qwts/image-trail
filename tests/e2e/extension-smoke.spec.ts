import {
  applyUrlInEditor,
  expect,
  expectPanelClosed,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  imageNavigationSnapshot,
  openFixturePage,
  panelStatus,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

const primaryImage = '#fixture-primary-image';
const primarySource = '#fixture-primary-source';

async function expectSelectedImage(page: Parameters<typeof imageNavigationSnapshot>[0], selector: string): Promise<void> {
  await expect(page.locator(selector)).toHaveAttribute('data-image-trail-selected', 'true');
  await expect(page.locator(selector)).toHaveCSS('outline-style', 'solid');
}

async function openHostTargetDetails(page: Parameters<typeof imageNavigationSnapshot>[0]): Promise<void> {
  const release = page.getByRole('button', { name: 'Release host image' });
  if (await release.isVisible()) return;
  await page.locator('.image-trail-panel__target-summary').click();
  await expect(release).toBeVisible();
}

async function expectHostRestoredTo(
  page: Parameters<typeof imageNavigationSnapshot>[0],
  expected: Awaited<ReturnType<typeof imageNavigationSnapshot>>,
): Promise<void> {
  const actual = await imageNavigationSnapshot(page, primaryImage, primarySource);
  expect({
    src: actual.src,
    srcset: actual.srcset,
    sizes: actual.sizes,
    sourceSrcset: actual.sourceSrcset,
    sourceSizes: actual.sourceSizes,
    style: actual.style,
    selected: actual.selected,
    handle: actual.handle,
    lockBox: actual.lockBox,
  }).toEqual({
    src: expected.src,
    srcset: expected.srcset,
    sizes: expected.sizes,
    sourceSrcset: expected.sourceSrcset,
    sourceSizes: expected.sourceSizes,
    style: expected.style,
    selected: null,
    handle: null,
    lockBox: null,
  });
}

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

test('single-image page auto-selects the host target on panel open', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await expectSelectedImage(page, primaryImage);
  await expectPanelStatusMessage(page, /Auto-selected .*asset-one\.svg/u);
  await expect(page.locator('.image-trail-panel__target-badge')).toHaveText('180×120');
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetOne));
});

test('multi-image page requires picking and marks only the selected target', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.multipleImages);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await expectPanelStatusMessage(page, '3 qualifying images found. Pick one target image.');
  await page.getByRole('button', { name: 'Set host image' }).click();
  await expectPanelStatusMessage(page, 'Pick mode is active. 3 image candidates available.');
  await page.locator('#fixture-image-two').click();

  await expectSelectedImage(page, '#fixture-image-two');
  await expect(page.locator('#fixture-image-one')).not.toHaveAttribute('data-image-trail-selected', 'true');
  await expect(page.locator('#fixture-image-three')).not.toHaveAttribute('data-image-trail-selected', 'true');
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetTwo));
  await expect(page.getByRole('button', { name: 'Release host image' })).toBeVisible();
});

test('minimize, expand, close, and reopen keep one panel host', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);

  await page.getByRole('button', { name: 'Minimize panel' }).click();
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Expand Image Trail panel' })).toBeVisible();
  await expect(page.locator('.image-trail-panel__minimized-button')).toHaveCount(1);

  await page.getByRole('button', { name: 'Expand Image Trail panel' }).click();
  await expectPanelOpen(page);
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);

  await page.getByRole('button', { name: 'Close panel' }).click();
  await expectPanelClosed(page);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);
});

test('release and close restore host image navigation attributes and owned styling', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  const beforeRelease = await imageNavigationSnapshot(page, primaryImage, primarySource);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await expectSelectedImage(page, primaryImage);
  await openHostTargetDetails(page);
  await page.getByRole('button', { name: 'Release host image' }).click();
  await expectPanelStatusMessage(page, 'Released host image and restored its original URL.');
  await expectHostRestoredTo(page, beforeRelease);

  await page.getByRole('button', { name: 'Close panel' }).click();
  await expectPanelClosed(page);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expectPanelClosed(page);
  await expectHostRestoredTo(page, beforeRelease);
});

test('recent preview projects into selected host image and guards repeated current previews', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  const projectedTwo = await imageNavigationSnapshot(page, primaryImage);
  expect(projectedTwo.src).toMatch(/^data:image\/svg\+xml;base64,/u);

  await page.locator('.image-trail-panel__history-item', { hasText: 'asset-one.svg' }).click();
  await expectPanelStatusMessage(page, /Loaded .*asset-one\.svg/u);
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetOne));
  const projectedOne = await imageNavigationSnapshot(page, primaryImage);
  expect(projectedOne.src).toMatch(/^data:image\/svg\+xml;base64,/u);
  expect(projectedOne.src).not.toBe(projectedTwo.src);

  await page.locator('.image-trail-panel__history-item', { hasText: 'asset-one.svg' }).click();
  await expectPanelStatusMessage(page, 'Recent image is already projected into the selected host element.');
  expect(await imageNavigationSnapshot(page, primaryImage)).toEqual(projectedOne);
});

test('failed projection keeps the previous successful host image', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  const successful = await imageNavigationSnapshot(page, primaryImage);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.missingImage));
  await expect(panelStatus(page)).toHaveClass(/is-error/u);
  await expectPanelStatusMessage(page, /Image failed to load: HTTP 404/u);
  expect(await imageNavigationSnapshot(page, primaryImage)).toEqual(successful);
});
