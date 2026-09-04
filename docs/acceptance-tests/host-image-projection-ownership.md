# Host Image Projection Ownership

Manual coverage for issue #180.

## Rapid Record Projection

1. Open the extension on a page with one selected host image and at least two Recent or queue records.
2. Click preview/load on record A, then quickly click preview/load on record B.
3. Expected: the selected host image remains on record B after all loads settle.
4. Expected: no stale message, URL review status, parsed-field save, or Recent row from record A replaces record B state.

## Same-Current Projection

1. Project a Recent or queue record into the selected host image.
2. Click the same record preview/load action again.
3. Expected: the panel reports that the image is already projected.
4. Expected: the host image does not enter a reload loop.

## Parsed-Field Navigation And Restore

1. Select a host image with a URL that parses into editable fields.
2. Use a parsed-field next/previous or value edit control.
3. Expected: the projection uses the parsed-field navigation reason and only the latest navigation result mutates state.
4. Collapse and expand the panel.
5. Expected: parsed-field markers restore; any source replay uses the explicit parsed-field restore path.

## New Tab Same URL Restore

1. Open a page with one host image.
2. Use parsed-field navigation to stop on a different projected image.
3. Open a new tab at the same browser page URL.
4. Open the extension.
5. Expected: the saved projected source may replay because the browser page URL matches the saved parsed-field record.
6. Expected: stale projection completions from the previous tab cannot update the new tab after a newer projection starts.

## Failed Projection

1. Attempt to project an invalid or unavailable image URL.
2. Expected: the panel reports the failed load.
3. Expected: the previous successful projection is not silently restored unless the user releases/closes the target.

## Skip-Then-Stop Leaves No Stray Failed Marker (#447)

1. Load a parseable image URL and lock a numeric parsed field into the trail.
2. Set up the neighbors in one direction so a short run of them fails to load (a "dead run").
3. Press Next (or Prev / arrow) so parsed-field navigation steps into that direction.
4. Expected: the panel skips the failed candidates ("Skipped a failed image candidate." /
   "Stopped after skipping N unavailable images…") and comes to rest on the last **successfully**
   loaded value.
5. Expected: the field shows its last-good value with **no** red failed-field outline — the
   transient quiet-skip failure marker is reconciled when the navigation drain stops, not stranded.
6. Expected: the next press bases navigation from the last-good URL, not the failed candidate draft.
7. Note: a single per-field +/- step into a failure still shows the failed marker (that value is the
   one the user asked for); only the skip-to-next-good traversal reconciles a non-landed marker.

## Failure Feedback Mode: Alert / Display / Mute (#450)

Settings → Automation → Preload has a **Failure feedback** control governing how loudly a parsed-field
image-load failure surfaces. It applies to ALL load failures — next/prev/arrow traversal AND direct
per-field +/- or URL-editor applies.

1. Set Failure feedback to **Alert**. Apply an unavailable URL (or step into a dead neighbor).
2. Expected: the red field ring appears AND the status shows the error (e.g. HTTP 404); traversal
   also toasts "Skipped a failed image candidate." per skip.
3. Set Failure feedback to **Display**. Repeat.
4. Expected: the red field ring appears, but there is no error status/toast; a traversal ring is
   cleared when the drain comes to rest (per #447).
5. Set Failure feedback to **Mute** (the default). Repeat.
6. Expected: nothing visible — no red ring, no error status, no skip toast.
7. Expected in every mode: the failure is still captured under the hood — it is written to the saved
   URL review status (exportable as `failed`) and logged — and it still drives skip-to-next-good
   navigation. `failedFieldId` stays set internally (it re-bases the next step off the last-good URL);
   the mode gates only the visible ring and the toast/status error, never the underlying behavior.

## Projection Loop Guard

1. Trigger repeated projection of the same source into the same host image, or simulate a host-image ownership loop.
2. Expected: the projection owner stops repeated requests after the guard threshold.
3. Expected: the browser console includes a warning with the blocked projection request details.
4. Expected: the panel does not continue applying the same projection indefinitely.

## Release And Close

1. Project a different URL into the selected host image.
2. Release the target or close/destroy the panel.
3. Expected: the original host-page image snapshot is restored.
4. Expected: pin, capture, queue, Recall, and Recents persistence behavior is unchanged.
