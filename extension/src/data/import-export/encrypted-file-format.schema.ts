import * as v from 'valibot';
import { encryptionAlgorithmSchema, keyKindSchema, keyWrappingModeSchema } from '../crypto/types.schema.js';
import type { ExportFileEnvelope, ExportFileHeader } from './encrypted-file-format.js';

export const exportPayloadTypeSchema = v.picklist(['history', 'bookmarks', 'mixed', 'keys', 'image']);

// `magic`/`formatVersion` literals mirror EXPORT_FORMAT_MAGIC / EXPORT_FORMAT_VERSION in
// ./encrypted-file-format.ts. They are inlined (not imported) so this schema stays a
// pure leaf and cannot form a value-level import cycle with that module, which imports
// these schemas back. The `satisfies ExportFileHeader['magic']`-style parity is enforced
// by the `as GenericSchema<unknown, ExportFileHeader>` cast below.
export const exportFileHeaderSchema = v.object({
  magic: v.literal('IMAGE-TRAIL-EXPORT'),
  formatVersion: v.literal(1),
  payloadType: exportPayloadTypeSchema,
  algorithm: encryptionAlgorithmSchema,
  wrappingMode: keyWrappingModeSchema,
  keyKind: keyKindSchema,
  keyReference: v.string(),
  salt: v.string(),
  iv: v.string(),
  iterations: v.number(),
  createdAt: v.string(),
  recordCount: v.number(),
}) as v.GenericSchema<unknown, ExportFileHeader>;

export const exportFileEnvelopeSchema = v.object({
  header: exportFileHeaderSchema,
  payload: v.string(),
}) as v.GenericSchema<unknown, ExportFileEnvelope>;
