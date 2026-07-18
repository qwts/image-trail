import { createThumbnailDataUrlFromImage } from '../../content/thumbnail-generator.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import type { CaptureResult } from '../../core/image/capture-result.js';
import type { PanelState } from '../../core/types.js';

interface TargetCaptureRecordInput {
  readonly url: string;
  readonly result: CaptureResult & { readonly status: 'captured' };
  readonly state: PanelState;
  readonly existingSavedRecord: ImageDisplayRecord | null;
  readonly createTargetThumbnail?: ((url: string) => Promise<string | undefined>) | undefined;
}

export async function createTargetCaptureRecord(input: TargetCaptureRecordInput): Promise<ImageDisplayRecord> {
  const capturedAt = new Date().toISOString();
  const existing = input.existingSavedRecord;
  const thumbnail = existing?.thumbnail ?? (await targetThumbnail(input));
  const dimensions = parseDimensionText(input.state.target.selectedDimensions);
  return createDisplayRecord({
    ...existing,
    id: existing?.id ?? input.url,
    url: input.url,
    timestamp: existing?.timestamp ?? capturedAt,
    thumbnail,
    width: dimensions.width ?? existing?.width,
    height: dimensions.height ?? existing?.height,
    source: 'bookmark',
    capturedAt,
    captureStatus: 'captured',
    blobId: input.result.blobId,
    storedOriginal: {
      blobId: input.result.blobId,
      mimeType: input.result.mimeType,
      byteLength: input.result.byteLength,
      capturedAt,
    },
  });
}

async function targetThumbnail(input: TargetCaptureRecordInput): Promise<string | undefined> {
  if (input.createTargetThumbnail) return input.createTargetThumbnail(input.url);
  if (typeof document === 'undefined' || input.state.target.selectedUrl !== input.url) return undefined;
  const handleId = input.state.target.selectedHandleId;
  if (!handleId) return undefined;
  const image = document.querySelector<HTMLImageElement>(`[data-image-trail-handle="${handleId}"]`);
  return image ? ((await createThumbnailDataUrlFromImage(image)) ?? undefined) : undefined;
}

function parseDimensionText(value: string | null): { readonly width?: number; readonly height?: number } {
  const match = value?.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/iu);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}
