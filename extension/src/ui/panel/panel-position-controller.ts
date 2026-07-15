import type { PanelPosition, PanelPositionStore, PanelState } from '../../core/types.js';
import type { WorkspaceRailEdge } from '../../core/workspace-layout.js';
import { clampPanelPositionWithinInsets, hostnameFromLocation } from '../panel-position.js';
import { workspacePanelInsets } from '../workspace/workspace-geometry.js';

export interface PanelPositionControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderRecallOnly(): void;
  whenStylesReady(): Promise<void> | null;
  root(): HTMLElement | null;
  panelPositionStore(): PanelPositionStore | null;
  onPositionChanged?(): void;
}

/**
 * Panel placement, moved verbatim off `ImageTrailPanel`: restore-on-open, drag-to-move,
 * clamp-to-viewport, and per-hostname persistence via `panelPositionStore`. The restore is
 * promise-memoized (single-flight) and attempt-guarded: every await re-checks
 * `isPanelPositionRestoreCurrent` so a teardown/remount or reset that bumped the attempt counter
 * aborts the stale restore instead of writing its position onto the new mount.
 */
export class PanelPositionController {
  private panelPositionRestored = false;
  private panelPositionRestorePromise: Promise<void> | null = null;
  private panelPositionRestoreAttempt = 0;
  private restoredPanelPosition: PanelPosition | null = null;
  private workspaceEdges = new Set<WorkspaceRailEdge>();
  private observingViewport = false;
  private cancelPanelDrag: (() => void) | null = null;

  constructor(private readonly deps: PanelPositionControllerDeps) {}

  async ensurePanelPositionRestored(): Promise<void> {
    if (!this.deps.root()) return;
    this.panelPositionRestorePromise ??= this.beginPanelPositionRestore();
    await this.panelPositionRestorePromise;
  }

  queuePanelPositionRestore(): void {
    if (!this.deps.root() || this.panelPositionRestored || this.panelPositionRestorePromise) return;
    this.panelPositionRestorePromise = this.beginPanelPositionRestore();
  }

  // Panel-teardown reset: bumping the attempt counter aborts any in-flight restore, and clearing
  // the memoized promise lets the next mount start a fresh one.
  invalidateRestore(): void {
    this.cancelPanelDrag?.();
    this.panelPositionRestoreAttempt += 1;
    this.panelPositionRestored = false;
    this.panelPositionRestorePromise = null;
    this.restoredPanelPosition = null;
    this.workspaceEdges.clear();
    this.updateViewportObservation(false);
  }

  private beginPanelPositionRestore(): Promise<void> {
    const attempt = (this.panelPositionRestoreAttempt += 1);
    return this.restorePanelPosition(attempt);
  }

  private async restorePanelPosition(attempt: number): Promise<void> {
    const panelPositionStore = this.deps.panelPositionStore();
    if (!this.deps.root() || !panelPositionStore || this.panelPositionRestored) return;
    try {
      const hostname = hostnameFromLocation();
      if (!hostname) return;
      const saved = await panelPositionStore.load(hostname);
      if (!saved || !this.isPanelPositionRestoreCurrent(attempt)) return;
      await this.waitForPanelLayout();
      if (!this.isPanelPositionRestoreCurrent(attempt)) return;
      this.restoredPanelPosition = this.clampPanelPosition(saved);
      this.applyRestoredPanelPosition();
      this.deps.renderRecallOnly();
    } finally {
      if (this.deps.root() && this.panelPositionRestoreAttempt === attempt) {
        this.panelPositionRestored = true;
      }
    }
  }

  private isPanelPositionRestoreCurrent(attempt: number): boolean {
    return Boolean(this.deps.root()) && this.panelPositionRestoreAttempt === attempt && !this.panelPositionRestored;
  }

  private async waitForPanelLayout(): Promise<void> {
    await this.deps.whenStylesReady();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  readonly handlePanelDragStart = (event: PointerEvent): void => {
    const root = this.deps.root();
    if (event.button !== 0 || !root) return;
    this.cancelPanelDrag?.();
    event.preventDefault();
    const startRect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let latest = this.clampPanelPosition({ left: startRect.left, top: startRect.top });

    const onMove = (moveEvent: PointerEvent): void => {
      latest = this.clampPanelPosition({
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      });
      this.applyPanelPosition(latest);
      this.restoredPanelPosition = latest;
      this.deps.renderRecallOnly();
    };

    const cleanup = (): void => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (this.cancelPanelDrag === cleanup) this.cancelPanelDrag = null;
    };

    const onUp = (): void => {
      cleanup();
      void this.savePanelPosition(latest);
      this.deps.onPositionChanged?.();
    };

    this.cancelPanelDrag = cleanup;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  private clampPanelPosition(position: PanelPosition): PanelPosition {
    const root = this.deps.root();
    if (!root) return position;
    const rect = root.getBoundingClientRect();
    return clampPanelPositionWithinInsets(
      position,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      workspacePanelInsets(this.workspaceEdges),
    );
  }

  private applyPanelPosition(position: PanelPosition): void {
    const root = this.deps.root();
    if (!root) return;
    root.style.left = `${Math.round(position.left)}px`;
    root.style.top = `${Math.round(position.top)}px`;
    root.style.right = 'auto';
  }

  private clearPanelPosition(): void {
    const root = this.deps.root();
    if (!root) return;
    root.style.removeProperty('left');
    root.style.removeProperty('top');
    root.style.removeProperty('right');
  }

  applyRestoredPanelPosition(): void {
    if (!this.restoredPanelPosition) return;
    this.applyPanelPosition(this.clampPanelPosition(this.restoredPanelPosition));
  }

  currentPanelPosition(): PanelPosition | null {
    if (this.restoredPanelPosition) return this.restoredPanelPosition;
    const rect = this.deps.root()?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top } : null;
  }

  restoreWorkspacePanelPosition(position: PanelPosition | null): void {
    if (!position) return;
    this.restoredPanelPosition = this.clampPanelPosition(position);
    this.applyRestoredPanelPosition();
  }

  setWorkspaceRailEdges(edges: ReadonlySet<WorkspaceRailEdge>, observeViewport = true): void {
    const root = this.deps.root();
    if (!root) return;
    if (!this.restoredPanelPosition) {
      const rect = root.getBoundingClientRect();
      this.restoredPanelPosition = { left: rect.left, top: rect.top };
    }
    this.workspaceEdges = new Set(edges);
    this.applyWorkspacePanelHeight(root);
    this.applyRestoredPanelPosition();
    this.deps.renderRecallOnly();
    this.updateViewportObservation(observeViewport);
  }

  private applyWorkspacePanelHeight(root: HTMLElement): void {
    if (this.workspaceEdges.size === 0) {
      root.style.removeProperty('max-height');
      return;
    }
    const insets = workspacePanelInsets(this.workspaceEdges);
    root.style.maxHeight = `${Math.max(120, window.innerHeight - insets.top - insets.bottom)}px`;
  }

  private readonly handleViewportChange = (): void => {
    this.deps.render();
  };

  private updateViewportObservation(active: boolean): void {
    if (active === this.observingViewport) return;
    this.observingViewport = active;
    const method = active ? 'addEventListener' : 'removeEventListener';
    window[method]('resize', this.handleViewportChange);
    window.visualViewport?.[method]('resize', this.handleViewportChange);
  }

  private async savePanelPosition(position: PanelPosition): Promise<void> {
    const panelPositionStore = this.deps.panelPositionStore();
    if (!panelPositionStore) return;
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    await panelPositionStore.save(hostname, position);
  }

  async resetPanelPosition(): Promise<void> {
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    this.panelPositionRestoreAttempt += 1;
    this.panelPositionRestorePromise = null;
    await this.deps.panelPositionStore()?.remove(hostname);
    this.restoredPanelPosition = null;
    this.panelPositionRestored = true;
    this.clearPanelPosition();
    this.deps.onPositionChanged?.();
    this.deps.setState({
      ...this.deps.getState(),
      message: 'Panel position reset for this site.',
      status: 'ready',
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
    this.deps.renderRecallOnly();
  }
}
