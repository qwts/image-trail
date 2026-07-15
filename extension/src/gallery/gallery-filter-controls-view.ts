import { createBadge, createButton, createCard, createSelect, createSectionHeader } from '../ui/components/primitives.js';
import {
  activeGalleryFilterCount,
  galleryFiltersActive,
  type GalleryImageTypeFilter,
  type GalleryRecordKindFilter,
} from './gallery-filters.js';
import type { GalleryViewHandlers, GalleryViewState } from './gallery-view.js';

export function createGalleryFilterControls(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-gallery__filters';
  section.setAttribute('aria-label', 'Gallery filters');
  const activeCount = activeGalleryFilterCount(state.filters);
  const clear = createButton({
    label: 'Clear filters',
    variant: 'ghost',
    disabled: activeCount === 0,
    onClick: handlers.clearFilters,
  });
  const controls = document.createElement('div');
  controls.className = 'image-trail-gallery__filter-grid';
  controls.append(createSourceHostFilter(state, handlers), createRecordKindFilter(state, handlers), createImageTypeFilter(state, handlers));
  const card = createCard({
    children: [
      createSectionHeader({ title: 'Filters', headingLevel: 2, divider: false, actions: [clear] }),
      controls,
      createFilterSummary(state),
    ],
    className: 'image-trail-gallery__filter-card',
  });
  section.append(card);
  return section;
}

function createSourceHostFilter(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLLabelElement {
  return createFilterField(
    'Source host',
    createSelect({
      ariaLabel: 'Filter by source host',
      value: state.filters.sourceHost ?? '',
      disabled: state.privacyMode,
      items: [{ value: '', label: state.privacyMode ? 'Hidden in privacy mode' : 'All source hosts' }, ...sourceHostOptions(state)],
      onChange: (event) => {
        const sourceHost = (event.currentTarget as HTMLSelectElement).value || null;
        handlers.updateFilters({ ...state.filters, sourceHost });
      },
    }),
  );
}

function createRecordKindFilter(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLLabelElement {
  return createFilterField(
    'Record kind',
    createSelect({
      ariaLabel: 'Filter by record kind',
      value: state.filters.recordKind ?? '',
      items: [
        { value: '', label: 'All record kinds' },
        { value: 'url-only', label: 'URL-only pins' },
        { value: 'stored-original', label: 'Captured originals' },
        { value: 'locked-private', label: 'Locked private pins' },
      ],
      onChange: (event) => {
        const recordKind = ((event.currentTarget as HTMLSelectElement).value || null) as GalleryRecordKindFilter | null;
        handlers.updateFilters({ ...state.filters, recordKind });
      },
    }),
  );
}

function createImageTypeFilter(state: GalleryViewState, handlers: GalleryViewHandlers): HTMLLabelElement {
  return createFilterField(
    'Image type',
    createSelect({
      ariaLabel: 'Filter by image type',
      value: state.filters.imageType ?? '',
      disabled: state.privacyMode,
      items: [{ value: '', label: state.privacyMode ? 'Hidden in privacy mode' : 'All image types' }, ...imageTypeOptions(state)],
      onChange: (event) => {
        const imageType = ((event.currentTarget as HTMLSelectElement).value || null) as GalleryImageTypeFilter | null;
        handlers.updateFilters({ ...state.filters, imageType });
      },
    }),
  );
}

function createFilterField(label: string, control: HTMLSelectElement): HTMLLabelElement {
  const field = document.createElement('label');
  field.className = 'image-trail-gallery__field';
  const text = document.createElement('span');
  text.textContent = label;
  field.append(text, control);
  return field;
}

function sourceHostOptions(state: GalleryViewState): readonly { readonly value: string; readonly label: string }[] {
  const values = new Set(state.filterFacets.sourceHosts);
  if (state.filters.sourceHost) values.add(state.filters.sourceHost);
  return [...values].sort((left, right) => left.localeCompare(right)).map((host) => ({ value: host, label: host }));
}

function imageTypeOptions(state: GalleryViewState): readonly { readonly value: string; readonly label: string }[] {
  const values = new Set(state.filterFacets.imageTypes);
  if (state.filters.imageType) values.add(state.filters.imageType);
  return [...values].map((imageType) => ({ value: imageType, label: imageType === 'UNKNOWN' ? 'Unknown type' : imageType }));
}

function createFilterSummary(state: GalleryViewState): HTMLElement {
  const summary = document.createElement('div');
  summary.className = 'image-trail-gallery__filter-summary';
  summary.setAttribute('aria-live', 'polite');
  if (!galleryFiltersActive(state.filters)) {
    const text = document.createElement('span');
    text.textContent = state.privacyMode
      ? 'No filters active. Source host and image type stay hidden in privacy mode.'
      : 'No filters active.';
    summary.append(text);
    return summary;
  }
  const count = activeGalleryFilterCount(state.filters);
  const text = document.createElement('span');
  text.textContent = `${count} filter${count === 1 ? '' : 's'} active; results match every filter.`;
  summary.append(text, ...activeFilterBadges(state));
  return summary;
}

function activeFilterBadges(state: GalleryViewState): HTMLElement[] {
  const badges: HTMLElement[] = [];
  if (state.filters.sourceHost) badges.push(createBadge({ label: `Source: ${state.filters.sourceHost}`, tone: 'selected' }));
  if (state.filters.recordKind) badges.push(createBadge({ label: `Kind: ${recordKindLabel(state.filters.recordKind)}`, tone: 'selected' }));
  if (state.filters.imageType) {
    badges.push(
      createBadge({ label: `Type: ${state.filters.imageType === 'UNKNOWN' ? 'Unknown' : state.filters.imageType}`, tone: 'selected' }),
    );
  }
  return badges;
}

function recordKindLabel(kind: GalleryRecordKindFilter): string {
  if (kind === 'stored-original') return 'Captured original';
  if (kind === 'locked-private') return 'Locked private';
  return 'URL-only';
}
