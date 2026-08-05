// Assorted helpers used across the background service worker.
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

export function parseGalleryUrl(raw: string): { album: string; page: number } | null {
  const url = new URL(raw);
  const match = /^\/gallery\/([a-z0-9-]+)(?:\/page\/(\d+))?$/.exec(url.pathname);
  if (!match) return null;
  return { album: match[1] ?? '', page: Number(match[2] ?? '1') };
}

const RETRY_BASE_MS = 250;
const RETRY_MAX_ATTEMPTS = 5;

export async function withBackoff<T>(operation: () => Promise<T>): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;
      if (attempt >= RETRY_MAX_ATTEMPTS) throw error;
      const jitter = Math.random() * RETRY_BASE_MS;
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt + jitter));
    }
  }
}

export const STORAGE_KEYS = {
  pairingState: 'interop.pairing.state',
  recentAlbums: 'gallery.recent.albums',
  pcloudToken: 'destinations.pcloud.token',
  panelLayout: 'ui.panel.layout',
} as const;

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 120);
}

export function relativeTime(from: Date, to: Date = new Date()): string {
  const seconds = Math.round((to.getTime() - from.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

export function isPcloudQuotaError(error: unknown): boolean {
  return error instanceof Error && /quota|2008/.test(error.message);
}
