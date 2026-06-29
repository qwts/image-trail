export type ImageRequestIntent =
  | 'field-speculative-probe'
  | 'field-active-navigation'
  | 'url-editor-apply'
  | 'recent-load'
  | 'bookmark-load'
  | 'pin-load'
  | 'thumbnail-refresh'
  | 'capture-original';

export type ImageProbeMethod = 'get' | 'head';

export interface ImageRequestContext {
  readonly intent: ImageRequestIntent;
  readonly referrer?: string;
  readonly contextKey?: string;
}
