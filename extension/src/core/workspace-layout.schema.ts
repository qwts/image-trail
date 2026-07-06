import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from './schema-assert.js';
import { DETACHABLE_SECTION_IDS, type WorkspaceLayout, type WorkspaceSectionLayout } from './workspace-layout.js';

const workspaceSectionLayoutSchema = v.object({
  sectionId: v.picklist(DETACHABLE_SECTION_IDS),
  position: v.nullable(
    v.object({
      left: v.number(),
      top: v.number(),
    }),
  ),
  minimized: v.boolean(),
});

export const workspaceLayoutSchema = v.object({
  sections: v.pipe(v.array(workspaceSectionLayoutSchema), v.readonly()),
});

type _AssertWorkspaceSectionLayout = Assert<MutuallyAssignable<v.InferOutput<typeof workspaceSectionLayoutSchema>, WorkspaceSectionLayout>>;
type _AssertWorkspaceLayout = Assert<MutuallyAssignable<v.InferOutput<typeof workspaceLayoutSchema>, WorkspaceLayout>>;
