import { createDisplayRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import type { CaptureResult, StoredOriginalReference } from '../../core/image/capture-result.js';
import type { ImportedImageFile } from '../../core/types.js';

export type CapturedImportedMedia = Extract<CaptureResult, { readonly status: 'captured' }>;

export function createImportedMediaRecords(
  file: ImportedImageFile,
  captured: CapturedImportedMedia | undefined,
  timestamp = new Date().toISOString(),
): { readonly bookmark: ImageDisplayRecord; readonly history: ImageDisplayRecord } | null {
  const presentation = importedMediaPresentation(file, captured);
  if (presentation === null) return null;
  const storedOriginal = captured ? storedOriginalFromCapture(captured, timestamp) : undefined;
  const bookmark = createDisplayRecord({
    id: `${timestamp}:${captured?.sha256 ?? file.name}`,
    url: presentation.url,
    title: file.name,
    label: file.name,
    thumbnail: presentation.thumbnail,
    width: captured?.width,
    height: captured?.height,
    timestamp,
    source: 'bookmark',
    ...(captured
      ? {
          capturedAt: timestamp,
          captureStatus: 'captured' as const,
          blobId: captured.blobId,
          storedOriginal,
        }
      : {}),
  });
  const history = createDisplayRecord({
    ...bookmark,
    id: `${timestamp}:history:${captured?.sha256 ?? file.name}`,
    source: 'history',
    pinnedAt: bookmark.timestamp,
    pinnedRecordId: bookmark.id,
  });
  return { bookmark, history };
}

function importedMediaPresentation(
  file: ImportedImageFile,
  captured: CapturedImportedMedia | undefined,
): { readonly url: string; readonly thumbnail: string } | null {
  if (captured?.mediaInfo?.kind === 'mpeg-ts') {
    return {
      url: file.dataUrl.startsWith('data:') ? localMediaUrl(file.name, captured) : file.dataUrl,
      thumbnail: transportStreamPosterDataUrl(captured.mediaInfo),
    };
  }
  return file.dataUrl.startsWith('data:image/') || /^https?:\/\//iu.test(file.dataUrl)
    ? { url: file.dataUrl, thumbnail: file.dataUrl }
    : null;
}

export function transportStreamPosterDataUrl(mediaInfo: Extract<CapturedImportedMedia['mediaInfo'], { readonly kind: 'mpeg-ts' }>): string {
  const codecs = mediaInfo.streams.map((stream) => stream.codec ?? 'Unknown').join(' + ') || 'Unknown codecs';
  const duration = formatDuration(mediaInfo.durationSeconds);
  const tier = mediaInfo.streams.some((stream) => stream.codec === 'H.264') ? 'Ready to preview' : 'Preserved only';
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
    '<rect width="640" height="360" fill="#07110f"/>',
    '<rect x="24" y="24" width="592" height="312" rx="16" fill="#0f201b" stroke="#7cffa8" stroke-opacity=".45"/>',
    '<path d="M274 126v108l102-54z" fill="#7cffa8"/>',
    `<text x="48" y="72" fill="#daffe9" font-family="system-ui,sans-serif" font-size="24" font-weight="700">MPEG-TS</text>`,
    `<text x="48" y="286" fill="#cbd5d1" font-family="system-ui,sans-serif" font-size="18">${escapeXml(codecs)}</text>`,
    `<text x="48" y="316" fill="#91a8a0" font-family="system-ui,sans-serif" font-size="16">${escapeXml(`${duration} · ${tier}`)}</text>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(svg)))}`;
}

function storedOriginalFromCapture(captured: CapturedImportedMedia, capturedAt: string): StoredOriginalReference {
  return {
    blobId: captured.blobId,
    mimeType: captured.mimeType,
    byteLength: captured.byteLength,
    capturedAt,
    ...(captured.fileName ? { fileName: captured.fileName } : {}),
    ...(captured.sha256 ? { sha256: captured.sha256 } : {}),
    ...(captured.width ? { width: captured.width } : {}),
    ...(captured.height ? { height: captured.height } : {}),
    ...(captured.mediaInfo ? { mediaInfo: captured.mediaInfo } : {}),
  };
}

function localMediaUrl(fileName: string, captured: CapturedImportedMedia): string {
  const identity = captured.sha256 ?? captured.blobId;
  return `image-trail://local-media/${encodeURIComponent(identity)}/${encodeURIComponent(fileName)}`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'Duration unknown';
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, '0')}`;
}

function escapeXml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}
