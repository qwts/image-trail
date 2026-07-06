export const LIBRARY_CHANGE_MESSAGE_TYPE = 'imageTrail.libraryChanged';
export const LIBRARY_CHANGE_MESSAGE_VERSION = 1;

export type LibraryChangeTopic = 'bookmarks' | 'albums';

export type LibraryChangeReason =
  | 'bookmark-saved'
  | 'bookmark-removed'
  | 'bookmarks-removed'
  | 'recall-bookmarks-removed'
  | 'album-created'
  | 'album-renamed'
  | 'album-deleted'
  | 'album-records-added'
  | 'album-record-removed'
  | 'album-backup-imported';

export interface LibraryChangePayload {
  readonly topic: LibraryChangeTopic;
  readonly reason: LibraryChangeReason;
  readonly changedAt: number;
  readonly recordIds?: readonly string[];
  readonly albumIds?: readonly string[];
}

export type LibraryChangeInput = Omit<LibraryChangePayload, 'changedAt'> & {
  readonly changedAt?: number;
};

export interface LibraryChangeMessage {
  readonly type: typeof LIBRARY_CHANGE_MESSAGE_TYPE;
  readonly version: typeof LIBRARY_CHANGE_MESSAGE_VERSION;
  readonly payload: LibraryChangePayload;
}

export function createLibraryChangeMessage(input: LibraryChangeInput): LibraryChangeMessage {
  return {
    type: LIBRARY_CHANGE_MESSAGE_TYPE,
    version: LIBRARY_CHANGE_MESSAGE_VERSION,
    payload: {
      topic: input.topic,
      reason: input.reason,
      changedAt: input.changedAt ?? Date.now(),
      ...(input.recordIds ? { recordIds: [...input.recordIds] } : {}),
      ...(input.albumIds ? { albumIds: [...input.albumIds] } : {}),
    },
  };
}

export function isLibraryChangeMessage(value: unknown): value is LibraryChangeMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<LibraryChangeMessage>;
  return (
    message.type === LIBRARY_CHANGE_MESSAGE_TYPE &&
    message.version === LIBRARY_CHANGE_MESSAGE_VERSION &&
    isLibraryChangePayload(message.payload)
  );
}

function isLibraryChangePayload(value: unknown): value is LibraryChangePayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<LibraryChangePayload>;
  return (
    isTopic(payload.topic) &&
    isReason(payload.reason) &&
    typeof payload.changedAt === 'number' &&
    isOptionalStringList(payload.recordIds) &&
    isOptionalStringList(payload.albumIds)
  );
}

function isTopic(value: unknown): value is LibraryChangeTopic {
  return value === 'bookmarks' || value === 'albums';
}

function isReason(value: unknown): value is LibraryChangeReason {
  return (
    value === 'bookmark-saved' ||
    value === 'bookmark-removed' ||
    value === 'bookmarks-removed' ||
    value === 'recall-bookmarks-removed' ||
    value === 'album-created' ||
    value === 'album-renamed' ||
    value === 'album-deleted' ||
    value === 'album-records-added' ||
    value === 'album-record-removed' ||
    value === 'album-backup-imported'
  );
}

function isOptionalStringList(value: unknown): value is readonly string[] | undefined {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}
