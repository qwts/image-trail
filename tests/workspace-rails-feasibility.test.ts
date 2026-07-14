import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HANDOFF_RAIL_GEOMETRY,
  REFLOW_STRATEGY_EVIDENCE,
  canonicalWorkspaceUrlStructure,
  deriveWorkspaceLayoutKey,
  interactionThresholds,
  measureRailSpace,
  recommendRailMode,
} from './support/workspace-rails-feasibility.js';

test('the strategy matrix keeps overlay as the only general default', () => {
  assert.deepEqual(
    REFLOW_STRATEGY_EVIDENCE.map(({ strategy, result }) => [strategy, result]),
    [
      ['overlay', 'default'],
      ['root-inset-or-margin', 'reject-general'],
      ['wrapper-insertion', 'reject'],
      ['css-transform', 'reject'],
      ['site-adapter', 'conditional'],
    ],
  );
});

test('the handoff rail geometry is allowed only when at least 640 by 480 CSS pixels remain', () => {
  assert.deepEqual(HANDOFF_RAIL_GEOMETRY, { side: 344, block: 240, minimumHostWidth: 640, minimumHostHeight: 480 });
  assert.deepEqual(measureRailSpace({ width: 1_440, height: 900 }, ['left']), {
    remainingWidth: 1_096,
    remainingHeight: 900,
    geometryFits: true,
  });
  assert.deepEqual(measureRailSpace({ width: 1_440, height: 900 }, ['left', 'right']), {
    remainingWidth: 752,
    remainingHeight: 900,
    geometryFits: true,
  });
  assert.equal(measureRailSpace({ width: 1_024, height: 768 }, ['left', 'right']).geometryFits, false);
  assert.equal(measureRailSpace({ width: 1_024, height: 768 }, ['top']).geometryFits, true);
  assert.equal(measureRailSpace({ width: 1_024, height: 768 }, ['top', 'bottom']).geometryFits, false);
  assert.equal(measureRailSpace({ width: 800, height: 600 }, ['left']).geometryFits, false);
  assert.equal(measureRailSpace({ width: 720, height: 450 }, ['left']).geometryFits, false, '1440x900 at 200% zoom falls back');
});

test('fine-pointer thresholds preserve the handoff while coarse and keyboard inputs stay operable', () => {
  assert.deepEqual(interactionThresholds('fine'), { detach: 8, snap: 40 });
  assert.deepEqual(interactionThresholds('coarse'), { detach: 16, snap: 56 });
  assert.deepEqual(interactionThresholds('keyboard'), { detach: null, snap: null });
});

test('automatic reflow is rejected; a proven adapter still falls back for geometry or host risks', () => {
  const base = { viewport: { width: 1_440, height: 900 }, edges: ['left'] as const, risks: [] as const };
  assert.deepEqual(recommendRailMode({ ...base, adapterApproved: false }), {
    mode: 'overlay',
    reasons: ['no-explicit-site-adapter'],
  });
  assert.deepEqual(recommendRailMode({ ...base, adapterApproved: true }), {
    mode: 'adapter-reflow',
    reasons: ['adapter-and-geometry-approved'],
  });
  assert.deepEqual(recommendRailMode({ ...base, adapterApproved: true, risks: ['fixed-or-sticky', 'shadow-root'] }), {
    mode: 'overlay',
    reasons: ['host-risk:fixed-or-sticky', 'host-risk:shadow-root'],
  });
  assert.deepEqual(recommendRailMode({ viewport: { width: 800, height: 600 }, edges: ['left'], risks: [], adapterApproved: true }), {
    mode: 'overlay',
    reasons: ['insufficient-host-viewport'],
  });
});

test('the URL-structure prototype normalizes dynamic values before deriving a salted opaque key', async () => {
  const first = 'https://private.example.test/gallery/2026/07/img-0042.jpg?token=private-one&size=large#secret';
  const sameStructure = 'https://private.example.test/gallery/2027/08/img-9999.jpg?size=small&token=private-two';
  assert.equal(canonicalWorkspaceUrlStructure(first), canonicalWorkspaceUrlStructure(sameStructure));

  const secret = new Uint8Array(32).fill(7);
  const firstKey = await deriveWorkspaceLayoutKey(first, secret);
  const sameKey = await deriveWorkspaceLayoutKey(sameStructure, secret);
  const otherShapeKey = await deriveWorkspaceLayoutKey('https://private.example.test/gallery/7/item.jpg?album=summer', secret);
  const otherOriginKey = await deriveWorkspaceLayoutKey(
    'https://other.example.test/gallery/2026/07/img-0042.jpg?size=large&token=x',
    secret,
  );
  const otherInstallKey = await deriveWorkspaceLayoutKey(first, new Uint8Array(32).fill(8));

  assert.equal(firstKey, sameKey);
  assert.notEqual(firstKey, otherShapeKey);
  assert.notEqual(firstKey, otherOriginKey);
  assert.notEqual(firstKey, otherInstallKey);
  assert.match(firstKey, /^workspace-layout:v2:[A-Za-z0-9_-]{43}$/u);
  assert.doesNotMatch(firstKey, /private|example|gallery|token|secret/iu);
});
