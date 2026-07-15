import type { CaptureStore } from '../../content/capture-controller.js';
import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import { DEFAULT_LOCAL_SETTINGS } from '../../content/panel-services.js';
import { reducePanelAction } from '../../core/actions.js';
import type { BookmarkStore, PanelState, UrlTemplateStore } from '../../core/types.js';
import type { UrlTemplateRecord } from '../../core/url/templates.js';

export interface PanelDataLoadControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  bookmarkStore(): BookmarkStore | null;
  recentHistoryStore(): RecentHistoryStore | null;
  captureStore(): CaptureStore | null;
  urlTemplateStore(): UrlTemplateStore | null;
  loadLocalSettings(options?: { readonly render?: boolean }): Promise<void>;
  // Grab/template resolution lives on the URL-template settings controller.
  currentUrlTemplateHostname(): string | null;
  activeTemplateIdForCurrentUrl(templates: readonly UrlTemplateRecord[]): string | null;
  syncGrabSettings(): void;
  primeBufferedNav(): void;
}

/**
 * The panel's async data-loading orchestration, moved verbatim off `ImageTrailPanel`: the initial
 * settings/bookmarks/recents load, per-host URL-template + grab-source-pattern loading, paged
 * bookmark loading, recent-history loading, and storage-usage refresh. Storage refresh keeps its
 * single-flight `storageUsageRequestId` guard so a stale response never overwrites a newer one.
 */
export class PanelDataLoadController {
  private storageUsageRequestId = 0;
  private recentHistoryRequestId = 0;

  constructor(private readonly deps: PanelDataLoadControllerDeps) {}

  private loadBookmarks = async (options: { readonly render?: boolean } = {}): Promise<void> => {
    if (!this.deps.bookmarkStore()) return;
    await this.loadBookmarkPage(0, options);
  };

  loadSettingsBookmarksAndRecents = async (): Promise<void> => {
    await this.deps.loadLocalSettings({ render: false });
    await Promise.all([this.loadBookmarks({ render: false }), this.loadRecentHistory({ render: false })]);
    this.deps.render();
  };

  async loadGrabSettings(options: { readonly render?: boolean; readonly primeBufferedNav?: boolean } = {}): Promise<void> {
    const urlTemplateStore = this.deps.urlTemplateStore();
    if (!urlTemplateStore) return;
    const hostname = this.deps.currentUrlTemplateHostname();
    if (!hostname) return;
    const [templates, grabSourcePatterns] = await Promise.all([
      urlTemplateStore.load(hostname),
      urlTemplateStore.loadGrabSourcePatterns(hostname),
    ]);
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'url-templates/load',
        templates,
        activeTemplateId: this.deps.activeTemplateIdForCurrentUrl(templates),
      }),
    );
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'grab-source-patterns/load',
        patterns: grabSourcePatterns,
      }),
    );
    this.deps.syncGrabSettings();
    if (options.primeBufferedNav !== false) this.deps.primeBufferedNav();
    if (options.render !== false) this.deps.render();
  }

  loadRecentHistory = async (options: { readonly render?: boolean } = {}): Promise<void> => {
    const recentHistoryStore = this.deps.recentHistoryStore();
    if (!recentHistoryStore) return;
    const scope = this.deps.getState().recentHistoryScope;
    const requestId = (this.recentHistoryRequestId += 1);
    const history = await recentHistoryStore.load(window.location.href, { scope });
    if (requestId !== this.recentHistoryRequestId || this.deps.getState().recentHistoryScope !== scope) return;
    this.deps.setState({
      ...this.deps.getState(),
      history,
      selectedHistoryIds: this.deps.getState().selectedHistoryIds.filter((id) => history.some((item) => item.id === id)),
      lastUpdatedAt: Date.now(),
    });
    if (options.render !== false) this.deps.render();
  };

  loadBookmarkPage = async (offset: number, options: { readonly render?: boolean } = {}): Promise<void> => {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore) return;
    const state = this.deps.getState();
    const page = await bookmarkStore.loadPage({
      offset,
      limit: state.bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      scope: state.bookmarkVisibilityScope,
      currentPageUrl: window.location.href,
      displayOrder: state.queueDisplayOrder,
    });
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'bookmarks/page-loaded',
        bookmarks: page.items,
        offset: page.offset,
        limit: page.limit,
        total: page.total,
        hasOlder: page.hasOlder,
        hasNewer: page.hasNewer,
      }),
    );
    if (options.render !== false) this.deps.render();
  };

  async refreshStorageUsage(options: { readonly render?: boolean | undefined } = {}): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const requestId = (this.storageUsageRequestId += 1);
    try {
      const usage = await captureStore.requestStorageUsage();
      if (requestId !== this.storageUsageRequestId) return;
      this.applyStorageUsage(usage, { preserveRequestId: true });
      if (options.render || this.deps.getState().activeDestination === 'settings') this.deps.render();
    } catch {
      // Storage health is informational; it must not break row actions.
    }
  }

  applyStorageUsage(usage: NonNullable<PanelState['storageUsage']>, options: { readonly preserveRequestId?: boolean } = {}): void {
    if (!options.preserveRequestId) this.storageUsageRequestId += 1;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'storage/update', usage }));
  }

  invalidateStorageUsageRequests(): void {
    this.storageUsageRequestId += 1;
  }
}
