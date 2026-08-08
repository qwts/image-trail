import assert from 'node:assert/strict';
import test from 'node:test';

import type { PageAdapter, TargetBookmarkRequestListener } from '../extension/src/content/page-adapter.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import type { ProjectionSessionController } from '../extension/src/core/projection-session.js';
import type { RecordLibraryController } from '../extension/src/ui/panel/record-library-controller.js';
import { subscribeToPageAdapter } from '../extension/src/ui/panel/panel-subscriptions.js';
import type { UrlTemplateSettingsController } from '../extension/src/ui/panel/url-template-settings-controller.js';

test('an explicit Grab request durably pins before optional capture and transient Recent creation', async () => {
  const log: string[] = [];
  let bookmarkRequest: TargetBookmarkRequestListener = () => undefined;
  let pending = Promise.resolve();
  const saved = createDisplayRecord({ id: 'pin-1', url: 'https://images.example.test/pic.jpg', source: 'bookmark' });
  const pageAdapter = {
    subscribe: () => () => undefined,
    subscribeToSuccessfulLoads: () => () => undefined,
    subscribeToBookmarkRequests: (listener: TargetBookmarkRequestListener) => {
      bookmarkRequest = listener;
      return () => undefined;
    },
    subscribeToGrabSourcePatternRequests: () => () => undefined,
  } as unknown as PageAdapter;
  const recordLibrary = {
    enqueueBookmarkMutation: (work: () => Promise<void>) => {
      pending = work();
    },
    bookmarkUrl: async (_url: string, _thumbnail: string | undefined, options: { onBookmarkSaved?: (record: typeof saved) => void }) => {
      log.push('pin');
      options.onBookmarkSaved?.(saved);
      return true;
    },
    addRecentHistory: async () => {
      log.push('recent');
    },
  } as unknown as RecordLibraryController;

  subscribeToPageAdapter({
    pageAdapter,
    recordLibrary,
    projections: {} as ProjectionSessionController,
    urlTemplateSettings: {} as UrlTemplateSettingsController,
    onTargetSelection: () => undefined,
    restoreFieldState: () => undefined,
    captureGrabbedBookmark: async (record) => {
      assert.equal(record, saved);
      log.push('capture');
    },
  });
  bookmarkRequest({
    handleId: 'image-1',
    url: saved.url,
    source: 'srcAttribute',
    width: 640,
    height: 480,
    trustedLoadedImage: true,
  });
  await pending;

  assert.deepEqual(log, ['pin', 'capture', 'recent']);
});
