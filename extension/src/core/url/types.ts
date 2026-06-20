export type UrlTokenKind = 'int' | 'hex' | 'text';

export interface UrlToken {
  readonly kind: UrlTokenKind;
  readonly value: string;
  readonly width?: number;
  readonly prefix?: '0x' | '0X';
  readonly uppercase?: boolean;
  readonly originalTokenIndex?: number;
  readonly splitBaseId?: string;
  readonly splitPartIndex?: number;
  readonly splitPartCount?: number;
}

export interface PathSeparator {
  readonly type: 'sep';
  readonly raw: string;
}

export interface PathSegment {
  readonly type: 'segment';
  readonly raw: string;
  readonly edited?: boolean;
  readonly tokens: UrlToken[];
}

export type PathPart = PathSeparator | PathSegment;

export interface QueryField {
  readonly type: 'query';
  readonly index: number;
  readonly hasEquals: boolean;
  readonly key: string;
  readonly keyRaw: string;
  readonly valueRaw: string;
  readonly valueTokens: UrlToken[];
}

export interface ParsedUrlModel {
  readonly protocol: string;
  readonly host: string;
  readonly hash: string;
  readonly pathParts: PathPart[];
  readonly queryPrefix: string;
  readonly queryFields: QueryField[];
}

export type UrlFieldLocation = 'path' | 'query';

export interface UrlField {
  readonly id: string;
  readonly location: UrlFieldLocation;
  readonly label: string;
  readonly value: string;
  readonly tokenKind: UrlTokenKind;
  readonly partIndex?: number;
  readonly queryIndex?: number;
  readonly tokenIndex: number;
  readonly originalTokenIndex?: number;
  readonly splitBaseId?: string;
  readonly splitPartIndex?: number;
  readonly splitPartCount?: number;
}

export interface UrlFieldSplitSpec {
  readonly baseFieldId: string;
  readonly location: UrlFieldLocation;
  readonly partIndex?: number;
  readonly queryIndex?: number;
  readonly tokenIndex: number;
  readonly lengths: readonly number[];
  readonly pattern: string;
}
