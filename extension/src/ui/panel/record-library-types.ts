import type { ImageRecordUrlValidation } from '../../core/display-records.js';

export interface ValidatedRecordUrl extends ImageRecordUrlValidation {
  readonly preloadDataUrl?: string;
}

export interface RecordAddOptions {
  readonly trustLoadedImage?: boolean | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly projectionId?: string | undefined;
}
