import type { CaptureStore } from '../content/capture-controller.js';
import { KeyboardRouter } from '../content/keyboard.js';
import { RequestGovernor } from '../content/request-governor.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import { createDisplayRecord } from '../core/display-records.js';
import { reducePanelAction } from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type { BookmarkStore, PanelAction, PanelState, TargetState } from '../core/types.js';
import { isCapturedResult } from '../core/image/capture-result.js';
import { applyImageUrl } from '../core/image/image-navigation.js';
import { parseUrl } from '../core/url/parse-url.js';
import { bumpUrlField, rebuildUrl } from '../core/url/rebuild-url.js';
import { collectUrlFields, selectDefaultField } from '../core/url/tokenize-fields.js';
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

  private readonly governor = new RequestGovernor();
  private readonly keyboard: KeyboardRouter;
  private readonly slideshow: Slideshow;
  private readonly retry: Retry404;

  constructor(
    private readonly pageAdapter: PageAdapter,
    private readonly bookmarkStore: BookmarkStore | null = null,
    private readonly captureStore: CaptureStore | null = null,
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
    void this.refreshStorageUsage();

    this.keyboard = new KeyboardRouter((action) => this.handleKeyAction(action));

    this.slideshow = new Slideshow(
      (direction) => this.navigateBy(direction),
      (phase, count) => {
        this.state = setAutomationState(this.state, { slideshowPhase: phase, slideshowCount: count });
        this.render();
      },
    );

    this.retry = new Retry404(
      () => this.tryReloadCurrent(),
      (direction) => this.navigateBy(direction),
      (phase, attempt, max) => {
        this.state = setAutomationState(this.state, { retryPhase: phase, retriesUsed: attempt, retriesMax: max });
        this.render();
      },
    );
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
    this.slideshow.destroy();
    this.retry.destroy();
    this.keyboard.disable();
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

    if (action.name === 'capture/request') {
      void this.captureImage(action.url, action.sourceType, action.sourceRecordId);
      return;
    }

    if (action.name === 'capture/delete') {
      void this.deleteCapturedBlob(action.id, action.blobId);
      return;
    }

    if (action.name === 'slideshow-start') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.start();
      this.render();
      return;
    }

    if (action.name === 'slideshow-stop') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.stop();
      this.render();
      return;
    }

    if (action.name === 'slideshow-pause') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.pause();
      this.render();
      return;
    }

    if (action.name === 'slideshow-resume') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.resume();
      this.render();
      return;
    }

    if (action.name === 'retry-start') {
      this.state = reducePanelAction(this.state, action);
      this.retry.start();
      this.render();
      return;
    }

    if (action.name === 'retry-stop') {
      this.state = reducePanelAction(this.state, action);
      this.retry.stop();
      this.render();
      return;
    }

    if (action.name === 'stop-all') {
      this.slideshow.stop();
      this.retry.stop();
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'navigate-next') {
      this.navigateBy(1);
      return;
    }

    if (action.name === 'navigate-previous') {
      this.navigateBy(-1);
      return;
    }

    this.state = reducePanelAction(this.state, action);
    if (!this.state.visible) {
      this.slideshow.destroy();
      this.retry.destroy();
      this.keyboard.disable();
      this.cleanupMountedElements();
      return;
    }
    this.mount();
    this.keyboard.enable();
    this.pageAdapter.autoSelectSingleImage();
    this.render();
  };

  private handleKeyAction(action: string): void {
    switch (action) {
      case 'next':
        this.dispatch({ name: 'navigate-next' });
        break;
      case 'previous':
        this.dispatch({ name: 'navigate-previous' });
        break;
      case 'slideshow-toggle':
        if (this.slideshow.currentPhase === 'running') {
          this.dispatch({ name: 'slideshow-pause' });
        } else if (this.slideshow.currentPhase === 'paused') {
          this.dispatch({ name: 'slideshow-resume' });
        } else {
          this.dispatch({ name: 'slideshow-start' });
        }
        break;
      case 'stop':
        this.dispatch({ name: 'stop-all' });
        break;
      case 'panel-toggle':
        this.dispatch({ name: 'toggle-panel' });
        break;
      case 'retry':
        this.dispatch({ name: 'retry-start' });
        break;
      default:
        break;
    }
  }

  private navigateBy(delta: 1 | -1): void {
    const result = this.governor.request(() => {
      const snapshot = this.pageAdapter.getSnapshot();
      if (!snapshot.selected) return false;
      const image = this.findSelectedImage(snapshot.selected.handleId);
      if (!image) return false;
      const currentUrl = image.src;
      if (!currentUrl) return false;
      const model = parseUrl(currentUrl);
      const fields = collectUrlFields(model);
      const field = selectDefaultField(fields);
      if (!field) return false;
      const bumped = bumpUrlField(model, field, delta);
      const nextUrl = rebuildUrl(bumped);
      applyImageUrl(image, nextUrl);
      return true;
    });

    this.state = setAutomationState(this.state, {
      governorStatus: result.status === 'ok' ? 'ready' : result.status,
      requestsInLastMinute: this.governor.requestsInLastMinute(),
    });
    this.render();
  }

  private async tryReloadCurrent(): Promise<boolean> {
    const snapshot = this.pageAdapter.getSnapshot();
    if (!snapshot.selected) return false;
    const image = this.findSelectedImage(snapshot.selected.handleId);
    if (!image) return false;
    return new Promise<boolean>((resolve) => {
      const onLoad = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      const currentSrc = image.src;
      image.src = currentSrc;
    });
  }

  private findSelectedImage(handleId: string): HTMLImageElement | null {
    return document.querySelector<HTMLImageElement>(`[data-image-trail-handle="${handleId}"]`);
  }

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

  private async captureImage(url: string, sourceType: 'target' | 'history' | 'bookmark', sourceRecordId?: string): Promise<void> {
    if (!this.captureStore) return;
    this.state = reducePanelAction(this.state, { name: 'capture/start' });
    this.render();
    const result = await this.captureStore.requestCapture(url, sourceType, sourceRecordId);
    this.state = reducePanelAction(this.state, { name: 'capture/complete', result, sourceRecordId });
    if (isCapturedResult(result) && sourceType === 'bookmark' && sourceRecordId && this.bookmarkStore) {
      const updatedBookmark = this.state.bookmarks.find((b) => b.id === sourceRecordId);
      if (updatedBookmark) {
        await this.bookmarkStore.save(updatedBookmark);
      }
    }
    await this.refreshStorageUsage();
    this.render();
  }

  private async deleteCapturedBlob(recordId: string, blobId: string): Promise<void> {
    if (!this.captureStore) return;
    this.state = reducePanelAction(this.state, { name: 'capture/delete', id: recordId, blobId });
    const { usage } = await this.captureStore.requestDeleteBlob(blobId);
    this.state = reducePanelAction(this.state, { name: 'storage/update', usage });
    this.render();
  }

  private async refreshStorageUsage(): Promise<void> {
    if (!this.captureStore) return;
    const usage = await this.captureStore.requestStorageUsage();
    this.state = reducePanelAction(this.state, { name: 'storage/update', usage });
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
