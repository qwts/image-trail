import { reducePanelAction } from '../../core/actions.js';
import type { PanelAction, PanelState, UrlTemplateStore } from '../../core/types.js';
import { parseUrl } from '../../core/url/parse-url.js';
import { rebuildUrl } from '../../core/url/rebuild-url.js';
import { suggestUrlSteppingPresets, type UrlSteppingPresetId } from '../../core/url/stepping-presets.js';
import {
  createUrlTemplateRecord,
  findBestMatchingTemplate,
  updateGrabSourcePatternSettings,
  updateTemplateSettings,
  updateTemplateFields,
  upsertGrabSourcePattern,
  type GrabSourcePattern,
  type UrlTemplateRecord,
} from '../../core/url/templates.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel } from '../../core/url/types.js';
import { hostnameFromLocation } from '../panel-position.js';

/**
 * Collaborator that owns the URL-template and grab-source-pattern settings logic extracted from
 * ImageTrailPanel (epic #290). The pure template algebra lives in core/url/templates.js; this
 * controller only orchestrates the persistence store, the panel state reducer, and the page adapter.
 *
 * Every external interaction routes through the injected {@link UrlTemplateSettingsControllerDeps}
 * callbacks, which the panel wires as lazy arrow closures over `this`. Note that
 * `saveUrlTemplateFromCurrentFields` delegates back to the panel-owned `loadGrabSettings`, which in
 * turn calls this controller's `currentUrlTemplateHostname` / `activeTemplateIdForCurrentUrl` /
 * `syncGrabSettings` — the cycle is fine at runtime because the deps are evaluated on call.
 */
export interface UrlTemplateSettingsControllerDeps {
  store(): UrlTemplateStore | null;
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  currentUrlModel(): ParsedUrlModel;
  setUrlTemplates(templates: readonly UrlTemplateRecord[], activeTemplateId: string | null): void;
  setGrabSourcePatterns(patterns: readonly GrabSourcePattern[]): void;
  loadGrabSettings(options?: { readonly render?: boolean; readonly primeBufferedNav?: boolean }): Promise<void>;
  saveParsedFieldState(): Promise<void>;
}

export class UrlTemplateSettingsController {
  constructor(private readonly deps: UrlTemplateSettingsControllerDeps) {}

  async saveSteppingPreset(presetId: UrlSteppingPresetId): Promise<void> {
    const store = this.deps.store();
    if (!store) return;
    let model: ParsedUrlModel;
    try {
      model = this.deps.currentUrlModel();
    } catch {
      return;
    }
    const fields = collectUrlFields(model);
    const preset = suggestUrlSteppingPresets(fields).find((candidate) => candidate.id === presetId);
    if (!preset) return;
    const existing = findBestMatchingTemplate(this.deps.getState().urlTemplates, model, { includeDisabled: true }) ?? undefined;
    const template = createUrlTemplateRecord({ model, fields, includedFieldIds: preset.fieldIds, existing });
    if (!template) return;
    await store.save(template);
    await this.deps.loadGrabSettings({ render: false, primeBufferedNav: false });
    await this.deps.saveParsedFieldState();
    this.deps.setState({
      ...this.deps.getState(),
      message: `Saved ${preset.label.toLowerCase()} preset with ${preset.fieldIds.length} field${preset.fieldIds.length === 1 ? '' : 's'}.`,
      status: 'ready',
      lastUpdatedAt: Date.now(),
    });
    this.deps.render();
  }

  async saveUrlTemplateFromCurrentFields(): Promise<void> {
    const store = this.deps.store();
    if (!store) return;
    let model: ParsedUrlModel;
    try {
      model = this.deps.currentUrlModel();
    } catch {
      return;
    }
    const fields = collectUrlFields(model);
    const existing = findBestMatchingTemplate(this.deps.getState().urlTemplates, model, { includeDisabled: true }) ?? undefined;
    if (this.deps.getState().unlockedFieldIds.length === 0) {
      if (existing) {
        await store.remove(existing.hostname, existing.id);
        await this.deps.loadGrabSettings({ render: false });
      }
      if (this.deps.getState().activeDestination === 'settings') this.deps.render();
      return;
    }
    const template = createUrlTemplateRecord({
      model,
      fields,
      includedFieldIds: this.deps.getState().unlockedFieldIds,
      existing,
    });
    if (!template) return;
    await store.save(template);
    await this.deps.loadGrabSettings({ render: false });
    if (this.deps.getState().activeDestination === 'settings') this.deps.render();
  }

  async removeUrlTemplate(id: string): Promise<void> {
    const store = this.deps.store();
    if (!store) return;
    const hostname =
      this.deps.getState().urlTemplates.find((candidate) => candidate.id === id)?.hostname ?? this.currentUrlTemplateHostname();
    if (!hostname) return;
    await store.remove(hostname, id);
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'url-template/remove', id }));
    this.syncGrabSettings();
    this.deps.render();
  }

  async updateUrlTemplateSettings(
    id: string,
    changes: Extract<PanelAction, { readonly name: 'url-template/update-settings' }>,
  ): Promise<void> {
    const store = this.deps.store();
    const template = this.deps.getState().urlTemplates.find((candidate) => candidate.id === id);
    if (!template || !store) return;
    const updated = updateTemplateSettings(template, {
      matchMode: changes.matchMode,
      hideExcludedFields: changes.hideExcludedFields,
      autoApplyEnabled: changes.autoApplyEnabled,
      grabStrategy: changes.grabStrategy,
    });
    await store.save(updated);
    this.deps.setState(reducePanelAction(this.deps.getState(), changes));
    this.syncGrabSettings();
    this.deps.render();
  }

  async updateUrlTemplateFields(id: string, changes: Extract<PanelAction, { readonly name: 'url-template/update-fields' }>): Promise<void> {
    const store = this.deps.store();
    const template = this.deps.getState().urlTemplates.find((candidate) => candidate.id === id);
    if (!template || !store) return;
    let model: ParsedUrlModel;
    try {
      model = this.deps.currentUrlModel();
    } catch {
      return;
    }
    const fields = collectUrlFields(model);
    const updated = updateTemplateFields({
      template,
      model,
      fields,
      includedFieldIds: changes.includedFieldIds,
    });
    if (!updated) {
      await store.remove(template.hostname, template.id);
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'url-template/remove', id: template.id }));
      this.syncGrabSettings();
      this.deps.render();
      return;
    }
    await store.save(updated);
    this.deps.setState(
      reducePanelAction(
        {
          ...this.deps.getState(),
          urlTemplates: this.deps.getState().urlTemplates.map((candidate) => (candidate.id === id ? updated : candidate)),
        },
        changes,
      ),
    );
    this.syncGrabSettings();
    this.deps.render();
  }

  async learnGrabSourcePattern(url: string): Promise<void> {
    const store = this.deps.store();
    if (!store) return;
    let model: ParsedUrlModel;
    try {
      model = parseUrl(url);
    } catch {
      this.deps.setState({
        ...this.deps.getState(),
        status: 'error',
        message: 'Grab source link is not a valid URL.',
        lastUpdatedAt: Date.now(),
      });
      this.deps.render();
      return;
    }

    const updated = upsertGrabSourcePattern(this.deps.getState().grabSourcePatterns, { model });
    await store.saveGrabSourcePattern(updated);
    this.deps.setState({
      ...this.deps.getState(),
      grabSourcePatterns: [updated, ...this.deps.getState().grabSourcePatterns.filter((pattern) => pattern.id !== updated.id)],
      message: `Learned grab pattern for ${new URL(url).hostname}.`,
      status: 'ready',
      lastUpdatedAt: Date.now(),
    });
    this.syncGrabSettings();
    this.deps.render();
  }

  async updateGrabSourcePattern(
    id: string,
    changes: Extract<PanelAction, { readonly name: 'grab-source-pattern/update-settings' }>,
  ): Promise<void> {
    const store = this.deps.store();
    const pattern = this.deps.getState().grabSourcePatterns.find((candidate) => candidate.id === id);
    if (!pattern || !store) return;
    const updated = updateGrabSourcePatternSettings(pattern, {
      matchMode: changes.matchMode,
      grabStrategy: changes.grabStrategy,
    });
    await store.saveGrabSourcePattern(updated);
    this.deps.setState(reducePanelAction(this.deps.getState(), changes));
    this.syncGrabSettings();
    this.deps.render();
  }

  async removeGrabSourcePattern(id: string): Promise<void> {
    const store = this.deps.store();
    const pattern = this.deps.getState().grabSourcePatterns.find((candidate) => candidate.id === id);
    if (!pattern || !store) return;
    await store.removeGrabSourcePattern(pattern.hostname, id);
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'grab-source-pattern/remove', id }));
    this.syncGrabSettings();
    this.deps.render();
  }

  syncGrabSettings(): void {
    const state = this.deps.getState();
    this.deps.setUrlTemplates(state.urlTemplates, state.activeUrlTemplateId);
    this.deps.setGrabSourcePatterns(state.grabSourcePatterns);
  }

  activeTemplateIdForCurrentUrl(templates: readonly UrlTemplateRecord[]): string | null {
    try {
      return findBestMatchingTemplate(templates, this.deps.currentUrlModel(), { includeDisabled: true })?.id ?? null;
    } catch {
      return null;
    }
  }

  currentUrlTemplateHostname(): string | null {
    try {
      return new URL(rebuildUrl(this.deps.currentUrlModel())).hostname.toLowerCase();
    } catch {
      return hostnameFromLocation();
    }
  }
}
