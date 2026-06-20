export const THUMBNAIL_MAX_EDGE = 256;

export interface ThumbnailSize {
  readonly width: number;
  readonly height: number;
}

export function fitThumbnailSize(input: ThumbnailSize, maxEdge = THUMBNAIL_MAX_EDGE): ThumbnailSize {
  if (input.width <= 0 || input.height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(input.width, input.height));
  return {
    width: Math.max(1, Math.round(input.width * scale)),
    height: Math.max(1, Math.round(input.height * scale)),
  };
}
