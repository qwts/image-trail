import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookmarkRowClearActionForModifier,
  bookmarkRowClearLabelForModifier,
  extensionLabelFor,
} from '../extension/src/ui/components/bookmarks-view.js';

test('bookmark extension label uses image filename extensions', () => {
  assert.equal(extensionLabelFor(record('https://example.test/photo.jpg')), 'JPG');
  assert.equal(extensionLabelFor(record('https://example.test/photo.jpeg')), 'JPEG');
  assert.equal(extensionLabelFor(record('https://example.test/photo.gif')), 'GIF');
  assert.equal(extensionLabelFor(record('https://example.test/photo.png')), 'PNG');
  assert.equal(extensionLabelFor(record('https://example.test/photo.webp')), 'WEBP');
});

test('bookmark extension label uses image format query params', () => {
  assert.equal(extensionLabelFor(record('https://pbs.twimg.com/media/example?format=jpg&name=large')), 'JPG');
  assert.equal(extensionLabelFor(record('https://images.example.test/render?fm=webp&w=800')), 'WEBP');
  assert.equal(extensionLabelFor(record('https://images.example.test/render?mime=image%2Fpng')), 'PNG');
});

test('bookmark extension label unwraps source image URL params before falling back', () => {
  const source = 'https://cdn.example.test/full/photo.gif';
  const wrapper = `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(source)}`;
  assert.equal(extensionLabelFor(record(wrapper)), 'GIF');
});

test('bookmark extension label falls back to image only when no type is available', () => {
  assert.equal(extensionLabelFor(record('https://example.test/image')), 'IMAGE');
});

test('bookmark extension label uses thumbnail data type before generic labels', () => {
  assert.equal(
    extensionLabelFor({
      ...record('https://example.test/image'),
      label: 'image',
      thumbnail: 'data:image/webp;base64,abc',
    }),
    'WEBP',
  );
});

test('bookmark row clear action stays undoable without modifiers', () => {
  const event = { metaKey: false, ctrlKey: false };

  assert.equal(bookmarkRowClearLabelForModifier(event), 'Clear');
  assert.equal(bookmarkRowClearActionForModifier(event), 'bookmark/clear');
});

test('bookmark row clear action becomes destructive delete with platform modifier', () => {
  assert.equal(bookmarkRowClearLabelForModifier({ metaKey: true, ctrlKey: false }), 'Delete');
  assert.equal(bookmarkRowClearActionForModifier({ metaKey: true, ctrlKey: false }), 'bookmark/remove');
  assert.equal(bookmarkRowClearLabelForModifier({ metaKey: false, ctrlKey: true }), 'Delete');
  assert.equal(bookmarkRowClearActionForModifier({ metaKey: false, ctrlKey: true }), 'bookmark/remove');
});

function record(url: string) {
  return {
    id: url,
    url,
    label: url.split('/').at(-1),
    timestamp: '2026-06-20T00:00:00.000Z',
    source: 'bookmark' as const,
  };
}
