import assert from 'node:assert/strict';
import { test } from 'node:test';

import { imageExtensionForRecord } from '../extension/src/core/display-records.js';
import {
  commonMediaPosterDataUrl,
  createImportedMediaRecords,
  transportStreamPosterDataUrl,
} from '../extension/src/ui/panel/imported-media-record.js';
import type { CommonMediaInfo } from '../extension/src/core/media/common-media-types.js';
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

test('common local video imports use opaque queue URLs, exact custody facts, and deterministic inert posters', () => {
  const commonMediaInfo: CommonMediaInfo = {
    kind: 'common-media',
    mediaKind: 'video',
    animated: false,
    frameCount: null,
    loopCount: null,
    container: 'ISO-BMFF',
    streams: [
      {
        type: 'video',
        codec: 'H.264',
        profile: 'Baseline',
        level: '3.0',
        bitDepth: 8,
        channels: null,
        sampleRate: null,
        language: null,
      },
      {
        type: 'audio',
        codec: 'AAC',
        profile: 'LC',
        level: null,
        bitDepth: null,
        channels: 1,
        sampleRate: 48_000,
        language: null,
      },
    ],
    durationSeconds: 1,
    codedWidth: 64,
    codedHeight: 48,
    displayWidth: 64,
    displayHeight: 48,
    rotationDegrees: 0,
    frameRate: 15,
    variableFrameRate: false,
    audioPresent: true,
    hdr: false,
    colorTransfer: 'BT.709',
    probeIncomplete: false,
  };
  const records = createImportedMediaRecords(
    { name: 'clip.mp4', dataUrl: 'data:video/mp4;base64,AAAA' },
    {
      status: 'captured',
      blobId: 'blob-mp4',
      mimeType: 'video/mp4',
      byteLength: 3,
      fileName: 'clip.mp4',
      sha256: '255d0bf97174c3be46680efa94e9fc5a0fc22509c94cf7e92e805bd013eca020',
      width: 64,
      height: 48,
      mediaInfo: commonMediaInfo,
    },
    '2026-07-29T00:00:00.000Z',
  );
  assert.ok(records);
  assert.match(records.bookmark.url, /^image-trail:\/\/local-media\//u);
  assert.equal(records.bookmark.url.includes('AAAA'), false);
  assert.equal(records.bookmark.storedOriginal?.mediaInfo?.kind, 'common-media');
  assert.equal(imageExtensionForRecord(records.bookmark), 'MP4');
  assert.equal(records.history.pinnedRecordId, records.bookmark.id);

  const first = commonMediaPosterDataUrl(commonMediaInfo);
  const second = commonMediaPosterDataUrl(commonMediaInfo);
  assert.equal(first, second);
  const decoded = atob(first.slice(first.indexOf(',') + 1));
  assert.match(decoded, /MP4/u);
  assert.match(decoded, /H\.264 \+ AAC/u);
  assert.equal(/<script|onload=/iu.test(decoded), false);
});
