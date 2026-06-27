# pCloud Provider Boundary

Issue: #199

## Scope

- Settings shows the Cloud backup pCloud provider in the live Import / Export utility stack.
- Connect pCloud uses the browser extension OAuth token flow through `chrome.identity.launchWebAuthFlow`.
- The pCloud OAuth access token is stored only in extension-owned background storage and is not returned to the content script or panel UI.
- Only `api.pcloud.com` and `eapi.pcloud.com` are accepted as API hosts.
- Back up now and Choose restore file intentionally surface next-slice messages until upload/list/download work lands.

## Manual Check

1. Load the unpacked extension and open Settings.
2. Expand Cloud backup and confirm pCloud starts disconnected.
3. Click Connect pCloud and complete the pCloud authorization.
4. Confirm the provider returns to connected state with the API host visible.
5. Click Back up now and Choose restore file.
   Expected: each button reports that the file-transfer step is a later implementation slice.
6. Click Disconnect.
   Expected: provider returns to disconnected state and no token is exposed in the panel state or message payloads.

## Follow-On Work

- Upload encrypted export files to pCloud.
- List and select restore candidates.
- Add restore preview, duplicate detection, and backup history.
