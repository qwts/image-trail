export const PAGE_CONTEXTS = ['single', 'gallery', 'feed'] as const;
export type PageContext = (typeof PAGE_CONTEXTS)[number];

export interface PageContextDetection {
  readonly detected: PageContext;
  readonly available: readonly PageContext[];
  readonly imageCount: number;
}

export interface PageContextState extends PageContextDetection {
  readonly effective: PageContext;
  readonly override: PageContext | null;
}

export interface PageContextOverrideRecord {
  readonly context: PageContext;
  readonly updatedAt: number;
}

export type PageContextOverrides = Readonly<Record<string, PageContextOverrideRecord>>;

export const PAGE_CONTEXT_OVERRIDE_LIMIT = 100;

export const EMPTY_PAGE_CONTEXT_STATE: PageContextState = {
  detected: 'single',
  effective: 'single',
  override: null,
  available: [],
  imageCount: 0,
};

export function isPageContext(value: unknown): value is PageContext {
  return typeof value === 'string' && (PAGE_CONTEXTS as readonly string[]).includes(value);
}

export function resolvePageContextState(detection: PageContextDetection, override: PageContext | null): PageContextState {
  const overrideAvailable = override !== null && detection.available.includes(override);
  return {
    ...detection,
    effective: overrideAvailable ? override : detection.detected,
    override,
  };
}

export function pageContextStatesEqual(left: PageContextState, right: PageContextState): boolean {
  return (
    left.detected === right.detected &&
    left.effective === right.effective &&
    left.override === right.override &&
    left.imageCount === right.imageCount &&
    left.available.length === right.available.length &&
    left.available.every((context, index) => context === right.available[index])
  );
}

export function pageContextLabel(context: PageContext): string {
  if (context === 'single') return 'Single image';
  if (context === 'gallery') return 'Gallery page';
  return 'Feed';
}

export function normalizePageContextScope(hostname: string): string | null {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/gu, '');
  if (!normalized || normalized.length > 253 || /[\s/\\]/u.test(normalized)) return null;
  return normalized;
}

export function sanitizePageContextOverrides(value: unknown): PageContextOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const newestByScope = new Map<string, PageContextOverrideRecord>();
  for (const [rawScope, rawRecord] of Object.entries(value)) {
    const scope = normalizePageContextScope(rawScope);
    if (!scope || !rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) continue;
    const record = rawRecord as Partial<PageContextOverrideRecord>;
    if (
      !isPageContext(record.context) ||
      typeof record.updatedAt !== 'number' ||
      !Number.isFinite(record.updatedAt) ||
      record.updatedAt < 0
    ) {
      continue;
    }
    const existing = newestByScope.get(scope);
    if (!existing || record.updatedAt > existing.updatedAt)
      newestByScope.set(scope, { context: record.context, updatedAt: record.updatedAt });
  }
  const records = Array.from(newestByScope.entries());
  records.sort((left, right) => right[1].updatedAt - left[1].updatedAt);
  return Object.fromEntries(records.slice(0, PAGE_CONTEXT_OVERRIDE_LIMIT));
}

export function updatePageContextOverrides(
  current: PageContextOverrides,
  hostname: string,
  context: PageContext | null,
  now = Date.now(),
): PageContextOverrides {
  const scope = normalizePageContextScope(hostname);
  if (!scope) return current;
  const next = { ...current };
  if (context) next[scope] = { context, updatedAt: now };
  else delete next[scope];
  return sanitizePageContextOverrides(next);
}
