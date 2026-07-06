import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../core/schema-assert.js';
import type { PlaintextLocalSettings } from './local-settings.js';

/**
 * Structural validation only: literal unions are pinned, but numeric range
 * clamping stays in `migrateLocalSettings`, which is the single place that
 * repairs out-of-range values into safe defaults.
 */
export const plaintextLocalSettingsSchema = v.object({
  schemaVersion: v.literal(1),
  showHistoryThumbnails: v.boolean(),
  requestThrottleMs: v.number(),
  requestThrottleMaxRequests: v.number(),
  requestThrottleWindowMs: v.number(),
  panelDock: v.picklist(['right', 'left']),
  visibleBookmarkSoftMax: v.number(),
  galleryPageLimit: v.number(),
  recentHistoryLimit: v.number(),
  recentHistoryRetainedLimit: v.number(),
  recentHistoryOverflowBehavior: v.picklist(['drop-oldest', 'keep-session']),
  bookmarkVisibilityScope: v.picklist(['global', 'site']),
  pinSaveStoragePreference: v.picklist(['encrypted', 'plaintext']),
  privacyModeEnabled: v.boolean(),
  buildInfoOverlayVisible: v.boolean(),
  previewObjectFit: v.picklist(['contain', 'cover', 'fill', 'none', 'scale-down']),
  previewFillScreen: v.boolean(),
  urlReviewStatusLimit: v.number(),
  clearUrlReviewStatusAfterExport: v.boolean(),
  neighborPreloadEnabled: v.boolean(),
  neighborPreloadRadius: v.number(),
  neighborPreloadCacheLimit: v.number(),
  neighborPreloadProbeMethod: v.picklist(['get', 'head']),
  secondaryControlsOpen: v.boolean(),
  restoreWorkspaceLayout: v.boolean(),
});

type _AssertPlaintextLocalSettings = Assert<MutuallyAssignable<v.InferOutput<typeof plaintextLocalSettingsSchema>, PlaintextLocalSettings>>;
