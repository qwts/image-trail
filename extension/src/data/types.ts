export type DataStoreName = 'metadata' | 'keys' | 'history';
export type DataStatusCode =
  | 'ok'
  | 'db-open-failed'
  | 'migration-failed'
  | 'encryption-failed'
  | 'decryption-failed'
  | 'not-found'
  | 'locked';

export interface RecoverableDataStatus {
  readonly ok: boolean;
  readonly code: DataStatusCode;
  readonly message: string;
  readonly cause?: unknown;
}

export interface VersionMetadataRecord {
  readonly key: 'schema';
  readonly databaseVersion: number;
  readonly migratedAt: string;
}

export interface DurableHistoryPayloadV1 {
  readonly url: string;
  readonly title?: string;
  readonly label?: string;
  readonly thumbnail?: string;
  readonly capturedAt: string;
  readonly captureStatus: 'remote-only' | 'downloaded' | 'failed';
}
