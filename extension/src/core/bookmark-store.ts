import type { ImageDisplayRecord } from './display-records.js';
import type { StorageUsageSummary } from './image/capture-result.js';
import type { QueueDisplayOrder } from './display-order.js';
import type { BookmarkSaveOptions } from './bookmark-save-options.js';

export interface BookmarkStore {
  readonly load: () => Promise<readonly ImageDisplayRecord[]>;
  readonly getStorageUsage?: () => Promise<StorageUsageSummary>;
  readonly loadOriginalBlobIds: () => Promise<ReadonlySet<string>>;
  readonly loadPage: (input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
    readonly displayOrder?: QueueDisplayOrder | undefined;
  }) => Promise<{
    readonly items: readonly ImageDisplayRecord[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  }>;
  readonly loadByIds: (ids: readonly string[]) => Promise<readonly ImageDisplayRecord[]>;
  readonly findByUrl: (url: string) => Promise<ImageDisplayRecord | null>;
  readonly save: (record: ImageDisplayRecord, options?: BookmarkSaveOptions) => Promise<ImageDisplayRecord>;
  readonly saveResult?: (
    record: ImageDisplayRecord,
    options?: BookmarkSaveOptions,
  ) => Promise<{ readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string }>;
  readonly remove: (record: ImageDisplayRecord) => Promise<void>;
  readonly removeMany: (ids: readonly string[]) => Promise<{ readonly removedCount: number }>;
  readonly removeRecallPage: (input: {
    readonly offset: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
  }) => Promise<{ readonly removedCount: number }>;
}
