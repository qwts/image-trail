import type { StorageUsageSummary } from '../../core/image/capture-result.js';
import type { ImageProbeMethod } from '../../core/image/request-policy.js';
import type { LoadFailureFeedback } from '../../core/settings.js';
import type { SearchableMetadataPolicy } from '../../core/metadata-policy.js';
import type { BuildIdentity } from '../../core/build-info.js';
import type { PanelAction, PinSaveStoragePreference, RecentHistoryOverflowBehavior, RecentSparseRowDisplayMode } from '../../core/types.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../../core/url/templates.js';
import type { UrlField } from '../../core/url/types.js';
import {
  createNeighborPreloadSettingsView,
  createRequestThrottleSettingsView,
  createUrlReviewStatusSettingsView,
} from './automation-settings-view.js';
import { createVisiblePinsSettingsView } from './display-settings-view.js';
import {
  createBuildIdentitySettingsView,
  createDestructiveSettingsView,
  createStorageHealthSettingsView,
} from './maintenance-settings-view.js';
import { createPanelLayoutSettingsView } from './panel-layout-settings-view.js';
import {
  createPrivacyModeSettingsView,
  createPrivatePinSettingsView,
  createSearchableMetadataSettingsView,
} from './privacy-settings-view.js';
import { createRecentsSettingsView } from './recents-settings-view.js';
import { createShortcutSettingsView } from './shortcut-settings-view.js';
import { createGrabSourcePatternSettingsView, createTemplateSettingsView } from './url-learning-settings-view.js';

export {
  createBuildIdentitySettingsView,
  createStorageHealthSettingsView,
  formatStorageHealthBytes,
  storageHealthRows,
} from './maintenance-settings-view.js';

const settingsGroupsOpen = new Map<string, boolean>();

export function createSettingsView(
  visibleBookmarkSoftMax: number,
  recentHistoryState: {
    readonly limit: number;
    readonly retainedLimit: number;
    readonly overflowBehavior: RecentHistoryOverflowBehavior;
    readonly sparseRowDisplayMode: RecentSparseRowDisplayMode;
  },
  privacyModeEnabled: boolean,
  searchableMetadataPolicy: SearchableMetadataPolicy,
  templates: readonly UrlTemplateRecord[],
  grabSourcePatterns: readonly GrabSourcePattern[],
  activeTemplateId: string | null,
  currentFields: readonly UrlField[],
  privatePinState: {
    readonly pinSaveStoragePreference: PinSaveStoragePreference;
    readonly blobKeyUnlocked: boolean;
    readonly blobKeyAvailable: boolean;
  },
  destructiveState: {
    readonly visibleQueueCount: number;
    readonly recallCount: number;
    readonly busy: boolean;
  },
  storageUsage: StorageUsageSummary | null,
  buildIdentityState: {
    readonly identity: BuildIdentity | null;
    readonly overlayVisible: boolean;
  },
  urlReviewStatusState: {
    readonly limit: number;
    readonly clearAfterExport: boolean;
  },
  requestThrottleState: {
    readonly minimumIntervalMs: number;
    readonly maxRequests: number;
    readonly windowMs: number;
  },
  neighborPreloadState: {
    readonly enabled: boolean;
    readonly radius: number;
    readonly cacheLimit: number;
    readonly probeMethod: ImageProbeMethod;
    readonly feedback: LoadFailureFeedback;
  },
  restoreWorkspaceLayoutEnabled: boolean,
  utilityChildren: readonly HTMLElement[],
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Settings';
  const header = document.createElement('div');
  header.className = 'image-trail-panel__section-header';
  header.append(heading);

  section.append(
    header,
    createSettingsGroup('Display', 'display', [
      createVisiblePinsSettingsView(visibleBookmarkSoftMax, dispatch),
      createRecentsSettingsView(recentHistoryState, dispatch),
    ]),
    createSettingsGroup('Privacy', 'privacy', [
      createPrivatePinSettingsView(privatePinState, dispatch),
      createPrivacyModeSettingsView(privacyModeEnabled, dispatch),
      createSearchableMetadataSettingsView(searchableMetadataPolicy, dispatch),
    ]),
    createSettingsGroup('Automation', 'automation', [
      createRequestThrottleSettingsView(requestThrottleState, dispatch),
      createNeighborPreloadSettingsView(neighborPreloadState, dispatch),
      createUrlReviewStatusSettingsView(urlReviewStatusState, dispatch),
    ]),
    createSettingsGroup('Shortcuts', 'shortcuts', [createShortcutSettingsView()]),
    createSettingsGroup('Maintenance', 'maintenance', [
      createPanelLayoutSettingsView(restoreWorkspaceLayoutEnabled, dispatch),
      createBuildIdentitySettingsView(buildIdentityState, dispatch),
      createStorageHealthSettingsView(storageUsage),
      createDestructiveSettingsView(destructiveState, dispatch),
    ]),
    createSettingsGroup('URL learning', 'url-learning', [
      createTemplateSettingsView(templates, activeTemplateId, currentFields, dispatch),
      createGrabSourcePatternSettingsView(grabSourcePatterns, dispatch),
    ]),
    ...utilityChildren,
  );
  return section;
}

function createSettingsGroup(title: string, id: string, children: readonly HTMLElement[]): HTMLElement {
  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section';
  group.open = settingsGroupsOpen.get(id) ?? false;
  group.addEventListener('toggle', () => {
    settingsGroupsOpen.set(id, group.open);
  });

  const heading = document.createElement('h4');
  heading.textContent = title;
  const header = document.createElement('div');
  header.className = 'image-trail-panel__settings-utility-header';
  header.append(heading);
  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.append(header);
  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body';
  body.append(...children);
  group.append(summary, body);
  return group;
}
