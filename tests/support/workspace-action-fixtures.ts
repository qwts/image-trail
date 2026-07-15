export const workspaceActionFixtures = {
  'workspace/move': {
    name: 'workspace/move',
    sectionId: 'history',
    floatingRect: { left: 10, top: 12, width: 340, height: 320 },
  },
  'workspace/unsnap': {
    name: 'workspace/unsnap',
    sectionId: 'history',
    floatingRect: { left: 10, top: 12, width: 340, height: 320 },
  },
  'workspace/snap': { name: 'workspace/snap', sectionId: 'history', edge: 'left' },
  'workspace/shade': { name: 'workspace/shade', sectionId: 'history' },
  'workspace/reorder': { name: 'workspace/reorder', sectionId: 'history', edge: 'left', order: 0 },
} as const;

export function workspaceActionDeps(record: (name: string) => void, recordAsync: (name: string) => Promise<void>) {
  return {
    updateWorkspaceLayoutRestore: () => record('updateWorkspaceLayoutRestore'),
    resetWorkspaceLayout: () => recordAsync('resetWorkspaceLayout'),
    notifyWorkspaceLayoutChanged: () => record('notifyWorkspaceLayoutChanged'),
    prepareDetachedWorkspaceSection: () => record('prepareDetachedWorkspaceSection'),
    restoreWorkspaceSection: () => record('restoreWorkspaceSection'),
    moveWorkspaceSection: () => record('moveWorkspaceSection'),
    snapWorkspaceSection: () => record('snapWorkspaceSection'),
    shadeWorkspaceSection: () => record('shadeWorkspaceSection'),
    reorderWorkspaceSection: () => record('reorderWorkspaceSection'),
  };
}
