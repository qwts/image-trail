import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as v from 'valibot';

import { captureResultSchema, storedOriginalReferenceSchema } from '../extension/src/core/image/capture-result.schema.js';
import { inspectGifWebpMedia } from '../extension/src/core/image/gif-webp-media.js';

const fixtureRoot = 'tests/e2e/pages/assets/animated';

function fixture(fileName: string): Uint8Array {
  return new Uint8Array(readFileSync(`${fixtureRoot}/${fileName}`));
}

test('bounded media inspection recognizes deterministic GIF/WebP fixtures without decoding or changing bytes', () => {
  const cases = [
    {
      fileName: 'animated.gif',
      mimeType: 'image/gif',
      sha256: 'e91380db853442ee77466f0f4a4b85f86c07b1607597efce84f1985ed38267f0',
      mediaInfo: { kind: 'gif', animated: true, frameCount: 3, loopCount: 0 },
    },
    {
      fileName: 'animated.webp',
      mimeType: 'image/webp',
      sha256: 'b0a4e06afd321fbcefdf834e165224734e99f0df811ab532c5bd3e94518f9b18',
      mediaInfo: { kind: 'webp', animated: true, frameCount: 3, loopCount: 0 },
    },
    {
      fileName: 'static.webp',
      mimeType: 'image/webp',
      sha256: '786ba2cc8b977a04ec253aae1b5807485716d62927faecea9a364fcbbe601065',
      mediaInfo: { kind: 'webp', animated: false, frameCount: 1, loopCount: null },
    },
  ] as const;

  for (const expected of cases) {
    const bytes = fixture(expected.fileName);
    const before = bytes.slice();
    const inspected = inspectGifWebpMedia(bytes, expected.mimeType);
    assert.deepEqual(inspected, {
      status: 'supported',
      mimeType: expected.mimeType,
      width: 40,
      height: 40,
      mediaInfo: expected.mediaInfo,
    });
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
    assert.deepEqual(bytes, before);
  }
});

test('byte signatures correct GIF/WebP MIME drift while declared GIF/WebP garbage fails closed', () => {
  assert.equal(inspectGifWebpMedia(fixture('animated.gif'), 'image/jpeg').status, 'supported');
  assert.deepEqual(inspectGifWebpMedia(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), 'image/gif'), {
    status: 'invalid',
    reason: 'malformed',
    message: 'GIF data does not match its declared image format.',
  });
});

test('truncated GIF/WebP and hostile frame tables stop within explicit probe bounds', () => {
  const gif = fixture('animated.gif');
  const webp = fixture('animated.webp');
  assert.match(invalidMessage(inspectGifWebpMedia(gif.subarray(0, 40), 'image/gif')), /truncated|missing/u);
  assert.match(invalidMessage(inspectGifWebpMedia(webp.subarray(0, 32), 'image/webp')), /truncated/u);

  const header = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0]);
  const frame = Uint8Array.from([0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 0, 0]);
  const hostile = new Uint8Array(header.byteLength + frame.byteLength * 10_001 + 1);
  hostile.set(header);
  for (let index = 0; index < 10_001; index += 1) hostile.set(frame, header.byteLength + index * frame.byteLength);
  hostile[hostile.byteLength - 1] = 0x3b;
  const inspected = inspectGifWebpMedia(hostile, 'image/gif');
  assert.equal(inspected.status, 'invalid');
  assert.equal(inspected.status === 'invalid' ? inspected.reason : null, 'probe-limit');
});

test('GIF inspection rejects out-of-range LZW code sizes before decoding image data', () => {
  const gif = fixture('animated.gif').slice();
  const firstImageDescriptor = gif.indexOf(0x2c, 40);
  assert.notEqual(firstImageDescriptor, -1);
  gif[firstImageDescriptor + 10] = 9;
  assert.match(invalidMessage(inspectGifWebpMedia(gif, 'image/gif')), /LZW code size/u);
});

test('capture and durable-record schemas reject media facts that disagree with MIME type', () => {
  const mediaInfo = { kind: 'gif', animated: true, frameCount: 3, loopCount: 0 } as const;
  assert.throws(() =>
    v.parse(captureResultSchema, {
      status: 'captured',
      blobId: 'blob-1',
      mimeType: 'image/webp',
      byteLength: 255,
      mediaInfo,
    }),
  );
  assert.throws(() =>
    v.parse(storedOriginalReferenceSchema, {
      blobId: 'blob-1',
      mimeType: 'image/webp',
      byteLength: 255,
      capturedAt: '2026-07-28T00:00:00.000Z',
      mediaInfo,
    }),
  );
});

function invalidMessage(result: ReturnType<typeof inspectGifWebpMedia>): string {
  assert.equal(result.status, 'invalid');
  return result.status === 'invalid' ? result.message : '';
}
