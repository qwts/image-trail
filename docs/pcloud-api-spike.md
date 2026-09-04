# pCloud API Spike

This page captures the pCloud API investigation for Image Trail cloud backup
support. It is the durable project note for issues
[#122](https://github.com/qwts/image-trail/issues/122) and
[#166](https://github.com/qwts/image-trail/issues/166).

## Goal

Determine whether pCloud can serve as an optional cloud backup destination for
Image Trail-owned encrypted export artifacts.

The intended product shape is manual backup/restore first, not live sync:

- Image Trail remains authoritative in extension-owned IndexedDB.
- Image Trail generates its own encrypted/versioned export artifacts.
- pCloud is treated as untrusted object storage for those artifacts.
- pCloud must not become the source of truth for Recall, durable pin ordering,
  bookmark metadata, or encrypted original storage.

## Current Recommendation

Proceed with caveats.

pCloud is viable for a manual backup provider spike because the API can
authenticate, create/reuse folders, upload a generated Image Trail-style
artifact, download it byte-for-byte, and delete it.

Do not build automatic sync yet. First product work should stay behind an
explicit provider boundary and implement user-triggered backup/restore only.

## API Access Status

pCloud disabled self-service API key/app creation for the account, but support
manually provisioned API access for this use case.

This means pCloud is not currently a frictionless self-service provider
integration. If Image Trail ever ships pCloud support to more users, confirm
whether pCloud will allow general app registration or whether every developer
must request manual access.

## OAuth Findings

Callback used for the local spike:

```text
http://127.0.0.1:8787/pcloud
```

Two OAuth paths were tested:

- Authorization code flow works end-to-end with localhost callback and local
  client-secret exchange.
- Token/implicit flow works end-to-end after the redirect host is configured in
  the pCloud app settings.

Important caveat:

- The pCloud app settings UI showed implicit grant as allowed.
- Before the redirect host was configured, token flow failed with a message that
  the application only supported `code` `response_type`.
- After the redirect host was configured, token flow successfully produced a
  token and authenticated.

Product implication:

- Token flow is the preferred production direction for a browser extension
  because the extension should not embed a client secret.
- Code flow is useful for local/server-side tests, but a production extension
  should use a pCloud-approved extension-safe OAuth setup rather than shipping a
  client secret.

Host-safety finding from the PR review:

- Token-bearing API calls should be limited to pCloud's documented API hosts:
  `api.pcloud.com` and `eapi.pcloud.com`.
- Code-flow redirects can include a `hostname` parameter. The localhost helper
  should carry that value into the token exchange unless the user explicitly
  provides a safe pCloud API host.
- Any value from `PCLOUD_API_HOST`, the OAuth redirect, or the token response
  should be normalized and rejected if it is not one of the pCloud API hosts.

## Successful Code-Flow Run

The code-flow run completed the full API round trip:

- OAuth code-flow callback succeeded on localhost.
- Token exchange succeeded.
- API host: `api.pcloud.com`.
- `userinfo` authenticated successfully.
- Account was premium.
- Quota observed: `13194139533312` bytes.
- Used quota observed: `1685485184707` bytes.
- Root folder reused/created: `Image Trail API Spike`
  (`folderid=32051336548`).
- Backup folder reused/created: `backups` (`folderid=32051336570`).
- Uploaded generated artifact:
  `image-trail-pcloud-spike-2026-06-24T13-58-20Z.image-trail-encrypted.json`.
- Uploaded file ID: `89622741545`.
- Uploaded size: `347` bytes.
- `listfolder` showed the uploaded artifact.
- `checksumfile` returned SHA-1 and MD5, but not SHA-256.
- Download via `getfilelink` matched byte-for-byte.
- Local SHA-256:
  `0647a3efd3d3e174472626dcc741403bba343071b0750ad916ea0710b0473681`.
- Cleanup succeeded with `deletefile`.

## Successful Token-Flow Run

After the redirect host was configured and the probe was hardened, token flow
completed the full API round trip:

- OAuth token-flow callback succeeded on localhost.
- API host: `api.pcloud.com`.
- `userinfo` authenticated successfully.
- Account was premium.
- Quota observed: `13194139533312` bytes.
- Used quota observed: `1685485185054` bytes.
- Root folder reused: `Image Trail API Spike` (`folderid=32051336548`).
- Backup folder reused: `backups` (`folderid=32051336570`).
- Uploaded generated artifact:
  `image-trail-pcloud-spike-2026-06-27T01-43-28Z.image-trail-encrypted.json`.
- Uploaded file ID: `89729479133`.
- Uploaded size: `347` bytes.
- `listfolder` showed the uploaded artifact.
- `checksumfile` returned SHA-1 and MD5, but not SHA-256.
- Download via `getfilelink` matched byte-for-byte.
- Local SHA-256:
  `e6d1525dba1c512b9d27d9a16a7260d07791953aa707e8996ffe070c34838305`.
- Cleanup succeeded with `deletefile`.

Earlier token-flow hiccup:

- A prior token-flow run on 2026-06-24 authenticated and uploaded file
  `89622824130`, but `listfolder` did not show the just-uploaded artifact in that
  run.
- The probe was hardened afterward with list retries, string-normalized file ID
  comparison, failure cleanup, and targeted cleanup mode.
- The successful 2026-06-27 run suggests the earlier miss was transient or caused
  by pre-hardening probe behavior, not a blocker for token-flow OAuth.

## Script Behavior

The local spike tooling lives in the repo branch for issue #166:

- `scripts/pcloud-oauth-local.mjs`
- `scripts/pcloud-api-spike.mjs`
- `docs/acceptance-tests/pcloud-api-spike.md`

The API probe intentionally uses generated non-sensitive data only. It:

1. Authenticates with pCloud.
2. Creates or reuses `Image Trail API Spike`.
3. Creates or reuses `backups`.
4. Uploads a generated `.image-trail-encrypted.json` artifact.
5. Lists the backup folder.
6. Requests server checksums.
7. Downloads the file with `getfilelink`.
8. Compares downloaded bytes to local bytes.
9. Deletes the uploaded test artifact.

The generated artifact resembles Image Trail's encrypted export envelope shape,
but it is not real user data.

## Integration Constraints

- Store OAuth tokens only in extension-owned storage.
- Do not use host-page `localStorage`.
- Provide a disconnect/revoke path.
- Treat pCloud filenames, folder paths, sizes, and timestamps as visible cloud
  metadata.
- Use neutral filenames and folders.
- Upload encrypted Image Trail artifacts by default.
- Do not rely on pCloud Crypto as Image Trail's encryption layer.
- Do not upload plaintext history/bookmark exports by default.
- Do not store key backups and encrypted data in pCloud without clear UI warning
  about password strength and account compromise tradeoffs.
- Compute Image Trail's own SHA-256 locally if SHA-256 matters; pCloud's
  checksum endpoint did not return SHA-256 in the successful run.

## Product Boundary

pCloud backup must not change these Image Trail rules:

- Recents remain transient session state.
- Pins/bookmarks remain durable queue records.
- Original-photo bytes remain in separate encrypted blob/original storage.
- Recall pages durable pins/bookmarks from the queue producer.
- Recall does not page cloud files, encrypted blobs, or cloned visible queue
  state.
- Queue ordering remains `queueUpdatedAt`.

## Next Steps

1. Clean up any retained test artifact by file ID if needed.
2. Treat token/implicit OAuth as the preferred production direction unless pCloud
   changes the app's allowed flow behavior.
3. Open a product implementation issue for a manual `Back up to pCloud` /
   `Restore from pCloud` provider boundary.
4. During implementation, decide token storage, disconnect/revoke behavior,
   backup naming, restore picker behavior, and local SHA-256 verification.
5. Defer scheduled sync, retention policy, conflict resolution, and multi-provider
   design to separate issues.
