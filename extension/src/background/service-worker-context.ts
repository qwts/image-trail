import type { PanelPositionStore, ParsedFieldStateStore, UrlReviewStatusStore, UrlTemplateStore } from '../core/types.js';
import type { IndexedDbBookmarkStore } from '../data/bookmarks-controller.js';
import type { DEFAULT_LOCAL_SETTINGS } from '../data/local-settings.js';
import type { ImageRequestManager } from './image-request-manager.js';
import type { RecentHistoryCache } from './recent-history-cache.js';

/**
 * Stores and services owned by the service-worker composition root and handed
 * to extracted handler modules. Handler modules must receive these through a
 * focused subset (`Pick<ServiceWorkerContext, ...>`) instead of importing
 * `service-worker.ts` module globals, so the composition root remains the one
 * place that constructs and wires them.
 */
export interface ServiceWorkerContext {
  readonly bookmarkStore: IndexedDbBookmarkStore;
  readonly panelPositionStore: PanelPositionStore;
  readonly parsedFieldStateStore: ParsedFieldStateStore;
  readonly urlReviewStatusStore: UrlReviewStatusStore;
  readonly urlTemplateStore: UrlTemplateStore;
  readonly recentHistoryCache: RecentHistoryCache;
  readonly imageRequests: ImageRequestManager;
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly loadLocalSettings: () => Promise<typeof DEFAULT_LOCAL_SETTINGS>;
}
