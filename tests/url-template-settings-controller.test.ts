import test from 'node:test';
import assert from 'node:assert/strict';

import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState, UrlTemplateStore } from '../extension/src/core/types.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { createUrlTemplateRecord, type GrabSourcePattern, type UrlTemplateRecord } from '../extension/src/core/url/templates.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel } from '../extension/src/core/url/types.js';
import {
  UrlTemplateSettingsController,
  type UrlTemplateSettingsControllerDeps,
} from '../extension/src/ui/panel/url-template-settings-controller.js';

const SOURCE_URL = 'https://images.example.test/albums/1024/photo_0042.jpg';
const SOURCE_HOSTNAME = 'images.example.test';

interface Harness {
  readonly controller: UrlTemplateSettingsController;
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
  seedTemplate(): UrlTemplateRecord;
  readonly saveLog: UrlTemplateRecord[];
  readonly removeLog: { readonly hostname: string; readonly id: string }[];
  readonly savePatternLog: GrabSourcePattern[];
  readonly removePatternLog: { readonly hostname: string; readonly id: string }[];
  readonly pageTemplates: { readonly templates: readonly UrlTemplateRecord[]; readonly activeId: string | null }[];
  readonly pagePatterns: (readonly GrabSourcePattern[])[];
  renderCount(): number;
  loadCount(): number;
}

// A page-adapter/store harness backed by plain Maps, mirroring the in-memory-fake pattern in
// tests/dom/parsed-field-state-sync.test.ts. `loadGrabSettings` emulates the panel-owned method that
// stays behind after the extraction — it reloads from the store, re-activates the best-matching
// template through the controller's own helpers, and pushes to the page adapter.
function createHarness(model: ParsedUrlModel = parseUrl(SOURCE_URL)): Harness {
  let state = createInitialPanelState(0);
  const templatesByHost = new Map<string, UrlTemplateRecord[]>();
  const patternsByHost = new Map<string, GrabSourcePattern[]>();
  const saveLog: UrlTemplateRecord[] = [];
  const removeLog: { readonly hostname: string; readonly id: string }[] = [];
  const savePatternLog: GrabSourcePattern[] = [];
  const removePatternLog: { readonly hostname: string; readonly id: string }[] = [];
  const pageTemplates: { readonly templates: readonly UrlTemplateRecord[]; readonly activeId: string | null }[] = [];
  const pagePatterns: (readonly GrabSourcePattern[])[] = [];
  let renders = 0;
  let loads = 0;

  const store: UrlTemplateStore = {
    load: async (hostname) => templatesByHost.get(hostname) ?? [],
    loadGrabSourcePatterns: async (hostname) => patternsByHost.get(hostname) ?? [],
    save: async (template) => {
      const list = templatesByHost.get(template.hostname) ?? [];
      templatesByHost.set(template.hostname, [...list.filter((candidate) => candidate.id !== template.id), template]);
      saveLog.push(template);
    },
    saveGrabSourcePattern: async (pattern) => {
      const list = patternsByHost.get(pattern.hostname) ?? [];
      patternsByHost.set(pattern.hostname, [...list.filter((candidate) => candidate.id !== pattern.id), pattern]);
      savePatternLog.push(pattern);
    },
    remove: async (hostname, id) => {
      templatesByHost.set(
        hostname,
        (templatesByHost.get(hostname) ?? []).filter((candidate) => candidate.id !== id),
      );
      removeLog.push({ hostname, id });
    },
    removeGrabSourcePattern: async (hostname, id) => {
      patternsByHost.set(
        hostname,
        (patternsByHost.get(hostname) ?? []).filter((candidate) => candidate.id !== id),
      );
      removePatternLog.push({ hostname, id });
    },
  };

  const deps: UrlTemplateSettingsControllerDeps = {
    store: () => store,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      renders += 1;
    },
    currentUrlModel: () => model,
    setUrlTemplates: (templates, activeId) => {
      pageTemplates.push({ templates, activeId });
    },
    setGrabSourcePatterns: (patterns) => {
      pagePatterns.push(patterns);
    },
    loadGrabSettings: async () => {
      const hostname = controller.currentUrlTemplateHostname();
      if (!hostname) return;
      const [templates, grabSourcePatterns] = await Promise.all([store.load(hostname), store.loadGrabSourcePatterns(hostname)]);
      state = reducePanelAction(state, {
        name: 'url-templates/load',
        templates,
        activeTemplateId: controller.activeTemplateIdForCurrentUrl(templates),
      });
      state = reducePanelAction(state, { name: 'grab-source-patterns/load', patterns: grabSourcePatterns });
      controller.syncGrabSettings();
      loads += 1;
    },
  };
  const controller = new UrlTemplateSettingsController(deps);

  return {
    controller,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
    seedTemplate: () => {
      const fields = collectUrlFields(model);
      const template = createUrlTemplateRecord({ model, fields, includedFieldIds: [fields[0]!.id] });
      assert.ok(template, 'expected a template to be created from the seed model');
      // Seed the backing store directly (not via store.save) so the seed does not pollute saveLog.
      templatesByHost.set(template.hostname, [...(templatesByHost.get(template.hostname) ?? []), template]);
      return template;
    },
    saveLog,
    removeLog,
    savePatternLog,
    removePatternLog,
    pageTemplates,
    pagePatterns,
    renderCount: () => renders,
    loadCount: () => loads,
  };
}

test('saveUrlTemplateFromCurrentFields persists a record and activates the best match', async () => {
  const harness = createHarness();
  const fields = collectUrlFields(parseUrl(SOURCE_URL));
  harness.patchState({ unlockedFieldIds: [fields[0]!.id] });

  await harness.controller.saveUrlTemplateFromCurrentFields();

  assert.equal(harness.saveLog.length, 1);
  const saved = harness.saveLog[0]!;
  assert.equal(saved.hostname, SOURCE_HOSTNAME);
  assert.equal(harness.loadCount(), 1, 'save reloads grab settings');
  assert.equal(harness.getState().activeUrlTemplateId, saved.id, 'the best-matching template becomes active');
  assert.deepEqual(
    harness.getState().urlTemplates.map((template) => template.id),
    [saved.id],
  );
  const lastPush = harness.pageTemplates.at(-1)!;
  assert.equal(lastPush.activeId, saved.id, 'the active template is pushed to the page adapter');
});

test('saveUrlTemplateFromCurrentFields with no unlocked fields removes the existing template', async () => {
  const harness = createHarness();
  const existing = harness.seedTemplate();
  harness.patchState({ urlTemplates: [existing], activeUrlTemplateId: existing.id, unlockedFieldIds: [] });

  await harness.controller.saveUrlTemplateFromCurrentFields();

  assert.equal(harness.saveLog.length, 0, 'nothing is saved when there are no unlocked fields');
  assert.deepEqual(harness.removeLog, [{ hostname: existing.hostname, id: existing.id }]);
  assert.deepEqual(harness.getState().urlTemplates, [], 'the reload clears the removed template');
  assert.equal(harness.getState().activeUrlTemplateId, null);
});

test('removeUrlTemplate clears the active template and pushes the empty set to the page', async () => {
  const harness = createHarness();
  const template = harness.seedTemplate();
  harness.patchState({ urlTemplates: [template], activeUrlTemplateId: template.id });

  await harness.controller.removeUrlTemplate(template.id);

  assert.deepEqual(harness.removeLog, [{ hostname: template.hostname, id: template.id }]);
  assert.deepEqual(harness.getState().urlTemplates, []);
  assert.equal(harness.getState().activeUrlTemplateId, null);
  const lastPush = harness.pageTemplates.at(-1)!;
  assert.deepEqual(lastPush, { templates: [], activeId: null });
});

test('learn/update/remove grab-source pattern round-trips through the store and page', async () => {
  const harness = createHarness();

  await harness.controller.learnGrabSourcePattern(SOURCE_URL);

  assert.equal(harness.savePatternLog.length, 1);
  const learned = harness.savePatternLog[0]!;
  assert.equal(learned.hostname, SOURCE_HOSTNAME);
  assert.equal(harness.getState().status, 'ready');
  assert.match(harness.getState().message, /Learned grab pattern for images\.example\.test\./u);
  assert.deepEqual(
    harness.getState().grabSourcePatterns.map((pattern) => pattern.id),
    [learned.id],
  );
  assert.deepEqual(
    harness.pagePatterns.at(-1)!.map((pattern) => pattern.id),
    [learned.id],
  );

  await harness.controller.updateGrabSourcePattern(learned.id, {
    name: 'grab-source-pattern/update-settings',
    id: learned.id,
    matchMode: 'broad-site',
  });

  assert.equal(harness.savePatternLog.length, 2);
  assert.equal(harness.savePatternLog.at(-1)!.matchRules.mode, 'broad-site', 'the settings change is persisted');

  await harness.controller.removeGrabSourcePattern(learned.id);

  assert.deepEqual(harness.removePatternLog, [{ hostname: learned.hostname, id: learned.id }]);
  assert.deepEqual(harness.getState().grabSourcePatterns, []);
  assert.deepEqual(harness.pagePatterns.at(-1)!, []);
});

test('updateUrlTemplateSettings persists the change and re-syncs the page', async () => {
  const harness = createHarness();
  const template = harness.seedTemplate();
  harness.patchState({ urlTemplates: [template], activeUrlTemplateId: template.id });

  await harness.controller.updateUrlTemplateSettings(template.id, {
    name: 'url-template/update-settings',
    id: template.id,
    autoApplyEnabled: false,
  });

  assert.equal(harness.saveLog.length, 1);
  assert.equal(harness.saveLog[0]!.autoApplyEnabled, false);
  assert.equal(harness.getState().urlTemplates[0]!.autoApplyEnabled, false);
  assert.equal(harness.pageTemplates.at(-1)!.activeId, template.id);
});

test('updateUrlTemplateFields persists the new field set and updates the unlocked fields', async () => {
  const harness = createHarness();
  const fields = collectUrlFields(parseUrl(SOURCE_URL));
  const template = harness.seedTemplate();
  harness.patchState({ urlTemplates: [template], activeUrlTemplateId: template.id, unlockedFieldIds: [fields[0]!.id] });

  await harness.controller.updateUrlTemplateFields(template.id, {
    name: 'url-template/update-fields',
    id: template.id,
    includedFieldIds: [fields[0]!.id, fields[1]!.id],
  });

  assert.equal(harness.saveLog.length, 1);
  assert.deepEqual(
    harness.saveLog[0]!.fields.map((field) => field.id),
    [fields[0]!.id, fields[1]!.id],
  );
  assert.deepEqual(harness.getState().unlockedFieldIds, [fields[0]!.id, fields[1]!.id]);
  assert.equal(harness.pageTemplates.at(-1)!.activeId, template.id);
});

test('updateUrlTemplateFields removes the template when no fields remain included', async () => {
  const harness = createHarness();
  const template = harness.seedTemplate();
  harness.patchState({ urlTemplates: [template], activeUrlTemplateId: template.id });

  await harness.controller.updateUrlTemplateFields(template.id, {
    name: 'url-template/update-fields',
    id: template.id,
    includedFieldIds: [],
  });

  assert.equal(harness.saveLog.length, 0);
  assert.deepEqual(harness.removeLog, [{ hostname: template.hostname, id: template.id }]);
  assert.deepEqual(harness.getState().urlTemplates, []);
  assert.equal(harness.getState().activeUrlTemplateId, null);
});

test('syncGrabSettings pushes the current templates and patterns to the page adapter', async () => {
  const harness = createHarness();
  const template = harness.seedTemplate();
  await harness.controller.learnGrabSourcePattern(SOURCE_URL);
  const pattern = harness.getState().grabSourcePatterns[0]!;
  harness.patchState({ urlTemplates: [template], activeUrlTemplateId: template.id, grabSourcePatterns: [pattern] });

  harness.controller.syncGrabSettings();

  assert.deepEqual(harness.pageTemplates.at(-1)!, { templates: [template], activeId: template.id });
  assert.deepEqual(harness.pagePatterns.at(-1)!, [pattern]);
});
