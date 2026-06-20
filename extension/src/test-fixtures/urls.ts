/**
 * URL parser/navigation regression fixtures for M03.
 *
 * Each fixture records the input URL, the expected parsed model shape, and
 * the expected rebuild output (which may differ from input due to
 * normalization). The increment/decrement cases record an expected output URL
 * after bumping the named field by the given delta.
 *
 * These fixtures are data-only. They are not runnable until the M03 parser
 * modules exist in extension/src/core/url/.
 */

export interface UrlToken {
  kind: 'int' | 'hex' | 'text';
  value: string;
  width?: number;
}

export interface PathSegment {
  type: 'segment' | 'sep';
  raw: string;
  tokens?: UrlToken[];
}

export interface QueryField {
  type: 'query';
  index: number;
  hasEquals: boolean;
  key: string;
  valueTokens: UrlToken[];
}

export interface ParsedModel {
  protocol: string;
  host: string;
  hash: string;
  pathParts: PathSegment[];
  queryPrefix: string;
  queryFields: QueryField[];
}

export interface UrlFixture {
  /** Human-readable label for the test case. */
  label: string;

  /** Category aligns with the bookmarklet behavior map sections. */
  category:
    | 'numeric-path'
    | 'hex-field'
    | 'query-field'
    | 'encoded-slash'
    | 'html-entity'
    | 'query-like-path'
    | 'hash'
    | 'width-preservation'
    | 'no-numeric'
    | 'rebuild-round-trip';

  /** The input URL string. */
  input: string;

  /**
   * Expected rebuild output after parse → rebuild cycle.
   * Omit when it should equal input exactly.
   */
  expectedRebuild?: string;

  /** Increment/decrement test cases for this URL. */
  incrementCases?: Array<{
    /** Field id (e.g., 'p:3:0' for path part 3, token 0) or label hint. */
    fieldHint: string;
    delta: number;
    expectedUrl: string;
  }>;

  /** Notes on why this case is interesting or tricky. */
  notes?: string;
}

export const urlFixtures: UrlFixture[] = [
  // ─── Numeric path segment tokens ──────────────────────────────────────────

  {
    label: 'Simple numeric path segment',
    category: 'numeric-path',
    input: 'https://example.com/images/00042/photo.jpg',
    incrementCases: [
      {
        fieldHint: 'path numeric 00042',
        delta: 1,
        expectedUrl: 'https://example.com/images/00043/photo.jpg',
      },
      {
        fieldHint: 'path numeric 00042',
        delta: -1,
        expectedUrl: 'https://example.com/images/00041/photo.jpg',
      },
    ],
    notes: 'Width-preserving zero-pad: 5 digits throughout.',
  },

  {
    label: 'Zero-padded filename numeric token',
    category: 'numeric-path',
    input: 'https://cdn.example.net/gallery/img_0007.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 0007',
        delta: 1,
        expectedUrl: 'https://cdn.example.net/gallery/img_0008.jpg',
      },
      {
        fieldHint: 'file numeric 0007',
        delta: -7,
        expectedUrl: 'https://cdn.example.net/gallery/img_0000.jpg',
      },
    ],
    notes: 'Width is 4; decrement to zero preserves zero-padding.',
  },

  {
    label: 'Decrement clamps at zero, does not go negative',
    category: 'numeric-path',
    input: 'https://example.com/photos/000.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 000',
        delta: -5,
        expectedUrl: 'https://example.com/photos/000.jpg',
      },
    ],
    notes: 'Bumping below zero clamps to zero and preserves width.',
  },

  {
    label: 'Non-zero-padded numeric path segment',
    category: 'numeric-path',
    input: 'https://media.example.com/posts/1234/full.jpg',
    incrementCases: [
      {
        fieldHint: 'path numeric 1234',
        delta: 1,
        expectedUrl: 'https://media.example.com/posts/1235/full.jpg',
      },
    ],
    notes: 'Width is 4; no leading zero but width must not shrink on bump.',
  },

  {
    label: 'Large numeric value requiring BigInt',
    category: 'numeric-path',
    input: 'https://example.com/img/9007199254740993.jpg',
    incrementCases: [
      {
        fieldHint: '9007199254740993',
        delta: 1,
        expectedUrl: 'https://example.com/img/9007199254740994.jpg',
      },
    ],
    notes: 'Exceeds Number.MAX_SAFE_INTEGER; BigInt arithmetic is required to avoid rounding.',
  },

  {
    label: 'Multiple numeric tokens in one path segment',
    category: 'numeric-path',
    input: 'https://example.com/2024/06/14/image_003.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 003',
        delta: 1,
        expectedUrl: 'https://example.com/2024/06/14/image_004.jpg',
      },
      {
        fieldHint: 'path numeric 2024',
        delta: 1,
        expectedUrl: 'https://example.com/2025/06/14/image_003.jpg',
      },
    ],
    notes: 'Year, month, day, and sequence number are all separate numeric tokens.',
  },

  // ─── Hex field tokens ──────────────────────────────────────────────────────

  {
    label: 'Uppercase hex filename token',
    category: 'hex-field',
    input: 'https://example.com/assets/3F9A2B.jpg',
    incrementCases: [
      {
        fieldHint: 'file hex 3F9A2B',
        delta: 1,
        expectedUrl: 'https://example.com/assets/3F9A2C.jpg',
      },
    ],
    notes: 'Hex token without 0x prefix; case must be preserved (uppercase in → uppercase out).',
  },

  {
    label: 'Lowercase hex filename token',
    category: 'hex-field',
    input: 'https://example.com/assets/3f9a2b.jpg',
    incrementCases: [
      {
        fieldHint: 'file hex 3f9a2b',
        delta: 1,
        expectedUrl: 'https://example.com/assets/3f9a2c.jpg',
      },
    ],
    notes: 'Lowercase in → lowercase out.',
  },

  {
    label: '0x-prefixed hex token',
    category: 'hex-field',
    input: 'https://example.com/images/0x00FF00/thumb.jpg',
    incrementCases: [
      {
        fieldHint: 'path hex 0x00FF00',
        delta: 1,
        expectedUrl: 'https://example.com/images/0x00FF01/thumb.jpg',
      },
      {
        fieldHint: 'path hex 0x00FF00',
        delta: -1,
        expectedUrl: 'https://example.com/images/0x00FEFF/thumb.jpg',
      },
    ],
    notes: '0x prefix is preserved; width applies to digits after 0x.',
  },

  {
    label: 'Hex token roll at zero',
    category: 'hex-field',
    input: 'https://example.com/assets/000.jpg',
    incrementCases: [
      {
        fieldHint: 'file hex 000',
        delta: -1,
        expectedUrl: 'https://example.com/assets/000.jpg',
      },
    ],
    notes: 'detectNumericType returns int for all-digit values; clamp to zero.',
  },

  {
    label: 'Long hash-like hex token in path',
    category: 'hex-field',
    input: 'https://example.com/media/a1b2c3d4e5f6.jpg',
    incrementCases: [
      {
        fieldHint: 'file hex a1b2c3d4e5f6',
        delta: 1,
        expectedUrl: 'https://example.com/media/a1b2c3d4e5f7.jpg',
      },
    ],
    notes: 'Mixed alphanumeric detected as hex; 12-char width preserved.',
  },

  // ─── Query field tokens ────────────────────────────────────────────────────

  {
    label: 'Numeric query parameter',
    category: 'query-field',
    input: 'https://example.com/photo?id=0042&size=large',
    incrementCases: [
      {
        fieldHint: 'query id',
        delta: 1,
        expectedUrl: 'https://example.com/photo?id=0043&size=large',
      },
    ],
    notes: 'Query parameter value is numeric with zero-padding.',
  },

  {
    label: 'Multiple numeric query parameters',
    category: 'query-field',
    input: 'https://example.com/viewer?page=003&chapter=02',
    incrementCases: [
      {
        fieldHint: 'query page',
        delta: 1,
        expectedUrl: 'https://example.com/viewer?page=004&chapter=02',
      },
      {
        fieldHint: 'query chapter',
        delta: 1,
        expectedUrl: 'https://example.com/viewer?page=003&chapter=03',
      },
    ],
    notes: 'Both query values are independently numeric tokens.',
  },

  {
    label: 'Query parameter without value',
    category: 'query-field',
    input: 'https://example.com/image?raw',
    expectedRebuild: 'https://example.com/image?raw',
    notes: 'hasEquals is false for bare query keys; rebuild must not append = sign.',
  },

  {
    label: 'Query parameter with + encoding for space',
    category: 'query-field',
    input: 'https://example.com/search?q=hello+world&num=001',
    incrementCases: [
      {
        fieldHint: 'query num',
        delta: 1,
        expectedUrl: 'https://example.com/search?q=hello+world&num=002',
      },
    ],
    notes: 'Decode + as space in query values; re-encode space as + on rebuild.',
  },

  {
    label: 'Query parameter with percent-encoded key',
    category: 'query-field',
    input: 'https://example.com/img?file%20name=003.jpg',
    notes: 'Key is percent-decoded for display; re-encoded on rebuild.',
  },

  // ─── Encoded slash paths ───────────────────────────────────────────────────

  {
    label: 'Singly encoded slash in path (%2f)',
    category: 'encoded-slash',
    input: 'https://example.com/photos%2farchive%2f0042.jpg',
    expectedRebuild: 'https://example.com/photos%2Farchive%2F0042.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 0042',
        delta: 1,
        expectedUrl: 'https://example.com/photos%2Farchive%2F0043.jpg',
      },
    ],
    notes: 'Encoded slashes (%2f / %2F) must not be decoded to / on rebuild; case may be normalized to uppercase.',
  },

  {
    label: 'Double-encoded slash in path (%252f)',
    category: 'encoded-slash',
    input: 'https://example.com/data%252fimages%252f001.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 001',
        delta: 1,
        expectedUrl: 'https://example.com/data%252fimages%252f002.jpg',
      },
    ],
    notes: 'Double-encoded slashes must be preserved as separators without further encoding.',
  },

  {
    label: 'Mixed literal and encoded slashes',
    category: 'encoded-slash',
    input: 'https://example.com/archive/photos%2f2024/img_001.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 001',
        delta: 1,
        expectedUrl: 'https://example.com/archive/photos%2F2024/img_002.jpg',
      },
    ],
    notes: 'Literal and encoded slashes in the same pathname each serve as separators; both styles preserved.',
  },

  // ─── HTML entity handling ──────────────────────────────────────────────────

  {
    label: 'HTML-encoded ampersand in URL',
    category: 'html-entity',
    input: 'https://example.com/img?page=002&amp;size=large',
    expectedRebuild: 'https://example.com/img?page=002&size=large',
    notes: '&amp; is decoded to & before URL parsing; rebuild produces the canonical unescaped form.',
  },

  {
    label: 'Multiple HTML entities',
    category: 'html-entity',
    input: 'https://example.com/img?q=hello&amp;id=003&amp;format=jpg',
    expectedRebuild: 'https://example.com/img?q=hello&id=003&format=jpg',
    notes: 'All &amp; occurrences are decoded before parsing; result is a standard query string.',
  },

  // ─── Query-like path (no ? in URL) ────────────────────────────────────────

  {
    label: 'Query parameters embedded in path with ?',
    category: 'query-like-path',
    input: 'https://example.com/photo?id=0003&size=full',
    notes: 'Standard ? separator; maybeSplitQueryLikePath should treat it as a normal query string.',
  },

  {
    label: 'Query-like suffix in path segment without ?',
    category: 'query-like-path',
    input: 'https://example.com/photo&id=0003',
    notes:
      'The path ends in &key=value; maybeSplitQueryLikePath splits this at &; the prefix becomes the pathname and the pair becomes a query field.',
  },

  // ─── Hash fragment ─────────────────────────────────────────────────────────

  {
    label: 'URL with hash fragment',
    category: 'hash',
    input: 'https://example.com/gallery/002.jpg#fullscreen',
    expectedRebuild: 'https://example.com/gallery/002.jpg#fullscreen',
    incrementCases: [
      {
        fieldHint: 'file numeric 002',
        delta: 1,
        expectedUrl: 'https://example.com/gallery/003.jpg#fullscreen',
      },
    ],
    notes: 'Hash is preserved and not parsed as a field; rebuild appends it unchanged.',
  },

  // ─── Width preservation ────────────────────────────────────────────────────

  {
    label: 'Width grows when bumped beyond current digit count',
    category: 'width-preservation',
    input: 'https://example.com/img/99.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 99',
        delta: 1,
        expectedUrl: 'https://example.com/img/100.jpg',
      },
    ],
    notes:
      'Width is 2 initially; after bumping to 100 the width grows to 3. No zero-padding is added when the value exceeds the original width.',
  },

  {
    label: 'Width is never reduced on decrement',
    category: 'width-preservation',
    input: 'https://example.com/img/100.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 100',
        delta: -1,
        expectedUrl: 'https://example.com/img/099.jpg',
      },
    ],
    notes: 'Decrementing 100 to 99 must zero-pad to preserve the width of 3.',
  },

  {
    label: 'Hex width preserved after increment',
    category: 'width-preservation',
    input: 'https://example.com/img/0ff.jpg',
    incrementCases: [
      {
        fieldHint: 'file hex 0ff',
        delta: 1,
        expectedUrl: 'https://example.com/img/100.jpg',
      },
    ],
    notes: 'Hex width is 3; incrementing 0xff (255) to 256 (0x100) grows to 3 digits.',
  },

  // ─── No numeric tokens ────────────────────────────────────────────────────

  {
    label: 'URL with no numeric tokens',
    category: 'no-numeric',
    input: 'https://example.com/images/photo.jpg',
    notes: 'Parser produces all text tokens; no active field is set; increment/decrement has no effect.',
  },

  {
    label: 'URL with only a text query parameter',
    category: 'no-numeric',
    input: 'https://example.com/search?q=mountains',
    notes: 'Query value is all text; no numeric or hex tokens; no active field.',
  },

  // ─── Round-trip rebuild integrity ─────────────────────────────────────────

  {
    label: 'Protocol and host are preserved on rebuild',
    category: 'rebuild-round-trip',
    input: 'https://images.example.co.uk/gallery/001/photo.jpg',
    notes: 'Subdomain and ccTLD are preserved exactly on rebuild.',
  },

  {
    label: 'Port number is preserved on rebuild',
    category: 'rebuild-round-trip',
    input: 'http://localhost:8080/images/003.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 003',
        delta: 1,
        expectedUrl: 'http://localhost:8080/images/004.jpg',
      },
    ],
    notes: 'Port is part of host; must not be dropped on rebuild.',
  },

  {
    label: 'Percent-encoded non-slash characters in path are preserved',
    category: 'rebuild-round-trip',
    input: 'https://example.com/img/hello%20world/002.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 002',
        delta: 1,
        expectedUrl: 'https://example.com/img/hello%20world/003.jpg',
      },
    ],
    notes: 'Space encoded as %20 in a path segment; decode for token display, re-encode on rebuild.',
  },

  {
    label: 'Non-ASCII characters in path',
    category: 'rebuild-round-trip',
    input: 'https://example.com/img/caf%C3%A9/001.jpg',
    incrementCases: [
      {
        fieldHint: 'file numeric 001',
        delta: 1,
        expectedUrl: 'https://example.com/img/caf%C3%A9/002.jpg',
      },
    ],
    notes: 'UTF-8 encoded characters in path segments; safeDecodePathSegment must handle multi-byte sequences.',
  },

  {
    label: 'Empty path with only a numeric query',
    category: 'rebuild-round-trip',
    input: 'https://example.com/?p=005',
    incrementCases: [
      {
        fieldHint: 'query p',
        delta: 1,
        expectedUrl: 'https://example.com/?p=006',
      },
    ],
    notes: 'Pathname is just /; all editable state is in the query.',
  },

  {
    label: 'Trailing slash in pathname is preserved',
    category: 'rebuild-round-trip',
    input: 'https://example.com/gallery/001/',
    expectedRebuild: 'https://example.com/gallery/001/',
    notes: 'A trailing / segment is a separator with an empty segment following it; rebuild must not collapse it.',
  },
];
