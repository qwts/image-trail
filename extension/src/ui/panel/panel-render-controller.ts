import { reducePanelAction } from '../../core/actions.js';
import type { PanelAction, PanelState } from '../../core/types.js';
import { renderPanel, renderRecallDrawer, type PanelLayoutState } from '../render.js';
import { createToast } from '../components/primitives.js';
import { isFocusablePanelControl } from './export-download.js';
import type { BufferedNavigationDebugSnapshot } from './buffered-navigation-controller.js';

const FINITE_CAPTURE_ERROR_MS = 2400;

export interface PanelRenderControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  dispatch(action: PanelAction): void;
  root(): HTMLElement | null;
  recallRoot(): HTMLElement | null;
  detachedRoot(): HTMLElement | null;
  toastRoot(): HTMLElement | null;
  panelStylesReady(): boolean;
  // The active preview scroll anchor + drag handler live on their own controllers; the render path
  // only threads them into `renderPanel`/`renderRecallDrawer`.
  previewScrollAnchorId(): string | null;
  handlePanelDragStart(event: PointerEvent): void;
  queuePanelPositionRestore(): void;
  applyRestoredPanelPosition(): void;
  // The buffered-navigation debug overlay reads a snapshot of the skip-buffer window.
  bufferedNavDebugSnapshot(): BufferedNavigationDebugSnapshot | null;
  // Queue refresh after a panel-only render so the recall drawer never triggers a full rerender.
  refreshRecallIfOpen(): void;
  onWorkspaceLayoutChanged(): void;
}

// The captured active-element identity re-applied after a render swaps the panel DOM: the control is
// re-found by structural index + tag within its root (panel or detached-section window), and text
// inputs restore their value and selection range.
type FocusedPanelControlSnapshot = {
  readonly scope: 'panel' | 'detached';
  readonly index: number;
  readonly tagName: string;
  readonly inputType?: string;
  readonly value?: string;
  readonly selectionStart?: number | null;
  readonly selectionEnd?: number | null;
};

/**
 * The panel's rendering plumbing, moved verbatim off `ImageTrailPanel`: the main `render` (with its
 * focus capture/restore contract across DOM swaps), the recall-only render (the `renderRecallDrawer`
 * vs `renderPanel` split that avoids full rerenders), the buffered-skip toast and buffered-debug
 * overlay, and the finite capture-error reset timer.
 *
 * Order-sensitive spots preserved: `captureFocusedPanelControl` → render → `restoreFocusedPanelControl`
 * (incl. `ShadowRoot` active-element resolution), the toast pulse-reflow (`void root.offsetWidth`) and
 * its dismiss timer, and `scheduleFiniteCaptureErrorReset`'s `lastUpdatedAt`-guarded reset.
 */
export class PanelRenderController {
  private finiteCaptureErrorTimer: number | null = null;
  private bufferedNavigationToastTimer: number | null = null;
  private readonly layoutState: PanelLayoutState = {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    detachedWindowPositions: new Map(),
    detachedWindowMinimized: new Set(),
    collapsibleListScrollTops: new Map(),
  };

  constructor(private readonly deps: PanelRenderControllerDeps) {}

  /** Live session geometry for the detached workspace; the workspace-layout controller hydrates and captures it. */
  workspaceGeometry(): Pick<PanelLayoutState, 'detachedWindowPositions' | 'detachedWindowMinimized'> {
    return this.layoutState;
  }

  scheduleFiniteCaptureErrorReset(
    updatedAt: number,
    mode: 'status' | 'capture-result',
    durationMs: number = FINITE_CAPTURE_ERROR_MS,
  ): void {
    this.clearFiniteCaptureErrorTimer();
    this.finiteCaptureErrorTimer = window.setTimeout(() => {
      this.finiteCaptureErrorTimer = null;
      const state = this.deps.getState();
      if (state.lastUpdatedAt !== updatedAt) return;
      if (mode === 'status') {
        if (state.status !== 'error') return;
        this.deps.setState({ ...state, status: 'ready', message: 'Image Trail is ready.', lastUpdatedAt: Date.now() });
      } else {
        if (state.captureResult === null || state.captureResult.status === 'captured') return;
        this.deps.setState({ ...reducePanelAction(state, { name: 'capture/clear' }), message: 'Image Trail is ready.' });
      }
      this.render();
    }, durationMs);
  }

  clearFiniteCaptureErrorTimer(): void {
    if (this.finiteCaptureErrorTimer === null) return;
    window.clearTimeout(this.finiteCaptureErrorTimer);
    this.finiteCaptureErrorTimer = null;
  }

  renderPanelAndRefreshRecall(): void {
    this.render({ includeRecall: false });
    this.deps.refreshRecallIfOpen();
  }

  render(options: { readonly includeRecall?: boolean } = {}): void {
    const root = this.deps.root();
    if (root) {
      const focusedControl = this.captureFocusedPanelControl();
      renderPanel(
        {
          root,
          recallRoot: this.deps.recallRoot(),
          detachedRoot: this.deps.detachedRoot(),
          toastRoot: this.deps.toastRoot(),
          dispatch: this.deps.dispatch,
          layoutState: this.layoutState,
          onWorkspaceLayoutChanged: () => this.deps.onWorkspaceLayoutChanged(),
          scrollAnchorId: this.deps.previewScrollAnchorId(),
          onPanelDragStart: this.deps.handlePanelDragStart,
        },
        this.deps.getState(),
        { renderRecall: options.includeRecall !== false },
      );
      this.restoreFocusedPanelControl(focusedControl);
      if (!this.deps.getState().minimized && this.deps.panelStylesReady()) {
        this.deps.queuePanelPositionRestore();
        this.deps.applyRestoredPanelPosition();
      }
      this.renderBufferedDebugOverlay();
    }
  }

  renderBufferedDebugOverlay(): void {
    const root = this.deps.root();
    if (!root) return;
    const existing = root.querySelector('.image-trail-panel__buffer-debug');
    const snapshot = this.deps.bufferedNavDebugSnapshot();
    if (!snapshot) {
      existing?.remove();
      return;
    }
    const overlay = existing instanceof HTMLElement ? existing : document.createElement('div');
    overlay.className = 'image-trail-panel__buffer-debug';
    const { cursor, bufferN, indices } = snapshot;
    const cells: HTMLElement[] = [];
    for (let index = cursor - bufferN; index <= cursor + bufferN; index += 1) {
      const entry = indices.get(index);
      const cell = document.createElement('span');
      cell.className = 'image-trail-panel__buffer-debug-cell';
      cell.dataset['status'] = entry ? `${entry.manifest}:${entry.image}` : 'UNKNOWN';
      if (index === cursor) cell.classList.add('is-current');
      cell.title = `${index}: ${entry?.manifest ?? 'UNKNOWN'} / ${entry?.image ?? 'UNKNOWN'}`;
      cell.textContent = String(index);
      cells.push(cell);
    }
    overlay.replaceChildren(...cells);
    if (!existing) root.append(overlay);
  }

  showBufferedNavigationToast(message: string): void {
    const root = this.deps.root();
    const toastRoot = this.deps.toastRoot();
    if (!root || !toastRoot) return;
    if (this.bufferedNavigationToastTimer !== null) {
      window.clearTimeout(this.bufferedNavigationToastTimer);
      this.bufferedNavigationToastTimer = null;
    }
    root.classList.remove('has-buffered-skip-pulse');
    void root.offsetWidth;
    root.classList.add('has-buffered-skip-pulse');

    toastRoot.replaceChildren();
    toastRoot.className = 'image-trail-panel-root image-trail-panel__toast-root has-buffered-skip-pulse';
    // Out-of-band toast write: clear the status-toast refresh key so the next render rebuilds.
    delete toastRoot.dataset['imageTrailToastKey'];

    const toast = createToast({ label: 'Skipped', message, tone: 'error' });
    toast.classList.add('image-trail-panel__toast', 'image-trail-panel__buffered-skip-toast');
    toast.querySelector('.image-trail-ds__toast-label')?.classList.add('image-trail-panel__toast-label');
    const copy = toast.querySelector<HTMLElement>('.image-trail-ds__toast-message');
    copy?.classList.add('image-trail-panel__toast-message');
    if (copy) copy.title = message;
    toastRoot.append(toast);
    this.bufferedNavigationToastTimer = window.setTimeout(() => {
      this.deps.root()?.classList.remove('has-buffered-skip-pulse');
      const currentToastRoot = this.deps.toastRoot();
      if (currentToastRoot) {
        currentToastRoot.replaceChildren();
        currentToastRoot.className = 'image-trail-panel-root image-trail-panel__toast-root';
        delete currentToastRoot.dataset['imageTrailToastKey'];
      }
      this.bufferedNavigationToastTimer = null;
    }, 1800);
  }

  private captureFocusedPanelControl(): FocusedPanelControlSnapshot | null {
    const root = this.deps.root();
    if (!root) return null;
    const rootNode = root.getRootNode();
    const activeElement = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return null;
    // The control may live in the panel root or in a detached-section window (same shadow root).
    const detachedRoot = this.deps.detachedRoot();
    const scope = root.contains(activeElement) ? 'panel' : detachedRoot?.contains(activeElement) ? 'detached' : null;
    if (!scope) return null;
    if (!isFocusablePanelControl(activeElement)) return null;
    const controls = this.focusablePanelControls(scope);
    const index = controls.indexOf(activeElement);
    if (index < 0) return null;
    if (activeElement instanceof HTMLInputElement) {
      if (activeElement.type === 'file') return { scope, index, tagName: activeElement.tagName, inputType: activeElement.type };
      return {
        scope,
        index,
        tagName: activeElement.tagName,
        inputType: activeElement.type,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      };
    }
    if (activeElement instanceof HTMLTextAreaElement) {
      return {
        scope,
        index,
        tagName: activeElement.tagName,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      };
    }
    return { scope, index, tagName: activeElement.tagName };
  }

  private restoreFocusedPanelControl(focusedControl: FocusedPanelControlSnapshot | null): void {
    const root = this.deps.root();
    if (!root || !focusedControl) return;
    const nextControl = this.focusablePanelControls(focusedControl.scope)[focusedControl.index];
    if (!nextControl || nextControl.tagName !== focusedControl.tagName) return;
    if (
      focusedControl.inputType !== undefined &&
      (!(nextControl instanceof HTMLInputElement) || nextControl.type !== focusedControl.inputType)
    ) {
      return;
    }
    if (nextControl instanceof HTMLInputElement && nextControl.type === 'file') {
      nextControl.focus();
      return;
    }
    if (focusedControl.value !== undefined && (nextControl instanceof HTMLInputElement || nextControl instanceof HTMLTextAreaElement)) {
      nextControl.value = focusedControl.value;
      try {
        nextControl.setSelectionRange(focusedControl.selectionStart ?? null, focusedControl.selectionEnd ?? null);
      } catch {
        // Some input types, such as number, do not support selection ranges.
      }
    }
    nextControl.focus();
  }

  private focusablePanelControls(scope: 'panel' | 'detached'): HTMLElement[] {
    const container = scope === 'panel' ? this.deps.root() : this.deps.detachedRoot();
    if (!container) return [];
    return Array.from(container.querySelectorAll<HTMLElement>('button, input, select, textarea'));
  }

  renderRecallOnly(): void {
    const root = this.deps.root();
    const recallRoot = this.deps.recallRoot();
    if (!root || !recallRoot) return;
    renderRecallDrawer(
      {
        root,
        recallRoot,
        toastRoot: this.deps.toastRoot(),
        dispatch: this.deps.dispatch,
        layoutState: this.layoutState,
        scrollAnchorId: this.deps.previewScrollAnchorId(),
        onPanelDragStart: this.deps.handlePanelDragStart,
      },
      this.deps.getState(),
    );
  }
}
