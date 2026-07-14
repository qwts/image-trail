import type { StorageUsageSummary } from '../../core/image/capture-result.js';
import type { SearchableMetadataPolicy } from '../../core/metadata-policy.js';
import type { PanelAction } from '../../core/types.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../../core/url/templates.js';
import type { UrlField } from '../../core/url/types.js';
import {
  createNeighborPreloadSettingsView,
  createRequestThrottleSettingsView,
  createUrlReviewStatusSettingsView,
  type NeighborPreloadSettingsState,
  type RequestThrottleSettingsState,
  type UrlReviewStatusSettingsState,
} from './automation-settings-view.js';
import { createVisiblePinsSettingsView } from './display-settings-view.js';
import {
  createBuildIdentitySettingsView,
  createDestructiveSettingsView,
  createStorageHealthSettingsView,
  type BuildIdentitySettingsState,
  type DestructiveSettingsState,
} from './maintenance-settings-view.js';
import { createPanelLayoutSettingsView } from './panel-layout-settings-view.js';
import {
  createPrivacyModeSettingsView,
  createPrivatePinSettingsView,
  createSearchableMetadataSettingsView,
  type PrivatePinSettingsState,
} from './privacy-settings-view.js';
import { createRecentsSettingsView, type RecentHistorySettingsState } from './recents-settings-view.js';
import { createShortcutSettingsView } from './shortcut-settings-view.js';
import { createGrabSourcePatternSettingsView, createTemplateSettingsView } from './url-learning-settings-view.js';
import { createUrlSteppingPresetView } from './url-stepping-preset-view.js';
import { applySettingsPrimitiveContracts } from './settings-primitive-contracts.js';
import { createSettingsDisclosure } from './settings-disclosure.js';

export {
  createBuildIdentitySettingsView,
  createStorageHealthSettingsView,
  formatStorageHealthBytes,
  storageHealthRows,
} from './maintenance-settings-view.js';

export interface SettingsUtilityGroups {
  readonly privacy: readonly HTMLElement[];
  readonly utilities: readonly HTMLElement[];
}

export function createSettingsView(
  visibleBookmarkSoftMax: number,
  recentHistoryState: RecentHistorySettingsState,
  privacyModeEnabled: boolean,
  searchableMetadataPolicy: SearchableMetadataPolicy,
  templates: readonly UrlTemplateRecord[],
  grabSourcePatterns: readonly GrabSourcePattern[],
  activeTemplateId: string | null,
  currentFields: readonly UrlField[],
  privatePinState: PrivatePinSettingsState,
  destructiveState: DestructiveSettingsState,
  storageUsage: StorageUsageSummary | null,
  buildIdentityState: BuildIdentitySettingsState,
  urlReviewStatusState: UrlReviewStatusSettingsState,
  requestThrottleState: RequestThrottleSettingsState,
  neighborPreloadState: NeighborPreloadSettingsState,
  restoreWorkspaceLayoutEnabled: boolean,
  utilityGroups: SettingsUtilityGroups,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section image-trail-ds__settings';

  const heading = document.createElement('h3');
  heading.textContent = 'Settings';
  const header = document.createElement('div');
  header.className = 'image-trail-panel__section-header';
  header.append(heading);

  section.append(
    header,
    createSettingsDisclosure(
      'Display',
      'display',
      [createVisiblePinsSettingsView(visibleBookmarkSoftMax, dispatch), createRecentsSettingsView(recentHistoryState, dispatch)],
      { defaultOpen: true },
    ),
    createSettingsDisclosure('Privacy', 'privacy', [
      createPrivatePinSettingsView(privatePinState, dispatch),
      createPrivacyModeSettingsView(privacyModeEnabled, dispatch),
      createSearchableMetadataSettingsView(searchableMetadataPolicy, dispatch),
      ...utilityGroups.privacy,
    ]),
    createSettingsDisclosure('Automation', 'automation', [
      createShortcutSettingsView(),
      createRequestThrottleSettingsView(requestThrottleState, dispatch),
      createNeighborPreloadSettingsView(neighborPreloadState, dispatch),
      createUrlReviewStatusSettingsView(urlReviewStatusState, dispatch),
      createUrlSteppingPresetView(currentFields, dispatch),
      createTemplateSettingsView(templates, activeTemplateId, currentFields, dispatch),
      createGrabSourcePatternSettingsView(grabSourcePatterns, dispatch),
    ]),
    createSettingsDisclosure('Utilities', 'utilities', utilityGroups.utilities),
    createSettingsDisclosure('System', 'system', [
      createPanelLayoutSettingsView(restoreWorkspaceLayoutEnabled, dispatch),
      createBuildIdentitySettingsView(buildIdentityState, dispatch),
      createStorageHealthSettingsView(storageUsage),
      createDestructiveSettingsView(destructiveState, dispatch),
    ]),
  );
  applySettingsPrimitiveContracts(section);
  return section;
}
