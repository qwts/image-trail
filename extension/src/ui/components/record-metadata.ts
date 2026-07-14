import {
  displayTitleForRecord,
  imageExtensionFromUrl,
  imageExtensionFromValue,
  normalizeDisplayLabel,
  type ImageDisplayRecord,
} from '../../core/display-records.js';

export interface RecordPrivacyOptions {
  readonly privacyMode?: boolean;
}

export const PRIVACY_RECORD_NAME = 'Private image';
export const PRIVACY_RECORD_META = 'Details hidden';
export const PRIVACY_URL_TEXT = 'Private URL hidden';

export function recordDisplayName(record: ImageDisplayRecord, options: RecordPrivacyOptions = {}): string {
  if (options.privacyMode && record.privacyStatus !== 'locked') return PRIVACY_RECORD_NAME;
  if (record.privacyStatus === 'locked') return 'Private pin';
  return normalizeDisplayLabel(record);
}

export function recordTitle(record: ImageDisplayRecord, options: RecordPrivacyOptions = {}): string {
  if (options.privacyMode && record.privacyStatus !== 'locked') return 'Privacy mode is hiding this image metadata for screen sharing.';
  if (record.privacyStatus === 'locked') return 'Unlock encrypted originals to show private pin metadata.';
  return displayTitleForRecord(record);
}

export function recordExtensionLabel(record: ImageDisplayRecord): string {
  if (record.privacyStatus === 'locked') return 'LOCK';
  const extension =
    imageExtensionFromUrl(record.url) ?? imageExtensionFromUrl(record.thumbnail ?? '') ?? imageExtensionFromValue(record.label);
  return extension ? extension.toUpperCase() : 'IMAGE';
}

export function recordMetadataText(record: ImageDisplayRecord, options: RecordPrivacyOptions = {}): string {
  if (options.privacyMode && record.privacyStatus !== 'locked') return PRIVACY_RECORD_META;
  if (record.privacyStatus === 'locked') return 'Locked';
  const parts = [formatRecordDate(record.timestamp), recordResolutionText(record)].filter((part): part is string => !!part);
  return parts.join(' · ');
}

export function recordResolutionText(record: ImageDisplayRecord): string | null {
  return isPositiveDimension(record.width) && isPositiveDimension(record.height) ? `${record.width} x ${record.height}` : null;
}

function formatRecordDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function isPositiveDimension(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
