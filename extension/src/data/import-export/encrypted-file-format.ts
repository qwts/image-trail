import * as v from 'valibot';
import type { EncryptionAlgorithm, KeyKind, KeyWrappingMode } from '../crypto/types.js';
import { exportFileEnvelopeSchema, exportFileHeaderSchema } from './encrypted-file-format.schema.js';

export const EXPORT_FORMAT_MAGIC = 'IMAGE-TRAIL-EXPORT';
export const EXPORT_FORMAT_VERSION = 1;

export type ExportPayloadType = 'history' | 'bookmarks' | 'mixed' | 'keys' | 'image';

export interface ExportFileHeader {
  readonly magic: typeof EXPORT_FORMAT_MAGIC;
  readonly formatVersion: typeof EXPORT_FORMAT_VERSION;
  readonly payloadType: ExportPayloadType;
  readonly algorithm: EncryptionAlgorithm;
  readonly wrappingMode: KeyWrappingMode;
  readonly keyKind: KeyKind;
  readonly keyReference: string;
  readonly salt: string;
  readonly iv: string;
  readonly iterations: number;
  readonly createdAt: string;
  readonly recordCount: number;
}

export interface ExportFileEnvelope {
  readonly header: ExportFileHeader;
  readonly payload: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export function buildExportFileHeader(params: {
  readonly payloadType: ExportPayloadType;
  readonly algorithm: EncryptionAlgorithm;
  readonly wrappingMode: KeyWrappingMode;
  readonly keyKind: KeyKind;
  readonly keyReference: string;
  readonly salt: Uint8Array;
  readonly iv: Uint8Array;
  readonly iterations: number;
  readonly recordCount: number;
  readonly now?: string;
}): ExportFileHeader {
  return {
    magic: EXPORT_FORMAT_MAGIC,
    formatVersion: EXPORT_FORMAT_VERSION,
    payloadType: params.payloadType,
    algorithm: params.algorithm,
    wrappingMode: params.wrappingMode,
    keyKind: params.keyKind,
    keyReference: params.keyReference,
    salt: toBase64(params.salt),
    iv: toBase64(params.iv),
    iterations: params.iterations,
    createdAt: params.now ?? new Date().toISOString(),
    recordCount: params.recordCount,
  };
}

export function validateExportFileHeader(header: unknown): header is ExportFileHeader {
  return v.is(exportFileHeaderSchema, header);
}

export function serializeExportFile(envelope: ExportFileEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseExportFile(raw: string): ExportFileEnvelope {
  const parsed: unknown = JSON.parse(raw);
  const result = v.safeParse(exportFileEnvelopeSchema, parsed);
  if (!result.success) {
    throw new Error('Invalid export file: header validation failed.');
  }
  return result.output;
}

export { toBase64, fromBase64 };
