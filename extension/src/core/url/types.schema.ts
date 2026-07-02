import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../schema-assert.js';
import type { UrlFieldDigitWidthSpec, UrlFieldLocation, UrlFieldSplitSpec } from './types.js';

export const urlFieldLocationSchema = v.picklist(['path', 'query']);

export const urlFieldSplitSpecSchema = v.object({
  baseFieldId: v.string(),
  location: urlFieldLocationSchema,
  partIndex: v.optional(v.number()),
  queryIndex: v.optional(v.number()),
  tokenIndex: v.number(),
  lengths: v.pipe(v.array(v.number()), v.readonly()),
  pattern: v.string(),
});

export const urlFieldDigitWidthSpecSchema = v.object({
  fieldId: v.string(),
  width: v.number(),
  sourceWidth: v.optional(v.number()),
});

type _AssertUrlFieldLocation = Assert<MutuallyAssignable<v.InferOutput<typeof urlFieldLocationSchema>, UrlFieldLocation>>;
type _AssertUrlFieldSplitSpec = Assert<MutuallyAssignable<v.InferOutput<typeof urlFieldSplitSpecSchema>, UrlFieldSplitSpec>>;
type _AssertUrlFieldDigitWidthSpec = Assert<MutuallyAssignable<v.InferOutput<typeof urlFieldDigitWidthSpecSchema>, UrlFieldDigitWidthSpec>>;
