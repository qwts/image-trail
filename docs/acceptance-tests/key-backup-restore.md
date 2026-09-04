# Key Backup Restore

## Purpose

Verify that encrypted captured originals have a portable recovery path before encrypted image downloads are added.

## Preconditions

- The extension is installed in a clean Brave or Chromium profile.
- The panel can capture encrypted originals.
- Browser downloads are allowed for the test profile.

## Steps

1. Open a page with at least one image and open Image Trail.
2. Create the encrypted originals key with an encryption password.
3. Select an image and capture its original bytes.
4. Export a key backup from the encrypted originals section with a separate backup password.
5. Confirm the downloaded key backup file is JSON and does not expose raw unwrapped key material.
6. Clear or reinstall the profile so IndexedDB extension data is empty.
7. Reinstall or reload the extension and open Image Trail.
8. Import the key backup JSON with the backup password.
9. Unlock encrypted originals with the original encryption password.
10. Restore the bookmark or history record that references the captured original, then preview or download the captured original.

## Expected Result

- Export succeeds only when a backup password is provided.
- Import validates the backup file and stores the restored blob key record.
- Unlock works with the original encryption password after import.
- The captured original created before export can be retrieved after restore.
- Importing with the wrong backup password fails closed and does not write a key.
- Re-importing an existing key reference is idempotent or reports that the key is already imported without duplicating it.

## Notes

- The backup contains the stored password-wrapped blob key record, not the active non-extractable `CryptoKey`.
- Encrypted image download UI should depend on this recovery path in the next slice.
