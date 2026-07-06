import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureWorkspaceLayout,
  sanitizeWorkspaceLayout,
  workspaceLayoutsEqual,
  type DetachableSectionId,
  type WorkspaceLayout,
} from '../extension/src/core/workspace-layout.js';

test('sanitizeWorkspaceLayout drops unknown section ids and dedupes by first occurrence', () => {
  const layout = {
    sections: [
      { sectionId: 'history', position: { left: 10, top: 20 }, minimized: false },
      { sectionId: 'time-machine' as DetachableSectionId, position: null, minimized: false },
      { sectionId: 'history', position: { left: 99, top: 99 }, minimized: true },
      { sectionId: 'settings', position: null, minimized: true },
    ],
  } as WorkspaceLayout;

  const sanitized = sanitizeWorkspaceLayout(layout);
  assert.deepEqual(
    sanitized.sections.map((section) => section.sectionId),
    ['history', 'settings'],
  );
  assert.deepEqual(sanitized.sections[0]?.position, { left: 10, top: 20 });
});

test('captureWorkspaceLayout preserves detach order and reads geometry maps', () => {
  const positions = new Map<DetachableSectionId, { left: number; top: number }>([['bookmarks', { left: 300, top: 40 }]]);
  const minimized = new Set<DetachableSectionId>(['history']);

  const layout = captureWorkspaceLayout(['bookmarks', 'history'], positions, minimized);
  assert.deepEqual(layout, {
    sections: [
      { sectionId: 'bookmarks', position: { left: 300, top: 40 }, minimized: false },
      { sectionId: 'history', position: null, minimized: true },
    ],
  });
});

test('workspaceLayoutsEqual compares section order, geometry, and minimized flags', () => {
  const a: WorkspaceLayout = {
    sections: [{ sectionId: 'history', position: { left: 1, top: 2 }, minimized: false }],
  };
  assert.equal(workspaceLayoutsEqual(a, { sections: [{ sectionId: 'history', position: { left: 1, top: 2 }, minimized: false }] }), true);
  assert.equal(workspaceLayoutsEqual(a, { sections: [{ sectionId: 'history', position: { left: 1, top: 3 }, minimized: false }] }), false);
  assert.equal(workspaceLayoutsEqual(a, { sections: [{ sectionId: 'history', position: null, minimized: false }] }), false);
  assert.equal(workspaceLayoutsEqual(a, { sections: [{ sectionId: 'history', position: { left: 1, top: 2 }, minimized: true }] }), false);
  assert.equal(workspaceLayoutsEqual(a, { sections: [] }), false);
});
