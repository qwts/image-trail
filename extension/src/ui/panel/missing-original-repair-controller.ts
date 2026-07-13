import type { CaptureStore } from '../../content/capture-controller.js';
import { isDurableImageSourceUrl, type ImageDisplayRecord } from '../../core/display-records.js';
import type { CaptureResult } from '../../core/image/capture-result.js';
import type { BookmarkStore, PanelState } from '../../core/types.js';

export interface MissingOriginalRepairControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  captureStore(): CaptureStore | null;
  bookmarkStore(): BookmarkStore | null;
  captureBookmark(record: ImageDisplayRecord): Promise<CaptureResult | null>;
}

function originalBlobId(record: ImageDisplayRecord): string | undefined {
  return record.storedOriginal?.blobId ?? record.blobId ?? record.protectedPin?.storedOriginalBlobId;
}

function hasRepairableUrl(record: ImageDisplayRecord): boolean {
  return record.privacyStatus !== 'locked' && (record.url.startsWith('data:image/') || isDurableImageSourceUrl(record.url));
}

function uniqueIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids.filter(Boolean))];
}

export class MissingOriginalRepairController {
  private repairInProgress = false;

  constructor(private readonly deps: MissingOriginalRepairControllerDeps) {}

  async repairSelected(ids: readonly string[]): Promise<void> {
    if (this.repairInProgress || this.deps.getState().captureInProgress) return;
    const selectedIds = uniqueIds(ids);
    const captureStore = this.deps.captureStore();
    const bookmarkStore = this.deps.bookmarkStore();
    if (selectedIds.length === 0 || !captureStore || !bookmarkStore) return;

    this.repairInProgress = true;
    try {
      this.setMessage('Checking selected queue originals...', 'ready');
      const loaded = await bookmarkStore.loadByIds(selectedIds);
      const byId = new Map(loaded.map((record) => [record.id, record]));
      const selected = selectedIds.map((id) => byId.get(id)).filter((record): record is ImageDisplayRecord => !!record);
      if (selected.length === 0) {
        this.setMessage('Selected queue rows are no longer available.', 'error');
        return;
      }

      const referencedBlobIds = selected.map(originalBlobId).filter((blobId): blobId is string => !!blobId);
      const verification = await captureStore.requestOriginalBlobRecords(referencedBlobIds);
      if (!verification.ok) {
        this.setMessage(`Could not verify selected originals: ${verification.message}`, 'error');
        return;
      }

      const missingBlobIds = new Set(verification.missingBlobIds);
      const missing = selected.filter((record) => {
        const blobId = originalBlobId(record);
        return !blobId || missingBlobIds.has(blobId);
      });
      if (missing.length === 0) {
        this.setMessage('Selected queue originals are already present.', 'ready');
        return;
      }

      const repairable = missing.filter(hasRepairableUrl);
      if (repairable.length === 0) {
        this.setMessage('Selected missing originals do not have a repairable image URL.', 'error');
        return;
      }

      let repairedCount = 0;
      for (const record of repairable) {
        const result = await this.deps.captureBookmark(record);
        if (!result) {
          this.setMessage('Missing-original repair paused because capture became unavailable.', 'error');
          return;
        }
        if (result.status !== 'captured') {
          this.setMessage(result.message, 'error');
          return;
        }
        repairedCount += 1;
      }
      const skippedCount = missing.length - repairable.length;
      const skipped = skippedCount > 0 ? ` Skipped ${skippedCount} row${skippedCount === 1 ? '' : 's'} without a usable source URL.` : '';
      this.setMessage(
        `Repaired ${repairedCount} missing original${repairedCount === 1 ? '' : 's'} without changing queue order.${skipped}`,
        'ready',
      );
    } finally {
      this.repairInProgress = false;
    }
  }

  private setMessage(message: string, status: PanelState['status']): void {
    this.deps.setState({ ...this.deps.getState(), message, status, lastUpdatedAt: Date.now() });
    this.deps.render();
  }
}
