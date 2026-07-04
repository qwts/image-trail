import { reducePanelAction } from '../../core/actions.js';
import type { ProjectionReason } from '../../core/projection-session.js';
import type { ParsedFieldStateRecord, PanelState } from '../../core/types.js';
import { imageResourceUrlsEqual } from '../../core/image/image-navigation.js';
import { applyFieldSplitSpecs } from '../../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../../core/url/field-widths.js';
import { parseUrl } from '../../core/url/parse-url.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import { hostnameFromLocation } from '../panel-position.js';

export interface ParsedFieldStateRecordControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  // Shared URL-base helper stays panel-owned (see FieldEditorController) and is injected here.
  currentRawUrl(): string;
  // The projection controller's single URL-load path, used to project a saved source before restore.
  applySelectedUrl(url: string, attemptedFieldIds: readonly string[], options: { readonly reason?: ProjectionReason }): Promise<boolean>;
  // Grab/template settings + parsed-field-state persistence stay on their own collaborators.
  syncGrabSettings(): void;
  loadGrabSettings(options?: { readonly render?: boolean }): Promise<void>;
  fieldStatePageUrl(): string;
  nextFieldStateUpdatedAt(): string;
  saveFieldState(): Promise<void>;
  restoreFieldState(options?: { readonly projectSavedSource?: boolean }): Promise<void>;
}

/**
 * The parsed-field-state record machinery, moved verbatim off `ImageTrailPanel`: it snapshots the
 * current field lock/exclude/split state into a `ParsedFieldStateRecord` (`createParsedFieldStateRecord`),
 * applies a restored record back onto panel state — optionally projecting its saved source first
 * (`applyRestoredParsedFieldState`) — and filters a record down to the fields the current URL still
 * parses to (`filterParsedFieldStateForCurrentUrl`). The `createRecord`/`applyRestoredRecord` callbacks
 * on `ParsedFieldStateSync` are wired to this controller.
 */
export class ParsedFieldStateRecordController {
  constructor(private readonly deps: ParsedFieldStateRecordControllerDeps) {}

  createParsedFieldStateRecord(): ParsedFieldStateRecord | null {
    const hostname = hostnameFromLocation();
    if (!hostname) return null;
    const state = this.deps.getState();
    if (!state.target.selectedUrl && !state.draftUrl) return null;
    return {
      schemaVersion: 1,
      hostname,
      pageUrl: this.deps.fieldStatePageUrl(),
      sourceUrl: this.deps.currentRawUrl(),
      selectedUrl: state.target.selectedUrl,
      selectedHandleId: state.target.selectedHandleId,
      activeFieldId: state.activeFieldId,
      failedFieldId: state.failedFieldId,
      successfulFieldIds: state.successfulFieldIds,
      unchangedFieldIds: state.unchangedFieldIds,
      unlockedFieldIds: state.unlockedFieldIds,
      manuallyExcludedFieldIds: state.manuallyExcludedFieldIds,
      fieldSplitSpecs: state.fieldSplitSpecs,
      fieldDigitWidthSpecs: state.fieldDigitWidthSpecs,
      activeUrlTemplateId: state.activeUrlTemplateId,
      updatedAt: this.deps.nextFieldStateUpdatedAt(),
    };
  }

  async applyRestoredParsedFieldState(
    record: ParsedFieldStateRecord,
    ctx: { readonly sameSource: boolean; readonly projectSavedSource: boolean },
  ): Promise<void> {
    if (ctx.projectSavedSource && !ctx.sameSource) {
      const projected = await this.deps.applySelectedUrl(record.sourceUrl, [], { reason: 'parsed-field-restore' });
      if (!projected && !imageResourceUrlsEqual(record.sourceUrl, this.deps.currentRawUrl(), window.location.href)) return;
    }
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'parsed-field-state/restore',
        record: this.filterParsedFieldStateForCurrentUrl(record),
      }),
    );
    this.deps.syncGrabSettings();
    void this.deps.saveFieldState();
    this.deps.render();
  }

  restoreParsedFieldStateForCurrentPanel(): void {
    void this.deps.loadGrabSettings({ render: false }).then(() => this.deps.restoreFieldState({ projectSavedSource: true }));
  }

  private filterParsedFieldStateForCurrentUrl(record: ParsedFieldStateRecord): ParsedFieldStateRecord {
    try {
      const model = applyFieldDigitWidthSpecs(
        applyFieldSplitSpecs(parseUrl(record.sourceUrl), record.fieldSplitSpecs),
        record.fieldDigitWidthSpecs ?? [],
      );
      const fieldIds = new Set(collectUrlFields(model).map((field) => field.id));
      const keep = (ids: readonly string[]): readonly string[] => ids.filter((id) => fieldIds.has(id));
      return {
        ...record,
        activeFieldId: record.activeFieldId && fieldIds.has(record.activeFieldId) ? record.activeFieldId : null,
        failedFieldId: record.failedFieldId && fieldIds.has(record.failedFieldId) ? record.failedFieldId : null,
        successfulFieldIds: keep(record.successfulFieldIds),
        unchangedFieldIds: keep(record.unchangedFieldIds),
        unlockedFieldIds: keep(record.unlockedFieldIds),
        manuallyExcludedFieldIds: keep(record.manuallyExcludedFieldIds),
        fieldDigitWidthSpecs: (record.fieldDigitWidthSpecs ?? []).filter((spec) => fieldIds.has(spec.fieldId)),
      };
    } catch {
      return { ...record, activeFieldId: null, failedFieldId: null };
    }
  }
}
