import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import type { PanelAction } from '../../core/types.js';
import type { DetachableSectionId, WorkspaceFloatingRect } from '../../core/workspace-layout.js';
import { clampFloatingRect, viewportSize } from '../workspace/workspace-geometry.js';
import { registerWorkspaceGesture } from '../workspace/workspace-gesture.js';

interface WorkspaceWindowResizeProps {
  readonly sectionId: DetachableSectionId;
  readonly title: string;
  readonly setDraftRect: (rect: WorkspaceFloatingRect | null) => void;
  readonly dispatch: (action: PanelAction) => void;
}

export function WorkspaceWindowResize({ sectionId, title, setDraftRect, dispatch }: WorkspaceWindowResizeProps) {
  return (
    <button
      type="button"
      className="image-trail-workspace__window-resize"
      data-image-trail-resize={sectionId}
      aria-label={`Resize ${title}`}
      title={`Resize ${title}`}
      onPointerDown={(event) => startWindowResize(event, sectionId, setDraftRect, dispatch)}
      onKeyDown={(event) => resizeWindowWithKeyboard(event, sectionId, dispatch)}
    >
      <span aria-hidden="true">◢</span>
    </button>
  );
}

function startWindowResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  sectionId: DetachableSectionId,
  setDraftRect: (rect: WorkspaceFloatingRect | null) => void,
  dispatch: (action: PanelAction) => void,
): void {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const startRect = currentWindowRect(event.currentTarget);
  if (!startRect) return;
  const start = { x: event.clientX, y: event.clientY };
  const viewport = viewportSize();
  let latest = startRect;
  let unregisterGesture = (): void => {};
  const onMove = (move: PointerEvent): void => {
    latest = clampFloatingRect(
      { ...startRect, width: startRect.width + move.clientX - start.x, height: startRect.height + move.clientY - start.y },
      viewport,
    );
    setDraftRect(latest);
  };
  const finish = (commit: boolean): void => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('keydown', onKeyDown, true);
    unregisterGesture();
    setDraftRect(null);
    if (commit && !rectsEqual(startRect, latest)) {
      dispatch({ name: 'workspace/resize', sectionId, floatingRect: latest });
    }
  };
  const onUp = (): void => finish(true);
  const onCancel = (): void => finish(false);
  const onKeyDown = (keyboard: KeyboardEvent): void => {
    if (keyboard.key !== 'Escape') return;
    keyboard.preventDefault();
    keyboard.stopPropagation();
    finish(false);
  };
  unregisterGesture = registerWorkspaceGesture(() => finish(false));
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('keydown', onKeyDown, true);
}

function resizeWindowWithKeyboard(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  sectionId: DetachableSectionId,
  dispatch: (action: PanelAction) => void,
): void {
  const direction = keyboardResizeDirection(event.key);
  if (!direction) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = currentWindowRect(event.currentTarget);
  if (!rect) return;
  const step = event.shiftKey ? 40 : 16;
  dispatch({
    name: 'workspace/resize',
    sectionId,
    floatingRect: clampFloatingRect(
      { ...rect, width: rect.width + direction.width * step, height: rect.height + direction.height * step },
      viewportSize(),
    ),
  });
}

function keyboardResizeDirection(key: string): { readonly width: number; readonly height: number } | null {
  if (key === 'ArrowLeft') return { width: -1, height: 0 };
  if (key === 'ArrowRight') return { width: 1, height: 0 };
  if (key === 'ArrowUp') return { width: 0, height: -1 };
  return key === 'ArrowDown' ? { width: 0, height: 1 } : null;
}

function currentWindowRect(handle: HTMLElement): WorkspaceFloatingRect | null {
  const windowElement = handle.closest<HTMLElement>('[data-workspace-mode="floating"]');
  if (!windowElement) return null;
  const rect = windowElement.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

function rectsEqual(a: WorkspaceFloatingRect, b: WorkspaceFloatingRect): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
