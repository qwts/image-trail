import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFieldLoadFailureToState,
  applyFieldSplitSpecToState,
  pruneInvalidFieldSplitSpecsFromState,
  reducePanelAction,
} from '../extension/src/core/actions.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import { applyFieldSplitSpecs, createFieldSplitSpec } from '../extension/src/core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../extension/src/core/url/field-widths.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { rebuildUrl } from '../extension/src/core/url/rebuild-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import { nextParsedFieldStatePageKey, shouldRestoreParsedFieldState } from '../extension/src/ui/panel.js';
import type { UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from '../extension/src/core/url/types.js';
import type { UrlTemplateRecord } from '../extension/src/core/url/templates.js';

test('switching active fields clears a previous failed field marker', () => {
  const failed = { ...createInitialPanelState(), activeFieldId: 'query-src-0', failedFieldId: 'query-src-0' };

  const next = reducePanelAction(failed, { name: 'active-field/set', id: 'query-page-0' });

  assert.equal(next.activeFieldId, 'query-page-0');
  assert.equal(next.failedFieldId, null);
});

test('duplicate active field selection preserves state reference', () => {
  const state = { ...createInitialPanelState(), activeFieldId: 'query-page-0' };

  const next = reducePanelAction(state, { name: 'active-field/set', id: 'query-page-0' });

  assert.equal(next, state);
});

test('Previous/Next inclusion toggle only changes successful fields', () => {
  const state = { ...createInitialPanelState(), successfulFieldIds: ['q:0:0'] };

  const included = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(included.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(included.manuallyExcludedFieldIds, []);

  const excluded = reducePanelAction(included, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(excluded.unlockedFieldIds, []);
  assert.deepEqual(excluded.manuallyExcludedFieldIds, ['q:0:0']);

  const includedAgain = reducePanelAction(excluded, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(includedAgain.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(includedAgain.manuallyExcludedFieldIds, []);

  const ignored = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:1:0' });
  assert.equal(ignored, state);
  assert.deepEqual(ignored.unlockedFieldIds, []);
  assert.deepEqual(ignored.manuallyExcludedFieldIds, []);
});

test('loaded active URL templates restore included fields for navigation', () => {
  const identityKey = '42'.repeat(32);
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 2,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactIdentity: '11'.repeat(32),
      pathShapeSignature: 'shape',
      queryShapeSignature: '0:int',
    },
    fields: [
      {
        id: 'q:0:0',
        label: 'query page',
        placeholder: '{query-page}',
        location: 'query',
        tokenKind: 'int',
        queryIndex: 0,
        queryKey: 'page',
        tokenIndex: 0,
      },
    ],
    hideExcludedFields: true,
    autoApplyEnabled: true,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  const loaded = reducePanelAction(createInitialPanelState(), {
    name: 'url-templates/load',
    templates: [template],
    identityKey,
    activeTemplateId: template.id,
  });
  assert.equal(loaded.activeUrlTemplateId, template.id);
  assert.deepEqual(loaded.unlockedFieldIds, ['q:0:0']);

  const excluded = reducePanelAction(loaded, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(excluded.unlockedFieldIds, []);
  assert.deepEqual(excluded.manuallyExcludedFieldIds, ['q:0:0']);

  const inactive = reducePanelAction(
    { ...loaded, unlockedFieldIds: ['q:0:0', 'q:1:0'], manuallyExcludedFieldIds: ['q:0:0', 'q:2:0'] },
    { name: 'url-templates/load', templates: [template], identityKey, activeTemplateId: null },
  );
  assert.equal(inactive.activeUrlTemplateId, null);
  assert.deepEqual(inactive.unlockedFieldIds, ['q:1:0']);
  assert.deepEqual(inactive.manuallyExcludedFieldIds, ['q:0:0', 'q:2:0']);

  const failedDraft = reducePanelAction(
    {
      ...loaded,
      draftUrl: 'https://example.test/missing.jpg?page=404',
      status: 'error',
      message: 'Image failed to load: HTTP 404',
    },
    { name: 'url-templates/load', templates: [template], identityKey, activeTemplateId: null },
  );
  assert.equal(failedDraft.activeUrlTemplateId, template.id);
  assert.deepEqual(failedDraft.unlockedFieldIds, ['q:0:0']);

  const cleared = reducePanelAction(
    { ...loaded, unlockedFieldIds: ['q:0:0', 'q:1:0'], manuallyExcludedFieldIds: ['q:0:0', 'q:2:0'] },
    { name: 'url-template/remove', id: template.id },
  );
  assert.equal(cleared.activeUrlTemplateId, null);
  assert.deepEqual(cleared.unlockedFieldIds, ['q:1:0']);
  assert.deepEqual(cleared.manuallyExcludedFieldIds, ['q:2:0']);
});

test('failed field load preserves Previous/Next inclusion choices', () => {
  const state = {
    ...createInitialPanelState(),
    successfulFieldIds: ['q:0:0', 'q:1:0'],
    unchangedFieldIds: ['q:0:0'],
    unlockedFieldIds: ['q:0:0', 'q:1:0'],
    manuallyExcludedFieldIds: ['q:2:0'],
  };

  const next = applyFieldLoadFailureToState(state, {
    draftUrl: 'https://example.test/missing.jpg?date=02012001&page=2',
    attemptedFieldIds: ['q:0:0', 'q:1:0'],
    message: 'Image failed to load: HTTP 404',
  });

  assert.equal(next.failedFieldId, 'q:0:0');
  assert.equal(next.draftUrl, 'https://example.test/missing.jpg?date=02012001&page=2');
  assert.deepEqual(next.successfulFieldIds, ['q:0:0', 'q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0', 'q:1:0']);
  assert.deepEqual(next.manuallyExcludedFieldIds, ['q:2:0']);
});

test('clearing split specs collapses fields and clears related markers', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2, 4],
    pattern: '2-2-4',
  };
  const state = {
    ...createInitialPanelState(),
    activeFieldId: 'q:0:0:s:2',
    failedFieldId: 'q:0:0:s:1',
    successfulFieldIds: ['q:0:0', 'q:0:0:s:2', 'q:1:0'],
    unchangedFieldIds: ['q:0:0:s:1'],
    unlockedFieldIds: ['q:0:0', 'q:0:0:s:2'],
    manuallyExcludedFieldIds: ['q:0:0:s:1'],
    fieldSplitSpecs: [splitSpec],
    fieldDigitWidthSpecs: [{ fieldId: 'q:0:0:s:2', width: 4 }],
  };

  const next = reducePanelAction(state, { name: 'field/transform', fieldId: 'q:0:0', transformId: 'split-clear' });

  assert.equal(next.activeFieldId, null);
  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, ['q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.deepEqual(next.manuallyExcludedFieldIds, []);
  assert.deepEqual(next.fieldSplitSpecs, []);
  assert.deepEqual(next.fieldDigitWidthSpecs, []);
});

test('clearing missing split spec preserves state reference', () => {
  const state = createInitialPanelState();

  const next = reducePanelAction(state, { name: 'field/transform', fieldId: 'q:0:0', transformId: 'split-clear' });

  assert.equal(next, state);
});

test('reapplying identical split spec preserves state reference', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2, 4],
    pattern: '2-2-4',
  };
  const state = { ...createInitialPanelState(), fieldSplitSpecs: [splitSpec] };

  const next = applyFieldSplitSpecToState(state, splitSpec);

  assert.equal(next, state);
});

test('splitting an earlier token preserves later field widths and markers by stable identity', () => {
  const url = 'https://example.com/gallery/2024-456-789/photo.jpg';
  const model = parseUrl(url);
  const fields = collectUrlFields(model);
  const splitTarget = fields.find((field) => field.value === '2024');
  const widthTarget = fields.find((field) => field.value === '789');
  assert.ok(splitTarget);
  assert.ok(widthTarget);
  assert.equal(widthTarget.id, 'p:3:4');
  const splitSpec = createFieldSplitSpec(splitTarget, '1-1-2');
  assert.ok(!('ok' in splitSpec));
  const state = {
    ...createInitialPanelState(),
    activeFieldId: widthTarget.id,
    successfulFieldIds: [widthTarget.id],
    unlockedFieldIds: [widthTarget.id],
    fieldDigitWidthSpecs: [{ fieldId: widthTarget.id, width: 6 }],
  };

  const splitState = applyFieldSplitSpecToState(state, splitSpec);
  assert.equal(splitState.activeFieldId, widthTarget.id);
  assert.deepEqual(splitState.successfulFieldIds, [widthTarget.id]);
  assert.deepEqual(splitState.unlockedFieldIds, [widthTarget.id]);
  assert.deepEqual(splitState.fieldDigitWidthSpecs, [{ fieldId: widthTarget.id, width: 6 }]);

  const projected = applyFieldDigitWidthSpecs(applyFieldSplitSpecs(model, splitState.fieldSplitSpecs), splitState.fieldDigitWidthSpecs);
  assert.equal(rebuildUrl(projected), 'https://example.com/gallery/2024-456-000789/photo.jpg');
  assert.equal(collectUrlFields(projected).find((field) => field.value === '456')?.id, 'p:3:2');
  assert.equal(collectUrlFields(projected).find((field) => field.value === '000789')?.id, widthTarget.id);

  const cleared = reducePanelAction(splitState, {
    name: 'field/transform',
    fieldId: splitSpec.baseFieldId,
    transformId: 'split-clear',
  });
  assert.equal(cleared.activeFieldId, widthTarget.id);
  assert.deepEqual(cleared.successfulFieldIds, [widthTarget.id]);
  assert.deepEqual(cleared.unlockedFieldIds, [widthTarget.id]);
  assert.deepEqual(cleared.fieldDigitWidthSpecs, [{ fieldId: widthTarget.id, width: 6 }]);
});

test('pruning stale split specs clears related markers after split collapse', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2, 4],
    pattern: '2-2-4',
  };
  const state = {
    ...createInitialPanelState(),
    activeFieldId: 'q:0:0:s:2',
    failedFieldId: 'q:0:0:s:1',
    successfulFieldIds: ['q:0:0', 'q:0:0:s:2', 'q:1:0'],
    unchangedFieldIds: ['q:0:0:s:1'],
    unlockedFieldIds: ['q:0:0', 'q:0:0:s:2'],
    manuallyExcludedFieldIds: ['q:0:0:s:1'],
    fieldSplitSpecs: [splitSpec],
    fieldDigitWidthSpecs: [{ fieldId: 'q:0:0:s:2', width: 4 }],
  };

  const next = pruneInvalidFieldSplitSpecsFromState(state, parseUrl('https://example.test/image?date=112001'));

  assert.equal(next.activeFieldId, null);
  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, ['q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.deepEqual(next.manuallyExcludedFieldIds, []);
  assert.deepEqual(next.fieldSplitSpecs, []);
  assert.deepEqual(next.fieldDigitWidthSpecs, []);
});

test('parsed field state restore revives saved field markers', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2],
    pattern: '2-2',
  };
  const digitWidthSpec: UrlFieldDigitWidthSpec = { fieldId: 'q:0:0:s:1', width: 5 };

  const next = reducePanelAction(createInitialPanelState(), {
    name: 'parsed-field-state/restore',
    record: {
      schemaVersion: 1,
      hostname: 'example.test',
      pageUrl: 'https://example.test/gallery',
      sourceUrl: 'https://cdn.example.test/image-0001.jpg',
      selectedUrl: 'https://cdn.example.test/image-0001.jpg',
      selectedHandleId: 'target-1',
      activeFieldId: 'q:0:0:s:1',
      failedFieldId: 'q:0:0:s:0',
      successfulFieldIds: ['q:0:0:s:1'],
      unchangedFieldIds: ['q:1:0'],
      unlockedFieldIds: ['q:0:0:s:1'],
      manuallyExcludedFieldIds: ['q:2:0'],
      fieldSplitSpecs: [splitSpec],
      fieldDigitWidthSpecs: [digitWidthSpec],
      activeUrlTemplateId: 'template-1',
      updatedAt: '2026-06-22T00:00:00.000Z',
    },
  });

  assert.equal(next.activeFieldId, 'q:0:0:s:1');
  assert.equal(next.failedFieldId, 'q:0:0:s:0');
  assert.deepEqual(next.successfulFieldIds, ['q:0:0:s:1']);
  assert.deepEqual(next.unchangedFieldIds, ['q:1:0']);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0:s:1']);
  assert.deepEqual(next.manuallyExcludedFieldIds, ['q:2:0']);
  assert.deepEqual(next.fieldSplitSpecs, [splitSpec]);
  assert.deepEqual(next.fieldDigitWidthSpecs, [digitWidthSpec]);
  assert.equal(next.activeUrlTemplateId, 'template-1');
  assert.equal(next.draftUrl, null);
});

test('parsed field state restore revives draft URL attempts', () => {
  const next = reducePanelAction(createInitialPanelState(), {
    name: 'parsed-field-state/restore',
    record: {
      schemaVersion: 1,
      hostname: 'example.test',
      pageUrl: 'https://example.test/gallery',
      sourceUrl: 'https://cdn.example.test/image-0002.jpg',
      selectedUrl: 'https://cdn.example.test/image-0001.jpg',
      selectedHandleId: 'target-1',
      activeFieldId: 'q:0:0',
      failedFieldId: 'q:0:0',
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      activeUrlTemplateId: null,
      updatedAt: '2026-06-22T00:00:00.000Z',
    },
  });

  assert.equal(next.draftUrl, 'https://cdn.example.test/image-0002.jpg');
  assert.equal(next.failedFieldId, 'q:0:0');
});

test('parsed field state restore does not replay drafts onto reused target handles', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0002.jpg', 'target-2'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0001.jpg', 'target-1'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0003.jpg', 'target-1'), false);
});

test('parsed field state restore can replay edits from the original image page URL', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'external-content.duckduckgo.com',
    pageUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0001.jpg',
    sourceUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    selectedUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    selectedHandleId: 'image-trail-target-1',
    activeFieldId: 'q:0:1',
    failedFieldId: null,
    successfulFieldIds: ['q:0:1'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:1'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, record.pageUrl, 'image-trail-target-1'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://example.test/other-image.jpg', 'image-trail-target-2'), false);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://example.test/other-image.jpg', 'image-trail-target-2', record.pageUrl), true);
});

test('parsed field state restore can replay saved projection when the browser page URL matches', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0009.jpg',
    selectedUrl: 'https://cdn.example.test/image-0008.jpg',
    selectedHandleId: 'target-previous-tab',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/site-default.jpg', 'target-new-tab'), false);
  assert.equal(
    shouldRestoreParsedFieldState(record, 'https://cdn.example.test/site-default.jpg', 'target-new-tab', 'https://example.test/gallery'),
    true,
  );
});

test('parsed field state restore ignores stale draft URLs for same host image elements', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0003.jpg',
    selectedUrl: 'https://cdn.example.test/image-0003.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0003.jpg', 'target-1'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0002.jpg', 'target-1'), false);
});

test('parsed field state restore does not auto-project saved drafts onto normal page images', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0001.jpg', 'target-1'), true);
});

test('parsed field state restore ignores stale direct-image page keys on normal pages', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://cdn.example.test/image-0001.jpg',
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0001.jpg', 'target-1'), true);
});

test('parsed field page key ignores extension projections but follows page navigation', () => {
  const originalPage = 'https://example.test/gallery/1';
  const projectedImage = 'https://example.test/images/2.jpg';
  const spaRoute = 'https://example.test/gallery/2';

  assert.equal(nextParsedFieldStatePageKey(originalPage, originalPage, null), originalPage);
  assert.equal(nextParsedFieldStatePageKey(projectedImage, originalPage, projectedImage), originalPage);
  assert.equal(nextParsedFieldStatePageKey(spaRoute, originalPage, projectedImage), spaRoute);
});
