import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import { reducePanelAction } from '../core/actions.js';
import { createInitialPanelState, setTargetState } from '../core/state.js';
import type { PanelAction, PanelState, TargetState } from '../core/types.js';
import { renderPanel } from './render.js';

const ROOT_ID = 'image-trail-panel-root';
const STYLE_ID = 'image-trail-panel-style';
const STYLE_PATH = 'src/ui/styles/panel.css';

function toTargetState(snapshot: TargetSelectionSnapshot): TargetState {
  return {
    mode: snapshot.mode,
    picking: snapshot.picking,
    candidateCount: snapshot.candidateCount,
    selectedUrl: snapshot.selected?.url ?? null,
    selectedHandleId: snapshot.selected?.handleId ?? null,
    selectedDimensions: snapshot.selected ? `${snapshot.selected.width}×${snapshot.selected.height}` : null,
    message: snapshot.message,
  };
}

export class ImageTrailPanel {
  private root: HTMLElement | null = null;
  private state: PanelState = createInitialPanelState();
  private unsubscribeFromTarget: (() => void) | null = null;

  constructor(private readonly pageAdapter: PageAdapter) {
    this.unsubscribeFromTarget = this.pageAdapter.subscribe((snapshot) => {
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
    });
  }

  get visible(): boolean {
    return this.state.visible;
  }

  get statusMessage(): string {
    return this.state.message;
  }

  toggle(): PanelState {
    this.dispatch({ name: 'toggle-panel' });
    return this.state;
  }

  destroy(): void {
    this.state = reducePanelAction(this.state, { name: 'close-panel' });
    this.cleanupMountedElements();
  }

  private cleanupMountedElements(): void {
    this.pageAdapter.cleanup();
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    this.root = null;
  }

  disconnect(): void {
    this.destroy();
    this.unsubscribeFromTarget?.();
    this.unsubscribeFromTarget = null;
  }

  private dispatch = (action: PanelAction): void => {
    if (action.name === 'start-target-picker') {
      this.state = reducePanelAction(this.state, action);
      this.pageAdapter.startPickMode();
      return;
    }

    if (action.name === 'stop-target-picker') {
      this.state = reducePanelAction(this.state, action);
      this.pageAdapter.stopPickMode();
      return;
    }

    this.state = reducePanelAction(this.state, action);
    if (!this.state.visible) {
      this.cleanupMountedElements();
      return;
    }
    this.mount();
    this.pageAdapter.autoSelectSingleImage();
    this.render();
  };

  private mount(): void {
    if (!this.root) {
      this.root = document.getElementById(ROOT_ID) ?? document.createElement('aside');
      this.root.id = ROOT_ID;
      this.root.className = 'image-trail-panel';
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-label', 'Image Trail panel');
      (document.body ?? document.documentElement).append(this.root);
    }

    if (!document.getElementById(STYLE_ID)) {
      const link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(STYLE_PATH);
      (document.head ?? document.documentElement).append(link);
    }
  }

  private render(): void {
    if (this.root) {
      renderPanel({ root: this.root, dispatch: this.dispatch }, this.state);
    }
  }
}
