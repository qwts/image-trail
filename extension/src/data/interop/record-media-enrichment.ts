import {
  interopMediaBlockFrom,
  interopMediaFileName,
  type InteropCommonMediaBlock,
  type InteropGifWebpMediaBlock,
  type InteropMediaBlock,
} from '../../core/interop/media.js';
import type { InteropRecord } from '../../core/interop/records.js';
import type { StoredOriginalReference } from '../types.js';

export function normalizeVerifiedOriginalCustody(
  record: InteropRecord,
  verifiedThumbnailDataUrl: string | undefined,
  original: StoredOriginalReference | undefined,
): StoredOriginalReference | undefined {
  const verifiedOriginal = enrichVerifiedOriginal(record, original);
  assertVerifiedCustody(record, verifiedThumbnailDataUrl, verifiedOriginal);
  return verifiedOriginal;
}

function enrichVerifiedOriginal(record: InteropRecord, original: StoredOriginalReference | undefined): StoredOriginalReference | undefined {
  if (!original) return undefined;
  const media = interopMediaBlockFrom(record.roundTripMetadata.overlook);
  if (!media || media.mimeType !== original.mimeType) return original;
  if (media.kind === 'video' || media.kind === 'audio') return enrichAvOriginal(record, original, media);
  if (!isGifWebpMediaBlock(media)) return original;
  return {
    ...original,
    fileName: original.fileName ?? interopOriginalFileName(record, media),
    width: original.width ?? record.dimensions?.width,
    height: original.height ?? record.dimensions?.height,
    mediaInfo: {
      kind: media.kind,
      animated: media.mediaInfo.animated,
      frameCount: media.mediaInfo.frameCount,
      loopCount: media.mediaInfo.loopCount,
    },
  };
}

function isGifWebpMediaBlock(media: InteropMediaBlock): media is InteropGifWebpMediaBlock {
  return media.kind === 'gif' || media.kind === 'webp';
}

function enrichAvOriginal(
  record: InteropRecord,
  original: StoredOriginalReference,
  media: Extract<InteropMediaBlock, { readonly kind: 'video' | 'audio' }>,
): StoredOriginalReference {
  const mediaInfo = media.mediaInfo;
  const storedMediaInfo =
    mediaInfo === null
      ? undefined
      : mediaInfo.container === 'MPEG-TS'
        ? { kind: 'mpeg-ts' as const, ...mediaInfo }
        : { kind: 'common-media' as const, mediaKind: media.kind, ...mediaInfo };
  return {
    ...original,
    fileName: original.fileName ?? interopOriginalFileName(record, media),
    width: original.width ?? mediaInfo?.displayWidth ?? mediaInfo?.codedWidth ?? record.dimensions?.width,
    height: original.height ?? mediaInfo?.displayHeight ?? mediaInfo?.codedHeight ?? record.dimensions?.height,
    ...(storedMediaInfo ? { mediaInfo: storedMediaInfo } : {}),
  };
}

function interopOriginalFileName(record: InteropRecord, media: InteropMediaBlock): string {
  const candidates = [record.label, record.title, sourceFileName(record.sourceUrl)].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const expectedExtension =
    media.extension ?? (isCommonMediaBlock(media) ? (media.kind === 'audio' ? 'mp2' : 'mp4') : media.kind === 'video' ? 'ts' : media.kind);
  const fallbackBase = media.kind === 'gif' || media.kind === 'webp' ? 'image' : 'media';
  return interopMediaFileName(
    candidates.find((candidate) => candidate.toLowerCase().endsWith(`.${expectedExtension.toLowerCase()}`)) ??
      `${fallbackBase}.${expectedExtension}`,
    expectedExtension,
  );
}

function isCommonMediaBlock(media: InteropMediaBlock): media is InteropCommonMediaBlock {
  return (media.kind === 'video' || media.kind === 'audio') && media.mediaInfo !== null && media.mediaInfo.container !== 'MPEG-TS';
}

function sourceFileName(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  try {
    const name = new URL(sourceUrl).pathname.split('/').filter(Boolean).at(-1);
    return name ? decodeURIComponent(name) : null;
  } catch {
    return null;
  }
}

function assertVerifiedCustody(
  record: InteropRecord,
  verifiedThumbnailDataUrl: string | undefined,
  verifiedOriginal: StoredOriginalReference | undefined,
): void {
  if (verifiedThumbnailDataUrl) {
    if (record.thumbnail.state !== 'available' || !verifiedThumbnailDataUrl.startsWith('data:image/')) {
      throw new Error('Verified thumbnail bytes do not match an available image thumbnail.');
    }
  }
  if (
    verifiedOriginal &&
    (record.original.state !== 'available' ||
      verifiedOriginal.mimeType !== record.original.mimeType ||
      verifiedOriginal.byteLength !== record.original.byteLength)
  ) {
    throw new Error('Verified original custody does not match the canonical original metadata.');
  }
}
