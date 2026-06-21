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
encryptedPins
encryptedPinThumbnails
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

Stores durable pin/bookmark queue rows. New extension code should use `bookmarks`; legacy import/export can map bookmarklet `favorites`.

Current implementation note:

- The `bookmarks` store is the queue and locked-mode relationship surface.
- For protected pins, it stores only opaque relationship fields and safe status flags by default: plain pin id, encrypted pin id, encrypted thumbnail id, stored-original blob id, queue order, and booleans for protected metadata/thumbnail/original availability.
- Sensitive display metadata such as URL, domain/path, title, label, dimensions, dates, generated metadata, and thumbnail data belongs in the protected stores unless a later settings feature explicitly permits a plaintext field.
- Locked UI reads this store and can show private placeholders without decrypting protected pin metadata.
- Unlocked UI reads this store plus protected pin stores and replaces placeholders with decrypted records where possible.
- Queue ordering is `queueUpdatedAt`; refreshing protected metadata or thumbnails must not reseal or reorder records unless the action intentionally moves a pin.

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

Protected relationship payloads use the same store but keep sensitive fields empty/redacted and include:

```json
{
  "payloadVersion": 1,
  "url": "image-trail-private:<plain pin id>",
  "label": "Private pin",
  "bookmarkedAt": "queue timestamp",
  "protectedPin": {
    "schemaVersion": 1,
    "plainPinId": "stable relationship row id",
    "encryptedPinId": "protected metadata id",
    "encryptedThumbnailId": "protected thumbnail id",
    "storedOriginalBlobId": "encrypted original blob id",
    "queueUpdatedAt": "queue timestamp",
    "hasEncryptedMetadata": true,
    "hasEncryptedThumbnail": true,
    "hasStoredOriginal": true
  }
}
```

## `encryptedPins`

Stores protected pin metadata using the existing password-unlocked blob key. This store is owned by the service worker; content scripts request bookmark/Recall data through extension messages and never open encrypted pin storage directly.

Primary key:

```text
id
```

Indexes:

```text
plainPinId
urlHash
queueUpdatedAt
key.reference
```

Plaintext record fields are limited to ids, URL hash for dedupe, queue order, and envelope/key metadata. The encrypted payload includes sensitive pin display data:

```json
{
  "payloadVersion": 1,
  "url": "image url",
  "title": "display title",
  "label": "display label",
  "width": 1200,
  "height": 800,
  "bookmarkedAt": "ISO timestamp",
  "downloadedAt": "optional ISO timestamp",
  "capturedAt": "optional ISO timestamp",
  "thumbnailId": "encrypted thumbnail id",
  "storedOriginal": {
    "blobId": "encrypted original blob id",
    "mimeType": "image/jpeg",
    "byteLength": 123456,
    "capturedAt": "ISO timestamp"
  }
}
```

## `encryptedPinThumbnails`

Stores protected thumbnail bytes separately from protected pin metadata. This avoids loading/decrypting thumbnail bytes while paging large queues.

Primary key:

```text
id
```

Indexes:

```text
pinId
createdAt
byteLength
key.reference
```

The plaintext record contains relationship/accounting fields only: thumbnail id, pin id, encrypted byte length, source byte length, created timestamp, and key reference. The AES-GCM binary envelope contains thumbnail MIME type and bytes.

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
