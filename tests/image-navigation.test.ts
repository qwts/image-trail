import test from 'node:test';
import assert from 'node:assert/strict';
import { applyImageUrl, clearResponsiveImageAttributes, pushVisibleUrlWhenSameOrigin } from '../extension/src/core/image/image-navigation.js';

function fakeImage(): HTMLImageElement {
  const removed: string[] = [];
  const sourceRemoved: string[] = [];
  const source = { removeAttribute(name: string) { sourceRemoved.push(name); } };
  return {
    src: 'https://example.test/old.jpg',
    removed,
    sourceRemoved,
    removeAttribute(name: string) { removed.push(name); },
    closest(selector: string) {
      assert.equal(selector, 'picture');
      return { querySelectorAll: () => [source] };
    },
  } as unknown as HTMLImageElement;
}

test('clears responsive attributes before applying a target image URL', () => {
  const image = fakeImage();
  const result = applyImageUrl(image, 'https://example.test/new.jpg');
  assert.deepEqual((image as unknown as { removed: string[] }).removed, ['srcset', 'sizes']);
  assert.deepEqual((image as unknown as { sourceRemoved: string[] }).sourceRemoved, ['srcset', 'sizes']);
  assert.equal(image.src, 'https://example.test/new.jpg');
  assert.equal(result.status, 'applied');
});

test('pushes visible URL only for same-origin updates', () => {
  const pushed: string[] = [];
  const location = { href: 'https://example.test/current', origin: 'https://example.test' } as Location;
  const history = { pushState(_state: unknown, _title: string, url?: string | URL | null) { pushed.push(String(url)); } } as History;

  assert.equal(pushVisibleUrlWhenSameOrigin('https://example.test/next.jpg', location, history), true);
  assert.equal(pushVisibleUrlWhenSameOrigin('https://other.test/next.jpg', location, history), false);
  assert.deepEqual(pushed, ['https://example.test/next.jpg']);
});
