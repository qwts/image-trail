import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as v from 'valibot';

import {
  interopGifWebpMediaBlockForOriginal,
  interopGifWebpMediaBlockFrom,
  interopGifWebpMediaBlockSchema,
  interopMediaFileName,
  withInteropGifWebpMediaBlock,
} from '../extension/src/core/interop/media.js';
import { interopRecordSchema } from '../extension/src/core/interop/records.js';

const block = {
  schemaVersion: 1,
  kind: 'gif',
  mimeType: 'image/gif',
  extension: 'gif',
  mediaInfo: { animated: true, frameCount: 3, loopCount: 0 },
} as const;

test('GIF/WebP media uses the open Photos metadata object without changing strict contract v1', () => {
  const fixture = JSON.parse(readFileSync('contracts/interop/v1/fixtures/valid-record-message.json', 'utf8')) as {
    readonly payload: { readonly record: v.InferOutput<typeof interopRecordSchema> };
  };
  const overlook = withInteropGifWebpMediaBlock({ rating: 4 }, block);
  const carrying = {
    ...fixture.payload.record,
    original: {
      state: 'metadata-only',
      blobId: null,
      mimeType: 'image/gif',
      byteLength: 255,
      contentHash: null,
      reason: 'provider-unavailable',
    },
    roundTripMetadata: { ...fixture.payload.record.roundTripMetadata, overlook },
  };
  const parsed = v.parse(interopRecordSchema, carrying);
  assert.deepEqual(interopGifWebpMediaBlockFrom(parsed.roundTripMetadata.overlook), block);
  assert.equal(parsed.roundTripMetadata.overlook['rating'], 4);
  assert.equal(parsed.original.mimeType, 'image/gif');
});

test('media block creation preserves original MIME, extension, and bounded facts', () => {
  assert.deepEqual(
    interopGifWebpMediaBlockForOriginal({
      blobId: 'blob-1',
      mimeType: 'image/webp',
      byteLength: 284,
      capturedAt: '2026-07-28T00:00:00.000Z',
      fileName: 'Party.WEBP',
      width: 8,
      height: 8,
      mediaInfo: { kind: 'webp', animated: true, frameCount: 3, loopCount: 0 },
    }),
    {
      schemaVersion: 1,
      kind: 'webp',
      mimeType: 'image/webp',
      extension: 'webp',
      mediaInfo: { animated: true, frameCount: 3, loopCount: 0 },
    },
  );
  assert.equal(
    interopGifWebpMediaBlockForOriginal({
      blobId: 'blob-2',
      mimeType: 'image/gif',
      byteLength: 284,
      capturedAt: '2026-07-28T00:00:00.000Z',
      fileName: 'mislabeled.jpg',
      mediaInfo: { kind: 'gif', animated: true, frameCount: 3, loopCount: null },
    })?.extension,
    null,
  );
});

test('absent and foreign media blocks are preserved as data but never interpreted', () => {
  assert.equal(interopGifWebpMediaBlockFrom({}), null);
  assert.equal(interopGifWebpMediaBlockFrom({ media: 'gif' }), null);
  assert.equal(
    interopGifWebpMediaBlockFrom({
      media: { ...block, playable: true },
    }),
    null,
  );
  assert.throws(() => v.parse(interopGifWebpMediaBlockSchema, { ...block, playable: true }));
  assert.deepEqual(withInteropGifWebpMediaBlock({ keep: 1, media: { foreign: true } }, null), { keep: 1 });
});

test('incoherent and unbounded media claims fail closed', () => {
  assert.equal(interopGifWebpMediaBlockFrom({ media: { ...block, mimeType: 'image/webp' } }), null);
  assert.equal(interopGifWebpMediaBlockFrom({ media: { ...block, extension: 'webp' } }), null);
  assert.equal(
    interopGifWebpMediaBlockFrom({
      media: { ...block, mediaInfo: { ...block.mediaInfo, frameCount: 10_001 } },
    }),
    null,
  );
  assert.throws(() => v.parse(interopGifWebpMediaBlockSchema, { ...block, mimeType: 'image/webp' }));
  assert.throws(() => v.parse(interopGifWebpMediaBlockSchema, { ...block, extension: 'jpg' }));
});

test('inbound media filenames are bounded and strip display-control spoofing', () => {
  assert.equal(interopMediaFileName('party\u202egnp.exe', 'gif'), 'party_gnp.exe.gif');
  assert.equal(interopMediaFileName(`${'x'.repeat(260)}.webp`, 'webp'), `${'x'.repeat(240)}.webp`);
});
