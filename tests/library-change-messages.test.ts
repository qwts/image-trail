import test from 'node:test';
import assert from 'node:assert/strict';

import { createLibraryChangeMessage, isLibraryChangeMessage } from '../extension/src/background/library-change-messages.js';

test('library change messages validate the notification envelope', () => {
  const message = createLibraryChangeMessage({
    topic: 'bookmarks',
    reason: 'bookmark-saved',
    recordIds: ['pin-1'],
    changedAt: 123,
  });

  assert.equal(isLibraryChangeMessage(message), true);
  assert.equal(isLibraryChangeMessage({ ...message, type: 'imageTrail.saveBookmark' }), false);
  assert.equal(isLibraryChangeMessage({ ...message, version: 2 }), false);
  assert.equal(isLibraryChangeMessage({ ...message, payload: { ...message.payload, recordIds: ['pin-1', 7] } }), false);
});

test('library change messages contain no gallery record metadata', () => {
  const message = createLibraryChangeMessage({
    topic: 'albums',
    reason: 'album-records-added',
    albumIds: ['album-1'],
    recordIds: ['pin-1'],
    changedAt: 456,
  });
  const serialized = JSON.stringify(message);

  assert.deepEqual(Object.keys(message.payload).sort(), ['albumIds', 'changedAt', 'reason', 'recordIds', 'topic']);
  assert.equal(serialized.includes('https://'), false);
  assert.equal(serialized.includes('data:image'), false);
  assert.equal(serialized.includes('blob-'), false);
});
