import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import { createDisplayRecord } from '../core/display-records.js';
import { reducePanelAction } from '../core/actions.js';
import { createInitialPanelState, setTargetState } from '../core/state.js';
import type { BookmarkStore, PanelAction, PanelState, TargetState } from '../core/types.js';
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
  private unsubscribeFromLoads: (() => void) | null = null;

  constructor(
    private readonly pageAdapter: PageAdapter,
    private readonly bookmarkStore: BookmarkStore | null = null,
  ) {
    this.unsubscribeFromTarget = this.pageAdapter.subscribe((snapshot) => {
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
    });
    this.unsubscribeFromLoads = this.pageAdapter.subscribeToSuccessfulLoads((target) => {
      this.state = reducePanelAction(this.state, { name: 'history/add-loaded', url: target.url });
      this.render();
    });
    void this.loadBookmarks();
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
    this.unsubscribeFromLoads?.();
    this.unsubscribeFromLoads = null;
  }

  private loadBookmarks = async (): Promise<void> => {
    if (!this.bookmarkStore) return;
    const bookmarks = await this.bookmarkStore.load();
    this.state = { ...this.state, bookmarks: bookmarks.slice(0, 200) };
    this.render();
  };

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

    if (action.name === 'bookmark/current') {
      void this.bookmarkCurrentImage();
      return;
    }

    if (action.name === 'bookmark/load') {
      this.loadBookmark(action.id);
      return;
    }

    if (action.name === 'bookmark/remove') {
      void this.removeBookmark(action.id);
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

  private async bookmarkCurrentImage(): Promise<void> {
    const url = this.state.target.selectedUrl;
    if (!url) return;
    const draft = createDisplayRecord({ id: url, url, source: 'bookmark' });
    const bookmark = this.bookmarkStore ? await this.bookmarkStore.save(draft) : draft;
    this.state = {
      ...this.state,
      bookmarks: [bookmark, ...this.state.bookmarks.filter((item) => item.url !== bookmark.url)],
      lastUpdatedAt: Date.now(),
    };
    this.render();
  }

  private loadBookmark(id: string): void {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    const snapshot = this.pageAdapter.applyUrlToSelected(bookmark.url);
    this.state = setTargetState(this.state, toTargetState(snapshot));
    this.render();
  }

  private async removeBookmark(id: string): Promise<void> {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    await this.bookmarkStore?.remove(bookmark);
    this.state = reducePanelAction(this.state, { name: 'bookmark/remove', id });
    this.render();
  }

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
