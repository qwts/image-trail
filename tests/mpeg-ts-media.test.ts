import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  detectTsLayout,
  inspectMpegTsMedia,
  isRemuxableTransportStream,
  probeTransportStream,
} from '../extension/src/core/media/mpeg-ts.js';
import { mpeg2Crc32 } from '../extension/src/core/media/mpeg-ts-crc.js';

const read = (name: string): Buffer => readFileSync(`tests/fixtures/mpeg-ts/${name}`);
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

const supported = read('supported-h264-aac.mpegts');
const preserved = read('preserved-mpeg2-mp2.mpegts');
const truncated = read('truncated-h264-aac.mpegts');
const spoofed = read('spoofed-jpeg.bin');
const malformed = read('malformed-no-cadence.bin');
const supportedM2ts = toM2ts(supported);

const HASHES: Readonly<Record<string, string>> = {
  'supported-h264-aac.mpegts': 'a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754',
  'preserved-mpeg2-mp2.mpegts': '095b7bfb8cfb4f4eaaa37bc7600a5870b3d3a8561769bcbdaa17e6603fb4a756',
  'truncated-h264-aac.mpegts': 'f9501eddbe99dcb75e6414e32ac4e4b2b59cdc347eaa23b1e5c426507c567b59',
  'spoofed-jpeg.bin': '5fefb55d3e27603a91f828fcb10e8529f8cde7ce010c08391ea8b79af72d54bb',
  'malformed-no-cadence.bin': 'b6cc9cd43bccd931dfa90c073ed79946d2f7b6ec7982951b5fe655f23505cfc4',
};

function toM2ts(transportStream: Uint8Array): Uint8Array {
  assert.equal(transportStream.byteLength % 188, 0);
  const packetCount = transportStream.byteLength / 188;
  const output = new Uint8Array(packetCount * 192);
  const view = new DataView(output.buffer);
  for (let index = 0; index < packetCount; index += 1) {
    view.setUint32(index * 192, index & 0x3fffffff);
    output.set(transportStream.subarray(index * 188, (index + 1) * 188), index * 192 + 4);
  }
  return output;
}

function withMpeg2Crc(section: readonly number[]): number[] {
  const output = [...section];
  const crc = mpeg2Crc32(Uint8Array.from(output.slice(0, -4)));
  output.splice(-4, 4, (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff);
  return output;
}

describe('MPEG-TS fixture custody', () => {
  for (const [name, expectedHash] of Object.entries(HASHES)) {
    test(`${name} keeps its known SHA-256 identity`, () => {
      assert.equal(sha256(read(name)), expectedHash);
    });
  }
});

describe('MPEG-TS signature and bounded probe', () => {
  test('recognizes sustained 188-byte and 192-byte packet cadences', () => {
    assert.deepEqual(detectTsLayout(supported), { packetSize: 188, syncOffset: 0 });
    assert.deepEqual(detectTsLayout(supportedM2ts), { packetSize: 192, syncOffset: 4 });
    const inspected = inspectMpegTsMedia(supportedM2ts, 'video/mp2t', 'clip.m2ts');
    assert.equal(inspected.status, 'playable');
    if (inspected.status !== 'playable') return;
    assert.equal(inspected.extension, 'm2ts');
    assert.deepEqual(inspected.mediaInfo, probeTransportStream(supported));
  });

  test('rejects a lone sync byte, suffix spoof, and malformed cadence', () => {
    assert.equal(detectTsLayout(new Uint8Array([0x47])), null);
    assert.equal(detectTsLayout(spoofed), null);
    assert.equal(detectTsLayout(malformed), null);
    const fake = new Uint8Array(200);
    fake[0] = 0x47;
    assert.equal(detectTsLayout(fake), null);
    assert.deepEqual(detectTsLayout(fake.subarray(0, 188), true), { packetSize: 188, syncOffset: 0 });
  });

  test('records H.264 + AAC as playable and derives duration', () => {
    const inspected = inspectMpegTsMedia(supported, 'application/octet-stream', 'clip.ts');
    assert.equal(inspected.status, 'playable');
    if (inspected.status !== 'playable') return;
    assert.equal(inspected.mimeType, 'video/mp2t');
    assert.equal(inspected.extension, 'ts');
    assert.deepEqual(
      inspected.mediaInfo.streams.map(({ codec, profile }) => ({ codec, profile })).sort((a, b) => a.codec!.localeCompare(b.codec!)),
      [
        { codec: 'AAC', profile: 'LC' },
        { codec: 'H.264', profile: 'Constrained Baseline' },
      ],
    );
    assert.ok((inspected.mediaInfo.durationSeconds ?? 0) > 0);
    assert.deepEqual(
      {
        coded: [inspected.mediaInfo.codedWidth, inspected.mediaInfo.codedHeight],
        display: [inspected.mediaInfo.displayWidth, inspected.mediaInfo.displayHeight],
        frameRate: inspected.mediaInfo.frameRate,
        variableFrameRate: inspected.mediaInfo.variableFrameRate,
      },
      { coded: [64, 64], display: [64, 64], frameRate: 15, variableFrameRate: false },
    );
    assert.equal(isRemuxableTransportStream(inspected.mediaInfo), true);
    assert.equal(
      isRemuxableTransportStream({
        ...inspected.mediaInfo,
        streams: inspected.mediaInfo.streams.map((stream) => (stream.type === 'video' ? { ...stream, profile: 'High 10' } : stream)),
      }),
      false,
    );
    assert.equal(
      isRemuxableTransportStream({
        ...inspected.mediaInfo,
        streams: inspected.mediaInfo.streams.map((stream) => (stream.type === 'audio' ? { ...stream, profile: 'Main' } : stream)),
      }),
      false,
    );
  });

  test('preserves MPEG-2 + MP2 honestly without claiming playback', () => {
    const inspected = inspectMpegTsMedia(preserved, 'video/mp2t', 'recording.mts');
    assert.equal(inspected.status, 'preserved-only');
    if (inspected.status !== 'preserved-only') return;
    assert.equal(inspected.extension, 'mts');
    assert.deepEqual(
      inspected.mediaInfo.streams.map(({ codec, profile }) => ({ codec, profile })).sort((a, b) => a.codec!.localeCompare(b.codec!)),
      [
        { codec: 'MP2', profile: null },
        { codec: 'MPEG-2 Video', profile: 'Main' },
      ],
    );
    assert.deepEqual(
      {
        coded: [inspected.mediaInfo.codedWidth, inspected.mediaInfo.codedHeight],
        display: [inspected.mediaInfo.displayWidth, inspected.mediaInfo.displayHeight],
        frameRate: inspected.mediaInfo.frameRate,
      },
      { coded: [64, 64], display: [64, 64], frameRate: 15 },
    );
    assert.equal(isRemuxableTransportStream(inspected.mediaInfo), false);
  });

  test('truncated and extension-spoofed inputs fail instead of yielding partial facts', () => {
    assert.deepEqual(probeTransportStream(truncated).streams, []);
    assert.equal(inspectMpegTsMedia(truncated, 'video/mp2t', 'truncated.ts').status, 'invalid');
    assert.equal(inspectMpegTsMedia(spoofed).status, 'not-mpeg-ts');
    assert.equal(inspectMpegTsMedia(spoofed, 'image/jpeg', 'spoofed.ts').status, 'invalid');
  });

  test('reassembles a PMT that crosses packet boundaries', () => {
    const pat = withMpeg2Crc([0x00, 0xb0, 0x0d, 0x00, 0x01, 0xc1, 0x00, 0x00, 0x00, 0x01, 0xe1, 0x00, 0, 0, 0, 0]);
    const descriptorLength = 160;
    const elementaryStreams = [0x1b, 0xe1, 0x01, 0xf0, 0x00, 0x0f, 0xe1, 0x02, 0xf0, 0x00];
    const body = [
      0xe1,
      0x00,
      0xf0 | ((descriptorLength >> 8) & 0x0f),
      descriptorLength & 0xff,
      ...Array.from({ length: descriptorLength }, () => 0),
      ...elementaryStreams,
    ];
    const sectionLength = 5 + body.length + 4;
    const pmt = withMpeg2Crc([0x02, 0xb0 | ((sectionLength >> 8) & 0x0f), sectionLength & 0xff, 0, 1, 0xc1, 0, 0, ...body, 0, 0, 0, 0]);
    const packet = (pid: number, startsUnit: boolean, payload: readonly number[]): number[] => {
      const header = [0x47, ((startsUnit ? 0x40 : 0) | ((pid >> 8) & 0x1f)) & 0xff, pid & 0xff, 0x10];
      const bodyBytes = [...(startsUnit ? [0] : []), ...payload];
      return [...header, ...bodyBytes, ...Array.from({ length: 188 - header.length - bodyBytes.length }, () => 0xff)];
    };
    const firstCapacity = 183;
    const stream = new Uint8Array([
      ...packet(0, true, pat),
      ...packet(0x100, true, pmt.slice(0, firstCapacity)),
      ...packet(0x100, false, pmt.slice(firstCapacity)),
    ]);
    const info = probeTransportStream(stream, { packetSize: 188, syncOffset: 0 });
    assert.equal(info.probeIncomplete, false);
    assert.deepEqual(info.streams.map((entry) => entry.codec).sort(), ['AAC', 'H.264']);
    const m2tsInfo = probeTransportStream(toM2ts(stream), { packetSize: 192, syncOffset: 4 });
    assert.equal(m2tsInfo.probeIncomplete, false);
    assert.deepEqual(m2tsInfo.streams.map((entry) => entry.codec).sort(), ['AAC', 'H.264']);

    const corrupted = stream.slice();
    corrupted[20] = (corrupted[20] ?? 0) ^ 1;
    assert.equal(probeTransportStream(corrupted, { packetSize: 188, syncOffset: 0 }).probeIncomplete, true);
  });
});
