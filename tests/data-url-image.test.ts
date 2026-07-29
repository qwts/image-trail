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
