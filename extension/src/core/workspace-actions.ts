import type { DetachableSectionId, WorkspaceFloatingRect, WorkspaceRailEdge } from './workspace-layout.js';

export type WorkspacePanelAction =
  | { readonly name: 'section/detach'; readonly sectionId: DetachableSectionId; readonly floatingRect?: WorkspaceFloatingRect }
  | { readonly name: 'section/restore'; readonly sectionId: DetachableSectionId }
  | {
      readonly name: 'workspace/move' | 'workspace/resize' | 'workspace/unsnap';
      readonly sectionId: DetachableSectionId;
      readonly floatingRect: WorkspaceFloatingRect;
    }
  | { readonly name: 'workspace/snap'; readonly sectionId: DetachableSectionId; readonly edge: WorkspaceRailEdge }
  | { readonly name: 'workspace/shade'; readonly sectionId: DetachableSectionId }
  | {
      readonly name: 'workspace/reorder';
      readonly sectionId: DetachableSectionId;
      readonly edge: WorkspaceRailEdge;
      readonly order: number;
    };
