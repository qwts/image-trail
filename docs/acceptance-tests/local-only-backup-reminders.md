# Local-Only Backup Reminders

Purpose: verify that an explicit local reminder can prompt a manual encrypted backup without creating a scheduled cloud-sync or notification path.

## Product Rules

- Backup reminders are off by default and remain opt-in.
- Reminder preferences and the next-due timestamp are extension-owned local settings. They are not Recents, Queue records, Recall records, or cloud-provider state.
- Image Trail evaluates whether a reminder is due when its Settings or Import / Export surfaces render. It does not register browser alarms or system notifications.
- A reminder never connects a provider, starts OAuth, uploads a file, or schedules a future provider operation.
- Supported reminder intervals are 7, 30, and 90 days.
- `Remind later` advances the local due timestamp by the selected interval without claiming that a backup completed.
- A successful encrypted bookmark export advances the next-due timestamp only after the browser download starts.
- A successful manual pCloud backup advances the next-due timestamp only after the uploaded manifest is verified.
- Plaintext exports, history exports, key-only exports, cancelled downloads, empty exports, provider failures, and partial or unverified uploads do not count as a completed bookmark backup.
- Enabling, disabling, snoozing, or completing a reminder must not persist Recents, reorder Queue, add Recall records, capture original bytes, or reseal encrypted metadata.

## Manual Scenario

1. Open Settings > Automation and verify `Remind me to make an encrypted backup` is off by default.
2. Enable the reminder, choose `Every 7 days`, and reopen Settings.
3. Verify the opt-in and cadence persist locally and the next reminder is shown without a browser permission request, alarm, notification, provider connection, or upload.
4. Move the test profile clock beyond the next-due timestamp and reopen Image Trail.
5. Open Import / Export and verify `Manual encrypted backup due` recommends an encrypted bookmark export with its key backup, or the explicit pCloud `Back up now` flow.
6. Verify the due prompt says that Image Trail never connects or uploads automatically.
7. Click `Remind later`, reopen Import / Export, and verify the due prompt is gone and the next reminder moved forward by seven days.
8. Make the reminder due again, then export plaintext bookmarks. Verify the reminder remains due.
9. Export history and the encryption-key backup separately. Verify neither clears the bookmark-backup reminder.
10. Attempt an encrypted bookmark export with no exportable records or invalid credentials. Verify the failed or empty operation leaves the reminder due.
11. Complete a successful encrypted bookmark export and verify the browser download starts before the reminder advances to the next cadence.
12. Make the reminder due again, disconnect pCloud, and verify no connection or upload starts until the user explicitly chooses the existing provider actions.
13. Start a manual pCloud backup and force a part or manifest verification failure. Verify the reminder remains due and partial cleanup follows the existing backup flow.
14. Complete a manual pCloud backup whose manifest is verified. Verify the reminder advances only after that verified completion.
15. Disable reminders and verify both Settings and Import / Export report reminders off and show no due prompt.
16. Throughout the scenario, verify Recents, Queue order, Recall, stored-original indicators, encrypted envelopes, and provider connection state change only through their existing explicit workflows.

## Expected Result

- Users can opt into a local 7-, 30-, or 90-day prompt for manual encrypted bookmark backups.
- The reminder is evaluated in Image Trail UI, never by browser alarms, notifications, or an automatic provider job.
- Snoozing changes only the local next-due timestamp; only a successful encrypted bookmark download or verified manual pCloud backup records completion.
- Failure, cancellation, plaintext export, unrelated export, and unverified provider operations leave a due reminder due.
- Recents remain transient and Queue, Recall, original bytes, encrypted metadata, and provider state retain their existing boundaries.
