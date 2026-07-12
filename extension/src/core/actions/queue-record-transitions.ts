import type { ImageDisplayRecord } from '../display-records.js';
import type { CaptureResult } from '../image/capture-result.js';
import type { PanelState } from '../types.js';

export function updateRecordPinned(
  records: readonly ImageDisplayRecord[],
  sourceRecordId: string,
  pinnedAt: string,
  pinnedRecordId: string,
): readonly ImageDisplayRecord[] {
  return records.map((record) => (record.id === sourceRecordId ? { ...record, pinnedAt, pinnedRecordId } : record));
}

export function updateRecordCapture(
  records: readonly ImageDisplayRecord[],
  sourceRecordId: string | undefined,
  result: CaptureResult & { status: 'captured' },
  capturedAt: string,
): readonly ImageDisplayRecord[] {
  if (!sourceRecordId) return records;
  return records.map((record) =>
    record.id === sourceRecordId
      ? {
          ...record,
          captureStatus: 'captured' as const,
          blobId: result.blobId,
          capturedAt,
          storedOriginal: { blobId: result.blobId, mimeType: result.mimeType, byteLength: result.byteLength, capturedAt },
        }
      : record,
  );
}

export function syncHistoryWithBookmarks(
  history: readonly ImageDisplayRecord[],
  bookmarks: readonly ImageDisplayRecord[],
): readonly ImageDisplayRecord[] {
  if (history.length === 0 || bookmarks.length === 0) return history;
  const bookmarksById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const bookmarksByUrl = new Map(bookmarks.map((bookmark) => [bookmark.url, bookmark]));
  return history.map((record) => {
    const linkedBookmark = record.pinnedRecordId ? bookmarksById.get(record.pinnedRecordId) : undefined;
    const bookmark = linkedBookmark ?? bookmarksByUrl.get(record.url);
    if (!bookmark) return record;
    const pinnedAt = record.pinnedAt ?? bookmark.timestamp;
    const pinnedRecordId = record.pinnedRecordId ?? bookmark.id;
    if (linkedBookmark) {
      return {
        ...record,
        pinnedAt,
        pinnedRecordId,
        captureStatus: bookmark.captureStatus,
        blobId: bookmark.blobId,
        capturedAt: bookmark.capturedAt,
        storedOriginal: bookmark.storedOriginal,
      };
    }
    if (bookmark.captureStatus !== 'captured') return { ...record, pinnedAt, pinnedRecordId };
    return {
      ...record,
      pinnedAt,
      pinnedRecordId,
      captureStatus: bookmark.captureStatus,
      blobId: bookmark.blobId,
      capturedAt: bookmark.capturedAt,
      storedOriginal: bookmark.storedOriginal,
    };
  });
}

function captureMatchesRecord(record: ImageDisplayRecord, id: string, blobId?: string): boolean {
  return (
    record.id === id ||
    (blobId !== undefined &&
      (record.blobId === blobId || record.storedOriginal?.blobId === blobId || record.protectedPin?.storedOriginalBlobId === blobId))
  );
}

export function clearRecordCapture<T extends ImageDisplayRecord>(records: readonly T[], id: string, blobId?: string): readonly T[] {
  return records.map((record) => {
    if (!captureMatchesRecord(record, id, blobId)) return record;
    const protectedPin = record.protectedPin
      ? { ...record.protectedPin, storedOriginalBlobId: undefined, hasStoredOriginal: false }
      : undefined;
    return {
      ...record,
      captureStatus: undefined,
      blobId: undefined,
      capturedAt: undefined,
      storedOriginal: undefined,
      protectedPin,
    } as T;
  });
}

export function removeRecallCandidate(recall: PanelState['recall'], id: string): PanelState['recall'] {
  const candidates = recall.candidates.filter((candidate) => candidate.id !== id);
  if (candidates.length === recall.candidates.length) return recall;
  const removedCount = recall.candidates.length - candidates.length;
  return {
    ...recall,
    candidates,
    selectedIds: recall.selectedIds.filter((selectedId) => selectedId !== id),
    nextOffset: Math.max(0, recall.nextOffset - removedCount),
    total: Math.max(0, recall.total - removedCount),
  };
}

export function unlinkHistoryFromBookmark(history: readonly ImageDisplayRecord[], bookmarkId: string): readonly ImageDisplayRecord[] {
  return history.map((record) =>
    record.pinnedRecordId === bookmarkId
      ? {
          ...record,
          pinnedAt: undefined,
          pinnedRecordId: undefined,
          captureStatus: undefined,
          blobId: undefined,
          capturedAt: undefined,
          storedOriginal: undefined,
        }
      : record,
  );
}
