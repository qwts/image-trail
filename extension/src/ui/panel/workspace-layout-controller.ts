import type { DetachableSectionId, PanelPosition, PanelState, WorkspaceLayoutStore, WorkspaceSectionLayout } from '../../core/types.js';
import type { PlaintextLocalSettings } from '../../content/panel-services.js';
import {
  attachedSection,
  captureWorkspaceLayout,
  floatingSection,
  railedSection,
  sanitizeWorkspaceLayout,
  workspaceLayoutsEqual,
  type WorkspaceLayout,
  type WorkspaceLayoutScope,
  type WorkspaceFloatingRect,
  type WorkspaceRailEdge,
} from '../../core/workspace-layout.js';
import { hostnameFromLocation } from '../panel-position.js';
import { railGeometryFits, viewportSize } from '../workspace/workspace-geometry.js';

const WORKSPACE_LAYOUT_SAVE_DEBOUNCE_MS = 400;

export interface WorkspaceLayoutControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  workspaceLayoutStore(): WorkspaceLayoutStore | null;
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  // The live session geometry owned by the render controller; restore hydrates these, capture reads them.
  workspaceSections(): Map<DetachableSectionId, WorkspaceSectionLayout>;
  panelPosition(): PanelPosition | null;
  restorePanelPosition(position: PanelPosition | null): void;
}

/**
 * Per-site detached-workspace persistence (issue #398), mirroring `PanelPositionController`'s
 * restore discipline: single-flight and attempt-guarded so a teardown or reset aborts a stale
 * restore. Restore only runs when the opt-in setting is on, and is queued after local settings
 * load (the flag lives there), not on styles-ready. Saves are debounced and skipped when the
 * captured layout equals the last persisted one; restored positions are clamped at render time by
 * `detachedWindowGeometry`, so a layout saved on a larger viewport still opens fully visible.
 */
export class WorkspaceLayoutController {
  private restorePromise: Promise<void> | null = null;
  private restoreAttempt = 0;
  private restored = false;
  private lastPersistedLayout: WorkspaceLayout | null = null;
  private saveTimer: number | null = null;
  private storeMutation: Promise<void> = Promise.resolve();

  constructor(private readonly deps: WorkspaceLayoutControllerDeps) {}

  /** Called after local settings land in state; no-ops unless the opt-in flag is enabled. */
  queueWorkspaceRestore(): void {
    if (this.restored || this.restorePromise || !this.deps.getState().restoreWorkspaceLayoutEnabled) return;
    const attempt = (this.restoreAttempt += 1);
    this.restorePromise = this.restoreWorkspaceLayout(attempt);
  }

  invalidateRestore(): void {
    this.restoreAttempt += 1;
    this.restored = false;
    this.restorePromise = null;
    this.cancelPendingSave();
  }

  /** Structural or geometry change to the detached workspace; persists (debounced) when enabled. */
  handleWorkspaceLayoutChanged(): void {
    if (!this.deps.getState().restoreWorkspaceLayoutEnabled) return;
    this.cancelPendingSave();
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.persistWorkspaceLayout();
    }, WORKSPACE_LAYOUT_SAVE_DEBOUNCE_MS);
  }

  updateWorkspaceLayoutRestore(enabled: boolean): void {
    if (this.deps.getState().restoreWorkspaceLayoutEnabled === enabled) return;
    this.deps.setState({ ...this.deps.getState(), restoreWorkspaceLayoutEnabled: enabled, lastUpdatedAt: Date.now() });
    this.deps.saveLocalSettings({ ...this.deps.getLocalSettings(), restoreWorkspaceLayout: enabled });
    // Opting in captures the arrangement the user is looking at, so it survives the very next reload.
    if (enabled) void this.persistWorkspaceLayout();
    this.deps.render();
  }

  prepareDetachedSection(sectionId: DetachableSectionId, floatingRect?: WorkspaceFloatingRect): void {
    const current = this.deps.workspaceSections().get(sectionId);
    if (current?.mode === 'floating' && floatingRect === undefined) return;
    this.deps.workspaceSections().set(
      sectionId,
      floatingSection(sectionId, floatingRect ?? current?.floatingRect ?? null, {
        shaded: current?.shaded ?? false,
        collapsed: current?.collapsed ?? false,
      }),
    );
  }

  restoreSection(sectionId: DetachableSectionId): void {
    const current = this.deps.workspaceSections().get(sectionId);
    this.deps.workspaceSections().set(sectionId, attachedSection(sectionId, current?.collapsed ?? false));
  }

  moveSection(sectionId: DetachableSectionId, floatingRect: WorkspaceFloatingRect): void {
    const current = this.deps.workspaceSections().get(sectionId);
    this.deps.workspaceSections().set(
      sectionId,
      floatingSection(sectionId, floatingRect, {
        shaded: current?.shaded ?? false,
        collapsed: current?.collapsed ?? false,
      }),
    );
    this.finishPlacementChange();
  }

  snapSection(sectionId: DetachableSectionId, edge: WorkspaceRailEdge): void {
    const placements = this.deps.workspaceSections();
    const current = placements.get(sectionId);
    const otherRails = [...placements.values()].filter((section) => section.sectionId !== sectionId && section.mode === 'railed');
    const activeEdges = new Set(
      otherRails.map((section) => section.edge).filter((candidate): candidate is WorkspaceRailEdge => candidate !== null),
    );
    if (!railGeometryFits(viewportSize(), new Set([...activeEdges, edge]))) return;
    const order = otherRails.filter((section) => section.edge === edge).length;
    placements.set(
      sectionId,
      railedSection(sectionId, edge, order, {
        shaded: current?.shaded ?? false,
        collapsed: current?.collapsed ?? false,
        floatingRect: current?.floatingRect ?? null,
      }),
    );
    this.finishPlacementChange();
  }

  toggleSectionShade(sectionId: DetachableSectionId): void {
    const current = this.deps.workspaceSections().get(sectionId);
    if (!current || current.mode === 'attached') return;
    this.deps.workspaceSections().set(sectionId, { ...current, shaded: !current.shaded });
    this.finishPlacementChange();
  }

  reorderSection(sectionId: DetachableSectionId, edge: WorkspaceRailEdge, order: number): void {
    const placements = this.deps.workspaceSections();
    const current = placements.get(sectionId);
    if (!current || current.mode !== 'railed') return;
    const siblings = [...placements.values()]
      .filter((section) => section.mode === 'railed' && section.edge === edge && section.sectionId !== sectionId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    siblings.splice(Math.max(0, Math.min(order, siblings.length)), 0, { ...current, edge });
    siblings.forEach((section, index) => placements.set(section.sectionId, { ...section, order: index }));
    this.finishPlacementChange();
  }

  async resetWorkspaceLayout(): Promise<void> {
    const scope = currentScope();
    if (!scope) return;
    this.restoreAttempt += 1;
    this.restorePromise = null;
    this.restored = true;
    this.cancelPendingSave();
    const store = this.deps.workspaceLayoutStore();
    if (store && !(await this.queueStoreMutation(() => store.remove(scope)))) {
      this.reportStorageFailure('The saved workspace layout could not be reset.');
      return;
    }
    this.lastPersistedLayout = null;
    this.deps.workspaceSections().clear();
    this.deps.setState({
      ...this.deps.getState(),
      detachedSections: [],
      historySectionOpen: true,
      bookmarksSectionOpen: true,
      message: 'Workspace layout reset for this site.',
      status: 'ready',
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
  }

  private async restoreWorkspaceLayout(attempt: number): Promise<void> {
    const store = this.deps.workspaceLayoutStore();
    if (!store || this.restored) return;
    try {
      const scope = currentScope();
      if (!scope) return;
      const saved = await store.load(scope);
      if (!saved || this.restoreAttempt !== attempt || this.restored) return;
      const layout = sanitizeWorkspaceLayout(saved);
      const placements = this.deps.workspaceSections();
      placements.clear();
      for (const section of layout.sections) {
        placements.set(section.sectionId, section);
      }
      this.deps.restorePanelPosition(layout.panelPosition);
      this.lastPersistedLayout = layout;
      const currentState = this.deps.getState();
      this.deps.setState({
        ...currentState,
        detachedSections: layout.sections.filter((section) => section.mode !== 'attached').map((section) => section.sectionId),
        historySectionOpen: restoredSectionOpen(layout, 'history', currentState.historySectionOpen),
        bookmarksSectionOpen: restoredSectionOpen(layout, 'bookmarks', currentState.bookmarksSectionOpen),
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
    } catch {
      if (this.restoreAttempt === attempt && !this.restored) {
        this.reportStorageFailure('The saved workspace layout could not be restored. Using the current layout.');
      }
    } finally {
      if (this.restoreAttempt === attempt) this.restored = true;
    }
  }

  private async persistWorkspaceLayout(): Promise<void> {
    const store = this.deps.workspaceLayoutStore();
    if (!store || !this.deps.getState().restoreWorkspaceLayoutEnabled) return;
    const scope = currentScope();
    if (!scope) return;
    const layout = captureWorkspaceLayout({
      detachedSections: this.deps.getState().detachedSections,
      placements: this.deps.workspaceSections(),
      panelPosition: this.deps.panelPosition(),
      collapsed: collapsedSections(this.deps.getState()),
    });
    if (this.lastPersistedLayout && workspaceLayoutsEqual(this.lastPersistedLayout, layout)) return;
    const saved = await this.queueStoreMutation(() => store.save(scope, layout));
    if (saved) {
      this.lastPersistedLayout = layout;
    } else {
      this.reportStorageFailure('The workspace layout could not be saved.');
    }
  }

  private async queueStoreMutation(operation: () => Promise<void>): Promise<boolean> {
    const result = this.storeMutation.then(operation).then(
      () => true,
      () => false,
    );
    this.storeMutation = result.then(() => undefined);
    return result;
  }

  private reportStorageFailure(message: string): void {
    const state = this.deps.getState();
    if (!state.visible) return;
    this.deps.setState({ ...state, status: 'error', message, lastUpdatedAt: Date.now() });
    this.deps.render();
  }

  private cancelPendingSave(): void {
    if (this.saveTimer === null) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private finishPlacementChange(): void {
    this.deps.render();
    this.handleWorkspaceLayoutChanged();
  }
}

export function createWorkspaceActionDeps(controller: WorkspaceLayoutController) {
  return {
    updateWorkspaceLayoutRestore: (enabled: boolean) => controller.updateWorkspaceLayoutRestore(enabled),
    resetWorkspaceLayout: () => controller.resetWorkspaceLayout(),
    notifyWorkspaceLayoutChanged: () => controller.handleWorkspaceLayoutChanged(),
    prepareDetachedWorkspaceSection: (...args: Parameters<WorkspaceLayoutController['prepareDetachedSection']>) =>
      controller.prepareDetachedSection(...args),
    restoreWorkspaceSection: (...args: Parameters<WorkspaceLayoutController['restoreSection']>) => controller.restoreSection(...args),
    moveWorkspaceSection: (...args: Parameters<WorkspaceLayoutController['moveSection']>) => controller.moveSection(...args),
    snapWorkspaceSection: (...args: Parameters<WorkspaceLayoutController['snapSection']>) => controller.snapSection(...args),
    shadeWorkspaceSection: (...args: Parameters<WorkspaceLayoutController['toggleSectionShade']>) => controller.toggleSectionShade(...args),
    reorderWorkspaceSection: (...args: Parameters<WorkspaceLayoutController['reorderSection']>) => controller.reorderSection(...args),
  };
}

function currentScope(): WorkspaceLayoutScope | null {
  const hostname = hostnameFromLocation();
  return hostname ? { hostname, pageUrl: window.location.href } : null;
}

function collapsedSections(state: PanelState): ReadonlySet<DetachableSectionId> {
  const collapsed = new Set<DetachableSectionId>();
  if (!state.historySectionOpen) collapsed.add('history');
  if (!state.bookmarksSectionOpen) collapsed.add('bookmarks');
  return collapsed;
}

function restoredSectionOpen(layout: WorkspaceLayout, sectionId: DetachableSectionId, fallback: boolean): boolean {
  const section = layout.sections.find((candidate) => candidate.sectionId === sectionId);
  return section ? !section.collapsed : fallback;
}
