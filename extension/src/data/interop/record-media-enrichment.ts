import { interopMediaBlockFrom, interopMediaFileName, type InteropMediaBlock } from '../../core/interop/media.js';
import type { InteropRecord } from '../../core/interop/records.js';
import type { StoredOriginalReference } from '../types.js';

export function enrichVerifiedOriginal(
  record: InteropRecord,
  original: StoredOriginalReference | undefined,
): StoredOriginalReference | undefined {
  if (!original) return undefined;
  const media = interopMediaBlockFrom(record.roundTripMetadata.overlook);
  if (!media || media.mimeType !== original.mimeType) return original;
  if (media.kind === 'video') return enrichVideoOriginal(record, original, media);
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

function enrichVideoOriginal(
  record: InteropRecord,
  original: StoredOriginalReference,
  media: Extract<InteropMediaBlock, { readonly kind: 'video' }>,
): StoredOriginalReference {
  const mediaInfo = media.mediaInfo;
  return {
    ...original,
    fileName: original.fileName ?? interopOriginalFileName(record, media),
    width: original.width ?? mediaInfo?.displayWidth ?? mediaInfo?.codedWidth ?? record.dimensions?.width,
    height: original.height ?? mediaInfo?.displayHeight ?? mediaInfo?.codedHeight ?? record.dimensions?.height,
    ...(mediaInfo ? { mediaInfo: { kind: 'mpeg-ts' as const, ...mediaInfo } } : {}),
  };
}

function interopOriginalFileName(record: InteropRecord, media: InteropMediaBlock): string {
  const candidates = [record.label, record.title, sourceFileName(record.sourceUrl)].filter(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  const expectedExtension = media.extension ?? (media.kind === 'video' ? 'ts' : media.kind);
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
