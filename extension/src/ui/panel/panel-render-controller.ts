import { reducePanelAction } from '../../core/actions.js';
import type { PanelAction, PanelState } from '../../core/types.js';
import { renderPanel, renderRecallDrawer, type PanelLayoutState } from '../render.js';
import { isFocusablePanelControl } from './export-download.js';
import type { BufferedNavigationDebugSnapshot } from './buffered-navigation-controller.js';

const FINITE_CAPTURE_ERROR_MS = 2400;

export interface PanelRenderControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  dispatch(action: PanelAction): void;
  root(): HTMLElement | null;
  recallRoot(): HTMLElement | null;
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
}

// The captured active-element identity re-applied after a render swaps the panel DOM: the control is
// re-found by structural index + tag, and text inputs restore their value and selection range.
type FocusedPanelControlSnapshot = {
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
  };

  constructor(private readonly deps: PanelRenderControllerDeps) {}

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
          toastRoot: this.deps.toastRoot(),
          dispatch: this.deps.dispatch,
          layoutState: this.layoutState,
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
      cell.dataset.status = entry ? `${entry.manifest}:${entry.image}` : 'UNKNOWN';
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

    const toast = document.createElement('aside');
    toast.className = 'image-trail-panel__toast image-trail-panel__buffered-skip-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const label = document.createElement('span');
    label.className = 'image-trail-panel__toast-label';
    label.textContent = 'Skipped';

    const copy = document.createElement('span');
    copy.className = 'image-trail-panel__toast-message';
    copy.textContent = message;
    copy.title = message;

    toast.append(label, copy);
    toastRoot.append(toast);
    this.bufferedNavigationToastTimer = window.setTimeout(() => {
      this.deps.root()?.classList.remove('has-buffered-skip-pulse');
      const currentToastRoot = this.deps.toastRoot();
      if (currentToastRoot) {
        currentToastRoot.replaceChildren();
        currentToastRoot.className = 'image-trail-panel-root image-trail-panel__toast-root';
      }
      this.bufferedNavigationToastTimer = null;
    }, 1800);
  }

  private captureFocusedPanelControl(): FocusedPanelControlSnapshot | null {
    const root = this.deps.root();
    if (!root) return null;
    const rootNode = root.getRootNode();
    const activeElement = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
    if (!(activeElement instanceof HTMLElement) || !root.contains(activeElement)) return null;
    if (!isFocusablePanelControl(activeElement)) return null;
    const controls = this.focusablePanelControls();
    const index = controls.indexOf(activeElement);
    if (index < 0) return null;
    if (activeElement instanceof HTMLInputElement) {
      if (activeElement.type === 'file') return { index, tagName: activeElement.tagName, inputType: activeElement.type };
      return {
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
        index,
        tagName: activeElement.tagName,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      };
    }
    return { index, tagName: activeElement.tagName };
  }

  private restoreFocusedPanelControl(focusedControl: FocusedPanelControlSnapshot | null): void {
    const root = this.deps.root();
    if (!root || !focusedControl) return;
    const nextControl = this.focusablePanelControls()[focusedControl.index];
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

  private focusablePanelControls(): HTMLElement[] {
    const root = this.deps.root();
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea'));
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
