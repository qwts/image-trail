import test from 'node:test';
import assert from 'node:assert/strict';

import * as v from 'valibot';

import {
  WORKSPACE_LAYOUT_KEY_VERSION,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  captureWorkspaceLayout,
  floatingSection,
  migrateLegacyWorkspaceLayout,
  railedSection,
  sanitizeWorkspaceLayout,
  workspaceLayoutsEqual,
  type StoredWorkspaceLayout,
  type WorkspaceLayout,
} from '../extension/src/core/workspace-layout.js';
import { workspaceLayoutSchema } from '../extension/src/core/workspace-layout.schema.js';

test('sanitize drops unknown ids, dedupes, and canonicalizes modes', () => {
  const stored: StoredWorkspaceLayout = layout([
    { ...floatingSection('history', { left: 10, top: 20, width: 340, height: 320 }), sectionId: 'history' },
    { ...floatingSection('history', null), sectionId: 'time-machine' },
    floatingSection('history', { left: 99, top: 99, width: 340, height: 320 }, { shaded: true }),
    { ...railedSection('settings', 'left', 20), order: Number.NaN },
  ]);

  const sanitized = sanitizeWorkspaceLayout(stored);
  assert.deepEqual(
    sanitized.sections.map((section) => section.sectionId),
    ['history', 'settings'],
  );
  assert.deepEqual(sanitized.sections[0]?.floatingRect, { left: 10, top: 20, width: 340, height: 320 });
  assert.equal(sanitized.sections[1]?.order, 0);
});

test('legacy v2 sections gain content sizing defaults without changing the schema version', () => {
  const sanitized = sanitizeWorkspaceLayout(
    layout([storedSectionWithoutSizeMode('history'), storedSectionWithoutSizeMode('bookmarks'), storedSectionWithoutSizeMode('settings')]),
  );

  assert.deepEqual(
    sanitized.sections.map(({ sectionId, floatingSizeMode }) => [sectionId, floatingSizeMode]),
    [
      ['history', 'auto'],
      ['bookmarks', 'auto'],
      ['settings', 'user'],
    ],
  );
  assert.equal(sanitized.schemaVersion, 2);
});

test('capture records every known section through one placement registry', () => {
  const placements = new Map([
    ['bookmarks', floatingSection('bookmarks', { left: 300, top: 40, width: 340, height: 320 })],
    ['history', railedSection('history', 'right', 0, { shaded: true })],
  ] as const);
  const captured = captureWorkspaceLayout({
    detachedSections: ['bookmarks', 'history'],
    placements,
    panelPosition: { left: 24, top: 36 },
    collapsed: new Set(['bookmarks']),
  });

  assert.equal(captured.sections.length, 8);
  assert.deepEqual(captured.panelPosition, { left: 24, top: 36 });
  assert.deepEqual(
    captured.sections.find((section) => section.sectionId === 'bookmarks'),
    {
      ...floatingSection('bookmarks', { left: 300, top: 40, width: 340, height: 320 }),
      collapsed: true,
    },
  );
  assert.deepEqual(
    captured.sections.find((section) => section.sectionId === 'history'),
    railedSection('history', 'right', 0, { shaded: true }),
  );
  assert.equal(captured.sections.find((section) => section.sectionId === 'target')?.mode, 'attached');
});

test('workspace equality covers panel, rail, shade, collapse, size ownership, and floating geometry', () => {
  const a: WorkspaceLayout = layout([floatingSection('history', { left: 1, top: 2, width: 340, height: 320 })]);
  assert.equal(workspaceLayoutsEqual(a, layout([floatingSection('history', { left: 1, top: 2, width: 340, height: 320 })])), true);
  assert.equal(workspaceLayoutsEqual(a, layout([floatingSection('history', { left: 1, top: 3, width: 340, height: 320 })])), false);
  assert.equal(workspaceLayoutsEqual(a, layout([railedSection('history', 'left', 0)])), false);
  assert.equal(
    workspaceLayoutsEqual(
      a,
      layout([floatingSection('history', { left: 1, top: 2, width: 340, height: 320 }, { floatingSizeMode: 'user' })]),
    ),
    false,
  );
  assert.equal(workspaceLayoutsEqual(a, { ...a, panelPosition: { left: 1, top: 2 } }), false);
});

test('schema remains permissive for newer section ids while validating v2 shape', () => {
  const stored = v.parse(workspaceLayoutSchema, layout([{ ...floatingSection('history', null), sectionId: 'future-section' }]));
  assert.deepEqual(sanitizeWorkspaceLayout(stored).sections, []);
});

test('legacy layouts migrate minimized windows to shaded v2 floating windows', () => {
  const migrated = migrateLegacyWorkspaceLayout({
    sections: [{ sectionId: 'history', position: { left: 9, top: 12 }, minimized: true }],
  });
  assert.deepEqual(migrated, {
    schemaVersion: 2,
    persistenceKeyVersion: 1,
    panelPosition: null,
    sections: [floatingSection('history', { left: 9, top: 12, width: 340, height: 160 }, { shaded: true })],
  });
});

function layout(sections: StoredWorkspaceLayout['sections']): WorkspaceLayout {
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    persistenceKeyVersion: WORKSPACE_LAYOUT_KEY_VERSION,
    panelPosition: null,
    sections: sections as WorkspaceLayout['sections'],
  };
}

function storedSectionWithoutSizeMode(sectionId: 'history' | 'bookmarks' | 'settings'): StoredWorkspaceLayout['sections'][number] {
  return {
    sectionId,
    mode: 'floating',
    edge: null,
    order: null,
    shaded: false,
    collapsed: false,
    floatingRect: { left: 12, top: 12, width: 340, height: 320 },
  };
}
