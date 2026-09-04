# pCloud API Spike

## Purpose

Verify that approved pCloud API access can support a future Image Trail cloud
backup provider before product UI or storage integration begins.

## Preconditions

- pCloud support has provisioned API access for the test account.
- A pCloud OAuth access token or equivalent API token is available locally.
- The token is kept out of the repository, shell history, screenshots, and logs.
- The test uses non-sensitive generated data only.

## Spike Command

For the local OAuth test, register this callback with pCloud:

```text
http://127.0.0.1:8787/pcloud
```

Then run the localhost OAuth helper with the pCloud client/app ID and secret:

```sh
PCLOUD_CLIENT_ID=<client-id> PCLOUD_CLIENT_SECRET=<client-secret> node scripts/pcloud-oauth-local.mjs
```

The helper prints an authorization URL, receives the OAuth redirect on
localhost, exchanges the one-time code for a token in memory, and runs the API
round-trip probe without printing the secret or token.

To retry the implicit grant flow shown in the pCloud app settings, omit the
client secret and set `PCLOUD_OAUTH_FLOW=token`:

```sh
PCLOUD_CLIENT_ID=<client-id> PCLOUD_OAUTH_FLOW=token node scripts/pcloud-oauth-local.mjs
```

In token flow, the localhost callback page captures the URL fragment in the
browser and posts it back to the local helper because fragments are not sent to
HTTP servers.

If an access token is already available, run the probe directly with credentials
supplied by environment variables:

```sh
PCLOUD_ACCESS_TOKEN=<token> PCLOUD_API_HOST=api.pcloud.com node scripts/pcloud-api-spike.mjs
```

Use `PCLOUD_API_HOST=eapi.pcloud.com` for Europe-region accounts when required.
Set `PCLOUD_SPIKE_KEEP_FILE=1` only when intentionally retaining the test file
for manual inspection.

If a failed run leaves a test artifact behind, delete it by file ID:

```sh
PCLOUD_ACCESS_TOKEN=<token> PCLOUD_SPIKE_DELETE_FILEID=<fileid> node scripts/pcloud-api-spike.mjs
```

## Steps

1. Authenticate with pCloud using the token without printing account email or
   token values.
2. Create or reuse the `Image Trail API Spike` folder.
3. Create or reuse the `backups` child folder.
4. Upload a generated `.image-trail-encrypted.json` test artifact.
5. List the backup folder and verify the uploaded artifact is present.
6. Request server-side checksums for the uploaded artifact.
7. Download the uploaded artifact and compare bytes locally.
8. Delete the test artifact unless retention was requested.

## Expected Result

- Authentication succeeds against the correct API host.
- Folder creation is idempotent.
- Upload returns file metadata and a file ID.
- Listing shows the uploaded artifact in the backup folder.
- The probe tolerates short listfolder propagation delays before failing.
- The checksum endpoint returns at least one checksum value.
- Downloaded bytes match the uploaded artifact exactly.
- Cleanup removes the test artifact, or retained-file behavior is documented.

## Findings To Record

- Which API host worked for the account.
- Whether the pCloud token shape matches browser-extension OAuth expectations.
- Whether `getfilelink` download works from the spike and whether browser
  extension background fetch needs a separate test.
- Any observed rate, quota, permission, traffic, or file-retention constraints.
- Whether a product implementation should proceed, proceed with caveats, or wait.

## Product Boundaries

- Do not upload real Image Trail user data during this spike.
- Do not depend on pCloud Crypto for Image Trail security.
- Do not change Recall, durable pin queue ordering, encrypted original storage,
  or bookmark metadata semantics.
- Treat pCloud as untrusted storage for Image Trail-owned encrypted artifacts.
