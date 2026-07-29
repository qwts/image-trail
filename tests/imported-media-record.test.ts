import assert from 'node:assert/strict';
import { test } from 'node:test';

import { imageExtensionForRecord } from '../extension/src/core/display-records.js';
import { createImportedMediaRecords, transportStreamPosterDataUrl } from '../extension/src/ui/panel/imported-media-record.js';
import type { MpegTsMediaInfo } from '../extension/src/core/media/mpeg-ts.js';

const mediaInfo: MpegTsMediaInfo = {
  kind: 'mpeg-ts',
  animated: false,
  frameCount: null,
  loopCount: null,
  container: 'MPEG-TS',
  streams: [
    { type: 'video', codec: 'H.264', profile: 'High' },
    { type: 'audio', codec: 'AAC', profile: 'LC' },
  ],
  durationSeconds: 1.25,
  codedWidth: null,
  codedHeight: null,
  displayWidth: null,
  displayHeight: null,
  rotationDegrees: null,
  frameRate: null,
  variableFrameRate: false,
  audioPresent: true,
  hdr: null,
  colorTransfer: null,
  probeIncomplete: false,
};

test('local MPEG-TS imports keep bytes out of durable metadata and attach encrypted custody facts', () => {
  const records = createImportedMediaRecords(
    { name: 'camera.ts', dataUrl: 'data:video/mp2t;base64,R0RBVEE=' },
    {
      status: 'captured',
      blobId: 'blob-ts',
      mimeType: 'video/mp2t',
      byteLength: 5,
      fileName: 'camera.ts',
      sha256: 'a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754',
      mediaInfo,
    },
    '2026-07-29T00:00:00.000Z',
  );
  assert.ok(records);
  assert.match(records.bookmark.url, /^image-trail:\/\/local-media\//u);
  assert.equal(records.bookmark.url.includes('R0RBVEE'), false);
  assert.equal(records.bookmark.captureStatus, 'captured');
  assert.equal(records.bookmark.storedOriginal?.sha256, 'a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754');
  assert.equal(records.bookmark.storedOriginal?.mediaInfo?.kind, 'mpeg-ts');
  assert.equal(imageExtensionForRecord(records.bookmark), 'TS');
  assert.equal(records.history.pinnedRecordId, records.bookmark.id);
  assert.match(records.bookmark.thumbnail ?? '', /^data:image\/svg\+xml;base64,/u);
});

test('the authenticated original filename preserves MTS and M2TS display extensions', () => {
  const base = createImportedMediaRecords(
    { name: 'camera.m2ts', dataUrl: 'data:video/mp2t;base64,R0RBVEE=' },
    {
      status: 'captured',
      blobId: 'blob-m2ts',
      mimeType: 'video/mp2t',
      byteLength: 5,
      fileName: 'camera.m2ts',
      mediaInfo,
    },
  );
  assert.ok(base);
  assert.equal(imageExtensionForRecord(base.bookmark), 'M2TS');
  assert.equal(
    imageExtensionForRecord({ ...base.bookmark, storedOriginal: { ...base.bookmark.storedOriginal!, fileName: 'camera.mts' } }),
    'MTS',
  );
});

test('the MPEG-TS queue poster is deterministic and contains no active content', () => {
  const first = transportStreamPosterDataUrl(mediaInfo);
  const second = transportStreamPosterDataUrl(mediaInfo);
  assert.equal(first, second);
  const decoded = atob(first.slice(first.indexOf(',') + 1));
  assert.match(decoded, /MPEG-TS/u);
  assert.match(decoded, /H\.264 \+ AAC/u);
  assert.match(decoded, /Ready to preview/u);
  assert.equal(/<script|onload=/iu.test(decoded), false);
});

test('the MPEG-TS queue poster never labels preserved-only profiles ready to preview', () => {
  const poster = transportStreamPosterDataUrl({
    ...mediaInfo,
    streams: [{ type: 'video', codec: 'H.264', profile: 'High 10' }],
  });
  const decoded = atob(poster.slice(poster.indexOf(',') + 1));

  assert.match(decoded, /Preserved only/u);
  assert.doesNotMatch(decoded, /Ready to preview/u);
});
