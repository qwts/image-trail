import type { PanelAction } from '../../../core/types.js';
import type { AnyActionDef } from '../action-dispatch.js';
import { buildAutomationActionEntries, type AutomationActionName } from './automation-actions.js';
import { buildDestinationActionEntries, type DestinationActionName } from './destination-actions.js';
import type { PanelActionDeps } from './deps.js';
import { buildDetachableSectionActionEntries, type DetachableSectionActionName } from './detach-actions.js';
import { buildFieldActionEntries, type FieldActionName } from './field-actions.js';
import { buildLibraryActionEntries, type LibraryActionName } from './library-actions.js';
import { buildPanelSettingsActionEntries, type PanelSettingsActionName } from './panel-settings-actions.js';
import { buildRecallActionEntries, type RecallActionName } from './recall-actions.js';
import { buildTargetActionEntries, type TargetActionName } from './target-actions.js';
import { buildTransferActionEntries, type TransferActionName } from './transfer-actions.js';

/**
 * Action names deliberately left to `ImageTrailPanel.handleDefaultAction` — the former if-chain's
 * fall-through tail (reduce, then remount or tear down by visibility). `toggle-panel`/`close-panel`
 * are the tail's intended traffic; the rest are reducer-internal names the panel dispatches to
 * itself from async completions (or reduces directly) and that never reach `dispatch` from the UI.
 */
type FallbackPanelActionName =
  | 'toggle-panel'
  | 'close-panel'
  | 'undo-last'
  | 'history/add-loaded'
  | 'history/mark-pinned'
  | 'history/load'
  | 'history/download'
  | 'history/select'
  | 'bookmarks/page-loaded'
  | 'url-templates/load'
  | 'grab-source-patterns/load'
  | 'parsed-field-state/restore'
  | 'capture/start'
  | 'capture/complete'
  | 'capture/clear'
  | 'blob-key/status'
  | 'import-export/start'
  | 'import-export/complete'
  | 'import-export/error'
  | 'import/restore-preview-ready'
  | 'pcloud-backup/status'
  | 'pcloud-backup/busy'
  | 'pcloud-backup/message'
  | 'pcloud-backup/upload-complete'
  | 'pcloud-backup/upload-error'
  | 'pcloud-backup/error'
  | 'pcloud-backup/restore-candidates-loaded'
  | 'pcloud-backup/restore-downloaded'
  | 'pcloud-backup/restore-error'
  | 'recall/load-start'
  | 'recall/load-complete'
  | 'recall/error'
  | 'recall/message-clear'
  | 'recall/complete'
  | 'storage/update';

/**
 * Every action name with a registry entry. Defined by exclusion over the full `PanelAction` name
 * domain (which is wider than `PanelActionName` — several names exist only on payload members),
 * mirroring `DispatchedRequestType` in the background service worker: adding a new `PanelAction`
 * member forces a compile-time decision — register it below or list it in the fallback union.
 */
export type RegisteredPanelActionName = Exclude<PanelAction['name'], FallbackPanelActionName>;

export const PANEL_ACTION_ENTRY_BUILDERS = [
  buildTargetActionEntries,
  buildPanelSettingsActionEntries,
  buildLibraryActionEntries,
  buildRecallActionEntries,
  buildFieldActionEntries,
  buildTransferActionEntries,
  buildAutomationActionEntries,
  buildDetachableSectionActionEntries,
  buildDestinationActionEntries,
] as const;

/**
 * Panel action registry: the single source of truth for `ImageTrailPanel.dispatch`. The
 * `satisfies Record<RegisteredPanelActionName, …>` check enforces completeness at compile time —
 * every registered name has exactly one entry, and no entry may use an unregistered name. Each
 * entry replaces one guard of the former ~520-line if-chain.
 */
export function buildPanelActionRegistry(deps: PanelActionDeps) {
  return {
    ...buildTargetActionEntries(deps),
    ...buildPanelSettingsActionEntries(deps),
    ...buildLibraryActionEntries(deps),
    ...buildRecallActionEntries(deps),
    ...buildFieldActionEntries(deps),
    ...buildTransferActionEntries(deps),
    ...buildAutomationActionEntries(deps),
    ...buildDetachableSectionActionEntries(deps),
    ...buildDestinationActionEntries(deps),
  } satisfies Record<RegisteredPanelActionName, AnyActionDef>;
}

// The `satisfies` above catches missing names; these catch a group module drifting outside the
// registered set (a stray group name would otherwise only surface as an excess-property error
// buried in the spread). Underscore names satisfy the no-unused-vars ignore pattern.
type GroupActionName =
  | TargetActionName
  | PanelSettingsActionName
  | LibraryActionName
  | RecallActionName
  | FieldActionName
  | TransferActionName
  | AutomationActionName
  | DetachableSectionActionName
  | DestinationActionName;
type _AssertNever<T extends never> = T;
type _NoGroupNameOutsideRegistry = _AssertNever<Exclude<GroupActionName, RegisteredPanelActionName>>;
