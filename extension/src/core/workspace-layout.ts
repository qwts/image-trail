/** Versioned extension-owned workspace geometry for detachable sections. */

export const WORKSPACE_LAYOUT_SCHEMA_VERSION = 2 as const;
export const WORKSPACE_LAYOUT_KEY_VERSION = 1 as const;

export const DETACHABLE_SECTION_IDS = ['settings', 'help', 'url-editor', 'target', 'fields', 'controls', 'history', 'bookmarks'] as const;
export type DetachableSectionId = (typeof DETACHABLE_SECTION_IDS)[number];
export const WORKSPACE_RAIL_EDGES = ['left', 'right', 'top', 'bottom'] as const;
export type WorkspaceRailEdge = (typeof WORKSPACE_RAIL_EDGES)[number];
export type WorkspaceSectionMode = 'attached' | 'floating' | 'railed';

export interface PanelPosition {
  readonly left: number;
  readonly top: number;
}

export interface WorkspaceFloatingRect extends PanelPosition {
  readonly width: number;
  readonly height: number;
}

export interface PanelPositionStore {
  load(hostname: string): Promise<PanelPosition | null>;
  save(hostname: string, position: PanelPosition): Promise<void>;
  remove(hostname: string): Promise<void>;
}

export interface StoredWorkspaceSectionLayout {
  readonly sectionId: string;
  readonly mode: WorkspaceSectionMode;
  readonly edge: WorkspaceRailEdge | null;
  readonly order: number | null;
  readonly shaded: boolean;
  readonly collapsed: boolean;
  readonly floatingRect: WorkspaceFloatingRect | null;
}

export interface WorkspaceSectionLayout extends StoredWorkspaceSectionLayout {
  readonly sectionId: DetachableSectionId;
}

export interface StoredWorkspaceLayout {
  readonly schemaVersion: typeof WORKSPACE_LAYOUT_SCHEMA_VERSION;
  readonly persistenceKeyVersion: typeof WORKSPACE_LAYOUT_KEY_VERSION;
  readonly panelPosition: PanelPosition | null;
  readonly sections: readonly StoredWorkspaceSectionLayout[];
}

export interface WorkspaceLayout extends StoredWorkspaceLayout {
  readonly sections: readonly WorkspaceSectionLayout[];
}

export interface LegacyStoredWorkspaceSectionLayout {
  readonly sectionId: string;
  readonly position: PanelPosition | null;
  readonly minimized: boolean;
}

export interface LegacyStoredWorkspaceLayout {
  readonly sections: readonly LegacyStoredWorkspaceSectionLayout[];
}

export interface WorkspaceLayoutScope {
  readonly hostname: string;
  readonly pageUrl: string;
}

export interface WorkspaceLayoutStore {
  load(scope: WorkspaceLayoutScope): Promise<StoredWorkspaceLayout | null>;
  save(scope: WorkspaceLayoutScope, layout: StoredWorkspaceLayout): Promise<void>;
  remove(scope: WorkspaceLayoutScope): Promise<void>;
}

export function isDetachableSectionId(value: unknown): value is DetachableSectionId {
  return typeof value === 'string' && (DETACHABLE_SECTION_IDS as readonly string[]).includes(value);
}

export function isWorkspaceRailEdge(value: unknown): value is WorkspaceRailEdge {
  return typeof value === 'string' && (WORKSPACE_RAIL_EDGES as readonly string[]).includes(value);
}

export function sanitizeWorkspaceLayout(layout: StoredWorkspaceLayout): WorkspaceLayout {
  const seen = new Set<DetachableSectionId>();
  const sections: WorkspaceSectionLayout[] = [];
  for (const section of layout.sections) {
    if (!isDetachableSectionId(section.sectionId) || seen.has(section.sectionId)) continue;
    seen.add(section.sectionId);
    sections.push(sanitizeSection(section, section.sectionId));
  }
  normalizeRailOrders(sections);
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    persistenceKeyVersion: WORKSPACE_LAYOUT_KEY_VERSION,
    panelPosition: finitePosition(layout.panelPosition),
    sections,
  };
}

function normalizeRailOrders(sections: WorkspaceSectionLayout[]): void {
  for (const edge of WORKSPACE_RAIL_EDGES) {
    const ordered = sections
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section.mode === 'railed' && section.edge === edge)
      .sort((a, b) => (a.section.order ?? 0) - (b.section.order ?? 0) || a.index - b.index);
    ordered.forEach(({ section }, order) => {
      sections[sections.indexOf(section)] = { ...section, order };
    });
  }
}

export function migrateLegacyWorkspaceLayout(layout: LegacyStoredWorkspaceLayout): StoredWorkspaceLayout {
  const sections = layout.sections.map((section): StoredWorkspaceSectionLayout => ({
    sectionId: section.sectionId,
    mode: 'floating',
    edge: null,
    order: null,
    shaded: section.minimized,
    collapsed: false,
    floatingRect: section.position ? legacyFloatingRect(section.sectionId, section.position) : null,
  }));
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    persistenceKeyVersion: WORKSPACE_LAYOUT_KEY_VERSION,
    panelPosition: null,
    sections,
  };
}

export function captureWorkspaceLayout(input: {
  readonly detachedSections: readonly DetachableSectionId[];
  readonly placements: ReadonlyMap<DetachableSectionId, WorkspaceSectionLayout>;
  readonly panelPosition: PanelPosition | null;
  readonly collapsed: ReadonlySet<DetachableSectionId>;
}): WorkspaceLayout {
  const detached = new Set(input.detachedSections);
  return {
    schemaVersion: WORKSPACE_LAYOUT_SCHEMA_VERSION,
    persistenceKeyVersion: WORKSPACE_LAYOUT_KEY_VERSION,
    panelPosition: finitePosition(input.panelPosition),
    sections: DETACHABLE_SECTION_IDS.map((sectionId) => {
      const placement = input.placements.get(sectionId);
      if (detached.has(sectionId) && placement) return { ...placement, collapsed: input.collapsed.has(sectionId) };
      return attachedSection(sectionId, input.collapsed.has(sectionId));
    }),
  };
}

export function workspaceLayoutsEqual(a: WorkspaceLayout, b: WorkspaceLayout): boolean {
  if (!positionsEqual(a.panelPosition, b.panelPosition) || a.sections.length !== b.sections.length) return false;
  return a.sections.every((section, index) => sectionsEqual(section, b.sections[index]));
}

export function floatingSection(
  sectionId: DetachableSectionId,
  floatingRect: WorkspaceFloatingRect | null,
  options: { readonly shaded?: boolean; readonly collapsed?: boolean } = {},
): WorkspaceSectionLayout {
  return {
    sectionId,
    mode: 'floating',
    edge: null,
    order: null,
    shaded: options.shaded ?? false,
    collapsed: options.collapsed ?? false,
    floatingRect,
  };
}

export function railedSection(
  sectionId: DetachableSectionId,
  edge: WorkspaceRailEdge,
  order: number,
  options: { readonly shaded?: boolean; readonly collapsed?: boolean; readonly floatingRect?: WorkspaceFloatingRect | null } = {},
): WorkspaceSectionLayout {
  return {
    sectionId,
    mode: 'railed',
    edge,
    order: Math.max(0, Math.trunc(order)),
    shaded: options.shaded ?? false,
    collapsed: options.collapsed ?? false,
    floatingRect: options.floatingRect ?? null,
  };
}

function sanitizeSection(section: StoredWorkspaceSectionLayout, sectionId: DetachableSectionId): WorkspaceSectionLayout {
  const floatingRect = finiteRect(section.floatingRect);
  if (section.mode === 'railed' && isWorkspaceRailEdge(section.edge)) {
    return railedSection(sectionId, section.edge, finiteOrder(section.order), {
      shaded: section.shaded,
      collapsed: section.collapsed,
      floatingRect,
    });
  }
  if (section.mode === 'floating') {
    return floatingSection(sectionId, floatingRect, { shaded: section.shaded, collapsed: section.collapsed });
  }
  return attachedSection(sectionId, section.collapsed);
}

export function attachedSection(sectionId: DetachableSectionId, collapsed = false): WorkspaceSectionLayout {
  return { sectionId, mode: 'attached', edge: null, order: null, shaded: false, collapsed, floatingRect: null };
}

function finiteOrder(order: number | null): number {
  return order !== null && Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : 0;
}

function finitePosition(position: PanelPosition | null): PanelPosition | null {
  return position && Number.isFinite(position.left) && Number.isFinite(position.top) ? position : null;
}

function finiteRect(rect: WorkspaceFloatingRect | null): WorkspaceFloatingRect | null {
  return rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
    ? rect
    : null;
}

function legacyFloatingRect(sectionId: string, position: PanelPosition): WorkspaceFloatingRect {
  const width = sectionId === 'settings' || sectionId === 'help' ? 420 : sectionId === 'fields' ? 380 : 340;
  return { ...position, width, height: 160 };
}

function positionsEqual(a: PanelPosition | null, b: PanelPosition | null): boolean {
  return a === null ? b === null : b !== null && a.left === b.left && a.top === b.top;
}

function sectionsEqual(a: WorkspaceSectionLayout, b: WorkspaceSectionLayout | undefined): boolean {
  return (
    b !== undefined &&
    a.sectionId === b.sectionId &&
    a.mode === b.mode &&
    a.edge === b.edge &&
    a.order === b.order &&
    a.shaded === b.shaded &&
    a.collapsed === b.collapsed &&
    rectsEqual(a.floatingRect, b.floatingRect)
  );
}

function rectsEqual(a: WorkspaceFloatingRect | null, b: WorkspaceFloatingRect | null): boolean {
  return a === null ? b === null : b !== null && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
