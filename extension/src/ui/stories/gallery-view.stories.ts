import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import '../../gallery/gallery.css';
import '../../gallery/gallery-filters.css';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { GalleryAlbumSummary } from '../../gallery/gallery-albums.js';
import { EMPTY_GALLERY_FILTERS } from '../../gallery/gallery-filters.js';
import { createGalleryView, type GalleryViewHandlers, type GalleryViewState } from '../../gallery/gallery-view.js';

const action = fn();
const thumbnail = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
    <defs><linearGradient id="sky" x2="1" y2="1"><stop stop-color="#9ae6ff"/><stop offset="1" stop-color="#153a55"/></linearGradient></defs>
    <rect width="240" height="160" fill="url(#sky)"/><path d="M0 142 72 58l44 50 34-34 90 68" fill="#173526"/>
  </svg>
`)}`;

const records: readonly ImageDisplayRecord[] = [
  {
    id: 'pin-1',
    url: 'https://images.example.test/alpine-lake.jpg',
    label: 'Alpine lake',
    thumbnail,
    width: 1920,
    height: 1280,
    timestamp: '2026-07-14T03:00:00.000Z',
    queueUpdatedAt: '2026-07-14T03:00:00.000Z',
    captureStatus: 'captured',
    blobId: 'blob-1',
  },
  {
    id: 'pin-2',
    url: 'https://images.example.test/coastline.webp',
    label: 'Coastline study',
    thumbnail,
    width: 1600,
    height: 1067,
    timestamp: '2026-07-14T02:00:00.000Z',
    queueUpdatedAt: '2026-07-14T02:00:00.000Z',
  },
  {
    id: 'pin-3',
    url: 'https://images.example.test/field-notes.png',
    label: 'Field notes',
    thumbnail: undefined,
    timestamp: '2026-07-14T01:00:00.000Z',
    queueUpdatedAt: '2026-07-14T01:00:00.000Z',
  },
];

const albums: readonly GalleryAlbumSummary[] = [
  {
    album: {
      schemaVersion: 1,
      id: 'album-1',
      name: 'References',
      createdAt: '2026-07-14T01:00:00.000Z',
      updatedAt: '2026-07-14T01:00:00.000Z',
    },
    recordIds: ['pin-1'],
  },
];

const meta = {
  title: 'Design System/Gallery',
  render: () => galleryStory(state({ items: records, albums, total: records.length })),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const InteractiveControls: Story = {
  render: () => galleryStory(state({ items: records, albums, total: records.length })),
  play: async ({ canvasElement }) => {
    action.mockClear();
    const canvas = within(canvasElement);
    const search = canvas.getByRole('searchbox', { name: 'Search gallery' });
    search.focus();
    await expect(search).toHaveFocus();
    await userEvent.type(search, 'coast');
    await expect(action).toHaveBeenCalledWith('search', 'coast');
    await userEvent.click(canvas.getByRole('button', { name: 'Reload' }));
    await expect(action).toHaveBeenCalledWith('reload');
    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Filter by image type' }), 'WEBP');
    await expect(action).toHaveBeenCalledWith('filters', { sourceHost: null, recordKind: null, imageType: 'WEBP' });
    await userEvent.click(canvas.getByRole('button', { name: 'Add Alpine lake to album' }));
    await expect(action).toHaveBeenCalledWith('toggle-album', 'pin-1');
  },
};

export const LockedAndPrivate: Story = {
  render: () =>
    galleryStory(
      state({
        items: [
          {
            ...records[0]!,
            url: 'image-trail-private:pin-1',
            label: undefined,
            thumbnail: undefined,
            privacyStatus: 'locked',
            protectedPin: {
              plainPinId: 'pin-1',
              hasEncryptedMetadata: true,
              hasEncryptedThumbnail: true,
              hasStoredOriginal: true,
            },
          },
          records[1]!,
        ],
        albums,
        total: 2,
        privacyMode: true,
      }),
    ),
};

export const Empty: Story = {
  render: () => galleryStory(state()),
};

export const Loading: Story = {
  render: () => galleryStory(state({ loading: true })),
};

export const Error: Story = {
  render: () => galleryStory(state({ message: 'Gallery could not load durable records.' })),
};

export const Narrow: Story = {
  render: () => galleryStory(state({ items: records, albums, total: records.length }), { width: 320 }),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.image-trail-gallery');
    await expect(root).not.toBeNull();
    await expect(root?.scrollWidth).toBeLessThanOrEqual(root?.clientWidth ?? 0);
  },
};

export const ReducedMotion: Story = {
  render: () => galleryStory(state({ items: records, albums, total: records.length, loading: true }), { reducedMotion: true }),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.image-trail-gallery');
    await expect(root).toHaveAttribute('data-reduced-motion-preview', 'true');
  },
};

function state(overrides: Partial<GalleryViewState> = {}): GalleryViewState {
  return {
    items: [],
    albums: [],
    selectedAlbumId: null,
    missingAlbumRecordCount: 0,
    openAlbumMenuRecordIds: [],
    albumMenuSelections: {},
    searchQuery: '',
    draftSearchQuery: '',
    filters: EMPTY_GALLERY_FILTERS,
    filterFacets: { sourceHosts: ['images.example.test'], imageTypes: ['JPG', 'PNG', 'WEBP'] },
    offset: 0,
    limit: 72,
    total: 0,
    hasOlder: false,
    hasNewer: false,
    loading: false,
    message: null,
    blobKeyUnlocked: false,
    privacyMode: false,
    ...overrides,
  };
}

function handlers(): GalleryViewHandlers {
  return {
    openRecord: (record) => action('open', record.id),
    createAlbum: (name) => action('create-album', name),
    selectAlbum: (albumId) => action('select-album', albumId),
    renameAlbum: (albumId, name) => action('rename-album', albumId, name),
    deleteAlbum: (albumId) => action('delete-album', albumId),
    toggleAlbumMenu: (recordId) => action('toggle-album', recordId),
    chooseAlbumForRecord: (recordId, albumId) => action('choose-album', recordId, albumId),
    addRecordToAlbum: (albumId, recordId) => action('add-to-album', albumId, recordId),
    removeRecordFromAlbum: (albumId, recordId) => action('remove-from-album', albumId, recordId),
    updateSearch: (query) => action('search', query),
    clearSearch: () => action('clear-search'),
    updateFilters: (filters) => action('filters', filters),
    clearFilters: () => action('clear-filters'),
    updatePageLimit: (limit) => action('page-limit', limit),
    loadPage: (offset) => action('load-page', offset),
    reload: () => action('reload'),
  };
}

function galleryStory(
  storyState: GalleryViewState,
  options: { readonly width?: number; readonly reducedMotion?: boolean } = {},
): HTMLElement {
  const root = createGalleryView(storyState, handlers());
  root.style.position = 'relative';
  root.style.margin = '16px';
  if (options.width) {
    root.style.width = `${options.width}px`;
    root.dataset['narrowPreview'] = 'true';
  }
  if (options.reducedMotion) root.dataset['reducedMotionPreview'] = 'true';
  return root;
}
