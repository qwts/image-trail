export type GrabStrategyKind = 'clicked-image' | 'linked-page-image';

export interface LinkedPageImageExtractor {
  readonly selector: string;
  readonly attribute: string;
}

export interface ClickedImageGrabStrategy {
  readonly kind: 'clicked-image';
}

export interface LinkedPageImageGrabStrategy {
  readonly kind: 'linked-page-image';
  readonly extractors: readonly LinkedPageImageExtractor[];
  readonly timeoutMs: number;
  readonly maxBytes: number;
}

export type UrlTemplateGrabStrategy = ClickedImageGrabStrategy | LinkedPageImageGrabStrategy;

export const DEFAULT_LINKED_PAGE_IMAGE_EXTRACTORS: readonly LinkedPageImageExtractor[] = [
  { selector: 'meta[property="og:image"]', attribute: 'content' },
  { selector: 'meta[name="twitter:image"]', attribute: 'content' },
  { selector: '#main-image', attribute: 'src' },
  { selector: 'img.fullsize', attribute: 'src' },
  { selector: 'img', attribute: 'src' },
];

export const DEFAULT_LINKED_PAGE_IMAGE_GRAB_STRATEGY: LinkedPageImageGrabStrategy = {
  kind: 'linked-page-image',
  extractors: DEFAULT_LINKED_PAGE_IMAGE_EXTRACTORS,
  timeoutMs: 5000,
  maxBytes: 1_048_576,
};

const MAX_EXTRACTORS = 8;
const MAX_SELECTOR_LENGTH = 160;
const MAX_ATTRIBUTE_LENGTH = 40;

export function defaultGrabStrategy(kind: GrabStrategyKind): UrlTemplateGrabStrategy {
  return kind === 'linked-page-image' ? DEFAULT_LINKED_PAGE_IMAGE_GRAB_STRATEGY : { kind: 'clicked-image' };
}

export function normalizeGrabStrategy(value: unknown): UrlTemplateGrabStrategy | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const kind = (value as { readonly kind?: unknown }).kind;
  if (kind === 'clicked-image') return { kind };
  if (kind !== 'linked-page-image') return undefined;

  const sourceExtractors = Array.isArray((value as { readonly extractors?: unknown }).extractors)
    ? (value as { readonly extractors: readonly unknown[] }).extractors
    : DEFAULT_LINKED_PAGE_IMAGE_EXTRACTORS;
  const extractors = normalizeExtractors(sourceExtractors);
  const timeoutMs = boundedInteger((value as { readonly timeoutMs?: unknown }).timeoutMs, 1000, 15_000, 5000);
  const maxBytes = boundedInteger((value as { readonly maxBytes?: unknown }).maxBytes, 32_768, 2_097_152, 1_048_576);

  return {
    kind,
    extractors: extractors.length > 0 ? extractors : DEFAULT_LINKED_PAGE_IMAGE_EXTRACTORS,
    timeoutMs,
    maxBytes,
  };
}

export function normalizeExtractors(values: readonly unknown[]): readonly LinkedPageImageExtractor[] {
  return values
    .map((value) => {
      if (!value || typeof value !== 'object') return null;
      const selector = cleanSelector((value as { readonly selector?: unknown }).selector);
      const attribute = cleanAttribute((value as { readonly attribute?: unknown }).attribute);
      return selector && attribute ? { selector, attribute } : null;
    })
    .filter((value): value is LinkedPageImageExtractor => value !== null)
    .slice(0, MAX_EXTRACTORS);
}

export function parseExtractorLines(value: string): readonly LinkedPageImageExtractor[] {
  return normalizeExtractors(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [selector, attribute = 'src'] = line.split('@');
        return { selector: selector?.trim(), attribute: attribute.trim() };
      }),
  );
}

export function serializeExtractorLines(extractors: readonly LinkedPageImageExtractor[]): string {
  return extractors.map((extractor) => `${extractor.selector}@${extractor.attribute}`).join('\n');
}

export function grabStrategyLabel(strategy: UrlTemplateGrabStrategy | undefined): string {
  switch (strategy?.kind) {
    case 'linked-page-image':
      return 'Linked page image';
    case 'clicked-image':
    case undefined:
      return 'Clicked image';
  }
}

function cleanSelector(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const selector = value.trim();
  if (!selector || selector.length > MAX_SELECTOR_LENGTH) return null;
  return selector;
}

function cleanAttribute(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const attribute = value.trim();
  if (!/^[a-z][a-z0-9:-]{0,39}$/iu.test(attribute) || attribute.length > MAX_ATTRIBUTE_LENGTH) return null;
  return attribute;
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}
