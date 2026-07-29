import type { UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from './url/types.js';

export interface ParsedFieldStateRecord {
  readonly schemaVersion: 1;
  readonly fieldIdVersion?: 2 | undefined;
  readonly hostname: string;
  readonly pageUrl: string;
  readonly sourceUrl: string;
  readonly selectedUrl: string | null;
  readonly selectedHandleId: string | null;
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs?: readonly UrlFieldDigitWidthSpec[] | undefined;
  readonly activeUrlTemplateId: string | null;
  readonly updatedAt: string;
}

export interface ParsedFieldResetBaseline {
  readonly sourceUrl: string;
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
}
