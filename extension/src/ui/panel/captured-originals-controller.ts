import type { CaptureStore } from '../../content/capture-controller.js';
import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import { reducePanelAction } from '../../core/actions.js';
import {
  createDisplayRecord,
  isDurableImageSourceUrl,
  recordHasStoredOriginal,
  withoutStoredOriginal,
} from '../../core/display-records.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import { isCapturedResult, type CaptureResult, type CaptureRetryRequest, type CaptureSourceType } from '../../core/image/capture-result.js';
import type { BookmarkStore, PanelState } from '../../core/types.js';
import { bookmarkSaveMessage, recordHasBlobId } from './record-export-helpers.js';
import { MissingOriginalRepairController } from './missing-original-repair-controller.js';

function captureRetryMatches(left: CaptureRetryRequest | null, right: CaptureRetryRequest): boolean {
  return left?.url === right.url && left.sourceType === right.sourceType && left.sourceRecordId === right.sourceRecordId;
}

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
  refreshStorageUsage(options?: { readonly render?: boolean | undefined }): Promise<void>;
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
  private capturePreflightInProgress = false;
  private readonly missingOriginalRepair: MissingOriginalRepairController;

  constructor(private readonly deps: CapturedOriginalsControllerDeps) {
    this.missingOriginalRepair = new MissingOriginalRepairController({
      ...deps,
      captureBookmark: (record) => this.repairBookmarkOriginal(record),
    });
  }

  repairSelectedOriginals(ids: readonly string[]): Promise<void> {
    return this.missingOriginalRepair.repairSelected(ids);
  }

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
    await this.captureImageWithOptions(url, sourceType, sourceRecordId);
  }

  async repairBookmarkOriginal(record: ImageDisplayRecord): Promise<CaptureResult | null> {
    return this.captureImageWithOptions(record.url, 'bookmark', record.id, { skipStoredOriginalPreflight: true });
  }

  private async captureImageWithOptions(
    url: string,
    sourceType: CaptureSourceType,
    sourceRecordId?: string,
    options: { readonly skipStoredOriginalPreflight?: boolean } = {},
  ): Promise<CaptureResult | null> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return null;
    if (this.deps.getState().captureInProgress || this.capturePreflightInProgress) return null;
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
      return null;
    }
    if (!options.skipStoredOriginalPreflight) {
      const existingSavedRecord = await this.findSavedRecordDuringCapturePreflight(url);
      if (existingSavedRecord && recordHasStoredOriginal(existingSavedRecord)) {
        await this.useExistingStoredOriginal(url, sourceType, sourceRecordId, existingSavedRecord);
        return null;
      }
    }
    const request: CaptureRetryRequest = { url, sourceType, sourceRecordId };
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'capture/start', request }));
    this.deps.render();
    const result = await captureStore.requestCapture(url, sourceType, sourceRecordId);
    await this.completeCapture(result, url, sourceType, sourceRecordId);
    return result;
  }

  /**
   * Starts with the permission request so Chrome sees it in the button's user-gesture call stack;
   * unlike a normal capture, this path must not await bookmark preflight first.
   */
  async retryCaptureWithPermission(request: CaptureRetryRequest): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore || this.deps.getState().captureInProgress || this.capturePreflightInProgress) return;
    if (!captureRetryMatches(this.deps.getState().captureRetryRequest, request)) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'capture/start', request }));
    this.deps.render();
    const result = await captureStore.requestPermissionAndRetry(request.url, request.sourceType, request.sourceRecordId);
    await this.completeCapture(result, request.url, request.sourceType, request.sourceRecordId);
  }

  private async completeCapture(result: CaptureResult, url: string, sourceType: CaptureSourceType, sourceRecordId?: string): Promise<void> {
    const request = { url, sourceType, sourceRecordId };
    if (isCapturedResult(result) && sourceType !== 'target' && !captureRetryMatches(this.deps.getState().captureRetryRequest, request)) {
      await this.discardDetachedCapture(result, sourceType);
      return;
    }
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
          this.deps.setState(
            reducePanelAction(this.deps.getState(), { name: 'capture/delete', id: sourceRecordId, blobId: result.blobId }),
          );
          const clearedHistory = this.deps.getState().history.find((item) => item.id === sourceRecordId);
          await this.removeCapturedBlobReference(result.blobId);
          const recentHistoryStore = this.deps.recentHistoryStore();
          const history =
            recentHistoryStore && clearedHistory
              ? await recentHistoryStore.add(clearedHistory, window.location.href)
              : this.deps.getState().history;
          this.deps.setState({
            ...this.deps.getState(),
            history,
            message: `Captured original was discarded because the recent row was not pinned: ${saved.message}`,
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

  private async discardDetachedCapture(
    result: CaptureResult & { readonly status: 'captured' },
    sourceType: CaptureSourceType,
  ): Promise<void> {
    await this.removeCapturedBlobReference(result.blobId);
    const sourceLabel = sourceType === 'history' ? 'recent row' : 'queue row';
    const message = `Captured original was discarded because its ${sourceLabel} was removed.`;
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'capture/complete',
        result: { status: 'failed', reason: 'unknown', message },
      }),
    );
    this.deps.setState({ ...this.deps.getState(), message, status: 'error', lastUpdatedAt: Date.now() });
    this.deps.render();
  }

  async deleteCapturedBlob(recordId: string, blobId: string): Promise<void> {
    if (!this.deps.captureStore()) return;
    const sourceRecord = this.findRecordForDelete(recordId, blobId);
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'capture/delete', id: recordId, blobId }));
    const updatedHistory = this.deps.getState().history.find((b) => b.id === recordId);
    const recentHistoryStore = this.deps.recentHistoryStore();
    if (updatedHistory && recentHistoryStore) {
      const history = await recentHistoryStore.add(updatedHistory, window.location.href);
      this.deps.setState({ ...this.deps.getState(), history, lastUpdatedAt: Date.now() });
    }
    const visibleBookmark = this.deps
      .getState()
      .bookmarks.find((bookmark) => bookmark.id === recordId || recordHasBlobId(bookmark, blobId));
    const updatedBookmark = visibleBookmark ?? (await this.findSavedRecordForDelete(sourceRecord, blobId));
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

  private async findSavedRecordByUrl(url: string): Promise<ImageDisplayRecord | null> {
    return (await this.deps.bookmarkStore()?.findByUrl(url)) ?? null;
  }

  private async findSavedRecordDuringCapturePreflight(url: string): Promise<ImageDisplayRecord | null> {
    this.capturePreflightInProgress = true;
    try {
      return await this.findSavedRecordByUrl(url);
    } finally {
      this.capturePreflightInProgress = false;
    }
  }

  private async useExistingStoredOriginal(
    url: string,
    sourceType: CaptureSourceType,
    sourceRecordId: string | undefined,
    savedRecord: ImageDisplayRecord,
  ): Promise<void> {
    if (sourceType === 'history' && sourceRecordId) {
      await this.deps.markRecentHistoryRowPinned(sourceRecordId, savedRecord);
    }
    if (sourceType === 'target' || sourceType === 'history') {
      await this.deps.loadBookmarkPage(0, { render: false });
    } else {
      await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
    }
    this.deps.setState({
      ...this.deps.getState(),
      message: `Original already stored for ${savedRecord.label ?? url}.`,
      status: 'ready',
      lastUpdatedAt: Date.now(),
    });
    this.deps.renderPanelAndRefreshRecall();
  }

  private findRecordForDelete(recordId: string, blobId: string): ImageDisplayRecord | undefined {
    return [...this.deps.getState().history, ...this.deps.getState().bookmarks, ...this.deps.getState().recall.candidates].find(
      (record) => record.id === recordId || recordHasBlobId(record, blobId),
    );
  }

  private async findSavedRecordForDelete(sourceRecord: ImageDisplayRecord | undefined, blobId: string): Promise<ImageDisplayRecord | null> {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore || !sourceRecord) return null;
    const linked = sourceRecord.pinnedRecordId ? (await bookmarkStore.loadByIds([sourceRecord.pinnedRecordId]))[0] : undefined;
    const saved = linked ?? (await bookmarkStore.findByUrl(sourceRecord.url));
    if (!saved || !recordHasBlobId(saved, blobId)) return null;
    return withoutStoredOriginal(saved);
  }
}
