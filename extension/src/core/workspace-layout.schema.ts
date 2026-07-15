import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from './schema-assert.js';
import {
  WORKSPACE_LAYOUT_KEY_VERSION,
  WORKSPACE_LAYOUT_SCHEMA_VERSION,
  type LegacyStoredWorkspaceLayout,
  type StoredWorkspaceLayout,
  type StoredWorkspaceSectionLayout,
} from './workspace-layout.js';

const panelPositionSchema = v.object({ left: v.number(), top: v.number() });
const floatingRectSchema = v.object({ left: v.number(), top: v.number(), width: v.number(), height: v.number() });

const storedWorkspaceSectionLayoutSchema = v.object({
  sectionId: v.string(),
  mode: v.picklist(['attached', 'floating', 'railed']),
  edge: v.nullable(v.picklist(['left', 'right', 'top', 'bottom'])),
  order: v.nullable(v.number()),
  shaded: v.boolean(),
  collapsed: v.boolean(),
  floatingRect: v.nullable(floatingRectSchema),
});

export const workspaceLayoutSchema = v.object({
  schemaVersion: v.literal(WORKSPACE_LAYOUT_SCHEMA_VERSION),
  persistenceKeyVersion: v.literal(WORKSPACE_LAYOUT_KEY_VERSION),
  panelPosition: v.nullable(panelPositionSchema),
  sections: v.pipe(v.array(storedWorkspaceSectionLayoutSchema), v.readonly()),
});

export const legacyWorkspaceLayoutSchema = v.object({
  sections: v.pipe(
    v.array(
      v.object({
        sectionId: v.string(),
        position: v.nullable(panelPositionSchema),
        minimized: v.boolean(),
      }),
    ),
    v.readonly(),
  ),
});

type _AssertStoredWorkspaceSectionLayout = Assert<
  MutuallyAssignable<v.InferOutput<typeof storedWorkspaceSectionLayoutSchema>, StoredWorkspaceSectionLayout>
>;
type _AssertStoredWorkspaceLayout = Assert<MutuallyAssignable<v.InferOutput<typeof workspaceLayoutSchema>, StoredWorkspaceLayout>>;
type _AssertLegacyStoredWorkspaceLayout = Assert<
  MutuallyAssignable<v.InferOutput<typeof legacyWorkspaceLayoutSchema>, LegacyStoredWorkspaceLayout>
>;
