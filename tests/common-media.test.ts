import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as v from 'valibot';

import { captureResultSchema, storedOriginalReferenceSchema } from '../extension/src/core/image/capture-result.schema.js';
import { inspectSpecializedMedia } from '../extension/src/core/media/inspect-media.js';
import { nativePlaybackType } from '../extension/src/core/media/common-media.js';
import { MAX_COMMON_MEDIA_ELEMENTS, type CommonMediaInfo } from '../extension/src/core/media/common-media-types.js';

const fixtureRoot = 'tests/e2e/pages/assets/media/common';

function fixture(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(`${fixtureRoot}/${fileName}`));
}

function inspect(fileName: string, declaredMimeType = ''): CommonMediaInfo {
  const result = inspectSpecializedMedia(fixture(fileName), declaredMimeType, fileName);
  assert.equal(result.status, 'supported');
  assert.equal(result.status === 'supported' ? result.mediaInfo.kind : null, 'common-media');
  return (result as { readonly mediaInfo: CommonMediaInfo }).mediaInfo;
}

function codecs(mediaInfo: CommonMediaInfo): string[] {
  return mediaInfo.streams.map((stream) => stream.codec ?? 'unknown');
}

test('signature inspection identifies deterministic MP4/MOV video without changing exact original bytes', () => {
  const cases = [
    ['h264-aac.mp4', '255d0bf97174c3be46680efa94e9fc5a0fc22509c94cf7e92e805bd013eca020'],
    ['iphone-slow-motion-vfr.mp4', 'a1121f3cf00078c6c5a7019b439a78515fdf92e1f08ff0d9ff3be2a64e9e4316'],
    ['iphone-rotated.mov', '9e7eda91717cc4c8c304974975e189d081257ed8df53e6601d5212d700339cf2'],
    ['iphone-hevc-main10-hdr.mov', '6e75d7664ba9c6d7123813fa9dbdc015a32948d68dc9d86b2deaa745ac7b8390'],
    ['prores-pcm.mov', '8aa692fbe3501faeb445a525c128f6b69ad1997c2cbca71f3958ebfacd99e069'],
  ] as const;
  for (const [fileName, sha256] of cases) {
    const bytes = fixture(fileName);
    const before = bytes.slice();
    assert.equal(inspectSpecializedMedia(bytes, 'application/octet-stream', `wrong.bin`).status, 'supported');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
    assert.deepEqual(bytes, before);
  }

  const mp4 = inspect('h264-aac.mp4');
  assert.equal(mp4.container, 'ISO-BMFF');
  assert.deepEqual(codecs(mp4), ['H.264', 'AAC']);
  assert.equal(mp4.streams[0]?.profile, 'Baseline');
  assert.equal(mp4.codedWidth, 64);
  assert.equal(mp4.codedHeight, 48);
  assert.equal(mp4.frameRate, 15);
  assert.equal(mp4.audioPresent, true);
});

test('variable-rate iPhone-style MP4 metadata preserves timing and codec compatibility facts', () => {
  const slowMotion = inspect('iphone-slow-motion-vfr.mp4');
  assert.equal(slowMotion.container, 'ISO-BMFF');
  assert.deepEqual(codecs(slowMotion), ['H.264']);
  assert.equal(slowMotion.streams[0]?.profile, 'High');
  assert.equal(slowMotion.variableFrameRate, true);
  assert.equal(slowMotion.frameRate !== null && slowMotion.frameRate >= 6 && slowMotion.frameRate <= 8, true);
  assert.match(nativePlaybackType('video/mp4', slowMotion), /codecs="avc1\.6400[0-9a-f]{2}"/u);
});

test('QuickTime inspection preserves rotation, HEVC Main 10 HDR, and ProRes/PCM facts', () => {
  const rotated = inspect('iphone-rotated.mov');
  assert.equal(rotated.container, 'QuickTime');
  assert.equal(rotated.rotationDegrees, 90);
  assert.equal(rotated.displayWidth, 48);
  assert.equal(rotated.displayHeight, 64);

  const hdr = inspect('iphone-hevc-main10-hdr.mov');
  assert.equal(hdr.container, 'QuickTime');
  assert.equal(hdr.streams[0]?.codec, 'HEVC');
  assert.equal(hdr.streams[0]?.profile, 'Main 10');
  assert.equal(hdr.streams[0]?.bitDepth, 10);
  assert.equal(hdr.hdr, true);
  assert.equal(hdr.colorTransfer, 'PQ (ST 2084)');

  const proRes = inspect('prores-pcm.mov');
  assert.deepEqual(codecs(proRes), ['ProRes', 'PCM']);
  assert.equal(proRes.streams[0]?.profile, '422 HQ');
});

test('WebM, Matroska, AVI, MPEG program stream, and audio-only MP2 get bounded container facts', () => {
  const cases = [
    {
      fileName: 'vp9-opus.webm',
      container: 'WebM',
      codecs: ['VP9', 'Opus'],
      mediaKind: 'video',
    },
    {
      fileName: 'h264-aac.mkv',
      container: 'Matroska',
      codecs: ['H.264', 'AAC'],
      mediaKind: 'video',
    },
    {
      fileName: 'mpeg4-mp3.avi',
      container: 'AVI',
      codecs: ['MPEG-4 Part 2', 'MP3'],
      mediaKind: 'video',
    },
    {
      fileName: 'mpeg2-mp2.mpg',
      container: 'MPEG-PS',
      codecs: ['MPEG-2 Video', 'MP2'],
      mediaKind: 'video',
    },
    {
      fileName: 'mpeg1-mp3.mpg',
      container: 'MPEG-PS',
      codecs: ['MPEG-1 Video', 'MP3'],
      mediaKind: 'video',
    },
    {
      fileName: 'audio-only.mp2',
      container: 'MPEG-Audio',
      codecs: ['MP2'],
      mediaKind: 'audio',
    },
  ] as const;
  for (const expected of cases) {
    const result = inspectSpecializedMedia(fixture(expected.fileName), '', expected.fileName);
    assert.equal(result.status, 'supported');
    if (result.status !== 'supported' || result.mediaInfo.kind !== 'common-media') continue;
    assert.equal(result.mediaInfo.container, expected.container);
    assert.equal(result.mediaInfo.mediaKind, expected.mediaKind);
    assert.deepEqual(codecs(result.mediaInfo), expected.codecs);
    assert.equal(result.mediaInfo.durationSeconds !== null && result.mediaInfo.durationSeconds > 0, true);
    assert.equal(result.playbackTier, ['WebM'].includes(expected.container) ? 'playable' : 'preserved-only');
  }

  assert.equal(inspect('mpeg4-mp3.avi').streams[0]?.bitDepth, null);
});

test('declared extensions never override signatures and malformed media fails closed', () => {
  assert.equal(inspectSpecializedMedia(fixture('h264-aac.mp4'), 'image/jpeg', 'photo.jpg').status, 'supported');
  const truncated = inspectSpecializedMedia(fixture('truncated.mp4'), 'video/mp4', 'truncated.mp4');
  assert.equal(truncated.status, 'invalid');
  assert.equal(truncated.status === 'invalid' ? truncated.reason : null, 'malformed');
  const spoofed = inspectSpecializedMedia(fixture('spoofed.mp4'), 'video/mp4', 'spoofed.mp4');
  assert.equal(spoofed.status, 'invalid');
  assert.match(spoofed.status === 'invalid' ? spoofed.message : '', /does not match a validated/u);
});

test('hostile ISO box tables stop at the explicit element limit', () => {
  const hostile = new Uint8Array(16 + MAX_COMMON_MEDIA_ELEMENTS * 8);
  const view = new DataView(hostile.buffer);
  view.setUint32(0, 16);
  hostile.set(Buffer.from('ftyp'), 4);
  hostile.set(Buffer.from('isom'), 8);
  for (let index = 0; index < MAX_COMMON_MEDIA_ELEMENTS; index += 1) {
    const offset = 16 + index * 8;
    view.setUint32(offset, 8);
    hostile.set(Buffer.from('free'), offset + 4);
  }
  const result = inspectSpecializedMedia(hostile, 'video/mp4', 'hostile.mp4');
  assert.equal(result.status, 'invalid');
  assert.equal(result.status === 'invalid' ? result.reason : null, 'probe-limit');
});

test('durable schemas accept bounded common-media facts and reject MIME/container drift', () => {
  const mediaInfo = inspect('h264-aac.mp4');
  const capture = {
    status: 'captured',
    blobId: 'blob-common',
    mimeType: 'video/mp4',
    byteLength: fixture('h264-aac.mp4').byteLength,
    fileName: 'h264-aac.mp4',
    mediaInfo,
  } as const;
  assert.deepEqual(v.parse(captureResultSchema, capture), capture);
  assert.throws(() => v.parse(captureResultSchema, { ...capture, mimeType: 'video/webm' }));
  assert.throws(() =>
    v.parse(storedOriginalReferenceSchema, {
      ...capture,
      status: undefined,
      capturedAt: '2026-07-29T00:00:00.000Z',
      mimeType: 'video/x-msvideo',
    }),
  );
});
