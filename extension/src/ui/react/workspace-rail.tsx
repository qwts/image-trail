import type { PointerEvent as ReactPointerEvent } from 'react';

import type { PanelAction } from '../../core/types.js';
import type { WorkspaceFloatingRect, WorkspaceRailEdge, WorkspaceSectionLayout } from '../../core/workspace-layout.js';
import { clampFloatingRect, currentPointerThresholds, viewportSize } from '../workspace/workspace-geometry.js';
import { registerWorkspaceGesture } from '../workspace/workspace-gesture.js';
import { WorkspaceDomBody } from './workspace-dom-body.js';

export interface WorkspaceRailEntry {
  readonly placement: WorkspaceSectionLayout & { readonly mode: 'railed'; readonly edge: WorkspaceRailEdge };
  readonly title: string;
  readonly body: HTMLElement;
}

export function WorkspaceRail({
  edge,
  entries,
  dispatch,
}: {
  readonly edge: WorkspaceRailEdge;
  readonly entries: readonly WorkspaceRailEntry[];
  readonly dispatch: (action: PanelAction) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <aside className="image-trail-panel-root image-trail-workspace__rail" data-edge={edge} aria-label={`${edge} workspace rail`}>
      <div className="image-trail-workspace__rail-stack">
        <div className="image-trail-workspace__rail-label" aria-hidden="true">
          ⧉ {edge} dock
        </div>
        {entries.map((entry, index) => (
          <section
            key={entry.placement.sectionId}
            className={`image-trail-workspace__rail-card${entry.placement.shaded ? ' is-shaded' : ''}`}
            data-image-trail-detached-window={entry.placement.sectionId}
            data-workspace-mode="railed"
          >
            <header
              className="image-trail-workspace__window-header"
              tabIndex={0}
              aria-label={`Move ${entry.title} from ${edge} rail; drag past the detach threshold to float`}
              onPointerDown={(event) => startRailDrag(event, entry.placement, index, dispatch)}
            >
              <div className="image-trail-workspace__window-title">
                <span className="image-trail-workspace__drag-grip" aria-hidden="true">
                  ⠿
                </span>
                <h3>{entry.title}</h3>
                <span className="image-trail-workspace__docked-label">· docked {edge}</span>
              </div>
              <WorkspaceRailActions entry={entry} edge={edge} index={index} count={entries.length} dispatch={dispatch} />
            </header>
            {entry.placement.shaded ? null : <WorkspaceDomBody content={entry.body} />}
          </section>
        ))}
      </div>
    </aside>
  );
}

function WorkspaceRailActions({
  entry,
  edge,
  index,
  count,
  dispatch,
}: {
  readonly entry: WorkspaceRailEntry;
  readonly edge: WorkspaceRailEdge;
  readonly index: number;
  readonly count: number;
  readonly dispatch: (action: PanelAction) => void;
}) {
  const sectionId = entry.placement.sectionId;
  return (
    <div className="image-trail-workspace__window-actions">
      <button
        type="button"
        disabled={index === 0}
        aria-label={`Move ${entry.title} earlier in ${edge} rail`}
        onClick={() => dispatch({ name: 'workspace/reorder', sectionId, edge, order: index - 1 })}
      >
        ‹
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        aria-label={`Move ${entry.title} later in ${edge} rail`}
        onClick={() => dispatch({ name: 'workspace/reorder', sectionId, edge, order: index + 1 })}
      >
        ›
      </button>
      <button
        type="button"
        data-image-trail-unsnap={sectionId}
        aria-label={`Unsnap ${entry.title} from ${edge} rail`}
        title="Float window"
        onClick={() => dispatch(unsnapAction(entry.placement, index))}
      >
        ⧉
      </button>
      <button
        type="button"
        data-image-trail-shade={sectionId}
        aria-label={`${entry.placement.shaded ? 'Unshade' : 'Shade'} ${entry.title}`}
        onClick={() => dispatch({ name: 'workspace/shade', sectionId })}
      >
        {entry.placement.shaded ? '+' : '−'}
      </button>
      <button
        type="button"
        data-image-trail-restore={sectionId}
        aria-label={`Restore ${entry.title} into the panel`}
        onClick={() => dispatch({ name: 'section/restore', sectionId })}
      >
        ✕
      </button>
    </div>
  );
}

function unsnapAction(placement: WorkspaceRailEntry['placement'], index: number): PanelAction {
  return { name: 'workspace/unsnap', sectionId: placement.sectionId, floatingRect: railFloatingRect(placement, index) };
}

function railFloatingRect(placement: WorkspaceRailEntry['placement'], index: number): WorkspaceFloatingRect {
  const viewport = viewportSize();
  const fallback: WorkspaceFloatingRect = {
    left: Math.max(12, (viewport.width - 340) / 2 + index * 20),
    top: Math.max(12, (viewport.height - 320) / 2 + index * 20),
    width: 340,
    height: 320,
  };
  return clampFloatingRect(placement.floatingRect ?? fallback, viewport);
}

function startRailDrag(
  event: ReactPointerEvent<HTMLElement>,
  placement: WorkspaceRailEntry['placement'],
  index: number,
  dispatch: (action: PanelAction) => void,
): void {
  if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
  event.preventDefault();
  const card = event.currentTarget.closest<HTMLElement>('[data-workspace-mode="railed"]');
  const start = { x: event.clientX, y: event.clientY };
  let latest = start;
  let exceeded = false;
  let unregisterGesture = (): void => {};
  const update = (pointer: PointerEvent): void => {
    latest = { x: pointer.clientX, y: pointer.clientY };
    exceeded = Math.hypot(latest.x - start.x, latest.y - start.y) >= currentPointerThresholds().detach;
    card?.classList.toggle('is-dragging-out', exceeded);
  };
  const finish = (commit: boolean): void => {
    window.removeEventListener('pointermove', update, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('keydown', onKeyDown, true);
    unregisterGesture();
    card?.classList.remove('is-dragging-out');
    if (!commit || !exceeded) return;
    const rect = railFloatingRect(placement, index);
    dispatch({
      name: 'workspace/unsnap',
      sectionId: placement.sectionId,
      floatingRect: clampFloatingRect({ ...rect, left: latest.x - 24, top: latest.y - 12 }, viewportSize()),
    });
  };
  const onUp = (pointer: PointerEvent): void => {
    update(pointer);
    finish(true);
  };
  const onCancel = (): void => finish(false);
  const onKeyDown = (keyboard: KeyboardEvent): void => {
    if (keyboard.key !== 'Escape') return;
    keyboard.preventDefault();
    keyboard.stopPropagation();
    finish(false);
  };
  unregisterGesture = registerWorkspaceGesture(() => finish(false));
  window.addEventListener('pointermove', update, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('keydown', onKeyDown, true);
}
