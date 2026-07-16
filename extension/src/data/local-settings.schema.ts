import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../core/schema-assert.js';
import type { PlaintextLocalSettings } from './local-settings.js';

/**
 * Structural validation only: literal unions are pinned, but numeric range
 * clamping stays in `migrateLocalSettings`, which is the single place that
 * repairs out-of-range values into safe defaults.
 */
const recentSparseRowDisplayModeSchema = v.picklist(['adaptive', 'full', 'half', 'compact']);
const pageContextOverridesSchema = v.record(
  v.string(),
  v.object({ context: v.picklist(['single', 'gallery', 'feed']), updatedAt: v.number() }),
);
const searchableMetadataPolicyEntries = {
  urlDerived: v.picklist(['plaintext', 'encrypted']),
  albumName: v.picklist(['plaintext', 'encrypted']),
};

const plaintextLocalSettingsEntries = {
  schemaVersion: v.literal(1),
  requestThrottleMs: v.number(),
  requestThrottleMaxRequests: v.number(),
  requestThrottleWindowMs: v.number(),
  visibleBookmarkSoftMax: v.number(),
  galleryPageLimit: v.number(),
  recentHistoryLimit: v.number(),
  recentHistoryRetainedLimit: v.number(),
  recentHistoryOverflowBehavior: v.picklist(['drop-oldest', 'keep-session']),
  recentSparseRowDisplayMode: recentSparseRowDisplayModeSchema,
  recentDisplayOrder: v.picklist(['newest-first', 'oldest-first']),
  bookmarkVisibilityScope: v.picklist(['global', 'site']),
  queueDisplayOrder: v.picklist(['front-first', 'back-first']),
  pinSaveStoragePreference: v.picklist(['encrypted', 'plaintext']),
  blobKeyInactivityTimeoutMinutes: v.picklist([5, 10, 15, 'never']),
  privacyModeEnabled: v.boolean(),
  searchableMetadataPolicy: v.object({ ...searchableMetadataPolicyEntries, thumbnail: v.literal('encrypted') }),
  buildInfoOverlayVisible: v.boolean(),
  previewObjectFit: v.picklist(['contain', 'cover', 'fill', 'none', 'scale-down']),
  previewFillScreen: v.boolean(),
  urlReviewStatusLimit: v.number(),
  clearUrlReviewStatusAfterExport: v.boolean(),
  neighborPreloadEnabled: v.boolean(),
  neighborPreloadRadius: v.number(),
  neighborPreloadCacheLimit: v.number(),
  neighborPreloadProbeMethod: v.picklist(['get', 'head']),
  loadFailureFeedback: v.picklist(['alert', 'display', 'mute']),
  downArrowAction: v.picklist(['capture', 'download', 'off']),
  secondaryControlsOpen: v.boolean(),
  restoreWorkspaceLayout: v.boolean(),
  pageContextOverrides: pageContextOverridesSchema,
};

export const plaintextLocalSettingsSchema = v.object(plaintextLocalSettingsEntries);

export const saveLocalSettingsPayloadSchema = v.object({
  ...plaintextLocalSettingsEntries,
  recentSparseRowDisplayMode: v.optional(recentSparseRowDisplayModeSchema),
  recentDisplayOrder: v.optional(v.picklist(['newest-first', 'oldest-first'])),
  queueDisplayOrder: v.optional(v.picklist(['front-first', 'back-first'])),
  downArrowAction: v.optional(v.picklist(['capture', 'download', 'off'])),
  pageContextOverrides: v.optional(pageContextOverridesSchema),
  searchableMetadataPolicy: v.object({
    ...searchableMetadataPolicyEntries,
    thumbnail: v.picklist(['plaintext', 'encrypted']),
  }),
});

type _AssertPlaintextLocalSettings = Assert<MutuallyAssignable<v.InferOutput<typeof plaintextLocalSettingsSchema>, PlaintextLocalSettings>>;
