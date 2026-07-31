import { parseUrl } from '../core/url/parse-url.js';
import { findBestMatchingGrabSourcePattern, type GrabSourcePattern } from '../core/url/templates.js';

export function matchingGrabSourcePattern(
  patterns: readonly GrabSourcePattern[],
  sourceUrl: string,
  identityKey: string | null,
): GrabSourcePattern | null {
  if (!identityKey) return null;
  try {
    return findBestMatchingGrabSourcePattern(patterns, parseUrl(sourceUrl), identityKey);
  } catch {
    return null;
  }
}
