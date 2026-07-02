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

// Which byte budget a source fetch should use. 'thumbnail' is the small budget for generating
// 256px thumbnails; 'navigation' matches the buffered/display budget used for the projected
// parsed-field navigation image (and the request-policy check), so a load and its skip-policy
// lookup can never disagree on the cache key.
export type ImageSourceProfile = 'thumbnail' | 'navigation';

export interface ImageRequestContext {
  readonly intent: ImageRequestIntent;
  readonly referrer?: string;
  readonly contextKey?: string;
}
