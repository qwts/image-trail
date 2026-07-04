import { applyFieldSplitSpecToState, reducePanelAction } from '../../core/actions.js';
import type { PanelAction, PanelState } from '../../core/types.js';
import { applyFieldSplitSpecs } from '../../core/url/field-splits.js';
import {
  applyFieldDigitWidthTransform,
  applyFieldSplitTransform,
  applySetFieldValueTransform,
  applyStepFieldValueTransform,
  clearFieldSplitTransform,
} from '../../core/url/field-transforms.js';
import { fieldDigitWidthSpecsEqual } from '../../core/url/field-widths.js';
import { parseUrl } from '../../core/url/parse-url.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel } from '../../core/url/types.js';
import { isUnsupportedUrlEditorInput } from '../components/url-editor-view.js';

// The intermediate result of a field-editor transform: `noop` skips application, `state` applies a
// pure panel-state update, `project` applies an optional state update and then loads a new URL
// through the projection controller (optionally saving the URL template on a successful load).
type FieldEditorEffect =
  | { readonly kind: 'noop' }
  | { readonly kind: 'state'; readonly state: PanelState; readonly saveParsedFieldState?: boolean; readonly render?: boolean }
  | {
      readonly kind: 'project';
      readonly state?: PanelState;
      readonly url: string;
      readonly attemptedFieldIds: readonly string[];
      readonly saveTemplateOnLoad: 'always' | 'when-unlocked';
    };

export interface FieldEditorControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  // `rejectUrlEditorInput` always uses the panel's default reset duration, so this seam intentionally
  // omits the optional `durationMs` the panel method accepts — keep the contract to what's actually used.
  scheduleFiniteCaptureErrorReset(updatedAt: number, mode: 'status'): void;
  // Shared URL-base / URL-model / split-prune helpers stay panel-owned (the parsed-field navigation
  // queue and the projection controller consume them too); the editor injects them.
  currentRawUrl(): string;
  currentUrlModel(): ParsedUrlModel;
  pruneInvalidFieldSplitSpecsForUrl(state: PanelState, url: string, options?: { readonly preserveMessage?: boolean }): PanelState;
  applyPanelState(nextState: PanelState, options?: { readonly saveParsedFieldState?: boolean; readonly render?: boolean }): boolean;
  // Field-interaction serialization and persistence stay on the parsed-field-state sync collaborator.
  enqueueFieldInteraction(run: () => Promise<void>): void;
  saveFieldState(): Promise<void>;
  saveUrlTemplateFromCurrentFields(): Promise<void>;
  // The single URL-load path every editor apply funnels through, on the projection controller.
  applySelectedUrl(
    url: string,
    attemptedFieldIds: readonly string[],
    options?: { readonly pushVisibleUrl?: boolean; readonly resetFieldState?: boolean },
  ): Promise<boolean>;
}

/**
 * The URL-field editor and transform machinery, moved verbatim off `ImageTrailPanel`: it parses the
 * current URL into a field model, maps a `field/transform` action (split / digit-width / set-value /
 * step) into a `FieldEditorEffect`, and runs that effect — either a pure state update or a projected
 * URL load routed through the injected projection controller. The URL-editor paste path funnels
 * through the same `applySelectedUrl` load, rejecting data URLs. Order-sensitive: `applyFieldTransform`
 * prunes invalid split specs before computing the effect, and `runFieldEditorEffect` saves the URL
 * template on a successful load only when `saveTemplateOnLoad === 'always'` or a field is unlocked.
 */
export class FieldEditorController {
  constructor(private readonly deps: FieldEditorControllerDeps) {}

  enqueueFieldTransform(action: Extract<PanelAction, { readonly name: 'field/transform' }>): void {
    this.enqueueFieldInteraction(() => this.applyFieldTransform(action));
  }

  enqueueSelectedUrlApply(url: string): void {
    this.enqueueFieldInteraction(() => this.applyUrlEditorUrl(url));
  }

  rejectUrlEditorInput(): void {
    this.deps.setState({
      ...this.deps.getState(),
      status: 'error',
      message: 'URL editor cannot use data URLs. Paste an http or https image URL.',
      lastUpdatedAt: Date.now(),
    });
    this.deps.scheduleFiniteCaptureErrorReset(this.deps.getState().lastUpdatedAt, 'status');
    this.deps.render();
  }

  private currentUrlModelWithoutDigitWidthSpecs(): ParsedUrlModel {
    return applyFieldSplitSpecs(parseUrl(this.deps.currentRawUrl()), this.deps.getState().fieldSplitSpecs);
  }

  private pruneInvalidFieldSplitSpecsForCurrentUrl(): boolean {
    const state = this.deps.getState();
    const nextState = this.deps.pruneInvalidFieldSplitSpecsForUrl(state, this.deps.currentRawUrl());
    if (nextState === state) return false;
    this.deps.setState(nextState);
    void this.deps.saveFieldState();
    return true;
  }

  private enqueueFieldInteraction(run: () => Promise<void>): void {
    this.deps.enqueueFieldInteraction(run);
  }

  private async applyUrlEditorUrl(url: string): Promise<void> {
    if (isUnsupportedUrlEditorInput(url)) {
      this.rejectUrlEditorInput();
      return;
    }

    await this.deps.applySelectedUrl(url, [], { pushVisibleUrl: true, resetFieldState: url !== this.deps.currentRawUrl() });
  }

  private async applyFieldTransform(action: Extract<PanelAction, { readonly name: 'field/transform' }>): Promise<void> {
    const prunedInvalidSplitSpecs = action.transformId !== 'split-clear' && this.pruneInvalidFieldSplitSpecsForCurrentUrl();
    const effect = this.fieldEditorEffect(action);
    if (effect.kind === 'noop') {
      if (prunedInvalidSplitSpecs) this.deps.render();
      return;
    }
    await this.runFieldEditorEffect(effect);
  }

  private fieldEditorEffect(action: Extract<PanelAction, { readonly name: 'field/transform' }>): FieldEditorEffect {
    if (action.transformId === 'digit-width') {
      const baseModel = this.currentUrlModelWithoutDigitWidthSpecs();
      if (!collectUrlFields(baseModel).some((field) => field.id === action.fieldId)) {
        return { kind: 'noop' };
      }
      const transform = applyFieldDigitWidthTransform(baseModel, action.fieldId, action.value, this.deps.getState().fieldDigitWidthSpecs);
      if (!transform.ok) {
        return {
          kind: 'state',
          state: { ...this.deps.getState(), status: 'error', message: transform.message, lastUpdatedAt: Date.now() },
        };
      }

      const fieldDigitWidthSpecsChanged = !fieldDigitWidthSpecsEqual(
        transform.fieldDigitWidthSpecs,
        this.deps.getState().fieldDigitWidthSpecs,
      );
      const state = {
        ...this.deps.getState(),
        activeFieldId: action.fieldId,
        fieldDigitWidthSpecs: transform.fieldDigitWidthSpecs,
        lastUpdatedAt: Date.now(),
      };

      if (transform.url === this.deps.currentRawUrl()) {
        return this.deps.getState().activeFieldId === action.fieldId && !fieldDigitWidthSpecsChanged
          ? { kind: 'noop' }
          : { kind: 'state', state };
      }

      return {
        kind: 'project',
        state,
        url: transform.url,
        attemptedFieldIds: transform.attemptedFieldIds,
        saveTemplateOnLoad: 'when-unlocked',
      };
    }

    if (action.transformId === 'split-clear') {
      const transform = clearFieldSplitTransform(action.fieldId);
      if (!transform.ok) return { kind: 'noop' };
      return { kind: 'state', state: reducePanelAction(this.deps.getState(), action) };
    }

    let model: ParsedUrlModel;
    try {
      model = this.deps.currentUrlModel();
    } catch {
      if (action.transformId !== 'split-apply') return { kind: 'noop' };
      return {
        kind: 'state',
        state: {
          ...this.deps.getState(),
          status: 'error',
          message: 'Current URL could not be parsed for splitting.',
          lastUpdatedAt: Date.now(),
        },
      };
    }

    const field = collectUrlFields(model).find((item) => item.id === action.fieldId);
    if (!field) return { kind: 'noop' };

    if (action.transformId === 'split-apply') {
      const transform = applyFieldSplitTransform(field, action.pattern);
      if (!transform.ok) {
        return {
          kind: 'state',
          state: { ...this.deps.getState(), status: 'error', message: transform.message, lastUpdatedAt: Date.now() },
        };
      }

      return { kind: 'state', state: applyFieldSplitSpecToState(this.deps.getState(), transform.splitSpec) };
    }

    const transform =
      action.transformId === 'set-value'
        ? applySetFieldValueTransform(model, field, action.value)
        : applyStepFieldValueTransform(model, field, action.delta);

    const state =
      action.transformId === 'step'
        ? reducePanelAction(this.deps.getState(), { name: 'active-field/set', id: action.fieldId })
        : this.deps.getState();

    if (transform.url === this.deps.currentRawUrl()) {
      return state === this.deps.getState() ? { kind: 'noop' } : { kind: 'state', state };
    }

    return {
      kind: 'project',
      state,
      url: transform.url,
      attemptedFieldIds: transform.attemptedFieldIds,
      saveTemplateOnLoad: action.transformId === 'step' ? 'always' : 'when-unlocked',
    };
  }

  private async runFieldEditorEffect(effect: FieldEditorEffect): Promise<boolean> {
    if (effect.kind === 'noop') return false;
    if (effect.kind === 'state') {
      return this.deps.applyPanelState(effect.state, {
        saveParsedFieldState: effect.saveParsedFieldState ?? true,
        render: effect.render ?? true,
      });
    }
    if (effect.state) this.deps.applyPanelState(effect.state);
    const loaded = await this.deps.applySelectedUrl(effect.url, effect.attemptedFieldIds);
    if (loaded && (effect.saveTemplateOnLoad === 'always' || this.deps.getState().unlockedFieldIds.length > 0)) {
      await this.deps.saveUrlTemplateFromCurrentFields();
    }
    return loaded;
  }
}
