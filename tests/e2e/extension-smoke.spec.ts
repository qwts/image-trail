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
  openTargetControls,
  panelStatus,
  setLoadFailureFeedback,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

const primaryImage = '#fixture-primary-image';
const primarySource = '#fixture-primary-source';

function recentRowForUrl(page: Parameters<typeof imageNavigationSnapshot>[0], url: string) {
  return page.locator(`.image-trail-panel__history-item[data-image-trail-row-id$="${url}"]`);
}

async function expectSelectedImage(page: Parameters<typeof imageNavigationSnapshot>[0], selector: string): Promise<void> {
  await expect(page.locator(selector)).toHaveAttribute('data-image-trail-selected', 'true');
  await expect(page.locator(selector)).toHaveCSS('outline-style', 'solid');
}

async function openHostTargetDetails(page: Parameters<typeof imageNavigationSnapshot>[0]): Promise<void> {
  const release = page.getByRole('button', { name: 'Release host image' });
  if (await release.isVisible()) return;
  const target = page.locator('.image-trail-panel__target-utility');
  if ((await target.getAttribute('open')) === null) await page.locator('.image-trail-panel__target-summary').click();
  await openTargetControls(page);
  await expect(release).toBeVisible();
}

async function expectHostRestoredTo(
  page: Parameters<typeof imageNavigationSnapshot>[0],
  expected: Awaited<ReturnType<typeof imageNavigationSnapshot>>,
  options: { readonly expectedSrcAttribute?: string } = {},
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
    src: options.expectedSrcAttribute ?? expected.src,
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

test('registers the build-info keyboard command for Chromium shortcut settings', async ({ serviceWorker }) => {
  const command = await serviceWorker.evaluate(async () => {
    return (await chrome.commands.getAll()).find((candidate) => candidate.name === 'toggle-build-info-overlay') ?? null;
  });

  expect(command).toMatchObject({
    name: 'toggle-build-info-overlay',
    description: 'Toggle build info overlay',
  });
});

test('registers assignable action commands for Chromium shortcut settings', async ({ serviceWorker }) => {
  const commandNames = await serviceWorker.evaluate(async () => {
    return (await chrome.commands.getAll()).map((command) => command.name).sort();
  });

  expect(commandNames).toEqual(
    expect.arrayContaining([
      'shortcut-next',
      'shortcut-previous',
      'shortcut-download',
      'shortcut-download-save-as',
      'shortcut-slideshow-toggle',
      'shortcut-stop',
      'shortcut-grab-mode-toggle',
      'shortcut-retry',
    ]),
  );
});

test('ignores browser shortcut action messages while the panel is closed', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  // On-demand injection means a never-invoked page has no message listener.
  // Open and close once so this test exercises the closed-panel listener state.
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelClosed(page);

  const result = await serviceWorker.evaluate(async (activeUrl) => {
    const [tab] = await chrome.tabs.query({ url: activeUrl });
    if (typeof tab?.id !== 'number') throw new Error('Fixture tab was not found.');
    return chrome.tabs.sendMessage(tab.id, {
      type: 'imageTrail.shortcutAction',
      version: 1,
      payload: { action: 'slideshow-toggle' },
    });
  }, page.url());

  expect(result).toMatchObject({
    type: 'imageTrail.status',
    payload: { panelVisible: false, status: 'Panel is closed.' },
  });
  await expectPanelClosed(page);
});

test('the panel header Help toggle shows the shortcut reference and feature guide (#352)', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  const helpToggle = page.getByRole('button', { name: 'Show help' });
  await helpToggle.click();

  const helpSection = page.locator('.image-trail-panel__help-section');
  await expect(helpSection).toBeVisible();
  // Role-based locators: shortcut ROW text can contain the heading strings as substrings
  // (e.g. a row starting 'Browser shortcut…'), which trips strict mode with getByText.
  await expect(helpSection.getByRole('heading', { name: 'Panel shortcuts' })).toBeVisible();
  await expect(helpSection.getByRole('heading', { name: 'Browser shortcuts' })).toBeVisible();
  await helpSection.getByRole('heading', { name: 'Workspace' }).click();
  await expect(helpSection.getByText('Host target', { exact: true })).toBeVisible();
  // The label can render in both the panel list and the legacy-keys list; any one instance proves
  // the shared registry feeds Help.
  await expect(helpSection.locator('strong').filter({ hasText: 'Next trail step' }).first()).toBeVisible();

  // Keyboard access without a focus trap: the toggle is a plain button and focus stays usable.
  await page.getByRole('button', { name: 'Hide help' }).click();
  await expect(page.locator('.image-trail-panel__help-section')).toHaveCount(0);
});

test('surfaces the build-info overlay toggle in Settings', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await page.getByRole('button', { name: 'Show settings' }).click();
  await page.getByText('System', { exact: true }).click();

  const toggle = page.getByLabel('Show build info overlay');
  await expect(toggle).toBeVisible();
  await toggle.check();
  const overlayHost = page.locator('#image-trail-build-identity-overlay');
  await expect(overlayHost).toHaveCount(1);
  await expect(overlayHost).toHaveCSS('pointer-events', 'none');

  const overlay = overlayHost.locator('.image-trail-build-overlay');
  await expect(overlay).toHaveCSS('pointer-events', 'auto');
  await expect(overlay).toHaveCSS('user-select', 'text');

  const details = overlay.locator('.image-trail-build-overlay__details');
  const detailsText = ((await details.textContent()) ?? '').trim();
  expect(detailsText).toContain('Version:');
  expect(detailsText).toContain('Mode:');
  expect(detailsText).toContain('Built UTC:');
  const detailsBox = await details.boundingBox();
  if (!detailsBox) throw new Error('Build-info overlay details were not visible for selection.');
  await page.mouse.move(detailsBox.x + 2, detailsBox.y + 2);
  await page.mouse.down();
  await page.mouse.move(detailsBox.x + detailsBox.width - 2, detailsBox.y + detailsBox.height - 2, { steps: 12 });
  await page.mouse.up();
  const selectedText = (await page.evaluate(() => getSelection()?.toString() ?? '')).trim();
  expect(selectedText).toContain('Version:');
  expect(selectedText).toContain('Mode:');
  expect(selectedText).toContain('Built UTC:');

  await page.evaluate(() => {
    document.body.dataset['imageTrailOutsideOverlayClick'] = 'pending';
    document.body.addEventListener(
      'click',
      () => {
        document.body.dataset['imageTrailOutsideOverlayClick'] = 'received';
      },
      { once: true },
    );
  });
  const overlayBox = await overlay.boundingBox();
  if (!overlayBox) throw new Error('Build-info overlay was not visible for outside-click check.');
  await page.mouse.click(Math.max(8, overlayBox.x - 8), overlayBox.y + 8);
  await expect(page.locator('body')).toHaveAttribute('data-image-trail-outside-overlay-click', 'received');

  await toggle.uncheck();
  await expect(page.locator('#image-trail-build-identity-overlay')).toHaveCount(0);

  await toggle.check();
  await expect(page.locator('#image-trail-build-identity-overlay')).toHaveCount(1);
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
  await expect(page.locator('.image-trail-panel__target-badge')).toHaveText('Selected');
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Single image');
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetOne));
});

test('multi-image page requires picking and marks only the selected target', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.multipleImages);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  await expectPanelStatusMessage(page, '3 qualifying images found. Pick one target image.');
  await openTargetControls(page);
  await page.getByRole('button', { name: 'Set host image' }).click();
  await expectPanelStatusMessage(page, 'Pick mode is active. 3 image candidates available.');
  await page.locator('#fixture-image-two').click();

  await expectSelectedImage(page, '#fixture-image-two');
  await expect(page.locator('#fixture-image-one')).not.toHaveAttribute('data-image-trail-selected', 'true');
  await expect(page.locator('#fixture-image-three')).not.toHaveAttribute('data-image-trail-selected', 'true');
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetTwo));
  await openTargetControls(page);
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
  await expectHostRestoredTo(page, beforeRelease, { expectedSrcAttribute: fixtureUrl(fixtureAssetPaths.assetOne) });
});

test('recent preview projects into selected host image and guards repeated current previews', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  const projectedTwo = await imageNavigationSnapshot(page, primaryImage);
  expect(projectedTwo.src).toMatch(/^data:image\/svg\+xml;base64,/u);

  const assetOneUrl = fixtureUrl(fixtureAssetPaths.assetOne);
  const assetOneRecent = recentRowForUrl(page, assetOneUrl);
  // A single click only selects (#426); the projected image must stay asset-two.
  await assetOneRecent.click();
  await expect(assetOneRecent).toHaveClass(/is-selected/u);
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  // A real double-click projects the row.
  await assetOneRecent.dblclick();
  await expectPanelStatusMessage(page, /Loaded .*asset-one\.svg/u);
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetOne));
  const projectedOne = await imageNavigationSnapshot(page, primaryImage);
  expect(projectedOne.src).toMatch(/^data:image\/svg\+xml;base64,/u);
  expect(projectedOne.src).not.toBe(projectedTwo.src);

  // Enter exercises the repeated-preview guard with one activation. A synthetic second dblclick
  // can lose its final event when the first click rerenders the row under Playwright.
  await assetOneRecent.press('Enter');
  await expectPanelStatusMessage(page, 'Recent image is already projected into the selected host element.');
  expect(await imageNavigationSnapshot(page, primaryImage)).toEqual(projectedOne);
});

test('focused recent row loads on Enter after arrow navigation (#390)', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);

  const assetTwoRecent = page.locator('.image-trail-panel__history-item', { hasText: 'asset-two.svg' });
  const assetOneRecent = recentRowForUrl(page, fixtureUrl(fixtureAssetPaths.assetOne));
  await assetTwoRecent.click();
  await expect(assetTwoRecent).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(assetOneRecent).toBeFocused();
  await page.keyboard.press('Enter');

  await expectPanelStatusMessage(page, /Loaded .*asset-one\.svg/u);
  await expect(page.locator('.image-trail-panel__target-url')).toHaveText(fixtureUrl(fixtureAssetPaths.assetOne));
});

test('previewing a recent after a failed load updates the URL editor and parsed fields (#429)', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  // Alert mode so the fail-closed apply surfaces the HTTP-error status this test waits on (#450).
  await setLoadFailureFeedback(page, 'alert');
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetOne));
  await expectPanelStatusMessage(page, /Loaded .*asset-one\.svg/u);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);

  // The failed load parks its address in the draft URL.
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.missingImage));
  await expectPanelStatusMessage(page, /Image failed to load: HTTP 404/u);
  await expect(page.locator('.image-trail-panel__full-url-input')).toHaveValue(fixtureUrl(fixtureAssetPaths.missingImage));

  // Double-click projecting a recent must supersede the failed draft: the URL editor and the
  // parsed-field derivation follow the projected record, not the dead address.
  const failedDraftRecent = recentRowForUrl(page, fixtureUrl(fixtureAssetPaths.assetOne));
  // The first click selects and rerenders the row. Resolve the locator again for the second click
  // so this exercises the product's cross-render double-click tracker instead of a stale node.
  await failedDraftRecent.click();
  await failedDraftRecent.click();
  await expectPanelStatusMessage(page, /(Loaded|Applied) .*asset-one\.svg|Projected image into selected host element\./u);
  await expect(page.locator('.image-trail-panel__full-url-input')).toHaveValue(fixtureUrl(fixtureAssetPaths.assetOne));
});

test('failed projection keeps the previous successful host image', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);

  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  // Alert mode so the failed projection surfaces the red error status this test asserts (#450).
  await setLoadFailureFeedback(page, 'alert');
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  const successful = await imageNavigationSnapshot(page, primaryImage);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.missingImage));
  await expect(panelStatus(page)).toHaveClass(/is-error/u);
  await expectPanelStatusMessage(page, /Image failed to load: HTTP 404/u);
  expect(await imageNavigationSnapshot(page, primaryImage)).toEqual(successful);
});
