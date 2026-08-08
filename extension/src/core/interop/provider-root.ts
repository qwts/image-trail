export const INTEROP_PROVIDER_ROOT_NAME = 'Overlook Interop';
export const INTEROP_PROVIDER_LIBRARY_ID = 'v1';
export const INTEROP_PROVIDER_LOGICAL_ROOT = `${INTEROP_PROVIDER_ROOT_NAME}/${INTEROP_PROVIDER_LIBRARY_ID}`;
export const INTEROP_GOOGLE_DRIVE_OWNER = 'qwts-overlook-interop-v1';
export const INTEROP_GOOGLE_DRIVE_DISCOVERY = {
  ownerPropertyKey: 'overlookOwner',
  pathHashPropertyKey: 'overlookPathHash',
  hashAlgorithm: 'sha256',
  hashEncoding: 'lowercase-hex',
  rootIdentity: 'overlook-root',
  libraryIdentityTemplate: 'library:{libraryId}',
  folderIdentityTemplate: 'library:{libraryId}/folder:{path}',
  fileIdentityTemplate: 'library:{libraryId}/file:{path}',
} as const;
