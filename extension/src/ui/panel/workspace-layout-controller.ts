import type { DetachableSectionId, PanelPosition, PanelState, WorkspaceLayoutStore } from '../../core/types.js';
import type { PlaintextLocalSettings } from '../../content/panel-services.js';
import {
  captureWorkspaceLayout,
  sanitizeWorkspaceLayout,
  workspaceLayoutsEqual,
  type WorkspaceLayout,
} from '../../core/workspace-layout.js';
import { hostnameFromLocation } from '../panel-position.js';

const WORKSPACE_LAYOUT_SAVE_DEBOUNCE_MS = 400;

export interface WorkspaceLayoutControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  workspaceLayoutStore(): WorkspaceLayoutStore | null;
  getLocalSettings(): PlaintextLocalSettings;
  saveLocalSettings(settings: PlaintextLocalSettings): void;
  // The live session geometry owned by the render controller; restore hydrates these, capture reads them.
  detachedWindowPositions(): Map<DetachableSectionId, PanelPosition>;
  detachedWindowMinimized(): Set<DetachableSectionId>;
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

  async resetWorkspaceLayout(): Promise<void> {
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    this.restoreAttempt += 1;
    this.restorePromise = null;
    this.restored = true;
    this.cancelPendingSave();
    await this.deps.workspaceLayoutStore()?.remove(hostname);
    this.lastPersistedLayout = null;
    this.deps.detachedWindowPositions().clear();
    this.deps.detachedWindowMinimized().clear();
    this.deps.setState({
      ...this.deps.getState(),
      detachedSections: [],
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
      const hostname = hostnameFromLocation();
      if (!hostname) return;
      const saved = await store.load(hostname);
      if (!saved || this.restoreAttempt !== attempt || this.restored) return;
      const layout = sanitizeWorkspaceLayout(saved);
      const positions = this.deps.detachedWindowPositions();
      const minimized = this.deps.detachedWindowMinimized();
      for (const section of layout.sections) {
        if (section.position) positions.set(section.sectionId, section.position);
        if (section.minimized) minimized.add(section.sectionId);
      }
      this.lastPersistedLayout = layout;
      this.deps.setState({
        ...this.deps.getState(),
        detachedSections: layout.sections.map((section) => section.sectionId),
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
    } finally {
      if (this.restoreAttempt === attempt) this.restored = true;
    }
  }

  private async persistWorkspaceLayout(): Promise<void> {
    const store = this.deps.workspaceLayoutStore();
    if (!store || !this.deps.getState().restoreWorkspaceLayoutEnabled) return;
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    const layout = captureWorkspaceLayout(
      this.deps.getState().detachedSections,
      this.deps.detachedWindowPositions(),
      this.deps.detachedWindowMinimized(),
    );
    if (this.lastPersistedLayout && workspaceLayoutsEqual(this.lastPersistedLayout, layout)) return;
    await store.save(hostname, layout);
    this.lastPersistedLayout = layout;
  }

  private cancelPendingSave(): void {
    if (this.saveTimer === null) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }
}
