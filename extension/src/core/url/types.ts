export type UrlTokenKind = 'int' | 'hex' | 'text';

export interface UrlToken {
  readonly kind: UrlTokenKind;
  readonly value: string;
  readonly width?: number;
  readonly prefix?: '0x' | '0X';
  readonly uppercase?: boolean;
}

export interface PathSegment {
  readonly type: 'segment';
  readonly raw: string;
  readonly rawEncoded: string;
  readonly edited?: boolean;
  readonly tokens: UrlToken[];
}

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
  readonly pathSegments: PathSegment[];
  readonly queryFields: QueryField[];
}

export type UrlFieldLocation = 'path' | 'query';

export interface UrlField {
  readonly id: string;
  readonly location: UrlFieldLocation;
  readonly label: string;
  readonly tokenKind: UrlTokenKind;
  readonly segmentIndex?: number;
  readonly queryIndex?: number;
  readonly tokenIndex: number;
}
