import {
  IMAGE_RECORD_EXTENSIONS,
  imageExtensionFromUrl,
  recordHasStoredOriginal,
  sourceImageUrlFrom,
  type ImageDisplayRecord,
} from '../core/display-records.js';

export type GalleryRecordKindFilter = 'url-only' | 'stored-original' | 'locked-private';
export type GalleryImageTypeFilter = (typeof IMAGE_RECORD_EXTENSIONS)[number] | 'UNKNOWN';

export interface GalleryFilters {
  readonly sourceHost: string | null;
  readonly recordKind: GalleryRecordKindFilter | null;
  readonly imageType: GalleryImageTypeFilter | null;
}

export interface GalleryFilterFacets {
  readonly sourceHosts: readonly string[];
  readonly imageTypes: readonly GalleryImageTypeFilter[];
}

export const EMPTY_GALLERY_FILTERS: GalleryFilters = {
  sourceHost: null,
  recordKind: null,
  imageType: null,
};

export const EMPTY_GALLERY_FILTER_FACETS: GalleryFilterFacets = {
  sourceHosts: [],
  imageTypes: [],
};

export function galleryFiltersActive(filters: GalleryFilters): boolean {
  return filters.sourceHost !== null || filters.recordKind !== null || filters.imageType !== null;
}

export function activeGalleryFilterCount(filters: GalleryFilters): number {
  return Number(filters.sourceHost !== null) + Number(filters.recordKind !== null) + Number(filters.imageType !== null);
}

export function privacySafeGalleryFilters(filters: GalleryFilters, privacyMode: boolean): GalleryFilters {
  if (!privacyMode) return filters;
  return { ...filters, sourceHost: null, imageType: null };
}

export function galleryRecordMatchesFilters(
  record: ImageDisplayRecord,
  filters: GalleryFilters,
  options: { readonly privacyMode: boolean },
): boolean {
  const effective = privacySafeGalleryFilters(filters, options.privacyMode);
  if (effective.sourceHost !== null && sourceHostForGalleryRecord(record) !== effective.sourceHost) return false;
  if (effective.imageType !== null && imageTypeForGalleryRecord(record) !== effective.imageType) return false;
  if (effective.recordKind !== null && recordKindForGalleryFilter(record) !== effective.recordKind) return false;
  return true;
}

export function galleryFilterFacets(
  records: readonly ImageDisplayRecord[],
  options: { readonly privacyMode: boolean },
): GalleryFilterFacets {
  if (options.privacyMode) return EMPTY_GALLERY_FILTER_FACETS;
  const sourceHosts = new Set<string>();
  const imageTypes = new Set<GalleryImageTypeFilter>();
  for (const record of records) {
    if (record.privacyStatus === 'locked') continue;
    const sourceHost = sourceHostForGalleryRecord(record);
    if (sourceHost) sourceHosts.add(sourceHost);
    imageTypes.add(imageTypeForGalleryRecord(record));
  }
  return {
    sourceHosts: [...sourceHosts].sort((left, right) => left.localeCompare(right)),
    imageTypes: [...imageTypes].sort(compareImageTypes),
  };
}

export function sourceHostForGalleryRecord(record: ImageDisplayRecord): string | null {
  if (record.privacyStatus === 'locked') return null;
  try {
    return sourceImageUrlFrom(record.url).hostname.toLocaleLowerCase() || null;
  } catch {
    return null;
  }
}

export function imageTypeForGalleryRecord(record: ImageDisplayRecord): GalleryImageTypeFilter {
  const extension = record.privacyStatus === 'locked' ? null : imageExtensionFromUrl(record.url);
  return isGalleryImageType(extension) ? extension : 'UNKNOWN';
}

export function recordKindForGalleryFilter(record: ImageDisplayRecord): GalleryRecordKindFilter {
  if (record.privacyStatus === 'locked') return 'locked-private';
  return recordHasStoredOriginal(record) ? 'stored-original' : 'url-only';
}

function isGalleryImageType(value: string | null): value is Exclude<GalleryImageTypeFilter, 'UNKNOWN'> {
  return value !== null && (IMAGE_RECORD_EXTENSIONS as readonly string[]).includes(value);
}

function compareImageTypes(left: GalleryImageTypeFilter, right: GalleryImageTypeFilter): number {
  if (left === 'UNKNOWN') return 1;
  if (right === 'UNKNOWN') return -1;
  return left.localeCompare(right);
}
