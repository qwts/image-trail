import { normalizeDisplayLabel, sourceImageUrlFrom, type ImageDisplayRecord } from '../core/display-records.js';
import { recordDisplayName, recordExtensionLabel, recordMetadataText } from '../ui/components/record-metadata.js';
import { galleryRecordKind } from './gallery-model.js';

export interface GallerySearchOptions {
  readonly privacyMode: boolean;
}

export function normalizeGallerySearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean).join(' ');
}

export function galleryRecordMatchesSearch(record: ImageDisplayRecord, query: string, options: GallerySearchOptions): boolean {
  const normalized = normalizeGallerySearchQuery(query);
  if (!normalized) return true;
  const haystack = gallerySearchText(record, options);
  return normalized.split(' ').every((term) => haystack.includes(term));
}

export function gallerySearchText(record: ImageDisplayRecord, options: GallerySearchOptions): string {
  const values =
    options.privacyMode || record.privacyStatus === 'locked'
      ? privacySafeFields(record, options)
      : [...privacySafeFields(record, options), ...urlFields(record), record.title, record.label, normalizeDisplayLabel(record)];
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n')
    .toLocaleLowerCase();
}

function privacySafeFields(record: ImageDisplayRecord, options: GallerySearchOptions): readonly string[] {
  return options.privacyMode && record.privacyStatus !== 'locked'
    ? [recordDisplayName(record, options), recordMetadataText(record, options), galleryRecordKind(record)]
    : [recordDisplayName(record, options), recordMetadataText(record, options), recordExtensionLabel(record), galleryRecordKind(record)];
}

function urlFields(record: ImageDisplayRecord): readonly string[] {
  const values = [record.url];
  try {
    const source = sourceImageUrlFrom(record.url);
    values.push(source.href, source.hostname, source.pathname);
    const filename = source.pathname.split('/').filter(Boolean).at(-1);
    if (filename) values.push(decodeURIComponent(filename));
  } catch {
    // Non-URL records can still match through label/title/display metadata.
  }
  return values;
}
