# Third-Party CDN Permission Flow

Purpose: verify that cross-origin capture failures are explicit and recoverable when optional host permissions are needed.

## Steps

1. Open a fixture page containing an image served from a third-party CDN origin.
2. Click the extension action.
3. Select the CDN image.
4. Click `Capture`.
5. If the extension lacks permission to fetch the original bytes, verify the capture attempt fails cleanly.
6. Verify the panel shows a permission-needed state that names the required origin.
7. Verify the panel shows **Grant permission and retry** beside **Dismiss**.
8. Click **Grant permission and retry** and approve the origin-specific browser prompt.
9. Verify capture succeeds, or verify the extension records a clean remote-only failure if the browser, CDN, quota, size, or CORS behavior still prevents local original storage.
10. Repeat from a clean permission state, deny the prompt, and verify the same source remains selected with an explicit retryable failure.
11. Click **Dismiss** and verify the failure and its retained retry context clear together.
12. Repeat the permission-needed state for a recent row and a queue row, delete that source row, and verify the retry action clears without opening a permission prompt.
13. Delete the source while an approved retry is completing and verify any captured bytes are removed instead of becoming an orphaned original.

## Expected Result

- The extension does not request broad host permissions up front.
- Permission-related failures are distinguishable from quota, size, CORS, and network failures.
- Permission retry uses the same target, history row, or bookmark that initiated the failed capture.
- Denial leaves the failure retryable; success returns through the normal stored-original save and refresh flow.
- Removing the retained recent or queue source cancels its retry before another permission request.
- Failed captures do not leave corrupt or partial blob records.
- A source deletion racing with capture completion deletes the detached captured blob.
- A remote-only record remains valid when local original storage is not possible.

## Validation layers

- Issue #62 automates retry-context lifecycle, CTA routing, source linkage, deletion races, and completion cleanup.
- Issue #57 removes required all-sites access so the live Chromium approval and denial prompts are reachable.
- Playwright uses a generated-only local fixture grant because browser-level extension permission prompts are outside the page automation surface; run steps 8 and 10 in a headful unpacked-extension session.
