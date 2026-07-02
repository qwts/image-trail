import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from './schema-assert.js';
import { urlFieldDigitWidthSpecSchema, urlFieldSplitSpecSchema } from './url/types.schema.js';
import type { PanelPosition, ParsedFieldStateRecord, UrlReviewStatus, UrlReviewStatusClearFilter, UrlReviewStatusRecord } from './types.js';

export const panelPositionSchema = v.object({
  left: v.number(),
  top: v.number(),
});

export const parsedFieldStateRecordSchema = v.object({
  schemaVersion: v.literal(1),
  hostname: v.string(),
  pageUrl: v.string(),
  sourceUrl: v.string(),
  selectedUrl: v.nullable(v.string()),
  selectedHandleId: v.nullable(v.string()),
  activeFieldId: v.nullable(v.string()),
  failedFieldId: v.nullable(v.string()),
  successfulFieldIds: v.pipe(v.array(v.string()), v.readonly()),
  unchangedFieldIds: v.pipe(v.array(v.string()), v.readonly()),
  unlockedFieldIds: v.pipe(v.array(v.string()), v.readonly()),
  manuallyExcludedFieldIds: v.pipe(v.array(v.string()), v.readonly()),
  fieldSplitSpecs: v.pipe(v.array(urlFieldSplitSpecSchema), v.readonly()),
  fieldDigitWidthSpecs: v.optional(v.pipe(v.array(urlFieldDigitWidthSpecSchema), v.readonly())),
  activeUrlTemplateId: v.nullable(v.string()),
  updatedAt: v.string(),
});

export const urlReviewStatusSchema = v.picklist(['passed', 'failed', 'unchanged']);

export const urlReviewStatusRecordSchema = v.object({
  schemaVersion: v.literal(1),
  hostname: v.string(),
  pageUrl: v.string(),
  sourceUrl: v.string(),
  status: urlReviewStatusSchema,
  fieldIds: v.pipe(v.array(v.string()), v.readonly()),
  activeFieldId: v.nullable(v.string()),
  reason: v.optional(v.string()),
  updatedAt: v.string(),
});

export const urlReviewStatusClearFilterSchema = v.variant('scope', [
  v.object({ scope: v.literal('hostname'), hostname: v.string() }),
  v.object({ scope: v.literal('page'), hostname: v.string(), pageUrl: v.string() }),
  v.object({ scope: v.literal('source'), hostname: v.string(), sourceUrl: v.string() }),
  v.object({ scope: v.literal('all') }),
]);

type _AssertPanelPosition = Assert<MutuallyAssignable<v.InferOutput<typeof panelPositionSchema>, PanelPosition>>;
type _AssertParsedFieldStateRecord = Assert<MutuallyAssignable<v.InferOutput<typeof parsedFieldStateRecordSchema>, ParsedFieldStateRecord>>;
type _AssertUrlReviewStatus = Assert<MutuallyAssignable<v.InferOutput<typeof urlReviewStatusSchema>, UrlReviewStatus>>;
type _AssertUrlReviewStatusRecord = Assert<MutuallyAssignable<v.InferOutput<typeof urlReviewStatusRecordSchema>, UrlReviewStatusRecord>>;
type _AssertUrlReviewStatusClearFilter = Assert<
  MutuallyAssignable<v.InferOutput<typeof urlReviewStatusClearFilterSchema>, UrlReviewStatusClearFilter>
>;
