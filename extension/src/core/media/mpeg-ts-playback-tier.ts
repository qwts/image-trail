const REMUXABLE_VIDEO = new Set(['H.264']);
const REMUXABLE_AUDIO = new Set(['AAC']);
const REMUXABLE_VIDEO_PROFILES = new Set(['Constrained Baseline', 'Baseline', 'Main', 'High']);
const REMUXABLE_AUDIO_PROFILES = new Set(['LC']);

interface ProbedStream {
  readonly type: 'video' | 'audio' | 'unknown';
  readonly codec: string | null;
  readonly profile: string | null;
}

interface ProbedTransportStream {
  readonly streams: readonly ProbedStream[];
  readonly probeIncomplete: boolean;
}

export function isRemuxableMpegTsInfo(info: ProbedTransportStream): boolean {
  if (info.probeIncomplete) return false;
  const video = info.streams.filter((stream) => stream.type === 'video');
  const audio = info.streams.filter((stream) => stream.type === 'audio');
  if (info.streams.some((stream) => stream.type === 'unknown') || video.length === 0) return false;
  if (!video.every(isRemuxableVideo)) return false;
  return audio.every(isRemuxableAudio);
}

function isRemuxableVideo(stream: ProbedStream): boolean {
  return stream.codec !== null && REMUXABLE_VIDEO.has(stream.codec) && REMUXABLE_VIDEO_PROFILES.has(stream.profile ?? '');
}

function isRemuxableAudio(stream: ProbedStream): boolean {
  return stream.codec !== null && REMUXABLE_AUDIO.has(stream.codec) && REMUXABLE_AUDIO_PROFILES.has(stream.profile ?? '');
}
