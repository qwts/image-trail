import {
  applyUrlInEditor,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  imageNavigationSnapshot,
  openFixturePage,
  openTargetControls,
  test,
  togglePanelFromExtensionAction,
  expect,
} from './fixtures.js';

const target = '#redraw-target';
const source = '#target-shell source';

interface ReplacementFrame {
  readonly src: string | null;
  readonly srcset: string | null;
  readonly sizes: string | null;
  readonly selected: string | null;
  readonly handle: string | null;
  readonly lockBox: string | null;
  readonly sourceSrcset: string | null;
  readonly sourceSizes: string | null;
}

async function openHostTargetDetails(page: Parameters<typeof imageNavigationSnapshot>[0]): Promise<void> {
  const release = page.getByRole('button', { name: 'Release host image' });
  if (await release.isVisible()) return;
  const target = page.locator('.image-trail-panel__target-utility');
  if ((await target.getAttribute('open')) === null) await page.locator('.image-trail-panel__target-summary').click();
  await openTargetControls(page);
  await expect(release).toBeVisible();
}

test('recovers a selected projection before the replacement node paints and restores the host state', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.redrawImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);
  const before = await imageNavigationSnapshot(page, target, source);

  const firstFrame = await page.evaluate(() =>
    (window as typeof window & { replaceRedrawTarget: () => Promise<ReplacementFrame> }).replaceRedrawTarget(),
  );

  expect(firstFrame.src).toBe(before.src);
  expect(firstFrame.src).toMatch(/^data:image\/svg\+xml;base64,/u);
  expect(firstFrame.srcset).toBeNull();
  expect(firstFrame.sizes).toBeNull();
  expect(firstFrame.sourceSrcset).toBeNull();
  expect(firstFrame.sourceSizes).toBeNull();
  expect(firstFrame.selected).toBe('true');
  expect(firstFrame.lockBox).toBe('true');
  expect(firstFrame.handle).toBe(before.handle);

  await openHostTargetDetails(page);
  await page.getByRole('button', { name: 'Release host image' }).click();
  await expectPanelStatusMessage(page, 'Released host image and restored its original URL.');
  const restored = await imageNavigationSnapshot(page, target, source);
  expect(restored.src).toBe('/assets/asset-one.svg');
  expect(restored.srcset).toBe('/assets/asset-one.svg 1x');
  expect(restored.sizes).toBe('180px');
  expect(restored.sourceSrcset).toBe('/assets/asset-one.svg 1x');
  expect(restored.sourceSizes).toBe('180px');
  expect(restored.selected).toBeNull();
  expect(restored.handle).toBeNull();
  expect(restored.style).toContain('border: 2px solid rgb(255, 0, 0)');
});

test('does not recover a replacement whose original image URL changed', async ({ page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.redrawImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expectPanelStatusMessage(page, /Loaded .*asset-two\.svg/u);

  const firstFrame = await page.evaluate(
    (differentSrc) =>
      (
        window as typeof window & {
          replaceRedrawTarget: (src: string) => Promise<ReplacementFrame>;
        }
      ).replaceRedrawTarget(differentSrc),
    fixtureAssetPaths.assetThree,
  );
  expect(firstFrame.selected).toBeNull();
  expect(firstFrame.handle).toBeNull();
  expect(firstFrame.src).toBe(fixtureAssetPaths.assetThree);

  await applyUrlInEditor(page, fixtureUrl(fixtureAssetPaths.assetOne));
  await expectPanelStatusMessage(page, 'Select a target image before loading a bookmark.');
});
