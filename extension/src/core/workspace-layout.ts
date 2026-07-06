/**
 * Per-site detached-workspace layout (issue #398): which sections are detached, each floating
 * window's position, and its minimized flag, persisted per hostname in extension-owned storage.
 * The layout deliberately contains section ids and geometry only — never image data, URLs, or
 * record content — so a stored layout is privacy-inert.
 */

/**
 * Panel subsections that can detach into a floating extension-owned window (issues #215/#408).
 * Every major section is eligible; keep entries aligned with the section registry in
 * `ui/render.ts` (`SECTIONS`), which is the single place a section is declared detachable.
 */
export const DETACHABLE_SECTION_IDS = ['settings', 'url-editor', 'target', 'fields', 'controls', 'history', 'bookmarks'] as const;
export type DetachableSectionId = (typeof DETACHABLE_SECTION_IDS)[number];

export interface PanelPosition {
  readonly left: number;
  readonly top: number;
}

export interface PanelPositionStore {
  load(hostname: string): Promise<PanelPosition | null>;
  save(hostname: string, position: PanelPosition): Promise<void>;
  remove(hostname: string): Promise<void>;
}

export interface WorkspaceSectionLayout {
  readonly sectionId: DetachableSectionId;
  /** `null` keeps the default stacked placement next to the panel. */
  readonly position: PanelPosition | null;
  readonly minimized: boolean;
}

export interface WorkspaceLayout {
  readonly sections: readonly WorkspaceSectionLayout[];
}

/**
 * A layout as it comes back from storage: section ids stay plain strings so a record saved by a
 * newer build (with section ids this build does not know) still loads instead of being quarantined
 * by validation — `sanitizeWorkspaceLayout` filters the unknown ids, keeping the rest.
 */
export interface StoredWorkspaceSectionLayout {
  readonly sectionId: string;
  readonly position: PanelPosition | null;
  readonly minimized: boolean;
}

export interface StoredWorkspaceLayout {
  readonly sections: readonly StoredWorkspaceSectionLayout[];
}

export interface WorkspaceLayoutStore {
  load(hostname: string): Promise<StoredWorkspaceLayout | null>;
  save(hostname: string, layout: StoredWorkspaceLayout): Promise<void>;
  remove(hostname: string): Promise<void>;
}

export function isDetachableSectionId(value: unknown): value is DetachableSectionId {
  return typeof value === 'string' && (DETACHABLE_SECTION_IDS as readonly string[]).includes(value);
}

/** Drop entries whose section id is unknown (a layout saved by a newer build) and dedupe by id, keeping first occurrence. */
export function sanitizeWorkspaceLayout(layout: StoredWorkspaceLayout): WorkspaceLayout {
  const seen = new Set<DetachableSectionId>();
  const sections: WorkspaceSectionLayout[] = [];
  for (const section of layout.sections) {
    if (!isDetachableSectionId(section.sectionId) || seen.has(section.sectionId)) continue;
    seen.add(section.sectionId);
    sections.push({ sectionId: section.sectionId, position: section.position, minimized: section.minimized });
  }
  return { sections };
}

/** Snapshot the live detach state into a persistable layout; detach order is preserved. */
export function captureWorkspaceLayout(
  detachedSections: readonly DetachableSectionId[],
  positions: ReadonlyMap<DetachableSectionId, PanelPosition>,
  minimized: ReadonlySet<DetachableSectionId>,
): WorkspaceLayout {
  return {
    sections: detachedSections.map((sectionId) => ({
      sectionId,
      position: positions.get(sectionId) ?? null,
      minimized: minimized.has(sectionId),
    })),
  };
}

export function workspaceLayoutsEqual(a: WorkspaceLayout, b: WorkspaceLayout): boolean {
  if (a.sections.length !== b.sections.length) return false;
  return a.sections.every((section, index) => {
    const other = b.sections[index];
    return (
      other !== undefined &&
      section.sectionId === other.sectionId &&
      section.minimized === other.minimized &&
      (section.position === null
        ? other.position === null
        : other.position !== null && section.position.left === other.position.left && section.position.top === other.position.top)
    );
  });
}
