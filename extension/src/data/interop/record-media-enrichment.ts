import { interopGifWebpMediaBlockFrom, interopMediaFileName } from '../../core/interop/media.js';
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
  const media = interopGifWebpMediaBlockFrom(record.roundTripMetadata.overlook);
  if (!media || media.mimeType !== original.mimeType) return original;
  return {
    ...original,
    fileName: original.fileName ?? interopOriginalFileName(record, media.extension, media.kind),
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

function interopOriginalFileName(record: InteropRecord, extension: 'gif' | 'webp' | null, kind: 'gif' | 'webp'): string {
  const candidates = [record.label, record.title, sourceFileName(record.sourceUrl)].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const expectedExtension = extension ?? kind;
  return interopMediaFileName(
    candidates.find((candidate) => candidate.toLowerCase().endsWith(`.${expectedExtension.toLowerCase()}`)) ?? `image.${expectedExtension}`,
    expectedExtension,
  );
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
