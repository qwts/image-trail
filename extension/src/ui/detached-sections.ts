import type { PanelState, WorkspaceSectionLayout } from '../core/types.js';
import { floatingSection } from '../core/workspace-layout.js';
import { renderReactWorkspace, type WorkspaceRenderEntry } from './react/workspace-renderer.js';
import { sectionVisible, sectionWindowInlineSize, type DetachableSectionDefinition } from './section-registry.js';
import { clampFloatingRect, defaultFloatingRect, railGeometryFits, viewportSize } from './workspace/workspace-geometry.js';
import type { PanelRenderTarget } from './render.js';

interface ScrollSnapshot {
  readonly lists: ReadonlyMap<string, number>;
  readonly bodies: ReadonlyMap<string, number>;
}

/** React owns workspace chrome; existing section views are adopted as DOM bodies. */
export function renderDetachedSections(
  target: PanelRenderTarget,
  state: PanelState,
  definitions: readonly DetachableSectionDefinition[],
): void {
  const root = target.detachedRoot;
  if (!root) return;
  const previousIds = detachedIds(root);
  const scroll = captureScroll(root);
  const entries = state.minimized ? [] : workspaceEntries(target, state, definitions);
  target.onWorkspaceEdgesChanged?.(activeRailEdges(entries), true);
  renderReactWorkspace(root, entries, target.dispatch, previousIds);
  restoreScroll(root, scroll);
}

function activeRailEdges(entries: readonly WorkspaceRenderEntry[]): ReadonlySet<NonNullable<WorkspaceSectionLayout['edge']>> {
  return new Set(
    entries.map((entry) => entry.placement.edge).filter((edge): edge is NonNullable<WorkspaceSectionLayout['edge']> => edge !== null),
  );
}

function workspaceEntries(
  target: PanelRenderTarget,
  state: PanelState,
  definitions: readonly DetachableSectionDefinition[],
): WorkspaceRenderEntry[] {
  const activeEdges = new Set<NonNullable<WorkspaceSectionLayout['edge']>>();
  let normalized = false;
  const entries = state.detachedSections
    .map((sectionId, index) => {
      const definition = definitions.find((candidate) => candidate.id === sectionId);
      if (!definition || !sectionVisible(definition, state)) return null;
      const placement = renderPlacement(target, definition, index, activeEdges);
      if (placement !== target.layoutState.workspaceSections.get(sectionId)) {
        target.layoutState.workspaceSections.set(sectionId, placement);
        normalized = true;
      }
      return { placement, title: definition.title, body: definition.create(target, state) };
    })
    .filter((entry): entry is WorkspaceRenderEntry => entry !== null);
  if (normalized) target.onWorkspaceLayoutChanged?.();
  return entries;
}

function renderPlacement(
  target: PanelRenderTarget,
  definition: DetachableSectionDefinition,
  stackIndex: number,
  activeEdges: Set<NonNullable<WorkspaceSectionLayout['edge']>>,
): WorkspaceSectionLayout {
  const stored = target.layoutState.workspaceSections.get(definition.id) ?? floatingSection(definition.id, null);
  const viewport = viewportSize();
  if (stored.mode === 'railed' && stored.edge) {
    const candidateEdges = new Set([...activeEdges, stored.edge]);
    if (activeEdges.has(stored.edge) || railGeometryFits(viewport, candidateEdges)) {
      activeEdges.add(stored.edge);
      return stored;
    }
  }
  const floatingRect = stored.floatingRect
    ? clampFloatingRect(stored.floatingRect, viewport)
    : defaultFloatingRect({
        panelRect: target.root.getBoundingClientRect(),
        width: sectionWindowInlineSize(definition),
        stackIndex,
        viewport,
      });
  if (stored.mode === 'floating' && stored.floatingRect && rectsEqual(stored.floatingRect, floatingRect)) return stored;
  return floatingSection(definition.id, floatingRect, { shaded: stored.shaded, collapsed: stored.collapsed });
}

function rectsEqual(
  a: NonNullable<WorkspaceSectionLayout['floatingRect']>,
  b: NonNullable<WorkspaceSectionLayout['floatingRect']>,
): boolean {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

function detachedIds(root: HTMLElement): ReadonlySet<string> {
  return new Set(
    Array.from(root.querySelectorAll<HTMLElement>('[data-image-trail-detached-window]'))
      .map((element) => element.dataset['imageTrailDetachedWindow'])
      .filter((id): id is string => id !== undefined),
  );
}

function captureScroll(root: HTMLElement): ScrollSnapshot {
  const lists = new Map<string, number>();
  const bodies = new Map<string, number>();
  for (const windowElement of Array.from(root.querySelectorAll<HTMLElement>('[data-image-trail-detached-window]'))) {
    const id = windowElement.dataset['imageTrailDetachedWindow'];
    if (!id) continue;
    const list = windowElement.querySelector<HTMLElement>('.image-trail-panel__record-list');
    const body = windowElement.querySelector<HTMLElement>('.image-trail-workspace__dom-body');
    if (list) lists.set(id, list.scrollTop);
    if (body) bodies.set(id, body.scrollTop);
  }
  return { lists, bodies };
}

function restoreScroll(root: HTMLElement, snapshot: ScrollSnapshot): void {
  for (const windowElement of Array.from(root.querySelectorAll<HTMLElement>('[data-image-trail-detached-window]'))) {
    const id = windowElement.dataset['imageTrailDetachedWindow'];
    if (!id) continue;
    restoreElementScroll(windowElement.querySelector('.image-trail-panel__record-list'), snapshot.lists.get(id));
    restoreElementScroll(windowElement.querySelector('.image-trail-workspace__dom-body'), snapshot.bodies.get(id));
  }
}

function restoreElementScroll(element: Element | null, scrollTop: number | undefined): void {
  if (!(element instanceof HTMLElement) || scrollTop === undefined) return;
  element.scrollTop = scrollTop;
  queueMicrotask(() => {
    element.scrollTop = scrollTop;
  });
}
