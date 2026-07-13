import type { QueueDisplayOrder } from '../../core/display-order.js';

export type BookmarkAction =
  | { readonly name: 'pin/current' }
  | { readonly name: 'bookmark/current' }
  | { readonly name: 'bookmark/load'; readonly id: string }
  | { readonly name: 'bookmark/remove'; readonly id: string }
  | { readonly name: 'bookmark/clear'; readonly id: string }
  | { readonly name: 'bookmark-selection/toggle'; readonly id: string }
  | { readonly name: 'bookmark-selection/single'; readonly id: string }
  | { readonly name: 'bookmark-selection/select'; readonly ids: readonly string[]; readonly mode?: 'replace' | 'add' }
  | { readonly name: 'bookmark-selection/clear' }
  | { readonly name: 'bookmarks/page-front' }
  | { readonly name: 'bookmarks/page-back' }
  | { readonly name: 'bookmarks/update-display-order'; readonly order: QueueDisplayOrder }
  | { readonly name: 'bookmarks/toggle-scope' }
  | { readonly name: 'bookmarks/clear-visible' }
  | { readonly name: 'bookmarks/reload' }
  | { readonly name: 'bookmarks/refresh-thumbnails' }
  | { readonly name: 'gallery/open' }
  | { readonly name: 'recall/open'; readonly side: 'left' | 'right' }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'bookmark'; readonly sourceRecordId: string }
  | { readonly name: 'capture/repair-selected'; readonly ids: readonly string[] }
  | {
      readonly name: 'capture/preview';
      readonly url: string;
      readonly blobId?: string | undefined;
      readonly scrollAnchorId?: string | undefined;
    }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string }
  | { readonly name: 'panel/bookmarks-section-open'; readonly open: boolean };
