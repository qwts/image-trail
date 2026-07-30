# Data-layer context

Persistence layer: IndexedDB (`db.ts`, `migrations.ts`), repositories
(`repositories/`), and crypto envelopes (`crypto/`). Read
[`../../../AGENTS.md`](../../../AGENTS.md) first. This file adds implementation
traps specific to `extension/src/data/`.

- **Reordering never reseals encrypted metadata.** `sealJsonEnvelope`
  (`crypto/envelope.ts`) mints a fresh IV per seal and binds `key` /
  `authenticatedMetadata` into AES-GCM AAD, which must round-trip byte-for-byte
  (`repositories/hydration.ts` returns stored rows, never reconstructed copies).
  Reordering rewrites only the plaintext `queueUpdatedAt` column via
  `updateQueueUpdatedAt` (`repositories/bookmarks-repository.ts`,
  `repositories/encrypted-pins-repository.ts`) — never a decrypt → reseal.
- **Blob reference counts gate deletion.** `blobs-repository.ts` `remove()`
  decrements `referenceCount` and only deletes the blob once it would drop to
  zero (`<= 1`); new blobs start at `1`. `deleteMany()` is a separate, explicit
  hard-delete path. Do not delete original-photo blobs outside these rules.
