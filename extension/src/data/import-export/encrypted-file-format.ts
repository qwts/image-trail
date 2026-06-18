import type { EncryptionAlgorithm, KeyKind, KeyWrappingMode } from '../crypto/types.js';

export const EXPORT_FORMAT_MAGIC = 'IMAGE-TRAIL-EXPORT';
export const EXPORT_FORMAT_VERSION = 1;

export type ExportPayloadType = 'history' | 'bookmarks' | 'mixed' | 'keys';

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
  for (const byte of bytes) binary += String.fromCharCode(byte);
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
  if (typeof header !== 'object' || header === null) return false;
  const h = header as Record<string, unknown>;
  return (
    h.magic === EXPORT_FORMAT_MAGIC &&
    h.formatVersion === EXPORT_FORMAT_VERSION &&
    typeof h.payloadType === 'string' &&
    typeof h.algorithm === 'string' &&
    typeof h.wrappingMode === 'string' &&
    typeof h.keyKind === 'string' &&
    typeof h.keyReference === 'string' &&
    typeof h.salt === 'string' &&
    typeof h.iv === 'string' &&
    typeof h.iterations === 'number' &&
    typeof h.createdAt === 'string' &&
    typeof h.recordCount === 'number'
  );
}

export function serializeExportFile(envelope: ExportFileEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseExportFile(raw: string): ExportFileEnvelope {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Invalid export file: not a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;
  if (!validateExportFileHeader(obj.header)) {
    throw new Error('Invalid export file: header validation failed.');
  }
  if (typeof obj.payload !== 'string') {
    throw new Error('Invalid export file: missing payload.');
  }
  return { header: obj.header, payload: obj.payload as string };
}

export { toBase64, fromBase64 };
