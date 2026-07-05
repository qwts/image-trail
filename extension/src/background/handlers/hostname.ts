/** Normalizes a hostname used as a per-site store key; empty input maps to `null`. */
export function normalizeHostname(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase();
  return normalized || null;
}
