import { BoundedMediaReader } from './binary-media-probe.js';
import { MAX_COMMON_MEDIA_PROBE_BYTES, type CommonMediaStreamInfo } from './common-media-types.js';

export interface MpegAudioProbe {
  readonly stream: CommonMediaStreamInfo;
  readonly durationSeconds: number | null;
  readonly frameCount: number;
  readonly firstFrameOffset: number;
}

interface MpegAudioFrame {
  readonly codec: 'MP2' | 'MP3';
  readonly profile: string;
  readonly bitRateKbps: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly samples: number;
  readonly byteLength: number;
}

const MPEG1_LAYER2_BITRATES = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0] as const;
const MPEG2_LAYER2_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0] as const;
const MPEG1_LAYER3_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0] as const;
const MPEG2_LAYER3_BITRATES = [0, 8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 144, 160, 0, 0] as const;

export function probeMpegAudio(bytes: Uint8Array, requireLayerTwo = false): MpegAudioProbe | null {
  const reader = new BoundedMediaReader(bytes);
  const searchEnd = Math.min(bytes.byteLength - 4, MAX_COMMON_MEDIA_PROBE_BYTES - 4);
  for (let firstOffset = 0; firstOffset <= searchEnd; firstOffset += 1) {
    const first = parseFrame(reader, firstOffset);
    if (!first || (requireLayerTwo && first.codec !== 'MP2')) continue;
    let offset = firstOffset;
    let frameCount = 0;
    let totalSamples = 0;
    let frame: MpegAudioFrame | null = first;
    while (frame && frame.codec === first.codec && frame.sampleRate === first.sampleRate && frameCount < 100_000) {
      frameCount += 1;
      totalSamples += frame.samples;
      offset += frame.byteLength;
      frame = parseFrame(reader, offset);
    }
    if (frameCount < 2) continue;
    if (offset < bytes.byteLength) {
      const nextHeader = reader.uint32(offset);
      if (nextHeader !== null && nextHeader >>> 21 === 0x7ff) continue;
    }
    return {
      stream: {
        type: 'audio',
        codec: first.codec,
        profile: first.profile,
        level: null,
        bitDepth: null,
        channels: first.channels,
        sampleRate: first.sampleRate,
        language: null,
      },
      durationSeconds: totalSamples / first.sampleRate,
      frameCount,
      firstFrameOffset: firstOffset,
    };
  }
  return null;
}

function parseFrame(reader: BoundedMediaReader, offset: number): MpegAudioFrame | null {
  const header = reader.uint32(offset);
  if (header === null || header >>> 21 !== 0x7ff) return null;
  const versionId = (header >>> 19) & 0x03;
  const layerId = (header >>> 17) & 0x03;
  const bitRateIndex = (header >>> 12) & 0x0f;
  const sampleRateIndex = (header >>> 10) & 0x03;
  const padding = (header >>> 9) & 0x01;
  const channelMode = (header >>> 6) & 0x03;
  if (versionId === 1 || ![1, 2].includes(layerId) || sampleRateIndex === 3 || bitRateIndex === 0 || bitRateIndex === 15) return null;
  const mpeg1 = versionId === 3;
  const layerTwo = layerId === 2;
  const baseSampleRate = [44_100, 48_000, 32_000][sampleRateIndex]!;
  const sampleRate = versionId === 3 ? baseSampleRate : versionId === 2 ? baseSampleRate / 2 : baseSampleRate / 4;
  const bitRates = layerTwo
    ? mpeg1
      ? MPEG1_LAYER2_BITRATES
      : MPEG2_LAYER2_BITRATES
    : mpeg1
      ? MPEG1_LAYER3_BITRATES
      : MPEG2_LAYER3_BITRATES;
  const bitRateKbps = bitRates[bitRateIndex] ?? 0;
  if (bitRateKbps <= 0) return null;
  const samples = layerTwo || mpeg1 ? 1_152 : 576;
  const coefficient = !layerTwo && !mpeg1 ? 72_000 : 144_000;
  const byteLength = Math.floor((coefficient * bitRateKbps) / sampleRate) + padding;
  if (byteLength < 4 || !reader.contains(offset, byteLength)) return null;
  return {
    codec: layerTwo ? 'MP2' : 'MP3',
    profile: `${mpeg1 ? 'MPEG-1' : versionId === 2 ? 'MPEG-2' : 'MPEG-2.5'} Layer ${layerTwo ? 'II' : 'III'}`,
    bitRateKbps,
    sampleRate,
    channels: channelMode === 3 ? 1 : 2,
    samples,
    byteLength,
  };
}
