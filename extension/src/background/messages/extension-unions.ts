import type { AlbumRequest, AlbumResponse } from '../album-messages.js';
import type { BlobKeyRequest, BlobKeyResponse } from '../blob-key-messages.js';
import type { DestinationRequest, DestinationResponse } from '../destination-messages.js';
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
} from '../layout-messages.js';
import type { OriginalBlobRequest, OriginalBlobResponse } from '../original-blob-messages.js';
import type { RecentHistoryRequest, RecentHistoryResponse } from '../recent-history-messages.js';
import type { TogglePanelMessage, PingMessage, StatusMessage, UnknownMessageResponse } from './common.js';
import type {
  ToggleBuildIdentityOverlayMessage,
  LoadBuildIdentityMessage,
  LoadBuildIdentityResultMessage,
  LoadParsedFieldStateMessage,
  LoadParsedFieldStateResultMessage,
  LoadParsedFieldStateBySourceMessage,
  LoadParsedFieldStateBySourceResultMessage,
  SaveParsedFieldStateMessage,
  SaveParsedFieldStateResultMessage,
  LoadLocalSettingsMessage,
  LoadLocalSettingsResultMessage,
  SaveLocalSettingsMessage,
  SaveLocalSettingsResultMessage,
} from './panel-messages.js';
import type {
  CaptureImageMessage,
  CaptureResultMessage,
  DownloadImageMessage,
  DownloadImageResultMessage,
  ExportEncryptedImageMessage,
  ExportEncryptedImageResultMessage,
  ImportEncryptedImageMessage,
  ImportEncryptedImageResultMessage,
  StorageUsageRequestMessage,
  StorageUsageResponseMessage,
  DeleteBlobMessage,
  DeleteBlobResultMessage,
  CleanupOrphanedBlobsMessage,
  CleanupOrphanedBlobsResultMessage,
  RetrieveBlobMessage,
  RetrieveBlobResultMessage,
  CreateBlobPreviewMessage,
  CreateDataUrlPreviewMessage,
  CreateBlobPreviewResultMessage,
  GrantPermissionAndCaptureMessage,
} from './blob-messages.js';
import type {
  FetchThumbnailSourceMessage,
  FetchThumbnailSourceResultMessage,
  ProbeImageSourceMessage,
  ProbeImageSourceResultMessage,
  FetchBufferedImageSourceMessage,
  FetchBufferedImageSourceResultMessage,
  CheckImageRequestPolicyMessage,
  CheckImageRequestPolicyResultMessage,
  FetchLinkedPageMessage,
  FetchLinkedPageResultMessage,
} from './image-fetch-messages.js';
import type {
  LoadBookmarksMessage,
  LoadBookmarksResultMessage,
  LoadBookmarksByIdsMessage,
  LoadBookmarksByIdsResultMessage,
  FindBookmarkByUrlMessage,
  FindBookmarkByUrlResultMessage,
  SaveBookmarkMessage,
  SaveBookmarkResultMessage,
  RemoveBookmarkMessage,
  RemoveBookmarkResultMessage,
  RemoveBookmarksMessage,
  RemoveBookmarksResultMessage,
  RemoveRecallBookmarksMessage,
  RemoveRecallBookmarksResultMessage,
} from './bookmark-messages.js';
import type {
  LoadRecallCandidatesMessage,
  LoadRecallCandidatesResultMessage,
  RecallRecordsMessage,
  RecallRecordsResultMessage,
} from './recall-messages.js';
import type {
  PCloudProviderStatusMessage,
  PCloudProviderStatusResultMessage,
  ConnectPCloudProviderMessage,
  ConnectPCloudProviderResultMessage,
  DisconnectPCloudProviderMessage,
  DisconnectPCloudProviderResultMessage,
  UploadPCloudBackupMessage,
  UploadPCloudBackupResultMessage,
  ListPCloudBackupsMessage,
  ListPCloudBackupsResultMessage,
  DownloadPCloudBackupMessage,
  DownloadPCloudBackupResultMessage,
} from './pcloud-messages.js';
import type {
  ListUrlReviewStatusMessage,
  ListUrlReviewStatusResultMessage,
  SaveUrlReviewStatusMessage,
  SaveUrlReviewStatusResultMessage,
  ImportUrlReviewStatusMessage,
  ImportUrlReviewStatusResultMessage,
  ClearUrlReviewStatusMessage,
  ClearUrlReviewStatusResultMessage,
  ListUrlTemplatesMessage,
  ListUrlTemplatesResultMessage,
  SaveUrlTemplateMessage,
  SaveUrlTemplateResultMessage,
  DeleteUrlTemplateMessage,
  DeleteUrlTemplateResultMessage,
  ListGrabSourcePatternsMessage,
  ListGrabSourcePatternsResultMessage,
  SaveGrabSourcePatternMessage,
  SaveGrabSourcePatternResultMessage,
  DeleteGrabSourcePatternMessage,
  DeleteGrabSourcePatternResultMessage,
} from './url-template-messages.js';

/**
 * The two envelope unions every runtime message belongs to. They live apart
 * from `messages.ts` so that adding a message type never grows that file — it
 * only ever adds one arm here, next to the domain modules the arms come from.
 */

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
  | import('../interop-runtime-messages.js').InteropRuntimeMessage
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
  | import('../interop-runtime-messages.js').InteropRuntimeResultMessage
  | ListUrlTemplatesResultMessage
  | SaveUrlTemplateResultMessage
  | DeleteUrlTemplateResultMessage
  | ListGrabSourcePatternsResultMessage
  | SaveGrabSourcePatternResultMessage
  | DeleteGrabSourcePatternResultMessage;
