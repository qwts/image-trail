import * as v from 'valibot';
import type { Assert, MutuallyAssignable } from '../schema-assert.js';
import { urlFieldLocationSchema } from './types.schema.js';
import { urlTemplateGrabStrategySchema } from './grab-strategies.schema.js';
import type { GrabSourcePattern, UrlTemplateField, UrlTemplateMatchMode, UrlTemplateMatchRules, UrlTemplateRecord } from './templates.js';

export const urlTemplateMatchModeSchema = v.picklist(['exact-page-shape', 'same-path-query-shape', 'broad-site']);

export const urlTemplateMatchRulesSchema = v.object({
  mode: urlTemplateMatchModeSchema,
  hostname: v.string(),
  exactPathSignature: v.string(),
  pathShapeSignature: v.string(),
  querySignature: v.string(),
});

const urlTokenKindSchema = v.picklist(['int', 'hex', 'text']);

export const urlTemplateFieldSchema = v.object({
  id: v.string(),
  label: v.string(),
  placeholder: v.string(),
  location: urlFieldLocationSchema,
  tokenKind: urlTokenKindSchema,
  partIndex: v.optional(v.number()),
  queryIndex: v.optional(v.number()),
  queryKey: v.optional(v.string()),
  tokenIndex: v.number(),
});

export const urlTemplateRecordSchema = v.object({
  id: v.string(),
  schemaVersion: v.literal(1),
  hostname: v.string(),
  templateUrl: v.string(),
  matchRules: urlTemplateMatchRulesSchema,
  fields: v.pipe(v.array(urlTemplateFieldSchema), v.readonly()),
  hideExcludedFields: v.boolean(),
  autoApplyEnabled: v.boolean(),
  grabStrategy: v.optional(urlTemplateGrabStrategySchema),
  createdAt: v.string(),
  updatedAt: v.string(),
  useCount: v.number(),
});

export const grabSourcePatternSchema = v.object({
  id: v.string(),
  schemaVersion: v.literal(1),
  hostname: v.string(),
  patternUrl: v.string(),
  matchRules: urlTemplateMatchRulesSchema,
  grabStrategy: v.optional(urlTemplateGrabStrategySchema),
  createdAt: v.string(),
  updatedAt: v.string(),
  useCount: v.number(),
});

type _AssertUrlTemplateMatchMode = Assert<MutuallyAssignable<v.InferOutput<typeof urlTemplateMatchModeSchema>, UrlTemplateMatchMode>>;
type _AssertUrlTemplateMatchRules = Assert<MutuallyAssignable<v.InferOutput<typeof urlTemplateMatchRulesSchema>, UrlTemplateMatchRules>>;
type _AssertUrlTemplateField = Assert<MutuallyAssignable<v.InferOutput<typeof urlTemplateFieldSchema>, UrlTemplateField>>;
type _AssertUrlTemplateRecord = Assert<MutuallyAssignable<v.InferOutput<typeof urlTemplateRecordSchema>, UrlTemplateRecord>>;
type _AssertGrabSourcePattern = Assert<MutuallyAssignable<v.InferOutput<typeof grabSourcePatternSchema>, GrabSourcePattern>>;
