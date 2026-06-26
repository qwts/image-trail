export const VISIBLE_BOOKMARK_SOFT_MAX_LIMITS = {
  min: 1,
  max: 200,
} as const;

export const RECENT_HISTORY_LIMITS = {
  min: 1,
  max: 200,
} as const;

export const URL_REVIEW_STATUS_LIMITS = {
  min: 10,
  max: 20_000,
} as const;

export const DEFAULT_URL_REVIEW_STATUS_LIMIT = 5_000;

export const NEIGHBOR_PRELOAD_RADIUS_LIMITS = {
  min: 0,
  max: 5,
} as const;

export const DEFAULT_NEIGHBOR_PRELOAD_RADIUS = 1;

export const NEIGHBOR_PRELOAD_CACHE_LIMITS = {
  min: 0,
  max: 500,
} as const;

export const DEFAULT_NEIGHBOR_PRELOAD_CACHE_LIMIT = 24;
