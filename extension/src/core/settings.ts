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
