# Third-Party CDN Permission Flow

Purpose: verify that cross-origin capture failures are explicit and recoverable when optional host permissions are needed.

## Steps

1. Open a fixture page containing an image served from a third-party CDN origin.
2. Click the extension action.
3. Select the CDN image.
4. Click `Capture`.
5. If the extension lacks permission to fetch the original bytes, verify the capture attempt fails cleanly.
6. Verify the panel shows a permission-needed state that names the required origin.
7. Grant the optional host permission.
8. Retry capture.
9. Verify capture succeeds, or verify the extension records a clean remote-only failure if the browser, CDN, quota, size, or CORS behavior still prevents local original storage.

## Expected Result

- The extension does not request broad host permissions up front.
- Permission-related failures are distinguishable from quota, size, CORS, and network failures.
- Failed captures do not leave corrupt or partial blob records.
- A remote-only record remains valid when local original storage is not possible.
