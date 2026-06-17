# IndexedDB Structure Draft

## Purpose

IndexedDB is the long-term durable store for encrypted history, bookmarks, keys, thumbnails, optional saved image blobs, encrypted downloads metadata, migrations, and locked settings.

This is an early draft. The goal is to define store boundaries and migration expectations before implementation starts.

## Database

```text
name: image-bookmarklet-extension
version: 1
```

Version upgrades should be handled only through ordered migrations. Encrypted payload format versions should live inside each encrypted envelope and evolve independently from the IndexedDB database version.

## Store Summary

```text
keys
history
bookmarks
thumbnails
imageBlobs
downloads
lockedSettings
storageStats
migrations
```

## Day-One Storage Limits

Unbounded local capture is not allowed.

Defaults:

```text
default max original image: 25 MB
hard max original image: 100 MB
thumbnail max: small and bounded by dimensions and byte size
visible recent/runtime items: about 200
```

Policy:

- Do not store original image blobs above the hard max.
- Store originals only when explicitly saved, bookmarked, or downloaded.
- If an original is too large, blocked by CORS, blocked by quota, or skipped by policy, keep a metadata/remote-only record.
- Keep size metadata outside encrypted payloads where needed for quota and usage reporting.
- Usage reporting should not require decrypting every record.

## `keys`

Stores key metadata and wrapped content keys.

Primary key:

```text
uuid
```

Indexes:

```text
kind
reference
kindReference
createdAt
updatedAt
```

Draft record shape:

```json
{
  "uuid": "key uuid",
  "kind": "history-item | bookmark-item | thumbnail | image-blob | download | locked-setting | root | export",
  "reference": "record uuid or logical reference",
  "algorithm": "AES-GCM",
  "keyUsages": ["encrypt", "decrypt"],
  "wrappedKey": "ArrayBuffer or base64 string",
  "wrapping": {
    "version": 1,
    "method": "local-root | password | pin | webauthn-placeholder",
    "algorithm": "AES-GCM | PBKDF2-AES-GCM",
    "salt": "optional base64",
    "iv": "base64",
    "iterations": 250000
  },
  "status": "active | rotated | retired",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

Notes:

- Raw long-lived key material should not be stored directly.
- Per-item keys are stored wrapped.
- WebAuthn/YubiKey support is not first-pass, but wrapping metadata should allow adding it later.
- Key rotation should retire old keys without rewriting unrelated records unless required.

## Encrypted Envelope

Encrypted stores should use a common envelope so record formats can migrate safely.

Draft envelope:

```json
{
  "version": 1,
  "keyUuid": "key uuid",
  "algorithm": "AES-GCM",
  "iv": "base64",
  "ciphertext": "ArrayBuffer or base64 string",
  "aad": {
    "store": "history",
    "recordUuid": "record uuid",
    "payloadVersion": 1
  },
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

The decrypted payload should include its own `payloadVersion`.

## `history`

Stores encrypted durable history records.

Primary key:

```text
uuid
```

Indexes:

```text
createdAt
updatedAt
lastViewedAt
keywordCount
hasThumbnail
hasImageBlob
remoteOnly
captureStatus
```

Draft record shape:

```json
{
  "uuid": "history item uuid",
  "keyUuid": "key uuid",
  "envelope": {},
  "keywordRefs": ["optional keyword ids or encrypted keyword refs"],
  "hasThumbnail": true,
  "thumbnailUuid": "thumbnail uuid",
  "hasImageBlob": false,
  "imageBlobUuid": "",
  "remoteOnly": false,
  "captureStatus": "captured | remote-only | failed | skipped-size | skipped-policy",
  "originalByteLength": 0,
  "thumbnailByteLength": 12345,
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp",
  "lastViewedAt": "ISO timestamp"
}
```

Draft decrypted payload:

```json
{
  "payloadVersion": 1,
  "url": "image url",
  "title": "display title",
  "label": "user label",
  "domain": "domain kept encrypted by default",
  "pathParts": ["optional parsed path metadata"],
  "imageKind": "jpg | png | webp | gif | unknown",
  "metadata": {},
  "downloadedAt": "",
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

Privacy rule:

- Domain/path searchable metadata should not be plaintext by default.
- Recent runtime history can sort/filter unencrypted session data.
- Older encrypted history is recalled through explicit unlock/decrypt flows.
- Optional keywording can be used to recall encrypted records without exposing broad plaintext URL indexes.

## `bookmarks`

Stores encrypted durable bookmarks. New extension code should use `bookmarks`; legacy import/export can map bookmarklet `favorites`.

Primary key:

```text
uuid
```

Indexes:

```text
createdAt
updatedAt
lastViewedAt
hasThumbnail
hasImageBlob
```

Draft record shape is similar to `history`, with a decrypted payload that includes:

```json
{
  "payloadVersion": 1,
  "url": "image url",
  "title": "display title",
  "label": "user label",
  "notes": "",
  "metadata": {},
  "createdAt": "ISO timestamp",
  "updatedAt": "ISO timestamp"
}
```

## `thumbnails`

Stores encrypted thumbnails. Thumbnails are stored by default when available and are separate from full image blobs.

Primary key:

```text
uuid
```

Indexes:

```text
sourceRecordUuid
sourceRecordKind
createdAt
updatedAt
byteLength
width
height
```

Draft decrypted payload:

```json
{
  "payloadVersion": 1,
  "mimeType": "image/webp | image/png | image/jpeg",
  "width": 256,
  "height": 256,
  "byteLength": 12345,
  "bytes": "ArrayBuffer or base64"
}
```

Notes:

- Thumbnail generation may fail for cross-origin/canvas-tainted images.
- Store original image blobs only when explicitly requested.
- Thumbnail dimensions and byte length must be bounded by settings/policy.

## `imageBlobs`

Stores optional encrypted original/saved image bytes.

Primary key:

```text
uuid
```

Indexes:

```text
sourceRecordUuid
sourceRecordKind
createdAt
updatedAt
byteLength
mimeType
captureStatus
```

Draft decrypted payload:

```json
{
  "payloadVersion": 1,
  "sourceUrl": "image url",
  "mimeType": "image/jpeg",
  "filename": "suggested filename",
  "byteLength": 1234567,
  "fingerprint": "sha256 hex if available",
  "bytes": "ArrayBuffer or base64"
}
```

Policy:

- Not stored for every history item.
- Stored only on explicit save/bookmark/download workflows.
- Default max original image size is 25 MB.
- Hard max original image size is 100 MB.
- Above the hard max, store a remote-only metadata record instead of the blob.

## `downloads`

Stores encrypted metadata about encrypted downloads written to disk.

Primary key:

```text
uuid
```

Indexes:

```text
sourceRecordUuid
createdAt
downloadedAt
filename
```

Draft decrypted payload:

```json
{
  "payloadVersion": 1,
  "sourceUrl": "image url",
  "filename": "encrypted file name",
  "originalFilename": "original suggested name",
  "fileFormatVersion": 1,
  "downloadKeyUuid": "key uuid",
  "fingerprint": "sha256 hex if available",
  "downloadedAt": "ISO timestamp"
}
```

## `lockedSettings`

Stores encrypted settings that were moved out of local plaintext settings by the user.

Primary key:

```text
uuid
```

Indexes:

```text
settingKind
reference
createdAt
updatedAt
```

Examples:

```text
field patterns
field aliases
sensitive LLM endpoint configuration
private sorting presets
```

Draft decrypted payload:

```json
{
  "payloadVersion": 1,
  "settingKind": "field-patterns",
  "reference": "domain or logical key",
  "value": {}
}
```

## `storageStats`

Stores aggregate counts and byte totals for the storage usage indicator.

Primary key:

```text
id
```

Draft record shape:

```json
{
  "id": "current",
  "capturedCount": 418,
  "originalBytes": 1932735283,
  "thumbnailBytes": 44040192,
  "failedOrRemoteOnlyCount": 37,
  "historyCount": 418,
  "bookmarkCount": 42,
  "updatedAt": "ISO timestamp"
}
```

Usage indicator example:

```text
Captured: 418 images
Originals: 1.8 GB
Thumbnails: 42 MB
Failed/remote-only: 37 records
```

Notes:

- Stats can be updated incrementally when records are added, changed, or deleted.
- A rebuild/recount operation can be added later for recovery.
- Stats should be based on plaintext metadata fields such as byte counts and capture status, not decrypted URLs or domains.

## `migrations`

Tracks completed migrations and recovery status.

Primary key:

```text
id
```

Draft record shape:

```json
{
  "id": "indexeddb-001-create-base-stores",
  "version": 1,
  "status": "complete | failed | rolled-back",
  "startedAt": "ISO timestamp",
  "finishedAt": "ISO timestamp",
  "error": ""
}
```

## Migration Rules

- Additive migrations are preferred.
- Avoid migrations that require decrypting every history/bookmark record.
- Keep encrypted payload migrations lazy where possible: decrypt, upgrade, and re-encrypt when a record is opened or recalled.
- If a migration changes key wrapping, encryption algorithms, or export compatibility, prompt the user to create a backup/export first.
- Failed migrations should leave previous readable data intact whenever possible.
