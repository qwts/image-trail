import * as v from 'valibot';
import { isBuildIdentity, type BuildIdentity } from '../core/build-info.js';
import type { BookmarkSaveOptions } from '../core/bookmark-save-options.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { storageUsageSummarySchema } from '../core/image/capture-result.schema.js';
import type { ImageProbeMethod, ImageRequestIntent, ImageSourceProfile } from '../core/image/request-policy.js';
import type { SaveLocalSettingsInput } from '../data/local-settings.js';
import { MESSAGE_DIRECTION, MESSAGE_PROTOCOL_VERSION, MessageType, hasVersionedObjectShape } from './message-protocol.js';
import type { MessageType as ProtocolMessageType } from './message-protocol.js';
import type { AlbumRequest, AlbumResponse } from './album-messages.js';
import type {
  BlobKeyRequest,
  BlobKeyResponse,
  BlobKeyResultMessage,
  BlobKeyStatusResultMessage,
  ExportBlobKeyBackupResultMessage,
  ImportBlobKeyBackupResultMessage,
} from './blob-key-messages.js';
import type { DestinationRequest, DestinationResponse } from './destination-messages.js';
import type {
  DeletePanelPositionMessage,
  DeletePanelPositionResultMessage,
  DeleteWorkspaceLayoutMessage,
  DeleteWorkspaceLayoutResultMessage,
  LoadPanelPositionMessage,
  LoadPanelPositionResultMessage,
  LoadWorkspaceLayoutMessage,
  LoadWorkspaceLayoutResultMessage,
  SavePanelPositionMessage,
  SavePanelPositionResultMessage,
  SaveWorkspaceLayoutMessage,
  SaveWorkspaceLayoutResultMessage,
} from './layout-messages.js';
import type { OriginalBlobRequest, OriginalBlobResponse } from './original-blob-messages.js';
import type { RecentHistoryRequest, RecentHistoryResponse } from './recent-history-messages.js';
export { MESSAGE_DIRECTION, MESSAGE_PROTOCOL_VERSION, MessageType } from './message-protocol.js';
export * from './album-messages.js';
export * from './blob-key-messages.js';
export * from './layout-messages.js';
export * from './original-blob-messages.js';
export * from './recent-history-messages.js';
const deleteBlobResultPayloadSchema = v.object({
  deleted: v.boolean(),
  usage: storageUsageSummarySchema,
});

export interface TogglePanelMessage {
  readonly type: typeof MessageType.TogglePanel;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly source: 'browserAction' };
}

export interface ToggleBuildIdentityOverlayMessage {
  readonly type: typeof MessageType.ToggleBuildIdentityOverlay;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly source: 'browserCommand' };
}

export interface PingMessage {
  readonly type: typeof MessageType.Ping;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly sentAt: number };
}

export interface LoadBuildIdentityMessage {
  readonly type: typeof MessageType.LoadBuildIdentity;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly requestedAt: number };
}

export interface LoadBuildIdentityResultMessage {
  readonly type: typeof MessageType.LoadBuildIdentityResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    { readonly ok: true; readonly identity: BuildIdentity } | { readonly ok: false; readonly identity: null; readonly message: string };
}

export interface StatusMessage {
  readonly type: typeof MessageType.Status;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly panelVisible: boolean; readonly status: string };
}

export interface UnknownMessageResponse {
  readonly type: typeof MessageType.Unknown;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly reason: string };
}

export type CaptureSourceType = 'target' | 'history' | 'bookmark';

export interface CaptureImageMessage {
  readonly type: typeof MessageType.CaptureImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceRecordId?: string | undefined;
    readonly sourceType: CaptureSourceType;
  };
}

export interface CaptureResultMessage {
  readonly type: typeof MessageType.CaptureResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/image/capture-result.js').CaptureResult;
}

export interface DownloadImageMessage {
  readonly type: typeof MessageType.DownloadImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly fileName: string;
    readonly saveAs: boolean;
  };
}

export interface DownloadImageResultMessage {
  readonly type: typeof MessageType.DownloadImageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly downloadId: number } | { readonly ok: false; readonly message: string };
}

export interface ExportEncryptedImageMessage {
  readonly type: typeof MessageType.ExportEncryptedImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly fileName: string;
    readonly blobId?: string | undefined;
  };
}

export interface ExportEncryptedImageResultMessage {
  readonly type: typeof MessageType.ExportEncryptedImageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly fileContent: string; readonly fileName: string; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface ImportEncryptedImageMessage {
  readonly type: typeof MessageType.ImportEncryptedImage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly fileContent: string };
}

export interface ImportEncryptedImageResultMessage {
  readonly type: typeof MessageType.ImportEncryptedImageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly dataUrl: string;
        readonly fileName: string;
        readonly sourceUrl: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly keyReference: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface StorageUsageRequestMessage {
  readonly type: typeof MessageType.StorageUsageRequest;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface StorageUsageResponseMessage {
  readonly type: typeof MessageType.StorageUsageResponse;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/image/capture-result.js').StorageUsageSummary;
}

export interface DeleteBlobMessage {
  readonly type: typeof MessageType.DeleteBlob;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface DeleteBlobResultMessage {
  readonly type: typeof MessageType.DeleteBlobResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly deleted: boolean; readonly usage: import('../core/image/capture-result.js').StorageUsageSummary };
}

export interface CleanupOrphanedBlobsMessage {
  readonly type: typeof MessageType.CleanupOrphanedBlobs;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface CleanupOrphanedBlobsResultMessage {
  readonly type: typeof MessageType.CleanupOrphanedBlobsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly deletedCount: number; readonly usage: import('../core/image/capture-result.js').StorageUsageSummary };
}

export interface RetrieveBlobMessage {
  readonly type: typeof MessageType.RetrieveBlob;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface RetrieveBlobResultMessage {
  readonly type: typeof MessageType.RetrieveBlobResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly blobId: string;
        readonly dataUrl: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly capturedAt: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface CreateBlobPreviewMessage {
  readonly type: typeof MessageType.CreateBlobPreview;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly blobId: string };
}

export interface CreateDataUrlPreviewMessage {
  readonly type: typeof MessageType.CreateDataUrlPreview;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly dataUrl: string };
}

export interface CreateBlobPreviewResultMessage {
  readonly type: typeof MessageType.CreateBlobPreviewResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly previewUrl: string; readonly byteLength: number }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface FetchThumbnailSourceMessage {
  readonly type: typeof MessageType.FetchThumbnailSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
    readonly sourceProfile?: ImageSourceProfile | undefined;
  };
}

export interface FetchThumbnailSourceResultMessage {
  readonly type: typeof MessageType.FetchThumbnailSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly dataUrl: string;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly sha256?: string | undefined;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface ProbeImageSourceMessage {
  readonly type: typeof MessageType.ProbeImageSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly timeoutMs: number;
    readonly contextKey?: string | undefined;
    readonly probeMethod?: ImageProbeMethod | undefined;
  };
}

export interface ProbeImageSourceResultMessage {
  readonly type: typeof MessageType.ProbeImageSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly status: number; readonly finalUrl: string }
    | { readonly ok: false; readonly status?: number; readonly reason: string; readonly message: string };
}

export interface FetchBufferedImageSourceMessage {
  readonly type: typeof MessageType.FetchBufferedImageSource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
  };
}

export interface FetchBufferedImageSourceResultMessage {
  readonly type: typeof MessageType.FetchBufferedImageSourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly bytes: ArrayBuffer;
        readonly mimeType: string;
        readonly byteLength: number;
        readonly sha256?: string | undefined;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface CheckImageRequestPolicyMessage {
  readonly type: typeof MessageType.CheckImageRequestPolicy;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly referrer?: string | undefined;
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
  };
}

export interface CheckImageRequestPolicyResultMessage {
  readonly type: typeof MessageType.CheckImageRequestPolicyResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly status: 'unknown' }
    | { readonly status: 'cached-success' }
    | { readonly status: 'skippable-failed'; readonly reason: string; readonly message: string };
}

export interface FetchLinkedPageMessage {
  readonly type: typeof MessageType.FetchLinkedPage;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly url: string; readonly maxBytes: number; readonly timeoutMs: number };
}

export interface FetchLinkedPageResultMessage {
  readonly type: typeof MessageType.FetchLinkedPageResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly text: string; readonly byteLength: number; readonly finalUrl: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface GrantPermissionAndCaptureMessage {
  readonly type: typeof MessageType.GrantPermissionAndCapture;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly url: string;
    readonly sourceType: CaptureSourceType;
    readonly sourceRecordId?: string | undefined;
  };
}

export interface LoadBookmarksMessage {
  readonly type: typeof MessageType.LoadBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
    readonly displayOrder?: import('../core/display-order.js').QueueDisplayOrder | undefined;
  };
}

export interface LoadBookmarksResultMessage {
  readonly type: typeof MessageType.LoadBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly items: readonly ImageDisplayRecord[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  };
}

export interface LoadBookmarksByIdsMessage {
  readonly type: typeof MessageType.LoadBookmarksByIds;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ids: readonly string[] };
}

export interface LoadBookmarksByIdsResultMessage {
  readonly type: typeof MessageType.LoadBookmarksByIdsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly items: readonly ImageDisplayRecord[] };
}

export interface FindBookmarkByUrlMessage {
  readonly type: typeof MessageType.FindBookmarkByUrl;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly url: string };
}

export interface FindBookmarkByUrlResultMessage {
  readonly type: typeof MessageType.FindBookmarkByUrlResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: ImageDisplayRecord | null };
}

export interface SaveBookmarkMessage {
  readonly type: typeof MessageType.SaveBookmark;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: ImageDisplayRecord; readonly options?: BookmarkSaveOptions | undefined };
}

export interface SaveBookmarkResultMessage {
  readonly type: typeof MessageType.SaveBookmarkResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string };
}

export interface RemoveBookmarkMessage {
  readonly type: typeof MessageType.RemoveBookmark;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: ImageDisplayRecord };
}

export interface RemoveBookmarkResultMessage {
  readonly type: typeof MessageType.RemoveBookmarkResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface RemoveBookmarksMessage {
  readonly type: typeof MessageType.RemoveBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ids: readonly string[] };
}

export interface RemoveBookmarksResultMessage {
  readonly type: typeof MessageType.RemoveBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean; readonly removedCount: number };
}

export interface RemoveRecallBookmarksMessage {
  readonly type: typeof MessageType.RemoveRecallBookmarks;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
  };
}

export interface RemoveRecallBookmarksResultMessage {
  readonly type: typeof MessageType.RemoveRecallBookmarksResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean; readonly removedCount: number };
}

export interface LoadRecallCandidatesMessage {
  readonly type: typeof MessageType.LoadRecallCandidates;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
    readonly currentPageUrl?: string | undefined;
  };
}

export interface LoadRecallCandidatesResultMessage {
  readonly type: typeof MessageType.LoadRecallCandidatesResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly candidates: readonly import('../core/types.js').RecallCandidate[];
        readonly total: number;
        readonly nextOffset: number;
        readonly hasMore: boolean;
        readonly failedCount: number;
        readonly message: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface RecallRecordsMessage {
  readonly type: typeof MessageType.RecallRecords;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ids: readonly string[] };
}

export interface RecallRecordsResultMessage {
  readonly type: typeof MessageType.RecallRecordsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly records: readonly ImageDisplayRecord[];
        readonly failedCount: number;
        readonly message: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface LoadParsedFieldStateMessage {
  readonly type: typeof MessageType.LoadParsedFieldState;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly pageUrl: string };
}

export interface LoadParsedFieldStateResultMessage {
  readonly type: typeof MessageType.LoadParsedFieldStateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly record: import('../core/types.js').ParsedFieldStateRecord | null }
    | { readonly ok: false; readonly message: string };
}

export interface LoadParsedFieldStateBySourceMessage {
  readonly type: typeof MessageType.LoadParsedFieldStateBySource;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly sourceUrl: string };
}

export interface LoadParsedFieldStateBySourceResultMessage {
  readonly type: typeof MessageType.LoadParsedFieldStateBySourceResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly record: import('../core/types.js').ParsedFieldStateRecord | null }
    | { readonly ok: false; readonly message: string };
}

export interface SaveParsedFieldStateMessage {
  readonly type: typeof MessageType.SaveParsedFieldState;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: import('../core/types.js').ParsedFieldStateRecord };
}

export interface SaveParsedFieldStateResultMessage {
  readonly type: typeof MessageType.SaveParsedFieldStateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface ListUrlReviewStatusMessage {
  readonly type: typeof MessageType.ListUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface ListUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.ListUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly records: readonly import('../core/types.js').UrlReviewStatusRecord[] }
    | { readonly ok: false; readonly message: string };
}

export interface SaveUrlReviewStatusMessage {
  readonly type: typeof MessageType.SaveUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly record: import('../core/types.js').UrlReviewStatusRecord };
}

export interface SaveUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.SaveUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface ImportUrlReviewStatusMessage {
  readonly type: typeof MessageType.ImportUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly records: readonly import('../core/types.js').UrlReviewStatusRecord[] };
}

export interface ImportUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.ImportUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly importedCount: number } | { readonly ok: false; readonly message: string };
}

export interface ClearUrlReviewStatusMessage {
  readonly type: typeof MessageType.ClearUrlReviewStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly filter: import('../core/types.js').UrlReviewStatusClearFilter };
}

export interface ClearUrlReviewStatusResultMessage {
  readonly type: typeof MessageType.ClearUrlReviewStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly deletedCount: number } | { readonly ok: false; readonly message: string };
}

export interface LoadLocalSettingsMessage {
  readonly type: typeof MessageType.LoadLocalSettings;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly requestedAt: number };
}

export interface LoadLocalSettingsResultMessage {
  readonly type: typeof MessageType.LoadLocalSettingsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly settings: import('../data/local-settings.js').PlaintextLocalSettings }
    | { readonly ok: false; readonly message: string };
}

type BackwardCompatibleLocalSettingsKey =
  | 'recentSparseRowDisplayMode'
  | 'recentDisplayOrder'
  | 'queueDisplayOrder'
  | 'downArrowAction'
  | 'pageContextOverrides'
  | 'blobKeyInactivityTimeoutMinutes';
type BackwardCompatibleLocalSettings = {
  readonly [Key in BackwardCompatibleLocalSettingsKey]?: SaveLocalSettingsInput[Key] | undefined;
};
export type SaveLocalSettingsPayloadSettings = Omit<SaveLocalSettingsInput, BackwardCompatibleLocalSettingsKey> &
  BackwardCompatibleLocalSettings;

export interface SaveLocalSettingsMessage {
  readonly type: typeof MessageType.SaveLocalSettings;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly settings: SaveLocalSettingsPayloadSettings };
}

export interface SaveLocalSettingsResultMessage {
  readonly type: typeof MessageType.SaveLocalSettingsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface PCloudProviderStatusMessage {
  readonly type: typeof MessageType.PCloudProviderStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface PCloudProviderStatusResultMessage {
  readonly type: typeof MessageType.PCloudProviderStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudProviderStatus;
}

export interface ConnectPCloudProviderMessage {
  readonly type: typeof MessageType.ConnectPCloudProvider;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ConnectPCloudProviderResultMessage {
  readonly type: typeof MessageType.ConnectPCloudProviderResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudProviderResult;
}

export interface DisconnectPCloudProviderMessage {
  readonly type: typeof MessageType.DisconnectPCloudProvider;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface DisconnectPCloudProviderResultMessage {
  readonly type: typeof MessageType.DisconnectPCloudProviderResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudProviderResult;
}

export interface UploadPCloudBackupMessage {
  readonly type: typeof MessageType.UploadPCloudBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudBackupUploadInput;
}

export interface UploadPCloudBackupResultMessage {
  readonly type: typeof MessageType.UploadPCloudBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudBackupUploadResult;
}

export interface ListPCloudBackupsMessage {
  readonly type: typeof MessageType.ListPCloudBackups;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ListPCloudBackupsResultMessage {
  readonly type: typeof MessageType.ListPCloudBackupsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudBackupListResult;
}

export interface DownloadPCloudBackupMessage {
  readonly type: typeof MessageType.DownloadPCloudBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudBackupDownloadInput;
}

export interface DownloadPCloudBackupResultMessage {
  readonly type: typeof MessageType.DownloadPCloudBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../core/cloud/pcloud-provider.js').PCloudBackupDownloadResult;
}

export interface ListUrlTemplatesMessage {
  readonly type: typeof MessageType.ListUrlTemplates;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface ListUrlTemplatesResultMessage {
  readonly type: typeof MessageType.ListUrlTemplatesResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly templates: readonly import('../core/url/templates.js').UrlTemplateRecord[] }
    | { readonly ok: false; readonly message: string };
}

export interface SaveUrlTemplateMessage {
  readonly type: typeof MessageType.SaveUrlTemplate;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly template: import('../core/url/templates.js').UrlTemplateRecord };
}

export interface SaveUrlTemplateResultMessage {
  readonly type: typeof MessageType.SaveUrlTemplateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface DeleteUrlTemplateMessage {
  readonly type: typeof MessageType.DeleteUrlTemplate;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly id: string };
}

export interface DeleteUrlTemplateResultMessage {
  readonly type: typeof MessageType.DeleteUrlTemplateResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface ListGrabSourcePatternsMessage {
  readonly type: typeof MessageType.ListGrabSourcePatterns;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string };
}

export interface ListGrabSourcePatternsResultMessage {
  readonly type: typeof MessageType.ListGrabSourcePatternsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly patterns: readonly import('../core/url/templates.js').GrabSourcePattern[] }
    | { readonly ok: false; readonly message: string };
}

export interface SaveGrabSourcePatternMessage {
  readonly type: typeof MessageType.SaveGrabSourcePattern;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly pattern: import('../core/url/templates.js').GrabSourcePattern };
}

export interface SaveGrabSourcePatternResultMessage {
  readonly type: typeof MessageType.SaveGrabSourcePatternResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface DeleteGrabSourcePatternMessage {
  readonly type: typeof MessageType.DeleteGrabSourcePattern;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly hostname: string; readonly id: string };
}

export interface DeleteGrabSourcePatternResultMessage {
  readonly type: typeof MessageType.DeleteGrabSourcePatternResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export type ExtensionRequest =
  | TogglePanelMessage
  | ToggleBuildIdentityOverlayMessage
  | PingMessage
  | LoadBuildIdentityMessage
  | DestinationRequest
  | AlbumRequest
  | CaptureImageMessage
  | DownloadImageMessage
  | ExportEncryptedImageMessage
  | ImportEncryptedImageMessage
  | StorageUsageRequestMessage
  | DeleteBlobMessage
  | CleanupOrphanedBlobsMessage
  | RetrieveBlobMessage
  | OriginalBlobRequest
  | CreateBlobPreviewMessage
  | CreateDataUrlPreviewMessage
  | FetchThumbnailSourceMessage
  | ProbeImageSourceMessage
  | FetchBufferedImageSourceMessage
  | CheckImageRequestPolicyMessage
  | FetchLinkedPageMessage
  | GrantPermissionAndCaptureMessage
  | BlobKeyRequest
  | LoadBookmarksMessage
  | LoadBookmarksByIdsMessage
  | FindBookmarkByUrlMessage
  | SaveBookmarkMessage
  | RemoveBookmarkMessage
  | RemoveBookmarksMessage
  | RemoveRecallBookmarksMessage
  | RecentHistoryRequest
  | LoadRecallCandidatesMessage
  | RecallRecordsMessage
  | LoadPanelPositionMessage
  | SavePanelPositionMessage
  | DeletePanelPositionMessage
  | LoadWorkspaceLayoutMessage
  | SaveWorkspaceLayoutMessage
  | DeleteWorkspaceLayoutMessage
  | LoadParsedFieldStateMessage
  | LoadParsedFieldStateBySourceMessage
  | SaveParsedFieldStateMessage
  | ListUrlReviewStatusMessage
  | SaveUrlReviewStatusMessage
  | ImportUrlReviewStatusMessage
  | ClearUrlReviewStatusMessage
  | LoadLocalSettingsMessage
  | SaveLocalSettingsMessage
  | PCloudProviderStatusMessage
  | ConnectPCloudProviderMessage
  | DisconnectPCloudProviderMessage
  | UploadPCloudBackupMessage
  | ListPCloudBackupsMessage
  | DownloadPCloudBackupMessage
  | import('./interop-runtime-messages.js').InteropRuntimeMessage
  | ListUrlTemplatesMessage
  | SaveUrlTemplateMessage
  | DeleteUrlTemplateMessage
  | ListGrabSourcePatternsMessage
  | SaveGrabSourcePatternMessage
  | DeleteGrabSourcePatternMessage;
export type ExtensionResponse =
  | StatusMessage
  | UnknownMessageResponse
  | LoadBuildIdentityResultMessage
  | DestinationResponse
  | AlbumResponse
  | CaptureResultMessage
  | DownloadImageResultMessage
  | ExportEncryptedImageResultMessage
  | ImportEncryptedImageResultMessage
  | StorageUsageResponseMessage
  | DeleteBlobResultMessage
  | CleanupOrphanedBlobsResultMessage
  | RetrieveBlobResultMessage
  | OriginalBlobResponse
  | CreateBlobPreviewResultMessage
  | FetchThumbnailSourceResultMessage
  | ProbeImageSourceResultMessage
  | FetchBufferedImageSourceResultMessage
  | CheckImageRequestPolicyResultMessage
  | FetchLinkedPageResultMessage
  | BlobKeyResponse
  | LoadBookmarksResultMessage
  | LoadBookmarksByIdsResultMessage
  | FindBookmarkByUrlResultMessage
  | SaveBookmarkResultMessage
  | RemoveBookmarkResultMessage
  | RemoveBookmarksResultMessage
  | RemoveRecallBookmarksResultMessage
  | RecentHistoryResponse
  | LoadRecallCandidatesResultMessage
  | RecallRecordsResultMessage
  | LoadPanelPositionResultMessage
  | SavePanelPositionResultMessage
  | DeletePanelPositionResultMessage
  | LoadWorkspaceLayoutResultMessage
  | SaveWorkspaceLayoutResultMessage
  | DeleteWorkspaceLayoutResultMessage
  | LoadParsedFieldStateResultMessage
  | LoadParsedFieldStateBySourceResultMessage
  | SaveParsedFieldStateResultMessage
  | ListUrlReviewStatusResultMessage
  | SaveUrlReviewStatusResultMessage
  | ImportUrlReviewStatusResultMessage
  | ClearUrlReviewStatusResultMessage
  | LoadLocalSettingsResultMessage
  | SaveLocalSettingsResultMessage
  | PCloudProviderStatusResultMessage
  | ConnectPCloudProviderResultMessage
  | DisconnectPCloudProviderResultMessage
  | UploadPCloudBackupResultMessage
  | ListPCloudBackupsResultMessage
  | DownloadPCloudBackupResultMessage
  | import('./interop-runtime-messages.js').InteropRuntimeResultMessage
  | ListUrlTemplatesResultMessage
  | SaveUrlTemplateResultMessage
  | DeleteUrlTemplateResultMessage
  | ListGrabSourcePatternsResultMessage
  | SaveGrabSourcePatternResultMessage
  | DeleteGrabSourcePatternResultMessage;

export function createTogglePanelMessage(): TogglePanelMessage {
  return { type: MessageType.TogglePanel, version: MESSAGE_PROTOCOL_VERSION, payload: { source: 'browserAction' } };
}

export function createToggleBuildIdentityOverlayMessage(): ToggleBuildIdentityOverlayMessage {
  return { type: MessageType.ToggleBuildIdentityOverlay, version: MESSAGE_PROTOCOL_VERSION, payload: { source: 'browserCommand' } };
}

export function createPingMessage(): PingMessage {
  return { type: MessageType.Ping, version: MESSAGE_PROTOCOL_VERSION, payload: { sentAt: Date.now() } };
}

export function createLoadBuildIdentityMessage(): LoadBuildIdentityMessage {
  return { type: MessageType.LoadBuildIdentity, version: MESSAGE_PROTOCOL_VERSION, payload: { requestedAt: Date.now() } };
}

export function createLoadBuildIdentityResultMessage(payload: LoadBuildIdentityResultMessage['payload']): LoadBuildIdentityResultMessage {
  return { type: MessageType.LoadBuildIdentityResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createStatusMessage(panelVisible: boolean, status: string): StatusMessage {
  return { type: MessageType.Status, version: MESSAGE_PROTOCOL_VERSION, payload: { panelVisible, status } };
}

export function createUnknownMessageResponse(reason: string): UnknownMessageResponse {
  return { type: MessageType.Unknown, version: MESSAGE_PROTOCOL_VERSION, payload: { reason } };
}

export function createCaptureImageMessage(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): CaptureImageMessage {
  return { type: MessageType.CaptureImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, sourceType, sourceRecordId } };
}

export function createCaptureResultMessage(result: import('../core/image/capture-result.js').CaptureResult): CaptureResultMessage {
  return { type: MessageType.CaptureResult, version: MESSAGE_PROTOCOL_VERSION, payload: result };
}

export function createDownloadImageMessage(url: string, fileName: string, saveAs: boolean): DownloadImageMessage {
  return { type: MessageType.DownloadImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, fileName, saveAs } };
}

export function createDownloadImageResultMessage(payload: DownloadImageResultMessage['payload']): DownloadImageResultMessage {
  return { type: MessageType.DownloadImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createExportEncryptedImageMessage(url: string, fileName: string, blobId?: string): ExportEncryptedImageMessage {
  return { type: MessageType.ExportEncryptedImage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, fileName, blobId } };
}

export function createExportEncryptedImageResultMessage(
  payload: ExportEncryptedImageResultMessage['payload'],
): ExportEncryptedImageResultMessage {
  return { type: MessageType.ExportEncryptedImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportEncryptedImageMessage(fileContent: string): ImportEncryptedImageMessage {
  return { type: MessageType.ImportEncryptedImage, version: MESSAGE_PROTOCOL_VERSION, payload: { fileContent } };
}

export function createImportEncryptedImageResultMessage(
  payload: ImportEncryptedImageResultMessage['payload'],
): ImportEncryptedImageResultMessage {
  return { type: MessageType.ImportEncryptedImageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createStorageUsageRequestMessage(): StorageUsageRequestMessage {
  return { type: MessageType.StorageUsageRequest, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createStorageUsageResponseMessage(
  usage: import('../core/image/capture-result.js').StorageUsageSummary,
): StorageUsageResponseMessage {
  return { type: MessageType.StorageUsageResponse, version: MESSAGE_PROTOCOL_VERSION, payload: usage };
}

export function createDeleteBlobMessage(blobId: string): DeleteBlobMessage {
  return { type: MessageType.DeleteBlob, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCleanupOrphanedBlobsMessage(): CleanupOrphanedBlobsMessage {
  return { type: MessageType.CleanupOrphanedBlobs, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createRetrieveBlobMessage(blobId: string): RetrieveBlobMessage {
  return { type: MessageType.RetrieveBlob, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCreateBlobPreviewMessage(blobId: string): CreateBlobPreviewMessage {
  return { type: MessageType.CreateBlobPreview, version: MESSAGE_PROTOCOL_VERSION, payload: { blobId } };
}

export function createCreateDataUrlPreviewMessage(dataUrl: string): CreateDataUrlPreviewMessage {
  return { type: MessageType.CreateDataUrlPreview, version: MESSAGE_PROTOCOL_VERSION, payload: { dataUrl } };
}

export function createFetchThumbnailSourceMessage(
  url: string,
  referrer?: string,
  options: {
    readonly intent?: ImageRequestIntent | undefined;
    readonly contextKey?: string | undefined;
    readonly sourceProfile?: ImageSourceProfile | undefined;
  } = {},
): FetchThumbnailSourceMessage {
  return { type: MessageType.FetchThumbnailSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, ...options } };
}

export function createProbeImageSourceMessage(
  url: string,
  referrer: string | undefined,
  timeoutMs: number,
  options: { readonly contextKey?: string; readonly probeMethod?: ImageProbeMethod } = {},
): ProbeImageSourceMessage {
  return { type: MessageType.ProbeImageSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, timeoutMs, ...options } };
}

export function createFetchBufferedImageSourceMessage(
  url: string,
  referrer?: string,
  options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string } = {},
): FetchBufferedImageSourceMessage {
  return { type: MessageType.FetchBufferedImageSource, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, ...options } };
}

export function createCheckImageRequestPolicyMessage(
  url: string,
  referrer?: string,
  options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string } = {},
): CheckImageRequestPolicyMessage {
  return { type: MessageType.CheckImageRequestPolicy, version: MESSAGE_PROTOCOL_VERSION, payload: { url, referrer, ...options } };
}

export function createFetchLinkedPageMessage(url: string, maxBytes: number, timeoutMs: number): FetchLinkedPageMessage {
  return { type: MessageType.FetchLinkedPage, version: MESSAGE_PROTOCOL_VERSION, payload: { url, maxBytes, timeoutMs } };
}

export function createRetrieveBlobResultMessage(payload: RetrieveBlobResultMessage['payload']): RetrieveBlobResultMessage {
  return { type: MessageType.RetrieveBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createCreateBlobPreviewResultMessage(payload: CreateBlobPreviewResultMessage['payload']): CreateBlobPreviewResultMessage {
  return { type: MessageType.CreateBlobPreviewResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFetchThumbnailSourceResultMessage(
  payload: FetchThumbnailSourceResultMessage['payload'],
): FetchThumbnailSourceResultMessage {
  return { type: MessageType.FetchThumbnailSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createProbeImageSourceResultMessage(payload: ProbeImageSourceResultMessage['payload']): ProbeImageSourceResultMessage {
  return { type: MessageType.ProbeImageSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFetchBufferedImageSourceResultMessage(
  payload: FetchBufferedImageSourceResultMessage['payload'],
): FetchBufferedImageSourceResultMessage {
  return { type: MessageType.FetchBufferedImageSourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createCheckImageRequestPolicyResultMessage(
  payload: CheckImageRequestPolicyResultMessage['payload'],
): CheckImageRequestPolicyResultMessage {
  return { type: MessageType.CheckImageRequestPolicyResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFetchLinkedPageResultMessage(payload: FetchLinkedPageResultMessage['payload']): FetchLinkedPageResultMessage {
  return { type: MessageType.FetchLinkedPageResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createGrantPermissionAndCaptureMessage(
  url: string,
  sourceType: CaptureSourceType,
  sourceRecordId?: string,
): GrantPermissionAndCaptureMessage {
  return { type: MessageType.GrantPermissionAndCapture, version: MESSAGE_PROTOCOL_VERSION, payload: { url, sourceType, sourceRecordId } };
}

export function createDeleteBlobResultMessage(
  deleted: boolean,
  usage: import('../core/image/capture-result.js').StorageUsageSummary,
): DeleteBlobResultMessage {
  return { type: MessageType.DeleteBlobResult, version: MESSAGE_PROTOCOL_VERSION, payload: { deleted, usage } };
}

export function createCleanupOrphanedBlobsResultMessage(
  payload: CleanupOrphanedBlobsResultMessage['payload'],
): CleanupOrphanedBlobsResultMessage {
  return { type: MessageType.CleanupOrphanedBlobsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksMessage(payload: LoadBookmarksMessage['payload']): LoadBookmarksMessage {
  return { type: MessageType.LoadBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksResultMessage(payload: LoadBookmarksResultMessage['payload']): LoadBookmarksResultMessage {
  return { type: MessageType.LoadBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadBookmarksByIdsMessage(ids: readonly string[]): LoadBookmarksByIdsMessage {
  return { type: MessageType.LoadBookmarksByIds, version: MESSAGE_PROTOCOL_VERSION, payload: { ids } };
}

export function createLoadBookmarksByIdsResultMessage(
  payload: LoadBookmarksByIdsResultMessage['payload'],
): LoadBookmarksByIdsResultMessage {
  return { type: MessageType.LoadBookmarksByIdsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createFindBookmarkByUrlMessage(url: string): FindBookmarkByUrlMessage {
  return { type: MessageType.FindBookmarkByUrl, version: MESSAGE_PROTOCOL_VERSION, payload: { url } };
}

export function createFindBookmarkByUrlResultMessage(payload: FindBookmarkByUrlResultMessage['payload']): FindBookmarkByUrlResultMessage {
  return { type: MessageType.FindBookmarkByUrlResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveBookmarkMessage(record: ImageDisplayRecord, options?: BookmarkSaveOptions): SaveBookmarkMessage {
  return { type: MessageType.SaveBookmark, version: MESSAGE_PROTOCOL_VERSION, payload: { record, options } };
}

export function createSaveBookmarkResultMessage(payload: SaveBookmarkResultMessage['payload']): SaveBookmarkResultMessage {
  return { type: MessageType.SaveBookmarkResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveBookmarkMessage(record: ImageDisplayRecord): RemoveBookmarkMessage {
  return { type: MessageType.RemoveBookmark, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createRemoveBookmarkResultMessage(payload: RemoveBookmarkResultMessage['payload']): RemoveBookmarkResultMessage {
  return { type: MessageType.RemoveBookmarkResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveBookmarksMessage(ids: readonly string[]): RemoveBookmarksMessage {
  return { type: MessageType.RemoveBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload: { ids } };
}

export function createRemoveBookmarksResultMessage(payload: RemoveBookmarksResultMessage['payload']): RemoveBookmarksResultMessage {
  return { type: MessageType.RemoveBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveRecallBookmarksMessage(payload: RemoveRecallBookmarksMessage['payload']): RemoveRecallBookmarksMessage {
  return { type: MessageType.RemoveRecallBookmarks, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveRecallBookmarksResultMessage(
  payload: RemoveRecallBookmarksResultMessage['payload'],
): RemoveRecallBookmarksResultMessage {
  return { type: MessageType.RemoveRecallBookmarksResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadRecallCandidatesMessage(input: {
  readonly offset: number;
  readonly limit: number;
  readonly scope?: 'global' | 'site' | undefined;
  readonly currentPageUrl?: string | undefined;
}): LoadRecallCandidatesMessage {
  return { type: MessageType.LoadRecallCandidates, version: MESSAGE_PROTOCOL_VERSION, payload: input };
}

export function createLoadRecallCandidatesResultMessage(
  payload: LoadRecallCandidatesResultMessage['payload'],
): LoadRecallCandidatesResultMessage {
  return { type: MessageType.LoadRecallCandidatesResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRecallRecordsMessage(ids: readonly string[]): RecallRecordsMessage {
  return { type: MessageType.RecallRecords, version: MESSAGE_PROTOCOL_VERSION, payload: { ids } };
}

export function createRecallRecordsResultMessage(payload: RecallRecordsResultMessage['payload']): RecallRecordsResultMessage {
  return { type: MessageType.RecallRecordsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadParsedFieldStateMessage(hostname: string, pageUrl: string): LoadParsedFieldStateMessage {
  return { type: MessageType.LoadParsedFieldState, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, pageUrl } };
}

export function createLoadParsedFieldStateResultMessage(
  payload: LoadParsedFieldStateResultMessage['payload'],
): LoadParsedFieldStateResultMessage {
  return { type: MessageType.LoadParsedFieldStateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadParsedFieldStateBySourceMessage(hostname: string, sourceUrl: string): LoadParsedFieldStateBySourceMessage {
  return { type: MessageType.LoadParsedFieldStateBySource, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, sourceUrl } };
}

export function createLoadParsedFieldStateBySourceResultMessage(
  payload: LoadParsedFieldStateBySourceResultMessage['payload'],
): LoadParsedFieldStateBySourceResultMessage {
  return { type: MessageType.LoadParsedFieldStateBySourceResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveParsedFieldStateMessage(record: import('../core/types.js').ParsedFieldStateRecord): SaveParsedFieldStateMessage {
  return { type: MessageType.SaveParsedFieldState, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createSaveParsedFieldStateResultMessage(
  payload: SaveParsedFieldStateResultMessage['payload'],
): SaveParsedFieldStateResultMessage {
  return { type: MessageType.SaveParsedFieldStateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListUrlReviewStatusMessage(hostname: string): ListUrlReviewStatusMessage {
  return { type: MessageType.ListUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createListUrlReviewStatusResultMessage(
  payload: ListUrlReviewStatusResultMessage['payload'],
): ListUrlReviewStatusResultMessage {
  return { type: MessageType.ListUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveUrlReviewStatusMessage(record: import('../core/types.js').UrlReviewStatusRecord): SaveUrlReviewStatusMessage {
  return { type: MessageType.SaveUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { record } };
}

export function createSaveUrlReviewStatusResultMessage(
  payload: SaveUrlReviewStatusResultMessage['payload'],
): SaveUrlReviewStatusResultMessage {
  return { type: MessageType.SaveUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportUrlReviewStatusMessage(
  records: readonly import('../core/types.js').UrlReviewStatusRecord[],
): ImportUrlReviewStatusMessage {
  return { type: MessageType.ImportUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { records } };
}

export function createImportUrlReviewStatusResultMessage(
  payload: ImportUrlReviewStatusResultMessage['payload'],
): ImportUrlReviewStatusResultMessage {
  return { type: MessageType.ImportUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createClearUrlReviewStatusMessage(
  filter: import('../core/types.js').UrlReviewStatusClearFilter,
): ClearUrlReviewStatusMessage {
  return { type: MessageType.ClearUrlReviewStatus, version: MESSAGE_PROTOCOL_VERSION, payload: { filter } };
}

export function createClearUrlReviewStatusResultMessage(
  payload: ClearUrlReviewStatusResultMessage['payload'],
): ClearUrlReviewStatusResultMessage {
  return { type: MessageType.ClearUrlReviewStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createLoadLocalSettingsMessage(): LoadLocalSettingsMessage {
  return { type: MessageType.LoadLocalSettings, version: MESSAGE_PROTOCOL_VERSION, payload: { requestedAt: Date.now() } };
}

export function createLoadLocalSettingsResultMessage(payload: LoadLocalSettingsResultMessage['payload']): LoadLocalSettingsResultMessage {
  return { type: MessageType.LoadLocalSettingsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveLocalSettingsMessage(settings: SaveLocalSettingsPayloadSettings): SaveLocalSettingsMessage {
  return { type: MessageType.SaveLocalSettings, version: MESSAGE_PROTOCOL_VERSION, payload: { settings } };
}

export function createSaveLocalSettingsResultMessage(payload: SaveLocalSettingsResultMessage['payload']): SaveLocalSettingsResultMessage {
  return { type: MessageType.SaveLocalSettingsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createPCloudProviderStatusMessage(): PCloudProviderStatusMessage {
  return { type: MessageType.PCloudProviderStatus, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createPCloudProviderStatusResultMessage(
  payload: PCloudProviderStatusResultMessage['payload'],
): PCloudProviderStatusResultMessage {
  return { type: MessageType.PCloudProviderStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createConnectPCloudProviderMessage(): ConnectPCloudProviderMessage {
  return { type: MessageType.ConnectPCloudProvider, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createConnectPCloudProviderResultMessage(
  payload: ConnectPCloudProviderResultMessage['payload'],
): ConnectPCloudProviderResultMessage {
  return { type: MessageType.ConnectPCloudProviderResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDisconnectPCloudProviderMessage(): DisconnectPCloudProviderMessage {
  return { type: MessageType.DisconnectPCloudProvider, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createDisconnectPCloudProviderResultMessage(
  payload: DisconnectPCloudProviderResultMessage['payload'],
): DisconnectPCloudProviderResultMessage {
  return { type: MessageType.DisconnectPCloudProviderResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createUploadPCloudBackupMessage(payload: UploadPCloudBackupMessage['payload']): UploadPCloudBackupMessage {
  return { type: MessageType.UploadPCloudBackup, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createUploadPCloudBackupResultMessage(
  payload: UploadPCloudBackupResultMessage['payload'],
): UploadPCloudBackupResultMessage {
  return { type: MessageType.UploadPCloudBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListPCloudBackupsMessage(): ListPCloudBackupsMessage {
  return { type: MessageType.ListPCloudBackups, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createListPCloudBackupsResultMessage(payload: ListPCloudBackupsResultMessage['payload']): ListPCloudBackupsResultMessage {
  return { type: MessageType.ListPCloudBackupsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDownloadPCloudBackupMessage(payload: DownloadPCloudBackupMessage['payload']): DownloadPCloudBackupMessage {
  return { type: MessageType.DownloadPCloudBackup, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDownloadPCloudBackupResultMessage(
  payload: DownloadPCloudBackupResultMessage['payload'],
): DownloadPCloudBackupResultMessage {
  return { type: MessageType.DownloadPCloudBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListUrlTemplatesMessage(hostname: string): ListUrlTemplatesMessage {
  return { type: MessageType.ListUrlTemplates, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createListUrlTemplatesResultMessage(payload: ListUrlTemplatesResultMessage['payload']): ListUrlTemplatesResultMessage {
  return { type: MessageType.ListUrlTemplatesResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveUrlTemplateMessage(template: import('../core/url/templates.js').UrlTemplateRecord): SaveUrlTemplateMessage {
  return { type: MessageType.SaveUrlTemplate, version: MESSAGE_PROTOCOL_VERSION, payload: { template } };
}

export function createSaveUrlTemplateResultMessage(payload: SaveUrlTemplateResultMessage['payload']): SaveUrlTemplateResultMessage {
  return { type: MessageType.SaveUrlTemplateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteUrlTemplateMessage(hostname: string, id: string): DeleteUrlTemplateMessage {
  return { type: MessageType.DeleteUrlTemplate, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, id } };
}

export function createDeleteUrlTemplateResultMessage(payload: DeleteUrlTemplateResultMessage['payload']): DeleteUrlTemplateResultMessage {
  return { type: MessageType.DeleteUrlTemplateResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListGrabSourcePatternsMessage(hostname: string): ListGrabSourcePatternsMessage {
  return { type: MessageType.ListGrabSourcePatterns, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname } };
}

export function createListGrabSourcePatternsResultMessage(
  payload: ListGrabSourcePatternsResultMessage['payload'],
): ListGrabSourcePatternsResultMessage {
  return { type: MessageType.ListGrabSourcePatternsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSaveGrabSourcePatternMessage(
  pattern: import('../core/url/templates.js').GrabSourcePattern,
): SaveGrabSourcePatternMessage {
  return { type: MessageType.SaveGrabSourcePattern, version: MESSAGE_PROTOCOL_VERSION, payload: { pattern } };
}

export function createSaveGrabSourcePatternResultMessage(
  payload: SaveGrabSourcePatternResultMessage['payload'],
): SaveGrabSourcePatternResultMessage {
  return { type: MessageType.SaveGrabSourcePatternResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteGrabSourcePatternMessage(hostname: string, id: string): DeleteGrabSourcePatternMessage {
  return { type: MessageType.DeleteGrabSourcePattern, version: MESSAGE_PROTOCOL_VERSION, payload: { hostname, id } };
}

export function createDeleteGrabSourcePatternResultMessage(
  payload: DeleteGrabSourcePatternResultMessage['payload'],
): DeleteGrabSourcePatternResultMessage {
  return { type: MessageType.DeleteGrabSourcePatternResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!hasVersionedObjectShape(value)) return false;
  return MESSAGE_DIRECTION[value.type as ProtocolMessageType] === 'request';
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (!hasVersionedObjectShape(value)) return false;
  return MESSAGE_DIRECTION[value.type as ProtocolMessageType] === 'response';
}

export function isBlobKeyResultMessage(value: unknown): value is BlobKeyResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.BlobKeyResult;
}

export function isExportBlobKeyBackupResultMessage(value: unknown): value is ExportBlobKeyBackupResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ExportBlobKeyBackupResult;
}

export function isImportBlobKeyBackupResultMessage(value: unknown): value is ImportBlobKeyBackupResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ImportBlobKeyBackupResult;
}

export function isBlobKeyStatusResultMessage(value: unknown): value is BlobKeyStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.BlobKeyStatusResult;
}

export function isRetrieveBlobResultMessage(value: unknown): value is RetrieveBlobResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RetrieveBlobResult;
}

export function isCleanupOrphanedBlobsResultMessage(value: unknown): value is CleanupOrphanedBlobsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CleanupOrphanedBlobsResult;
}

export function isDeleteBlobResultMessage(value: unknown): value is DeleteBlobResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  if (value.type !== MessageType.DeleteBlobResult) return false;
  return v.is(deleteBlobResultPayloadSchema, value.payload);
}

export function isStorageUsageResponseMessage(value: unknown): value is StorageUsageResponseMessage {
  if (!hasVersionedObjectShape(value)) return false;
  if (value.type !== MessageType.StorageUsageResponse) return false;
  return v.is(storageUsageSummarySchema, value.payload);
}

export function isCreateBlobPreviewResultMessage(value: unknown): value is CreateBlobPreviewResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CreateBlobPreviewResult;
}

export function isFetchThumbnailSourceResultMessage(value: unknown): value is FetchThumbnailSourceResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.FetchThumbnailSourceResult;
}

export function isProbeImageSourceResultMessage(value: unknown): value is ProbeImageSourceResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ProbeImageSourceResult;
}

export function isFetchBufferedImageSourceResultMessage(value: unknown): value is FetchBufferedImageSourceResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.FetchBufferedImageSourceResult;
}

export function isCheckImageRequestPolicyResultMessage(value: unknown): value is CheckImageRequestPolicyResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CheckImageRequestPolicyResult;
}

export function isFetchLinkedPageResultMessage(value: unknown): value is FetchLinkedPageResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.FetchLinkedPageResult;
}

export function isCaptureResultMessage(value: unknown): value is CaptureResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.CaptureResult;
}

export function isDownloadImageResultMessage(value: unknown): value is DownloadImageResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DownloadImageResult;
}

export function isExportEncryptedImageResultMessage(value: unknown): value is ExportEncryptedImageResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ExportEncryptedImageResult;
}

export function isImportEncryptedImageResultMessage(value: unknown): value is ImportEncryptedImageResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ImportEncryptedImageResult;
}

export function isLoadBookmarksResultMessage(value: unknown): value is LoadBookmarksResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadBookmarksResult;
}

export function isLoadBookmarksByIdsResultMessage(value: unknown): value is LoadBookmarksByIdsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadBookmarksByIdsResult;
}

export function isFindBookmarkByUrlResultMessage(value: unknown): value is FindBookmarkByUrlResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.FindBookmarkByUrlResult;
}

export function isSaveBookmarkResultMessage(value: unknown): value is SaveBookmarkResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveBookmarkResult;
}

export function isRemoveBookmarkResultMessage(value: unknown): value is RemoveBookmarkResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RemoveBookmarkResult;
}

export function isRemoveBookmarksResultMessage(value: unknown): value is RemoveBookmarksResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RemoveBookmarksResult;
}

export function isRemoveRecallBookmarksResultMessage(value: unknown): value is RemoveRecallBookmarksResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RemoveRecallBookmarksResult;
}

export function isLoadRecallCandidatesResultMessage(value: unknown): value is LoadRecallCandidatesResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadRecallCandidatesResult;
}

export function isRecallRecordsResultMessage(value: unknown): value is RecallRecordsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.RecallRecordsResult;
}

export function isLoadParsedFieldStateResultMessage(value: unknown): value is LoadParsedFieldStateResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadParsedFieldStateResult;
}

export function isLoadParsedFieldStateBySourceResultMessage(value: unknown): value is LoadParsedFieldStateBySourceResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadParsedFieldStateBySourceResult;
}

export function isSaveParsedFieldStateResultMessage(value: unknown): value is SaveParsedFieldStateResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveParsedFieldStateResult;
}

export function isListUrlReviewStatusResultMessage(value: unknown): value is ListUrlReviewStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ListUrlReviewStatusResult;
}

export function isSaveUrlReviewStatusResultMessage(value: unknown): value is SaveUrlReviewStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveUrlReviewStatusResult;
}

export function isImportUrlReviewStatusResultMessage(value: unknown): value is ImportUrlReviewStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ImportUrlReviewStatusResult;
}

export function isClearUrlReviewStatusResultMessage(value: unknown): value is ClearUrlReviewStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ClearUrlReviewStatusResult;
}

export function isLoadLocalSettingsResultMessage(value: unknown): value is LoadLocalSettingsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.LoadLocalSettingsResult;
}

export function isSaveLocalSettingsResultMessage(value: unknown): value is SaveLocalSettingsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveLocalSettingsResult;
}

export function isPCloudProviderStatusResultMessage(value: unknown): value is PCloudProviderStatusResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.PCloudProviderStatusResult;
}

export function isConnectPCloudProviderResultMessage(value: unknown): value is ConnectPCloudProviderResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ConnectPCloudProviderResult;
}

export function isDisconnectPCloudProviderResultMessage(value: unknown): value is DisconnectPCloudProviderResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DisconnectPCloudProviderResult;
}

export function isUploadPCloudBackupResultMessage(value: unknown): value is UploadPCloudBackupResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.UploadPCloudBackupResult;
}

export function isListPCloudBackupsResultMessage(value: unknown): value is ListPCloudBackupsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ListPCloudBackupsResult;
}

export function isDownloadPCloudBackupResultMessage(value: unknown): value is DownloadPCloudBackupResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DownloadPCloudBackupResult;
}

export function isListUrlTemplatesResultMessage(value: unknown): value is ListUrlTemplatesResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ListUrlTemplatesResult;
}

export function isSaveUrlTemplateResultMessage(value: unknown): value is SaveUrlTemplateResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveUrlTemplateResult;
}

export function isDeleteUrlTemplateResultMessage(value: unknown): value is DeleteUrlTemplateResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DeleteUrlTemplateResult;
}

export function isListGrabSourcePatternsResultMessage(value: unknown): value is ListGrabSourcePatternsResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.ListGrabSourcePatternsResult;
}

export function isSaveGrabSourcePatternResultMessage(value: unknown): value is SaveGrabSourcePatternResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.SaveGrabSourcePatternResult;
}

export function isDeleteGrabSourcePatternResultMessage(value: unknown): value is DeleteGrabSourcePatternResultMessage {
  if (!hasVersionedObjectShape(value)) return false;
  return value.type === MessageType.DeleteGrabSourcePatternResult;
}

export function isStatusMessage(value: unknown): value is StatusMessage {
  if (!isExtensionResponse(value) || value.type !== MessageType.Status) return false;
  const payload = value.payload as { panelVisible?: unknown; status?: unknown };
  return typeof payload.panelVisible === 'boolean' && typeof payload.status === 'string';
}

export function isLoadBuildIdentityResultMessage(value: unknown): value is LoadBuildIdentityResultMessage {
  if (!isExtensionResponse(value) || value.type !== MessageType.LoadBuildIdentityResult) return false;
  const payload = value.payload as { ok?: unknown; identity?: unknown; message?: unknown };
  if (payload.ok === true) return isBuildIdentity(payload.identity);
  if (payload.ok === false) return payload.identity === null && typeof payload.message === 'string';
  return false;
}
