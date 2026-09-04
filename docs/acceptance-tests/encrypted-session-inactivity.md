# Encrypted Session Inactivity

Purpose: prove that an unlocked encrypted-originals key survives normal Manifest V3 service-worker suspension without becoming durable, then locks after the configured period of real user inactivity.

## Security contract

- Settings offers **5 minutes**, **10 minutes** (default), **15 minutes**, and **Never**.
- Pointer movement, pointer actions, keyboard activity, and meaningful panel actions reset the inactivity deadline while the key is unlocked. Pointer-move reporting is throttled so host-page movement cannot flood extension messaging.
- Manual **Lock now** is immediate and clears both the active in-memory key and the worker-recovery record.
- The unwrapped key is held only in extension-owned memory and `chrome.storage.session`. Session storage access is restricted to trusted extension contexts; host-page storage and `chrome.storage.local` are never used for the unwrapped key.
- `chrome.storage.session` survives routine Manifest V3 worker suspension/restart, but clears at the browser/extension session boundary. **Never** therefore means until manual lock, extension reload/update, disable, or browser shutdown—not durable unlock.
- A restored key is imported as non-extractable. Malformed, missing, expired, or unreadable recovery data fails closed, is erased, and leaves encrypted originals locked.
- The wrapped durable key record and encrypted original bytes remain in their existing stores. This feature does not create a second durable key format.

## Automated coverage

- `tests/session-unlock.test.ts` uses a fake clock for 5/10/15/Never, repeated activity, settings changes, expiry, and manual lock.
- `tests/blob-key-session.test.ts` covers trusted session-storage recovery, non-extractable restore, activity persistence, timeout removal, manual removal, and malformed-state failure.
- `tests/secure-session-activity.test.ts` covers throttled pointer/keyboard activity and locked-session feedback without host storage.
- `tests/dom/encryption-view.test.ts` covers the timeout selector and separate Lock/Clear controls.
- `tests/e2e/secure-session.spec.ts` creates a key in an isolated extension profile, forcibly stops the real service worker through CDP, captures an original through the restarted worker, and verifies manual lock.
- The existing encrypted-image and import/export suites continue to cover capture, key backup, wrong-password failure, encrypted image round trips, deletion, orphan cleanup, and recovery boundaries.

## Manual release script

1. Run `npm run ci`, `npm run test:e2e`, and `npm run test:stories:ci`.
2. Load `extension/dist` as an unpacked Chromium extension. Open a supported page, open the panel, then open Settings > Encrypted originals.
3. Create or unlock the encryption key. Select **5 minutes**, interact with the page/panel before five minutes, and verify the panel remains unlocked for five minutes after the latest activity—not five minutes after the original unlock.
4. Stop interacting for five minutes. Verify the panel reports locked and capture does not reveal or write an unencrypted original.
5. Unlock again and click **Lock now**. Verify the locked state is immediate and the Unlock control appears; reopening Settings must not restore the session.
6. Unlock, select **Never**, and leave the panel idle. Verify ordinary idleness does not lock it. Reload/disable the extension or restart the browser and verify it is locked afterward.
7. For the Manifest V3 boundary, unlock and pin an image, stop the extension service worker from Chromium's extension inspection tools without reloading the extension, then capture the pin. Verify capture succeeds and the encrypted-original indicator appears.
8. Inspect extension storage while unlocked. Verify the worker-recovery record exists only in `chrome.storage.session`, is unavailable to content scripts, and no raw/unwrapped key appears in IndexedDB, `chrome.storage.local`, or host-page storage. Lock and verify the session record is removed.

## Expected result

- Normal worker suspension is transparent during an authorized unlocked session.
- Inactivity and manual lock remove all unwrapped key material from extension session memory.
- Browser/extension session boundaries always return to locked state.
- Recovery failure is visible and fail-closed; encrypted thumbnails, originals, queue ordering, Recall, and transient Recents behavior remain unchanged.
