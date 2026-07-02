import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../schema-assert.js';
import type { LinkedPageImageExtractor, UrlTemplateGrabStrategy } from './grab-strategies.js';

export const linkedPageImageExtractorSchema = v.object({
  selector: v.string(),
  attribute: v.string(),
});

export const urlTemplateGrabStrategySchema = v.variant('kind', [
  v.object({ kind: v.literal('clicked-image') }),
  v.object({
    kind: v.literal('linked-page-image'),
    extractors: v.pipe(v.array(linkedPageImageExtractorSchema), v.readonly()),
    timeoutMs: v.number(),
    maxBytes: v.number(),
  }),
]);

type _AssertLinkedPageImageExtractor = Assert<
  MutuallyAssignable<v.InferOutput<typeof linkedPageImageExtractorSchema>, LinkedPageImageExtractor>
>;
type _AssertUrlTemplateGrabStrategy = Assert<
  MutuallyAssignable<v.InferOutput<typeof urlTemplateGrabStrategySchema>, UrlTemplateGrabStrategy>
>;
