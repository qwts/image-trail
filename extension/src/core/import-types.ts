export interface ImportedImageFile {
  readonly name: string;
  readonly dataUrl: string;
}

export interface ImportedEncryptedImageFile {
  readonly name: string;
  readonly fileContent: string;
}

export interface ImportRestorePreviewState {
  readonly fileName: string;
  readonly payloadLabel: string;
  readonly recordCount: number;
  readonly capturedOriginalCount?: number | undefined;
  readonly duplicateCount?: number | undefined;
  readonly skippedCount?: number | undefined;
  readonly unsupportedCount?: number | undefined;
  readonly plaintext?: boolean | undefined;
  readonly message?: string | undefined;
  readonly messageIsError?: boolean | undefined;
  readonly samples: readonly ImportRestorePreviewSample[];
  readonly validationIssues?: readonly ImportRestorePreviewValidationIssue[] | undefined;
  readonly unsupportedSections?: readonly ImportRestorePreviewUnsupportedSection[] | undefined;
}

export interface ImportRestorePreviewSample {
  readonly label: string;
  readonly url?: string | undefined;
  readonly detail?: string | undefined;
}

export interface ImportRestorePreviewUnsupportedSection {
  readonly label: string;
  readonly detail: string;
}

export interface ImportRestorePreviewValidationIssue {
  readonly reason: string;
  readonly count: number;
}
