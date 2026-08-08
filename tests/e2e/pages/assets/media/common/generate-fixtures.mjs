import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const outputDirectory = path.dirname(fileURLToPath(import.meta.url));
const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'image-trail-common-media-'));
const videoInput = ['-f', 'lavfi', '-i', 'testsrc=size=64x48:rate=15:duration=1'];
const audioInput = ['-f', 'lavfi', '-i', 'sine=frequency=880:sample_rate=48000:duration=1'];
const base = ['-hide_banner', '-loglevel', 'error', '-y'];
const deterministicOutput = [
  '-map_metadata',
  '-1',
  '-metadata',
  'creation_time=1970-01-01T00:00:00Z',
  '-fflags',
  '+bitexact',
  '-flags:v',
  '+bitexact',
  '-flags:a',
  '+bitexact',
  '-threads:v',
  '1',
  '-threads:a',
  '1',
];

async function ffmpeg(name, arguments_) {
  await exec('ffmpeg', [...base, ...arguments_, ...deterministicOutput, path.join(outputDirectory, name)]);
}

try {
  await ffmpeg('h264-aac.mp4', [
    ...videoInput,
    ...audioInput,
    '-c:v',
    'libx264',
    '-profile:v',
    'baseline',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '32k',
    '-movflags',
    '+faststart',
    '-shortest',
  ]);
  await ffmpeg('iphone-slow-motion-vfr.mp4', [
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x48:rate=30:duration=1',
    '-vf',
    "select='eq(n,0)+eq(n,1)+eq(n,4)+eq(n,9)+eq(n,10)+eq(n,19)+eq(n,29)'",
    '-fps_mode',
    'vfr',
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-bf',
    '0',
    '-movflags',
    '+faststart',
  ]);
  await exec('ffmpeg', [
    ...base,
    '-display_rotation:v:0',
    '90',
    '-i',
    path.join(outputDirectory, 'h264-aac.mp4'),
    '-c',
    'copy',
    '-map_metadata',
    '-1',
    '-metadata',
    'creation_time=1970-01-01T00:00:00Z',
    '-fflags',
    '+bitexact',
    path.join(outputDirectory, 'iphone-rotated.mov'),
  ]);
  await ffmpeg('iphone-hevc-main10-hdr.mov', [
    ...videoInput,
    ...audioInput,
    '-c:v',
    'libx265',
    '-profile:v',
    'main10',
    '-pix_fmt',
    'yuv420p10le',
    '-tag:v',
    'hvc1',
    '-vf',
    'setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc',
    '-x265-params',
    'colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc',
    '-movflags',
    '+write_colr',
    '-c:a',
    'aac',
    '-b:a',
    '32k',
    '-shortest',
  ]);
  await ffmpeg('prores-pcm.mov', [...videoInput, ...audioInput, '-c:v', 'prores_ks', '-profile:v', '3', '-c:a', 'pcm_s16le', '-shortest']);
  await ffmpeg('vp9-opus.webm', [
    ...videoInput,
    ...audioInput,
    '-c:v',
    'libvpx-vp9',
    '-b:v',
    '100k',
    '-c:a',
    'libopus',
    '-b:a',
    '32k',
    '-shortest',
  ]);
  await ffmpeg('h264-aac.mkv', [
    ...videoInput,
    ...audioInput,
    '-c:v',
    'libx264',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '32k',
    '-shortest',
  ]);
  await ffmpeg('mpeg4-mp3.avi', [
    ...videoInput,
    ...audioInput,
    '-c:v',
    'mpeg4',
    '-q:v',
    '8',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '32k',
    '-shortest',
  ]);
  await ffmpeg('mpeg2-mp2.mpg', [
    ...videoInput,
    ...audioInput,
    '-c:v',
    'mpeg2video',
    '-b:v',
    '200k',
    '-c:a',
    'mp2',
    '-b:a',
    '64k',
    '-f',
    'mpeg',
    '-shortest',
  ]);
  await ffmpeg('mpeg1-mp3.mpg', [
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x48:rate=25:duration=1',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=660:sample_rate=44100:duration=1',
    '-c:v',
    'mpeg1video',
    '-b:v',
    '200k',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '64k',
    '-f',
    'mpeg',
    '-shortest',
  ]);
  await ffmpeg('audio-only.mp2', [
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=48000:duration=1',
    '-c:a',
    'mp2',
    '-b:a',
    '64k',
    '-f',
    'mp2',
  ]);

  const mp4 = await readFile(path.join(outputDirectory, 'h264-aac.mp4'));
  await writeFile(path.join(outputDirectory, 'truncated.mp4'), mp4.subarray(0, 28));
  const spoofed = await readFile(new globalThis.URL('../../../../../fixtures/mpeg-ts/spoofed-jpeg.bin', import.meta.url));
  await writeFile(path.join(outputDirectory, 'spoofed.mp4'), spoofed.subarray(0, 4_096));
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
