import type { WorkspaceFloatingRect, WorkspaceRailEdge } from '../../core/workspace-layout.js';

export const WORKSPACE_RAIL_GEOMETRY = {
  side: 344,
  block: 240,
  minimumHostWidth: 640,
  minimumHostHeight: 480,
} as const;

const EDGE_PADDING = 12;
const MINIMUM_VISIBLE_HEIGHT = 120;

export interface WorkspaceViewport {
  readonly width: number;
  readonly height: number;
}

export interface WorkspacePanelInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface WorkspaceSnapCandidate {
  readonly edge: WorkspaceRailEdge;
  readonly allowed: boolean;
}

export function workspacePanelInsets(edges: ReadonlySet<WorkspaceRailEdge>): WorkspacePanelInsets {
  const side = WORKSPACE_RAIL_GEOMETRY.side + EDGE_PADDING * 2;
  const block = WORKSPACE_RAIL_GEOMETRY.block + EDGE_PADDING * 2;
  return {
    left: edges.has('left') ? side : EDGE_PADDING,
    right: edges.has('right') ? side : EDGE_PADDING,
    top: edges.has('top') ? block : EDGE_PADDING,
    bottom: edges.has('bottom') ? block : EDGE_PADDING,
  };
}

export function pointerThresholds(coarse: boolean): { readonly detach: number; readonly snap: number } {
  return coarse ? { detach: 16, snap: 56 } : { detach: 8, snap: 40 };
}

export function currentPointerThresholds(): { readonly detach: number; readonly snap: number } {
  return pointerThresholds(window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

export function defaultFloatingRect(input: {
  readonly panelRect: DOMRect;
  readonly width: number;
  readonly stackIndex: number;
  readonly viewport: WorkspaceViewport;
}): WorkspaceFloatingRect {
  const offset = input.stackIndex * 24;
  return clampFloatingRect(
    {
      left: input.panelRect.right + 8 + offset,
      top: input.panelRect.top + offset,
      width: input.width,
      height: 320,
    },
    input.viewport,
  );
}

export function clampFloatingRect(rect: WorkspaceFloatingRect, viewport: WorkspaceViewport): WorkspaceFloatingRect {
  const width = Math.min(Math.max(240, rect.width), Math.max(240, viewport.width - EDGE_PADDING * 2));
  const height = Math.min(
    Math.max(MINIMUM_VISIBLE_HEIGHT, rect.height),
    Math.max(MINIMUM_VISIBLE_HEIGHT, viewport.height - EDGE_PADDING * 2),
  );
  return {
    left: clamp(rect.left, EDGE_PADDING, Math.max(EDGE_PADDING, viewport.width - width - EDGE_PADDING)),
    top: clamp(rect.top, EDGE_PADDING, Math.max(EDGE_PADDING, viewport.height - MINIMUM_VISIBLE_HEIGHT - EDGE_PADDING)),
    width,
    height,
  };
}

export function snapCandidateAtPoint(
  point: { readonly x: number; readonly y: number },
  viewport: WorkspaceViewport,
  activeEdges: ReadonlySet<WorkspaceRailEdge>,
  threshold: number,
): WorkspaceSnapCandidate | null {
  const candidates: Array<{ readonly edge: WorkspaceRailEdge; readonly distance: number }> = [
    { edge: 'left', distance: point.x },
    { edge: 'right', distance: viewport.width - point.x },
    { edge: 'top', distance: point.y },
    { edge: 'bottom', distance: viewport.height - point.y },
  ];
  const candidate = candidates.sort((a, b) => a.distance - b.distance)[0];
  if (!candidate || candidate.distance > threshold) return null;
  return { edge: candidate.edge, allowed: railGeometryFits(viewport, new Set([...activeEdges, candidate.edge])) };
}

export function railGeometryFits(viewport: WorkspaceViewport, edges: ReadonlySet<WorkspaceRailEdge>): boolean {
  const sideCount = Number(edges.has('left')) + Number(edges.has('right'));
  const blockCount = Number(edges.has('top')) + Number(edges.has('bottom'));
  return (
    viewport.width - sideCount * WORKSPACE_RAIL_GEOMETRY.side >= WORKSPACE_RAIL_GEOMETRY.minimumHostWidth &&
    viewport.height - blockCount * WORKSPACE_RAIL_GEOMETRY.block >= WORKSPACE_RAIL_GEOMETRY.minimumHostHeight
  );
}

export function viewportSize(): WorkspaceViewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}
