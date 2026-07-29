export type MpegTsExtension = 'ts' | 'mts' | 'm2ts';

export function hasMpegTsHint(mimeType: string, fileNameOrUrl: string): boolean {
  return normalizedMimeType(mimeType) === 'video/mp2t' || mpegTsExtensionHint(fileNameOrUrl) !== null;
}

export function mpegTsExtensionHint(fileNameOrUrl: string): MpegTsExtension | null {
  let candidate = fileNameOrUrl;
  try {
    candidate = new URL(fileNameOrUrl).pathname;
  } catch {
    // A local filename is already the desired candidate.
  }
  const extension = candidate.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
  return extension === 'ts' || extension === 'mts' || extension === 'm2ts' ? extension : null;
}

function normalizedMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
}
