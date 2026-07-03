import type { CaptureStore } from '../../content/capture-controller.js';
import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import { reducePanelAction } from '../../core/actions.js';
import { createDisplayRecord, isDurableImageSourceUrl } from '../../core/display-records.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import { isCapturedResult } from '../../core/image/capture-result.js';
import type { BookmarkStore, CaptureSourceType, PanelState } from '../../core/types.js';
import { bookmarkSaveMessage, recordHasBlobId } from './record-export-helpers.js';

function parseDimensionText(value: string | null): { readonly width?: number; readonly height?: number } {
  const match = value?.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/iu);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

export interface CapturedOriginalsControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(options?: { readonly includeRecall?: boolean }): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  refreshStorageUsage(options?: { readonly render?: boolean }): Promise<void>;
  applyStorageUsage(usage: NonNullable<PanelState['storageUsage']>): void;
  // Cancels in-flight storage-usage refreshes (the panel-owned request-id bump) so a stale response
  // cannot overwrite the usage snapshot this controller just applied.
  invalidateStorageUsageRequests(): void;
  scheduleFiniteCaptureErrorReset(updatedAt: number, mode: 'status' | 'capture-result'): void;
  refreshBlobKeyStatus(): Promise<void>;
  saveRecentRecordAsBookmark(
    record: ImageDisplayRecord,
    options?: { readonly timestamp?: string; readonly render?: boolean },
  ): Promise<{ readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string }>;
  markRecentHistoryRowPinned(id: string, bookmark: ImageDisplayRecord): Promise<void>;
  captureStore(): CaptureStore | null;
  bookmarkStore(): BookmarkStore | null;
  recentHistoryStore(): RecentHistoryStore | null;
}

/**
 * Captured-original (encrypted blob) flows, moved verbatim off `ImageTrailPanel`: capture with its
 * per-source-type pin/save orchestration, blob-reference deletion, and orphan cleanup. The
 * bookmark/recent-history CRUD lives in `RecordLibraryController`; the two reach each other only
 * through panel-mediated deps callbacks.
 */
export class CapturedOriginalsController {
  constructor(private readonly deps: CapturedOriginalsControllerDeps) {}

  async removeCapturedBlobReference(blobId: string, options: { readonly render?: boolean } = {}): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    try {
      const { usage } = await captureStore.requestDeleteBlob(blobId);
      this.deps.applyStorageUsage(usage);
      if (options.render) this.deps.render();
    } catch {
      void this.deps.refreshStorageUsage({ render: options.render });
    }
  }

  async cleanupOrphanedBlobs(): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const { deletedCount, usage } = await captureStore.requestCleanupOrphanedBlobs();
    this.deps.setState(
      reducePanelAction(
        {
          ...this.deps.getState(),
          message: `Cleaned up ${deletedCount} unused original${deletedCount === 1 ? '' : 's'}.`,
          status: 'ready',
          lastUpdatedAt: Date.now(),
        },
        { name: 'storage/update', usage },
      ),
    );
    this.deps.invalidateStorageUsageRequests();
    this.deps.render({ includeRecall: false });
  }

  async captureImage(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    if (this.deps.getState().captureInProgress) return;
    const isImportedImage = url.startsWith('data:image/');
    if (!isImportedImage && !isDurableImageSourceUrl(url)) {
      const lastUpdatedAt = Date.now();
      this.deps.setState({
        ...this.deps.getState(),
        message: 'Only http(s) image URLs can be captured as encrypted originals.',
        status: 'error',
        lastUpdatedAt,
      });
      this.deps.render();
      this.deps.scheduleFiniteCaptureErrorReset(lastUpdatedAt, 'status');
      return;
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'capture/start' }));
    this.deps.render();
    const result = await captureStore.requestCapture(url, sourceType, sourceRecordId);
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'capture/complete', result, sourceRecordId }));
    let queueChanged = false;
    const finiteCaptureResultError =
      (result.status === 'failed' || result.status === 'remote-only') &&
      (result.reason === 'encryption-locked' || result.reason === 'auth-required');
    if ((result.status === 'failed' || result.status === 'remote-only') && result.reason === 'encryption-locked') {
      await this.deps.refreshBlobKeyStatus();
    }
    if (isCapturedResult(result) && sourceType === 'history' && sourceRecordId) {
      const updatedHistory = this.deps.getState().history.find((item) => item.id === sourceRecordId);
      if (updatedHistory) {
        const saved = await this.deps.saveRecentRecordAsBookmark(updatedHistory, { render: false });
        if (saved.ok) {
          await this.deps.markRecentHistoryRowPinned(sourceRecordId, saved.record);
          this.deps.setState({
            ...this.deps.getState(),
            message: `Captured ${(result.byteLength / 1024).toFixed(1)} KB image. ${bookmarkSaveMessage(saved.record, saved.record.label)}`,
            lastUpdatedAt: Date.now(),
          });
          queueChanged = true;
        } else {
          const recentHistoryStore = this.deps.recentHistoryStore();
          const history = recentHistoryStore
            ? await recentHistoryStore.add(updatedHistory, window.location.href)
            : this.deps.getState().history;
          this.deps.setState({
            ...this.deps.getState(),
            history,
            message: `Captured ${(result.byteLength / 1024).toFixed(1)} KB image, but the recent row was not pinned: ${saved.message}`,
            status: 'error',
            lastUpdatedAt: Date.now(),
          });
        }
      }
    }
    if (isCapturedResult(result) && sourceType === 'target') {
      const capturedAt = new Date().toISOString();
      const dimensions = parseDimensionText(this.deps.getState().target.selectedDimensions);
      const draft = createDisplayRecord({
        id: url,
        url,
        timestamp: capturedAt,
        width: dimensions.width,
        height: dimensions.height,
        source: 'bookmark',
        capturedAt,
        captureStatus: 'captured',
        blobId: result.blobId,
        storedOriginal: {
          blobId: result.blobId,
          mimeType: result.mimeType,
          byteLength: result.byteLength,
          capturedAt,
        },
      });
      const bookmarkStore = this.deps.bookmarkStore();
      if (!bookmarkStore) {
        await this.removeCapturedBlobReference(result.blobId);
        this.deps.setState({
          ...this.deps.getState(),
          message: 'Captured original was discarded because bookmark storage is unavailable.',
          status: 'error',
          lastUpdatedAt: Date.now(),
        });
      } else {
        const saved = bookmarkStore.saveResult
          ? await bookmarkStore.saveResult(draft)
          : { ok: true as const, record: await bookmarkStore.save(draft) };
        if (saved.ok) {
          await this.deps.loadBookmarkPage(0, { render: false });
          this.deps.setState({
            ...this.deps.getState(),
            message: `Captured ${(result.byteLength / 1024).toFixed(1)} KB image. ${bookmarkSaveMessage(saved.record, saved.record.label)}`,
            lastUpdatedAt: Date.now(),
          });
          queueChanged = true;
        } else {
          await this.removeCapturedBlobReference(result.blobId);
          this.deps.setState({
            ...this.deps.getState(),
            message: `Captured original was discarded because the target pin was not saved: ${saved.message}`,
            status: 'error',
            lastUpdatedAt: Date.now(),
          });
        }
      }
    }
    const bookmarkStoreForSource = this.deps.bookmarkStore();
    if (isCapturedResult(result) && sourceType === 'bookmark' && sourceRecordId && bookmarkStoreForSource) {
      const updatedBookmark = this.deps.getState().bookmarks.find((b) => b.id === sourceRecordId);
      if (updatedBookmark) {
        await bookmarkStoreForSource.save(updatedBookmark);
        await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
        queueChanged = true;
      }
    }
    await this.deps.refreshStorageUsage();
    if (finiteCaptureResultError) this.deps.scheduleFiniteCaptureErrorReset(this.deps.getState().lastUpdatedAt, 'capture-result');
    if (queueChanged) {
      this.deps.renderPanelAndRefreshRecall();
    } else {
      this.deps.render();
    }
  }

  async deleteCapturedBlob(recordId: string, blobId: string): Promise<void> {
    if (!this.deps.captureStore()) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'capture/delete', id: recordId, blobId }));
    const updatedHistory = this.deps.getState().history.find((b) => b.id === recordId);
    const recentHistoryStore = this.deps.recentHistoryStore();
    if (updatedHistory && recentHistoryStore) {
      const history = await recentHistoryStore.add(updatedHistory, window.location.href);
      this.deps.setState({ ...this.deps.getState(), history, lastUpdatedAt: Date.now() });
    }
    const updatedBookmark = this.deps
      .getState()
      .bookmarks.find((bookmark) => bookmark.id === recordId || recordHasBlobId(bookmark, blobId));
    let queueChanged = false;
    const bookmarkStore = this.deps.bookmarkStore();
    if (updatedBookmark && bookmarkStore) {
      await bookmarkStore.save(updatedBookmark);
      await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
      queueChanged = true;
    }
    if (queueChanged) {
      this.deps.renderPanelAndRefreshRecall();
    } else {
      this.deps.render();
    }
    void this.removeCapturedBlobReference(blobId, { render: true });
  }
}
