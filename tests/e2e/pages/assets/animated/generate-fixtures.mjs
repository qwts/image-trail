// Deterministic, dependency-free fixture materialization for Image Trail #677.
// Run from the repository root:
//   node tests/e2e/pages/assets/animated/generate-fixtures.mjs

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const outputDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureSize = 40;

function animatedGif() {
  const bytes = [];
  const push = (...values) => bytes.push(...values);
  const pushU16 = (value) => push(value & 0xff, (value >> 8) & 0xff);
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  pushU16(fixtureSize);
  pushU16(fixtureSize);
  push(0x91, 0, 0, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255);
  push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((character) => character.charCodeAt(0)), 3, 1);
  pushU16(0);
  push(0);
  for (const colorIndex of [1, 2, 3]) {
    push(0x21, 0xf9, 4, 0x04, 0x0a, 0, 0, 0, 0x2c);
    pushU16(0);
    pushU16(0);
    pushU16(fixtureSize);
    pushU16(fixtureSize);
    push(0, 2);
    const codes = [];
    for (let index = 0; index < fixtureSize * fixtureSize; index += 1) codes.push(4, colorIndex);
    codes.push(4, 5);
    let accumulator = 0;
    let accumulatorBits = 0;
    const data = [];
    for (const code of codes) {
      accumulator |= code << accumulatorBits;
      accumulatorBits += 3;
      while (accumulatorBits >= 8) {
        data.push(accumulator & 0xff);
        accumulator >>= 8;
        accumulatorBits -= 8;
      }
    }
    if (accumulatorBits > 0) data.push(accumulator & 0xff);
    for (let offset = 0; offset < data.length; offset += 255) {
      const block = data.slice(offset, offset + 255);
      push(block.length, ...block);
    }
    push(0);
  }
  push(0x3b);
  return Buffer.from(bytes);
}

const fixtures = {
  'animated.gif': animatedGif(),
  'truncated.gif': animatedGif().subarray(0, 40),
  'animated.webp': Buffer.from(
    'UklGRkgBAABXRUJQVlA4WAoAAAACAAAAJwAAJwAAQU5JTQYAAAD/////AABBTk1GXgAAAAAAAAAAACcAACcAAGQAAAJWUDggRgAAAJADAJ0BKigAKAA+kUifS6WkIqGjiACwEglnANGugAAc1HqlBAAA/u6mP/+A3XxbTL//c4H/c4H/c4H8bYSm+qTg3voAAABBTk1GWAAAAAAAAAAAACcAACcAAGQAAABWUDggQAAAAHQDAJ0BKigAKAA+kT6XS4I4AAEglnANCCgH4AfgAAHfas/ZAAD+3tY//owXAcD30v/9jMftGf5xDCyN9EqSAABBTk1GVgAAAAAAAAAAACcAACcAAGQAAABWUDggPgAAALQCAJ0BKigAKAA+kT6XS4I4AAEglnAAAbyxZPw4AAD+9Vi///ucD//ZwP/9nA/jr/9eqWuTo/qPRd44AAAA',
    'base64',
  ),
  'static.webp': Buffer.from(
    'UklGRlAAAABXRUJQVlA4IEQAAACQAwCdASooACgAPpFIn0ulpCKho4gAsBIJZwDRroAAHNR6pQQAAP7wpdf/7Wh/6tD/1aH8t3/amxVTy0MCeLcN36AAAA==',
    'base64',
  ),
};

for (const [fileName, bytes] of Object.entries(fixtures)) {
  await writeFile(join(outputDirectory, fileName), bytes);
  process.stdout.write(`${fileName}\t${String(bytes.byteLength)}B\t${createHash('sha256').update(bytes).digest('hex')}\n`);
}
