import { expect, test } from './fixtures.js';
import {
  captureWorkspaceArtifact,
  detachedHistoryName,
  detachHistory,
  keyboardSnapLeft,
  openWorkspaceFixture,
  openWorkspacePanel,
} from './workspace-test-helpers.js';

test('floating, shaded, railed, and restored states have deterministic handoff artifacts', async ({ page, serviceWorker }, testInfo) => {
  await openWorkspaceFixture(page, 'fixed-sticky');
  const panel = await openWorkspacePanel(page, serviceWorker);
  const floating = await detachHistory(page);
  await captureWorkspaceArtifact(page, testInfo, '11-workspace-floating');

  await floating.getByRole('button', { name: 'Shade Recent history' }).click();
  await expect(floating.locator('.image-trail-workspace__dom-body')).toHaveCount(0);
  await captureWorkspaceArtifact(page, testInfo, '11-workspace-shaded');
  await floating.getByRole('button', { name: 'Unshade Recent history' }).click();

  const rail = await keyboardSnapLeft(page, floating);
  await expect(rail.locator('[data-image-trail-detached-window="history"]')).toBeVisible();
  await captureWorkspaceArtifact(page, testInfo, '11-workspace-railed');

  await rail.getByRole('button', { name: 'Restore Recent history into the panel' }).click();
  await expect(page.getByRole('button', { name: detachedHistoryName })).toBeFocused();
  await expect(panel.locator('.image-trail-panel__history-section')).toBeVisible();
  await captureWorkspaceArtifact(page, testInfo, '11-workspace-restored');
});
