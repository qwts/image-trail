import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ImageStatus,
  ManifestStatus,
  NavigationBucket,
  classifyBufferedImageIndex,
  createBufferedImageNavigationState,
  reduceBufferedImageNavigation,
} from '../extension/src/core/url/buffered-image-navigation.js';

test('classifyBufferedImageIndex collapses manifest and image state into navigation buckets', () => {
  assert.equal(classifyBufferedImageIndex(undefined), NavigationBucket.WALL);
  assert.equal(
    classifyBufferedImageIndex({
      manifest: ManifestStatus.FAILED_HEAD,
      image: ImageStatus.UNKNOWN,
      url: null,
      blobUrl: null,
      imgElement: null,
      sha256: null,
    }),
    NavigationBucket.SKIPPABLE,
  );
  assert.equal(
    classifyBufferedImageIndex({
      manifest: ManifestStatus.PRESENT,
      image: ImageStatus.OK,
      url: 'https://example.test/2.jpg',
      blobUrl: 'blob:2',
      imgElement: {} as HTMLImageElement,
      sha256: null,
    }),
    NavigationBucket.LANDABLE,
  );
});

test('ADVANCE skips failed indices without resting the cursor on them', () => {
  let state = createBufferedImageNavigationState(3);
  state = reduceBufferedImageNavigation(state, { type: 'SET_MANIFEST', index: 0, status: ManifestStatus.PRESENT, url: '0' });
  state = reduceBufferedImageNavigation(state, {
    type: 'SET_IMAGE',
    index: 0,
    status: ImageStatus.OK,
    blobUrl: 'blob:0',
    imgElement: {} as HTMLImageElement,
  });
  state = reduceBufferedImageNavigation(state, { type: 'INIT_CURSOR', index: 0 });
  state = reduceBufferedImageNavigation(state, { type: 'SET_MANIFEST', index: 1, status: ManifestStatus.FAILED_HEAD });
  state = reduceBufferedImageNavigation(state, { type: 'SET_MANIFEST', index: 2, status: ManifestStatus.PRESENT, url: '2' });
  state = reduceBufferedImageNavigation(state, {
    type: 'SET_IMAGE',
    index: 2,
    status: ImageStatus.OK,
    blobUrl: 'blob:2',
    imgElement: {} as HTMLImageElement,
  });

  state = reduceBufferedImageNavigation(state, { type: 'SEEK', dir: 1 });

  assert.equal(state.cursor, 2);
  assert.equal(state.seek, null);
  assert.equal(state.blockedOn, null);
});

test('FAILED_HEAD clears any decoded image data for that index', () => {
  let state = createBufferedImageNavigationState(3);
  state = reduceBufferedImageNavigation(state, { type: 'SET_MANIFEST', index: 1, status: ManifestStatus.PRESENT, url: '1' });
  state = reduceBufferedImageNavigation(state, {
    type: 'SET_IMAGE',
    index: 1,
    status: ImageStatus.OK,
    blobUrl: 'blob:1',
    imgElement: {} as HTMLImageElement,
    sha256: 'abc',
  });

  state = reduceBufferedImageNavigation(state, { type: 'SET_MANIFEST', index: 1, status: ManifestStatus.FAILED_HEAD });

  const failed = state.indices.get(1);
  assert.equal(classifyBufferedImageIndex(failed), NavigationBucket.SKIPPABLE);
  assert.equal(failed?.image, ImageStatus.UNKNOWN);
  assert.equal(failed?.blobUrl, null);
  assert.equal(failed?.imgElement, null);
  assert.equal(failed?.sha256, null);
});

test('ADVANCE blocks on unknown walls until terminal state resolves', () => {
  let state = createBufferedImageNavigationState(3);
  state = reduceBufferedImageNavigation(state, { type: 'SET_MANIFEST', index: 0, status: ManifestStatus.PRESENT, url: '0' });
  state = reduceBufferedImageNavigation(state, {
    type: 'SET_IMAGE',
    index: 0,
    status: ImageStatus.OK,
    blobUrl: 'blob:0',
    imgElement: {} as HTMLImageElement,
  });
  state = reduceBufferedImageNavigation(state, { type: 'INIT_CURSOR', index: 0 });

  state = reduceBufferedImageNavigation(state, { type: 'SEEK', dir: 1 });

  assert.equal(state.cursor, 0);
  assert.equal(state.blockedOn, 1);
  assert.deepEqual(state.seek, { dir: 1, remaining: 1 });
});
