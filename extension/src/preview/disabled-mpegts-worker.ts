export default function disabledMpegTsWorker(): never {
  throw new Error('MPEG-TS workers are disabled by the extension playback policy.');
}
