let activeCancel: (() => void) | null = null;

export function registerWorkspaceGesture(cancel: () => void): () => void {
  activeCancel?.();
  activeCancel = cancel;
  return () => {
    if (activeCancel === cancel) activeCancel = null;
  };
}

export function cancelWorkspaceGesture(): void {
  const cancel = activeCancel;
  activeCancel = null;
  cancel?.();
}
