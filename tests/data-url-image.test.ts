import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { dataUrlToImageBytes, imageDataUrlFromBytes, openedImageDataFromPayload } from '../extension/src/background/data-url-image.js';

const fixturePath = 'tests/e2e/pages/assets/animated/animated.webp';

test('data URL capture and encrypted retrieval derive GIF/WebP facts from exact bytes', () => {
  const fixture = new Uint8Array(readFileSync(fixturePath));
  const dataUrl = imageDataUrlFromBytes(fixture, 'image/jpeg');
  const parsed = dataUrlToImageBytes(dataUrl);
  assert.deepEqual(parsed.ok ? { ...parsed, bytes: undefined } : parsed, {
    ok: true,
    bytes: undefined,
    mimeType: 'image/webp',
    byteLength: 336,
    width: 40,
    height: 40,
    mediaInfo: { kind: 'webp', animated: true, frameCount: 3, loopCount: 0 },
  });

  const opened = openedImageDataFromPayload(fixture.buffer, {
    mimeType: 'image/jpeg',
    byteLength: fixture.byteLength,
    sourceUrl: 'https://example.test/mislabeled.jpg',
    capturedAt: '2026-07-28T00:00:00.000Z',
    fileName: 'safe\u202eimage.webp',
  });
  assert.deepEqual(opened.ok ? { ...opened, dataUrl: undefined } : opened, {
    ok: true,
    dataUrl: undefined,
    mimeType: 'image/webp',
    byteLength: 336,
    capturedAt: '2026-07-28T00:00:00.000Z',
    fileName: 'safe_image.webp',
    width: 40,
    height: 40,
    mediaInfo: { kind: 'webp', animated: true, frameCount: 3, loopCount: 0 },
  });
});

test('encrypted retrieval rejects authenticated metadata drift and malformed declared media', () => {
  const fixture = new Uint8Array(readFileSync(fixturePath));
  assert.deepEqual(
    openedImageDataFromPayload(fixture.buffer, {
      mimeType: 'image/webp',
      byteLength: fixture.byteLength + 1,
      sourceUrl: 'https://example.test/party.webp',
      capturedAt: '2026-07-28T00:00:00.000Z',
    }),
    {
      ok: false,
      reason: 'corrupt-original',
      message: 'Encrypted original byte length does not match its authenticated metadata.',
    },
  );
  assert.deepEqual(
    openedImageDataFromPayload(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]).buffer, {
      mimeType: 'image/gif',
      byteLength: 4,
      sourceUrl: 'https://example.test/broken.gif',
      capturedAt: '2026-07-28T00:00:00.000Z',
    }),
    {
      ok: false,
      reason: 'corrupt-original',
      message: 'GIF data does not match its declared image format.',
    },
  );
});

test('MPEG-TS data URLs preserve exact bytes, stream facts, filename, and content identity', () => {
  const fixture = new Uint8Array(readFileSync('tests/fixtures/mpeg-ts/supported-h264-aac.mpegts'));
  const dataUrl = imageDataUrlFromBytes(fixture, 'video/mp2t');
  const parsed = dataUrlToImageBytes(dataUrl, 'camera.M2TS');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.mimeType, 'video/mp2t');
  assert.equal(parsed.byteLength, fixture.byteLength);
  assert.equal(parsed.fileName, 'camera.M2TS');
  assert.deepEqual([parsed.width, parsed.height], [64, 64]);
  assert.equal(parsed.mediaInfo?.kind, 'mpeg-ts');
  assert.deepEqual(parsed.mediaInfo?.kind === 'mpeg-ts' ? parsed.mediaInfo.streams.map((stream) => stream.codec).sort() : [], [
    'AAC',
    'H.264',
  ]);
  assert.deepEqual(new Uint8Array(parsed.bytes), fixture);

  const opened = openedImageDataFromPayload(fixture.buffer, {
    mimeType: 'video/mp2t',
    byteLength: fixture.byteLength,
    sourceUrl: 'image-trail://local-import',
    capturedAt: '2026-07-29T00:00:00.000Z',
    fileName: 'camera.M2TS',
    sha256: 'a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754',
    mediaInfo: parsed.mediaInfo,
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(opened.mimeType, 'video/mp2t');
  assert.equal(opened.sha256, 'a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754');
  assert.equal(opened.dataUrl, dataUrl);
  assert.deepEqual([opened.width, opened.height], [64, 64]);
  assert.equal(opened.mediaInfo?.kind, 'mpeg-ts');
});

test('malformed and truncated declared transport streams never produce capture bytes', () => {
  const truncated = new Uint8Array(readFileSync('tests/fixtures/mpeg-ts/truncated-h264-aac.mpegts'));
  const result = dataUrlToImageBytes(imageDataUrlFromBytes(truncated, 'video/mp2t'), 'broken.ts');
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.reason, 'not-media');
  assert.match(result.message, /truncated|malformed|probe/iu);
});

test('common video data URLs retain exact bytes and replace declared MIME with signature facts', () => {
  const fixture = new Uint8Array(readFileSync('tests/e2e/pages/assets/media/common/h264-aac.mp4'));
  const dataUrl = imageDataUrlFromBytes(fixture, 'video/webm');
  const parsed = dataUrlToImageBytes(dataUrl, 'camera.mp4');
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.mimeType, 'video/mp4');
  assert.equal(parsed.byteLength, fixture.byteLength);
  assert.equal(parsed.fileName, 'camera.mp4');
  assert.deepEqual([parsed.width, parsed.height], [64, 48]);
  assert.equal(parsed.mediaInfo?.kind, 'common-media');
  assert.deepEqual(parsed.mediaInfo?.kind === 'common-media' ? parsed.mediaInfo.streams.map((stream) => stream.codec) : [], [
    'H.264',
    'AAC',
  ]);
  assert.deepEqual(new Uint8Array(parsed.bytes), fixture);

  const opened = openedImageDataFromPayload(fixture.buffer, {
    mimeType: 'video/webm',
    byteLength: fixture.byteLength,
    sourceUrl: 'image-trail://local-import',
    capturedAt: '2026-07-29T00:00:00.000Z',
    fileName: 'camera.mp4',
    mediaInfo: parsed.mediaInfo,
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  assert.equal(opened.mimeType, 'video/mp4');
  assert.equal(opened.dataUrl, imageDataUrlFromBytes(fixture, 'video/mp4'));
  assert.equal(opened.mediaInfo?.kind, 'common-media');
});

test('spoofed and truncated common-media data URLs never enter encrypted custody', () => {
  for (const fileName of ['spoofed.mp4', 'truncated.mp4']) {
    const fixture = new Uint8Array(readFileSync(`tests/e2e/pages/assets/media/common/${fileName}`));
    const result = dataUrlToImageBytes(imageDataUrlFromBytes(fixture, 'video/mp4'), fileName);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.reason, 'not-media');
  }
});
