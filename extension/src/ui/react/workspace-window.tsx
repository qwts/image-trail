import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

import type { PanelAction } from '../../core/types.js';
import type { WorkspaceFloatingRect, WorkspaceRailEdge, WorkspaceSectionLayout } from '../../core/workspace-layout.js';
import {
  clampFloatingRect,
  currentPointerThresholds,
  railGeometryFits,
  snapCandidateAtPoint,
  viewportSize,
  type WorkspaceSnapCandidate,
  type WorkspaceViewport,
} from '../workspace/workspace-geometry.js';
import { cancelWorkspaceGesture, registerWorkspaceGesture } from '../workspace/workspace-gesture.js';
import { WorkspaceDomBody } from './workspace-dom-body.js';

export interface WorkspaceWindowEntry {
  readonly placement: WorkspaceSectionLayout & { readonly mode: 'floating'; readonly floatingRect: WorkspaceFloatingRect };
  readonly title: string;
  readonly body: HTMLElement;
}

interface WorkspaceWindowProps {
  readonly entry: WorkspaceWindowEntry;
  readonly activeEdges: ReadonlySet<WorkspaceRailEdge>;
  readonly nextRailPositions: ReadonlyMap<WorkspaceRailEdge, number>;
  readonly dispatch: (action: PanelAction) => void;
  readonly animate: boolean;
}

type WorkspaceWindowPreview = WorkspaceSnapCandidate & { readonly position: number };

export function WorkspaceWindow({ entry, activeEdges, nextRailPositions, dispatch, animate }: WorkspaceWindowProps) {
  const [draftRect, setDraftRect] = useState<WorkspaceFloatingRect | null>(null);
  const [preview, setPreview] = useState<WorkspaceWindowPreview | null>(null);
  const rect = draftRect ?? entry.placement.floatingRect;
  const { placement, title } = entry;
  const style = { left: rect.left, top: rect.top, width: rect.width, height: placement.shaded ? undefined : rect.height };
  useEffect(() => () => cancelWorkspaceGesture(), []);

  const commitKeyboardSnap = (event: ReactKeyboardEvent<HTMLElement>): void => {
    const edge = isEditable(event.target) ? null : keyboardEdge(event);
    if (!edge) return;
    event.preventDefault();
    const candidate = edgeCandidate(edge, activeEdges, nextRailPositions);
    setPreview(null);
    if (candidate.allowed) dispatch({ name: 'workspace/snap', sectionId: placement.sectionId, edge });
  };

  return (
    <>
      {preview ? <WorkspaceSnapPreview candidate={preview} title={title} /> : null}
      <aside
        className={`image-trail-panel-root image-trail-workspace__window${placement.shaded ? ' is-shaded' : ''}${animate ? ' is-opening' : ''}`}
        data-image-trail-detached-window={placement.sectionId}
        data-workspace-mode="floating"
        role="dialog"
        aria-label={`${title} (floating)`}
        style={style}
        onKeyDown={(event) => {
          const edge = isEditable(event.target) ? null : keyboardEdge(event);
          if (edge) {
            event.preventDefault();
            setPreview(edgeCandidate(edge, activeEdges, nextRailPositions));
          } else if (event.key === 'Escape' && !isEditable(event.target)) {
            event.preventDefault();
            dispatch({ name: 'section/restore', sectionId: placement.sectionId });
          }
        }}
        onKeyUp={commitKeyboardSnap}
      >
        <header
          className="image-trail-workspace__window-header"
          tabIndex={0}
          aria-label={`Move ${title}; Alt plus an arrow key previews and snaps to an edge`}
          onPointerDown={(event) =>
            startWindowDrag(event, rect, activeEdges, nextRailPositions, setDraftRect, setPreview, dispatch, placement.sectionId)
          }
        >
          <div className="image-trail-workspace__window-title">
            <span className="image-trail-workspace__drag-grip" aria-hidden="true">
              ⠿
            </span>
            <h3>{title}</h3>
          </div>
          <WorkspaceWindowActions placement={placement} title={title} dispatch={dispatch} />
        </header>
        {placement.shaded ? null : <WorkspaceDomBody content={entry.body} />}
      </aside>
    </>
  );
}

function WorkspaceSnapPreview({ candidate, title }: { readonly candidate: WorkspaceWindowPreview; readonly title: string }) {
  const fallback = candidate.allowed ? '' : ' is-fallback';
  return (
    <>
      <div className={`image-trail-workspace__snap-preview${fallback}`} data-edge={candidate.edge} aria-hidden="true">
        <span className="image-trail-workspace__snap-label">
          {candidate.allowed ? `${candidate.edge} dock · position ${candidate.position}` : 'keep floating'}
        </span>
      </div>
      <div className="image-trail-workspace__announcement" role="status" aria-live="polite" aria-atomic="true">
        {candidate.allowed
          ? `${title} can dock to the ${candidate.edge} rail.`
          : `${title} will stay floating because the ${candidate.edge} rail leaves too little center space.`}
      </div>
    </>
  );
}

function WorkspaceWindowActions({
  placement,
  title,
  dispatch,
}: {
  readonly placement: WorkspaceSectionLayout;
  readonly title: string;
  readonly dispatch: (action: PanelAction) => void;
}) {
  return (
    <div className="image-trail-workspace__window-actions">
      <button
        type="button"
        data-image-trail-shade={placement.sectionId}
        aria-label={`${placement.shaded ? 'Unshade' : 'Shade'} ${title}`}
        title={placement.shaded ? 'Show window body' : 'Shade to title bar'}
        onClick={() => dispatch({ name: 'workspace/shade', sectionId: placement.sectionId })}
      >
        {placement.shaded ? '+' : '−'}
      </button>
      <button
        type="button"
        data-image-trail-restore={placement.sectionId}
        aria-label={`Restore ${title} into the panel`}
        title="Restore to panel"
        onClick={() => dispatch({ name: 'section/restore', sectionId: placement.sectionId })}
      >
        ✕
      </button>
    </div>
  );
}

function startWindowDrag(
  event: ReactPointerEvent<HTMLElement>,
  startRect: WorkspaceFloatingRect,
  activeEdges: ReadonlySet<WorkspaceRailEdge>,
  nextRailPositions: ReadonlyMap<WorkspaceRailEdge, number>,
  setRect: (rect: WorkspaceFloatingRect | null) => void,
  setPreview: (candidate: WorkspaceWindowPreview | null) => void,
  dispatch: (action: PanelAction) => void,
  sectionId: WorkspaceSectionLayout['sectionId'],
): void {
  if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
  event.preventDefault();
  const start = { x: event.clientX, y: event.clientY };
  let latest = startRect;
  let preview: WorkspaceWindowPreview | null = null;
  let unregisterGesture = (): void => {};
  const viewport = viewportSize();
  const onMove = (move: PointerEvent): void => {
    latest = movedRect(startRect, start, move, viewport);
    preview = addRailPosition(
      snapCandidateAtPoint({ x: move.clientX, y: move.clientY }, viewport, activeEdges, currentPointerThresholds().snap),
      nextRailPositions,
    );
    setRect(latest);
    setPreview(preview);
  };
  const finish = (commit: boolean): void => {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('keydown', onKeyDown, true);
    unregisterGesture();
    setPreview(null);
    setRect(null);
    if (!commit) return;
    dispatch(
      preview?.allowed
        ? { name: 'workspace/snap', sectionId, edge: preview.edge }
        : { name: 'workspace/move', sectionId, floatingRect: latest },
    );
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

function edgeCandidate(
  edge: WorkspaceRailEdge,
  activeEdges: ReadonlySet<WorkspaceRailEdge>,
  nextRailPositions: ReadonlyMap<WorkspaceRailEdge, number>,
): WorkspaceWindowPreview {
  return {
    edge,
    allowed: railGeometryFits(viewportSize(), new Set([...activeEdges, edge])),
    position: nextRailPositions.get(edge) ?? 1,
  };
}

function addRailPosition(
  candidate: WorkspaceSnapCandidate | null,
  nextRailPositions: ReadonlyMap<WorkspaceRailEdge, number>,
): WorkspaceWindowPreview | null {
  return candidate ? { ...candidate, position: nextRailPositions.get(candidate.edge) ?? 1 } : null;
}

function movedRect(
  rect: WorkspaceFloatingRect,
  start: { readonly x: number; readonly y: number },
  event: PointerEvent,
  viewport: WorkspaceViewport,
): WorkspaceFloatingRect {
  return clampFloatingRect({ ...rect, left: rect.left + event.clientX - start.x, top: rect.top + event.clientY - start.y }, viewport);
}

function keyboardEdge(event: ReactKeyboardEvent<HTMLElement>): WorkspaceRailEdge | null {
  if (!event.altKey) return null;
  if (event.key === 'ArrowLeft') return 'left';
  if (event.key === 'ArrowRight') return 'right';
  if (event.key === 'ArrowUp') return 'top';
  return event.key === 'ArrowDown' ? 'bottom' : null;
}

function isEditable(target: EventTarget): boolean {
  return target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}
