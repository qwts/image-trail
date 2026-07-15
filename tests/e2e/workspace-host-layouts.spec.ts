import { expect, test } from './fixtures.js';
import {
  captureWorkspaceArtifact,
  closeWorkspacePanel,
  detachHistory,
  hostSnapshot,
  keyboardSnapLeft,
  openWorkspaceFixture,
  openWorkspacePanel,
  prepareHostSnapshot,
} from './workspace-test-helpers.js';

const hostScenarios = ['responsive', 'fixed-sticky', 'infinite-feed', 'nested-scroll', 'rtl', 'iframe', 'transformed-root'] as const;

for (const scenario of hostScenarios) {
  test(`${scenario} host keeps exact layout, scroll, selection, hit testing, and styles`, async ({ page, serviceWorker }, testInfo) => {
    await openWorkspaceFixture(page, scenario);
    const baseline = await prepareHostSnapshot(page);
    const panel = await openWorkspacePanel(page, serviceWorker);
    const floating = await detachHistory(page);
    const rail = await keyboardSnapLeft(page, floating);

    const during = await hostSnapshot(page);
    expect(hostGeometry(during)).toEqual(hostGeometry(baseline));
    await expect(panel).toBeVisible();
    await expect(rail).toHaveAttribute('aria-label', 'left workspace rail');
    await captureWorkspaceArtifact(page, testInfo, `workspace-host-${scenario}`);

    await rail.getByRole('button', { name: 'Restore Recent history into the panel' }).click();
    await closeWorkspacePanel(page);
    expect(await hostSnapshot(page)).toEqual(baseline);
  });
}

function hostGeometry(snapshot: Awaited<ReturnType<typeof hostSnapshot>>) {
  const { targetMarkup: _targetMarkup, ...geometry } = snapshot;
  return geometry;
}
