import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import type {
  createThumbnailDataUrlFromDataUrl,
  createThumbnailDataUrlFromImage,
  createThumbnailDataUrlFromUrl,
  fetchThumbnailSource,
} from '../../content/thumbnail-generator.js';
import { isTransientBlobUrl } from '../../content/thumbnail-generator.js';
import { DEFAULT_LOCAL_SETTINGS } from '../../content/panel-services.js';
import { reducePanelAction } from '../../core/actions.js';
import {
  createDisplayRecord,
  encryptedBlobIdForRecord,
  validateImageRecordUrl,
  type ImageRecordUrlValidation,
} from '../../core/display-records.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { ProjectionReason } from '../../core/projection-session.js';
import type { BookmarkStore, ImportedImageFile, PanelState } from '../../core/types.js';
import { bookmarkSaveMessage, withoutRecentPinState } from './record-export-helpers.js';

interface ValidatedRecordUrl extends ImageRecordUrlValidation {
  readonly preloadDataUrl?: string;
}

export interface RecordAddOptions {
  readonly trustLoadedImage?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly projectionId?: string;
}

export interface RecordLibraryControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  refreshStorageUsage(options?: { readonly render?: boolean }): Promise<void>;
  scheduleFiniteCaptureErrorReset(updatedAt: number, mode: 'status'): void;
  findSelectedImage(handleId: string): HTMLImageElement | null;
  isProjectionActive(projectionId: string): boolean;
  applySelectedUrl(url: string, attemptedFieldIds: readonly string[], options: { readonly reason: ProjectionReason }): Promise<boolean>;
  removeCapturedBlobReference(blobId: string, options?: { readonly render?: boolean }): Promise<void>;
  bookmarkStore(): BookmarkStore | null;
  recentHistoryStore(): RecentHistoryStore | null;
  // Thumbnail-generator surface injected typeof-style so tests can stub the network/canvas seam
  // (the NeighborPreloadController fetchThumbnail precedent).
  createThumbnailDataUrlFromImage: typeof createThumbnailDataUrlFromImage;
  createThumbnailDataUrlFromUrl: typeof createThumbnailDataUrlFromUrl;
  createThumbnailDataUrlFromDataUrl: typeof createThumbnailDataUrlFromDataUrl;
  fetchThumbnailSource: typeof fetchThumbnailSource;
}

/**
 * Bookmark and recent-history record management, moved verbatim off `ImageTrailPanel`: add/pin/
 * remove flows, record URL validation, thumbnail resolution, and the serialized bookmark mutation
 * queue. Captured-original blob flows live in `CapturedOriginalsController`; the two reach each
 * other only through panel-mediated deps callbacks.
 */
export class RecordLibraryController {
  private bookmarkMutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: RecordLibraryControllerDeps) {}

  async bookmarkCurrentImage(): Promise<void> {
    const state = this.deps.getState();
    const url = state.target.selectedUrl;
    if (!url) return;
    const image = state.target.selectedHandleId ? this.deps.findSelectedImage(state.target.selectedHandleId) : null;
    const trustLoadedImage = image ? image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 : false;
    await this.bookmarkUrl(url, image ? ((await this.deps.createThumbnailDataUrlFromImage(image)) ?? undefined) : undefined, {
      trustLoadedImage,
      width: image?.naturalWidth || undefined,
      height: image?.naturalHeight || undefined,
    });
  }

  enqueueBookmarkMutation(work: () => Promise<void>): void {
    this.bookmarkMutationQueue = this.bookmarkMutationQueue.then(work, work);
    void this.bookmarkMutationQueue;
  }

  async bookmarkUrl(url: string, thumbnail?: string, options: RecordAddOptions = {}): Promise<boolean> {
    const validation = await this.validateRecordUrlForAdd(url, options);
    if (!validation.ok || !validation.sourceUrl) {
      return false;
    }
    const sourceUrl = validation.sourceUrl;
    const resolvedThumbnail = await this.resolveRecordThumbnail(sourceUrl, thumbnail, validation, options);
    const draft = createDisplayRecord({
      id: sourceUrl,
      url: sourceUrl,
      thumbnail: resolvedThumbnail,
      width: options.width,
      height: options.height,
      source: 'bookmark',
    });
    const bookmarkStore = this.deps.bookmarkStore();
    const bookmark = bookmarkStore ? await bookmarkStore.save(draft) : draft;
    this.deps.setState({ ...this.deps.getState(), message: bookmarkSaveMessage(bookmark), lastUpdatedAt: Date.now() });
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.renderPanelAndRefreshRecall();
    void this.deps.refreshStorageUsage({ render: true });
    return true;
  }

  async addImportedImage(file: ImportedImageFile): Promise<boolean> {
    if (!file.dataUrl.startsWith('data:image/')) return false;
    const timestamp = new Date().toISOString();
    const draft = createDisplayRecord({
      id: `${timestamp}:${file.name}`,
      url: file.dataUrl,
      title: file.name,
      label: file.name,
      thumbnail: file.dataUrl,
      timestamp,
      source: 'bookmark',
    });
    const bookmarkStore = this.deps.bookmarkStore();
    const bookmark = bookmarkStore ? await bookmarkStore.save(draft) : draft;
    const historyItem = createDisplayRecord({ ...draft, id: `${timestamp}:history:${file.name}`, source: 'history' });
    const recentHistoryStore = this.deps.recentHistoryStore();
    const history = recentHistoryStore
      ? await recentHistoryStore.add(historyItem, window.location.href)
      : [historyItem, ...this.deps.getState().history];
    this.deps.setState({
      ...this.deps.getState(),
      history: history.slice(0, 30),
      message: bookmarkSaveMessage(bookmark, bookmark.label ?? file.name),
      lastUpdatedAt: Date.now(),
    });
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.renderPanelAndRefreshRecall();
    void this.deps.refreshStorageUsage({ render: true });
    return true;
  }

  async addRecentHistory(url: string, thumbnail?: string, options: RecordAddOptions = {}): Promise<void> {
    if (options.projectionId && !this.deps.isProjectionActive(options.projectionId)) return;
    const validation = await this.validateRecordUrlForAdd(url, options);
    if (options.projectionId && !this.deps.isProjectionActive(options.projectionId)) return;
    if (!validation.ok || !validation.sourceUrl) return;
    const resolvedThumbnail = await this.resolveRecordThumbnail(validation.sourceUrl, thumbnail, validation, options);
    if (options.projectionId && !this.deps.isProjectionActive(options.projectionId)) return;
    const next = reducePanelAction(this.deps.getState(), {
      name: 'history/add-loaded',
      url: validation.sourceUrl,
      thumbnail: resolvedThumbnail,
      width: options.width,
      height: options.height,
    }).history;
    const item = next[0];
    if (!item) return;
    if (options.projectionId && !this.deps.isProjectionActive(options.projectionId)) return;
    const recentHistoryStore = this.deps.recentHistoryStore();
    const history = recentHistoryStore ? await recentHistoryStore.add(item, window.location.href) : next;
    if (options.projectionId && !this.deps.isProjectionActive(options.projectionId)) return;
    this.deps.setState({ ...this.deps.getState(), history, lastUpdatedAt: Date.now() });
    this.deps.render();
  }

  async pinRecentHistory(id: string): Promise<void> {
    const record = this.deps.getState().history.find((item) => item.id === id);
    if (!record) return;
    const result = await this.saveRecentRecordAsBookmark(record, { render: false });
    if (!result.ok) {
      this.deps.setState({ ...this.deps.getState(), message: result.message, status: 'error', lastUpdatedAt: Date.now() });
      this.deps.render();
      return;
    }
    await this.markRecentHistoryRowPinned(id, result.record);
    this.deps.renderPanelAndRefreshRecall();
  }

  async saveRecentRecordAsBookmark(
    record: ImageDisplayRecord,
    options: { readonly timestamp?: string; readonly render?: boolean } = {},
  ): Promise<{ readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string }> {
    const timestamp = options.timestamp ?? new Date().toISOString();
    const recordForBookmark = withoutRecentPinState(record);
    const draft = createDisplayRecord({
      ...recordForBookmark,
      id: record.url.startsWith('data:image/') ? record.id : record.url,
      timestamp,
      source: 'bookmark',
    });
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore) {
      return { ok: false, message: 'Bookmark storage is unavailable.' };
    }
    const result = bookmarkStore.saveResult
      ? await bookmarkStore.saveResult(draft)
      : { ok: true as const, record: await bookmarkStore.save(draft) };
    if (!result.ok) return result;
    const bookmark = result.record;
    this.deps.setState({ ...this.deps.getState(), message: bookmarkSaveMessage(bookmark, bookmark.label), lastUpdatedAt: Date.now() });
    await this.deps.loadBookmarkPage(0, { render: false });
    if (options.render !== false) this.deps.renderPanelAndRefreshRecall();
    void this.deps.refreshStorageUsage({ render: options.render !== false });
    return { ok: true, record: bookmark };
  }

  async markRecentHistoryRowPinned(id: string, bookmark: ImageDisplayRecord): Promise<void> {
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'history/mark-pinned',
        id,
        pinnedAt: bookmark.timestamp,
        pinnedRecordId: bookmark.id,
      }),
    );
    const updatedHistory = this.deps.getState().history.find((item) => item.id === id);
    if (!updatedHistory) return;
    const recentHistoryStore = this.deps.recentHistoryStore();
    const history = recentHistoryStore ? await recentHistoryStore.add(updatedHistory, window.location.href) : this.deps.getState().history;
    this.deps.setState({
      ...this.deps.getState(),
      history,
      selectedHistoryIds: this.deps.getState().selectedHistoryIds.filter((selectedId) => history.some((item) => item.id === selectedId)),
      lastUpdatedAt: Date.now(),
    });
  }

  private async resolveRecordThumbnail(
    sourceUrl: string,
    thumbnail: string | undefined,
    validation: ValidatedRecordUrl,
    options: RecordAddOptions,
  ): Promise<string | undefined> {
    if (thumbnail && !isTransientBlobUrl(thumbnail)) return thumbnail;
    if (thumbnail && isTransientBlobUrl(thumbnail)) {
      const durableThumbnail = await this.deps.createThumbnailDataUrlFromUrl(thumbnail);
      if (durableThumbnail) return durableThumbnail;
    }
    if (validation.preloadDataUrl) return (await this.deps.createThumbnailDataUrlFromDataUrl(validation.preloadDataUrl)) ?? undefined;
    if (!options.trustLoadedImage) return undefined;
    return (await this.deps.createThumbnailDataUrlFromUrl(sourceUrl)) ?? sourceUrl;
  }

  private async validateRecordUrlForAdd(url: string, options: RecordAddOptions = {}): Promise<ValidatedRecordUrl> {
    const validation = options.trustLoadedImage ? this.validateLoadedImageUrl(url) : this.validateRecordUrl(url);
    if (!validation.ok || !validation.sourceUrl) return validation;
    if (validation.sourceUrl.startsWith('data:image/')) return validation;
    if (options.trustLoadedImage) return validation;
    const fetchResult = await this.deps.fetchThumbnailSource(validation.sourceUrl);
    if (fetchResult.ok) return { ...validation, preloadDataUrl: fetchResult.dataUrl };

    this.deps.setState({
      ...this.deps.getState(),
      message: `Image Trail could not save this URL because the image failed to load: ${fetchResult.message}`,
      status: 'error',
      lastUpdatedAt: Date.now(),
    });
    this.deps.scheduleFiniteCaptureErrorReset(this.deps.getState().lastUpdatedAt, 'status');
    this.deps.render();
    return { ok: false, message: this.deps.getState().message };
  }

  private validateRecordUrl(url: string): ReturnType<typeof validateImageRecordUrl> {
    const validation = validateImageRecordUrl(url);
    if (!validation.ok) {
      this.deps.setState({
        ...this.deps.getState(),
        message: validation.message ?? 'Image Trail could not save this URL.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
    }
    return validation;
  }

  private validateLoadedImageUrl(url: string): ImageRecordUrlValidation {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(url, document.baseURI);
    } catch {
      return { ok: false, message: 'Image Trail could not save this URL because it is not a valid URL.' };
    }

    if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
      return { ok: false, message: 'Only http(s) image URLs can be saved to Image Trail.' };
    }

    return { ok: true, sourceUrl: sourceUrl.href };
  }

  async removeRecentHistory(id: string): Promise<void> {
    const existing = this.deps.getState().history.find((item) => item.id === id);
    const blobId = existing ? encryptedBlobIdForRecord(existing) : undefined;
    const recentHistoryStore = this.deps.recentHistoryStore();
    const history = recentHistoryStore
      ? await recentHistoryStore.remove(id, window.location.href)
      : reducePanelAction(this.deps.getState(), { name: 'history/remove', id }).history;
    this.deps.setState({ ...this.deps.getState(), history, lastUpdatedAt: Date.now() });
    this.deps.render();
    if (blobId) await this.deps.removeCapturedBlobReference(blobId, { render: true });
  }

  async deleteRecentHistory(): Promise<void> {
    const records = this.deps.getState().history;
    if (records.length === 0) return;
    const recentHistoryStore = this.deps.recentHistoryStore();
    if (recentHistoryStore) {
      for (const record of records) {
        await recentHistoryStore.remove(record.id, window.location.href);
      }
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'history/delete-all' }));
    this.deps.render();
    let removedCapturedBlob = false;
    for (const record of records) {
      const blobId = encryptedBlobIdForRecord(record);
      if (blobId) {
        await this.deps.removeCapturedBlobReference(blobId, { render: false });
        removedCapturedBlob = true;
      }
    }
    if (removedCapturedBlob) await this.deps.refreshStorageUsage({ render: true });
  }

  async loadBookmark(id: string): Promise<void> {
    const bookmark = this.deps.getState().bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    await this.deps.applySelectedUrl(bookmark.url, [], { reason: 'bookmark-load' });
  }

  async removeBookmark(id: string): Promise<void> {
    const bookmark = this.deps.getState().bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    await this.deps.bookmarkStore()?.remove(bookmark);
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'bookmark/remove', id }));
    await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
    this.deps.renderPanelAndRefreshRecall();
    void this.deps.refreshStorageUsage({ render: true });
  }

  async deleteVisibleBookmarks(): Promise<void> {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore || this.deps.getState().bookmarks.length === 0) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await bookmarkStore.removeMany(this.deps.getState().bookmarks.map((bookmark) => bookmark.id));
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import-export/complete',
        message: `Deleted ${result.removedCount} queue item${result.removedCount === 1 ? '' : 's'}.`,
      }),
    );
    this.deps.renderPanelAndRefreshRecall();
    void this.deps.refreshStorageUsage({ render: true });
  }

  async deleteRecallBookmarks(): Promise<void> {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await bookmarkStore.removeRecallPage({
      offset: this.deps.getState().bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      scope: this.deps.getState().bookmarkVisibilityScope,
      currentPageUrl: window.location.href,
    });
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import-export/complete',
        message: `Deleted ${result.removedCount} Recall item${result.removedCount === 1 ? '' : 's'}.`,
      }),
    );
    this.deps.renderPanelAndRefreshRecall();
    void this.deps.refreshStorageUsage({ render: true });
  }

  async refreshBookmarkThumbnails(): Promise<void> {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore) return;
    const bookmarks = this.deps.getState().bookmarks;
    if (bookmarks.length === 0) return;

    this.deps.setState({
      ...this.deps.getState(),
      message: `Refreshing ${bookmarks.length} visible bookmark thumbnail(s)...`,
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();

    let refreshed = 0;
    let unavailable = 0;
    for (const bookmark of bookmarks) {
      const thumbnail = await this.deps.createThumbnailDataUrlFromUrl(bookmark.url);
      if (!thumbnail) {
        unavailable += 1;
        continue;
      }
      await bookmarkStore.save({ ...bookmark, thumbnail });
      refreshed += 1;
    }

    await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
    this.deps.setState({
      ...this.deps.getState(),
      message: `Refreshed ${refreshed} thumbnail${refreshed === 1 ? '' : 's'}${unavailable ? `; ${unavailable} unavailable` : ''}.`,
      lastUpdatedAt: Date.now(),
    });
    this.deps.renderPanelAndRefreshRecall();
  }
}
