import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from './schema-assert.js';
import type { StoredWorkspaceLayout, StoredWorkspaceSectionLayout } from './workspace-layout.js';

/**
 * Storage-boundary validation is deliberately permissive about section ids (`v.string()`, not a
 * picklist): a layout saved by a newer build with section ids this build does not know must still
 * hydrate, so `sanitizeWorkspaceLayout` can drop just the unknown entries instead of validation
 * quarantining the whole per-site record.
 */
const storedWorkspaceSectionLayoutSchema = v.object({
  sectionId: v.string(),
  position: v.nullable(
    v.object({
      left: v.number(),
      top: v.number(),
    }),
  ),
  minimized: v.boolean(),
});

export const workspaceLayoutSchema = v.object({
  sections: v.pipe(v.array(storedWorkspaceSectionLayoutSchema), v.readonly()),
});

type _AssertStoredWorkspaceSectionLayout = Assert<
  MutuallyAssignable<v.InferOutput<typeof storedWorkspaceSectionLayoutSchema>, StoredWorkspaceSectionLayout>
>;
type _AssertStoredWorkspaceLayout = Assert<MutuallyAssignable<v.InferOutput<typeof workspaceLayoutSchema>, StoredWorkspaceLayout>>;
