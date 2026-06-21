import {
  displayTitleForRecord,
  imageExtensionFromUrl,
  imageExtensionFromValue,
  normalizeDisplayLabel,
  type ImageDisplayRecord,
} from '../../core/display-records.js';

export function recordDisplayName(record: ImageDisplayRecord): string {
  return normalizeDisplayLabel(record);
}

export function recordTitle(record: ImageDisplayRecord): string {
  return displayTitleForRecord(record);
}

export function recordExtensionLabel(record: ImageDisplayRecord): string {
  const extension = imageExtensionFromValue(record.label) ?? imageExtensionFromUrl(record.url);
  return extension ? extension.toUpperCase() : 'IMAGE';
}

export function recordMetadataText(record: ImageDisplayRecord): string {
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
