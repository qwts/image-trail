import { Buffer } from 'node:buffer';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(fixtureDirectory, '../../../../fixtures/mpeg-ts/supported-h264-aac.mpegts');
const outputPath = path.join(fixtureDirectory, 'supported.m2ts');
const source = await readFile(sourcePath);

if (source.byteLength % 188 !== 0) {
  throw new Error('The source MPEG-TS fixture must contain complete 188-byte packets.');
}

const packetCount = source.byteLength / 188;
const output = Buffer.alloc(packetCount * 192);
for (let index = 0; index < packetCount; index += 1) {
  const outputOffset = index * 192;
  output.writeUInt32BE(index & 0x3fffffff, outputOffset);
  source.copy(output, outputOffset + 4, index * 188, (index + 1) * 188);
}

await writeFile(outputPath, output);
