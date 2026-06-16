import { reducePanelAction } from '../core/actions.js';
import { createInitialPanelState } from '../core/state.js';
import type { PanelAction, PanelState } from '../core/types.js';
import { renderPanel } from './render.js';

const ROOT_ID = 'image-trail-panel-root';
const STYLE_ID = 'image-trail-panel-style';
const STYLE_PATH = 'src/ui/styles/panel.css';

export class ImageTrailPanel {
  private root: HTMLElement | null = null;
  private state: PanelState = createInitialPanelState();

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
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    this.root = null;
    this.state = reducePanelAction(this.state, { name: 'close-panel' });
  }

  private dispatch = (action: PanelAction): void => {
    this.state = reducePanelAction(this.state, action);
    if (!this.state.visible) {
      this.destroy();
      return;
    }
    this.mount();
    this.render();
  };

  private mount(): void {
    if (!this.root) {
      this.root = document.getElementById(ROOT_ID) ?? document.createElement('aside');
      this.root.id = ROOT_ID;
      this.root.className = 'image-trail-panel';
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-label', 'Image Trail panel');
      document.documentElement.append(this.root);
    }

    if (!document.getElementById(STYLE_ID)) {
      const link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(STYLE_PATH);
      document.documentElement.append(link);
    }
  }

  private render(): void {
    if (this.root) {
      renderPanel({ root: this.root, dispatch: this.dispatch }, this.state);
    }
  }
}
