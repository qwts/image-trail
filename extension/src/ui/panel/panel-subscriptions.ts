import type { PageAdapter, TargetSelectionSnapshot } from '../../content/page-adapter.js';
import type { ProjectionSessionController } from '../../core/projection-session.js';
import type { RecordLibraryController } from './record-library-controller.js';
import type { UrlTemplateSettingsController } from './url-template-settings-controller.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';

export interface PanelSubscriptionDeps {
  readonly pageAdapter: PageAdapter;
  readonly projections: ProjectionSessionController;
  readonly recordLibrary: RecordLibraryController;
  readonly urlTemplateSettings: UrlTemplateSettingsController;
  readonly onTargetSelection: (snapshot: TargetSelectionSnapshot) => void;
  readonly restoreFieldState: () => void;
  readonly captureGrabbedBookmark: (record: ImageDisplayRecord) => Promise<void>;
}

export function subscribeToPageAdapter(deps: PanelSubscriptionDeps): ReadonlyArray<() => void> {
  return [
    deps.pageAdapter.subscribe((snapshot) => {
      deps.onTargetSelection(snapshot);
      deps.restoreFieldState();
    }),
    deps.pageAdapter.subscribeToSuccessfulLoads((target) => {
      if (target.projectionId && !deps.projections.isActive(target.projectionId)) return;
      if (target.projectionId) deps.projections.update(target.projectionId, { status: 'loaded' });
      void deps.recordLibrary.addRecentHistory(target.url, target.thumbnail, {
        trustLoadedImage: target.trustedLoadedImage,
        width: target.width,
        height: target.height,
        projectionId: target.projectionId,
      });
    }),
    deps.pageAdapter.subscribeToBookmarkRequests((target) => {
      deps.recordLibrary.enqueueBookmarkMutation(async () => {
        const options = { trustLoadedImage: target.trustedLoadedImage, width: target.width, height: target.height };
        const saved: { record?: ImageDisplayRecord } = {};
        const bookmarked = await deps.recordLibrary.bookmarkUrl(target.url, target.thumbnail, {
          ...options,
          onBookmarkSaved: (record) => {
            saved.record = record;
          },
        });
        if (!bookmarked) return;
        if (saved.record) await deps.captureGrabbedBookmark(saved.record);
        await deps.recordLibrary.addRecentHistory(saved.record?.url ?? target.url, target.thumbnail, options);
      });
    }),
    deps.pageAdapter.subscribeToGrabSourcePatternRequests((url) => {
      void deps.urlTemplateSettings.learnGrabSourcePattern(url);
    }),
  ];
}
