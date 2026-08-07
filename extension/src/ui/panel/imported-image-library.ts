import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { BookmarkStore, ImportedImageFile } from '../../core/types.js';
import { bookmarkSaveMessage } from './record-export-helpers.js';
import { createImportedMediaRecords, type CapturedImportedMedia } from './imported-media-record.js';
import { addProtectedImportedImageToLibrary, type ProtectedImageImportLibraryDeps } from './protected-image-import-controller.js';

export type RecordLibraryImportInput = ImportedImageFile | { readonly durableRecord: ImageDisplayRecord };

export interface ImportedImageLibraryDeps extends ProtectedImageImportLibraryDeps {
  bookmarkStore(): BookmarkStore | null;
}

export async function addImportedImageToLibrary(
  deps: ImportedImageLibraryDeps,
  file: RecordLibraryImportInput,
  captured?: CapturedImportedMedia,
): Promise<boolean> {
  if ('durableRecord' in file) return addProtectedImportedImageToLibrary(deps, file.durableRecord);
  const records = createImportedMediaRecords(file, captured);
  if (!records) return false;
  const bookmarkStore = deps.bookmarkStore();
  const bookmark = bookmarkStore ? await bookmarkStore.save(records.bookmark) : records.bookmark;
  const historyItem = { ...records.history, pinnedRecordId: bookmark.id, pinnedAt: bookmark.queueUpdatedAt ?? bookmark.timestamp };
  const recentHistoryStore = deps.recentHistoryStore();
  const history = recentHistoryStore
    ? await recentHistoryStore.add(historyItem, window.location.href, { scope: deps.getState().recentHistoryScope })
    : [historyItem, ...deps.getState().history];
  deps.setState({
    ...deps.getState(),
    history: history.slice(0, 30),
    message: bookmarkSaveMessage(bookmark, bookmark.label ?? file.name),
    lastUpdatedAt: Date.now(),
  });
  await deps.loadBookmarkPage(0, { render: false });
  deps.renderPanelAndRefreshRecall();
  void deps.refreshStorageUsage({ render: true });
  return true;
}
