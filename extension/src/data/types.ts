import type { EncryptionAlgorithm, KeyReference } from './crypto/types.js';
import type { InteropReviewCategory } from '../core/interop/contract.js';
import type { InteropAlbum, InteropRecord } from '../core/interop/records.js';

export type DataStoreName =
  | 'metadata'
  | 'keys'
  | 'history'
  | 'bookmarks'
  | 'blobs'
  | 'originalBlobIndex'
  | 'downloads'
  | 'encryptedPins'
  | 'encryptedPinThumbnails'
  | 'albums'
  | 'albumMemberships'
  | 'moveJournals'
  | 'moveItems'
  | 'moveOutbox'
  | 'moveReceipts'
  | 'moveAudit'
  | 'syncSessions'
  | 'syncItems'
  | 'syncReceipts'
  | 'syncAudit'
  | 'secureSyncSessions'
  | 'secureSyncItems'
  | 'secureSyncOutbox'
  | 'secureSyncInbox';
export type DataStatusCode =
  'ok' | 'db-open-failed' | 'migration-failed' | 'encryption-failed' | 'decryption-failed' | 'not-found' | 'locked';

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

export interface AlbumRecord {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AlbumMembershipRecord {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly albumId: string;
  readonly recordId: string;
  readonly position: number;
  readonly addedAt: string;
}

export type BlobKind = 'original' | 'thumbnail';

export interface StoredBlobRecord {
  readonly id: string;
  readonly kind: BlobKind;
  readonly schemaVersion: 1;
  readonly algorithm: EncryptionAlgorithm;
  readonly iv: string;
  readonly ciphertext: ArrayBuffer;
  readonly encryptedByteLength: number;
  readonly createdAt: string;
  readonly key: KeyReference<'blob'>;
  readonly referenceCount: number;
}

export interface StoredOriginalReference {
  readonly blobId: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly capturedAt: string;
}

export interface DurableHistoryPayloadV1 {
  readonly url: string;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly thumbnail?: string | undefined;
  readonly capturedAt: string;
  readonly captureStatus: 'remote-only' | 'downloaded' | 'failed';
  readonly storedOriginal?: StoredOriginalReference | undefined;
}

export interface DurableBookmarkPayloadV1 {
  readonly url: string;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly thumbnail?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly bookmarkedAt: string;
  readonly downloadedAt?: string | undefined;
  readonly capturedAt?: string | undefined;
  readonly sourceCompatibility?: 'favorites' | undefined;
  readonly storedOriginal?: StoredOriginalReference | undefined;
  readonly protectedPin?: ProtectedPinRelationshipV1 | undefined;
  readonly interop?: DurableInteropRecordV1 | undefined;
}

export interface DurableInteropRecordV1 {
  readonly schemaVersion: 1;
  readonly record: InteropRecord;
  readonly albums: readonly InteropAlbum[];
  readonly reviewCategory: InteropReviewCategory;
}

export interface ProtectedPinRelationshipV1 {
  readonly schemaVersion: 1;
  readonly plainPinId: string;
  readonly encryptedPinId?: string | undefined;
  readonly encryptedThumbnailId?: string | undefined;
  readonly storedOriginalBlobId?: string | undefined;
  readonly queueUpdatedAt: string;
  readonly hasEncryptedMetadata: boolean;
  readonly hasEncryptedThumbnail: boolean;
  readonly hasStoredOriginal: boolean;
}

export interface DurableEncryptedPinPayloadV1 {
  readonly url: string;
  readonly title?: string | undefined;
  readonly label?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly bookmarkedAt: string;
  readonly downloadedAt?: string | undefined;
  readonly capturedAt?: string | undefined;
  readonly sourceCompatibility?: 'favorites' | undefined;
  readonly storedOriginal?: StoredOriginalReference | undefined;
  readonly thumbnailId?: string | undefined;
  readonly interop?: DurableInteropRecordV1 | undefined;
}

export interface DurableDownloadPayloadV1 {
  readonly sourceUrl: string;
  readonly filename: string;
  readonly originalFilename?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly byteLength?: number | undefined;
  readonly fingerprint?: string | undefined;
  readonly downloadedAt: string;
  readonly sourceRecordUuid?: string | undefined;
  readonly fileFormatVersion?: number | undefined;
}
