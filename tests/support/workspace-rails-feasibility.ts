export const HANDOFF_RAIL_GEOMETRY = {
  side: 344,
  block: 240,
  minimumHostWidth: 640,
  minimumHostHeight: 480,
} as const;

export type RailEdge = 'left' | 'right' | 'top' | 'bottom';
export type HostRisk =
  | 'viewport-media-query'
  | 'fixed-or-sticky'
  | 'infinite-feed'
  | 'nested-scroll'
  | 'iframe'
  | 'transformed-root'
  | 'fullscreen'
  | 'rtl-physical-edge'
  | 'spa-root-replacement'
  | 'shadow-root';

export interface RailSpace {
  readonly remainingWidth: number;
  readonly remainingHeight: number;
  readonly geometryFits: boolean;
}

export interface RailModeDecision {
  readonly mode: 'overlay' | 'adapter-reflow';
  readonly reasons: readonly string[];
}

export const REFLOW_STRATEGY_EVIDENCE = [
  {
    strategy: 'overlay',
    result: 'default',
    evidence: 'Does not mutate host layout; removable extension surfaces preserve host geometry, scroll, and focus.',
  },
  {
    strategy: 'root-inset-or-margin',
    result: 'reject-general',
    evidence: 'Shrinks normal flow without changing viewport media queries and leaves fixed/sticky chrome in the reserved edge.',
  },
  {
    strategy: 'wrapper-insertion',
    result: 'reject',
    evidence: 'Changes direct-child selectors, framework root ancestry, observer records, and fixed-position containing blocks.',
  },
  {
    strategy: 'css-transform',
    result: 'reject',
    evidence: 'Changes paint geometry while layout metrics, media queries, scroll bounds, and fixed/sticky behavior remain unchanged.',
  },
  {
    strategy: 'site-adapter',
    result: 'conditional',
    evidence: 'Can reflow an explicitly known container and its chrome, but only after adapter-specific tests and exact rollback proof.',
  },
] as const;

export function measureRailSpace(viewport: { readonly width: number; readonly height: number }, edges: readonly RailEdge[]): RailSpace {
  const unique = new Set(edges);
  const sideCount = Number(unique.has('left')) + Number(unique.has('right'));
  const blockCount = Number(unique.has('top')) + Number(unique.has('bottom'));
  const remainingWidth = viewport.width - sideCount * HANDOFF_RAIL_GEOMETRY.side;
  const remainingHeight = viewport.height - blockCount * HANDOFF_RAIL_GEOMETRY.block;
  return {
    remainingWidth,
    remainingHeight,
    geometryFits: remainingWidth >= HANDOFF_RAIL_GEOMETRY.minimumHostWidth && remainingHeight >= HANDOFF_RAIL_GEOMETRY.minimumHostHeight,
  };
}

export function interactionThresholds(pointer: 'fine' | 'coarse' | 'keyboard'): {
  readonly detach: number | null;
  readonly snap: number | null;
} {
  if (pointer === 'keyboard') return { detach: null, snap: null };
  return pointer === 'coarse' ? { detach: 16, snap: 56 } : { detach: 8, snap: 40 };
}

export function recommendRailMode(input: {
  readonly viewport: { readonly width: number; readonly height: number };
  readonly edges: readonly RailEdge[];
  readonly risks: readonly HostRisk[];
  readonly adapterApproved: boolean;
}): RailModeDecision {
  const space = measureRailSpace(input.viewport, input.edges);
  if (!space.geometryFits) return { mode: 'overlay', reasons: ['insufficient-host-viewport'] };
  if (!input.adapterApproved) return { mode: 'overlay', reasons: ['no-explicit-site-adapter'] };
  if (input.risks.length > 0) return { mode: 'overlay', reasons: input.risks.map((risk) => `host-risk:${risk}`) };
  return { mode: 'adapter-reflow', reasons: ['adapter-and-geometry-approved'] };
}
