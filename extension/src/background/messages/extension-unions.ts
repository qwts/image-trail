import type { AlbumRequest, AlbumResponse } from '../album-messages.js';
import type { BlobKeyRequest, BlobKeyResponse } from '../blob-key-messages.js';
import type { DestinationRequest, DestinationResponse } from '../destination-messages.js';
import type { LayoutRequest, LayoutResponse } from '../layout-messages.js';
import type { OriginalBlobRequest, OriginalBlobResponse } from '../original-blob-messages.js';
import type { RecentHistoryRequest, RecentHistoryResponse } from '../recent-history-messages.js';
import type { InteropRuntimeMessage, InteropRuntimeResultMessage } from '../interop-runtime-messages.js';
import type { BlobRequest, BlobResponse } from './blob-messages.js';
import type { BookmarkRequest, BookmarkResponse } from './bookmark-messages.js';
import type { CommonRequest, CommonResponse } from './common.js';
import type { ImageFetchRequest, ImageFetchResponse } from './image-fetch-messages.js';
import type { PanelRequest, PanelResponse } from './panel-messages.js';
import type { PCloudRequest, PCloudResponse } from './pcloud-messages.js';
import type { RecallRequest, RecallResponse } from './recall-messages.js';
import type { UrlTemplateRequest, UrlTemplateResponse } from './url-template-messages.js';

/**
 * The two envelope unions every runtime message belongs to, composed from each
 * domain's own sub-union rather than enumerating individual message types.
 *
 * Composition is what keeps this file from growing: a new message type joins
 * its domain's sub-union, in the module that already owns its interface, its
 * factory, and its guard — and never reaches this file at all.
 */

export type ExtensionRequest =
  | CommonRequest
  | PanelRequest
  | AlbumRequest
  | DestinationRequest
  | BlobRequest
  | BlobKeyRequest
  | OriginalBlobRequest
  | ImageFetchRequest
  | BookmarkRequest
  | RecentHistoryRequest
  | RecallRequest
  | LayoutRequest
  | PCloudRequest
  | UrlTemplateRequest
  | InteropRuntimeMessage;

export type ExtensionResponse =
  | CommonResponse
  | PanelResponse
  | AlbumResponse
  | DestinationResponse
  | BlobResponse
  | BlobKeyResponse
  | OriginalBlobResponse
  | ImageFetchResponse
  | BookmarkResponse
  | RecentHistoryResponse
  | RecallResponse
  | LayoutResponse
  | PCloudResponse
  | UrlTemplateResponse
  | InteropRuntimeResultMessage;
