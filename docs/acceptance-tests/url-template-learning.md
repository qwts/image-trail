# URL Template Learning

## Product Rules

- URL templates are learned from the field parser when included fields drive successful image URL changes.
- Included fields become readable template placeholders such as `{query-page}`.
- Templates are stored as extension-owned metadata keyed by hostname.
- Field split patterns are target/session scoped in this slice and must not be stored inside durable URL template records.
- Template matching uses explicit match modes, not an opaque confidence score:
  - Exact page shape is the conservative default.
  - Same path/query shape can apply to URLs with the same structural field layout.
  - Broad site match applies to the hostname only.
- Settings must show learned templates for the current hostname and allow users to clear them.
- Settings may offer up to four deduplicated stepping presets derived from the current URL: numbered filename, gallery path, gallery query, and all detected numeric fields.
- A preset must show its exact structural field labels before save, exclude session-only split child fields, and persist as an ordinary URL template rather than a second settings format.
- Saving a preset must not navigate or make an image request. Later Previous/Next use remains subject to the request governor and neighbor preload behavior.
- Numeric and hex path fields, including numbered filenames, use the same governed Previous/Next navigation pipeline as numeric and hex query fields.
- Reloading or reopening the panel on the same hostname restores the active template's included fields for Previous/Next navigation.
- Settings must allow the active template's included fields to be reviewed and changed without clearing the template.
- If a template is configured to hide excluded fields, the panel field list should show only the template's included fields while preserving a settings path to change or clear the template.
- Parsed-field work-in-progress state is stored as extension-owned metadata for the current hostname/page and selected image context. It may restore active, successful, unchanged, failed, included/excluded, split-field, and draft URL state after panel close, extension reload, or page recovery.
- Numeric parsed fields infer padding only from leading zeroes by default. For example, `001` increments to `002`, but `1000` decrements to `999`.
- Parsed fields accept empty values and delimiter-like input (`/`, `?`, `&`, `=`, `#`, and encoded spellings), including fields currently parsed as numeric. Raw delimiters are substituted into the projected URL as structure, encoded spellings remain encoded, and the reparsed projected URL is authoritative even when token kinds, field ids, or field rows change.
- Numeric edits that are neither valid numbers nor empty/delimiter-changing commits are rejected, restore the visible canonical value, and show bounded feedback that does not include the attempted value.
- A split-child value edit is accepted only when rebuilding and reparsing leaves its active split specification valid. An edit that changes the base token length or tokenization enough to invalidate the split is rejected and restored with bounded privacy-safe feedback.
- Parsed-field editing captures a session baseline before the first transform. **Reset structure** appears when parsed topology differs from that baseline; it restores the exact baseline URL without saving a template, preserves current active/include/exclude/digit-width/split settings that remain valid, prunes invalid settings, and keeps **Reset all** available to restore the complete original field-state snapshot.
- Users can set an explicit digit width for a parsed numeric field. Explicit widths are field-scoped parsed-field metadata, survive panel close/reopen for the same selected image context, and are not stored in Recents, pins/bookmarks, or originals.
- Parsed query field step controls must not shift when a field becomes includable or included; repeated `-`/`+` clicks must not turn into an accidental Include/Exclude click.
- Parsed-field resume state is not Recents, is not a pin/bookmark, and must not write to host-page `localStorage`.

## Manual Acceptance

1. Open a page with a selected image URL that has parsed numeric or hex query fields.
2. Use the field parser increment/decrement controls until a changed image loads successfully.
3. Include one or more successful fields for Previous/Next.
4. Open Settings.
5. Confirm a URL template appears for the current hostname with included-field placeholders.
6. Change the active template's included-field checkboxes and confirm the templated URL updates without clearing the template.
7. Change the template match mode and toggle Hide excluded fields.
8. Confirm the settings persist after closing/reopening the panel on the same hostname, and Previous/Next uses the restored included fields.
9. Create parsed-field work-in-progress state by activating a field, applying a split pattern, and attempting a URL that fails or does not change the image.
10. Close/reopen the panel, or reload the extension on the same page.
11. Confirm the active field, split fields, included/excluded choices, failed or unchanged markers, and draft URL return for the same selected image context.
12. Select or enter a URL containing a naturally unpadded number such as `image-1000.jpg`; decrement it and confirm the result is `image-999.jpg`, not `image-0999.jpg`.
13. Select or enter a URL containing a padded number such as `image-001.jpg`; increment it and confirm the result is `image-002.jpg`.
14. Set an explicit digit width such as `5` for a numeric field whose value is `999`; confirm the URL uses `00999`, close/reopen the panel, and confirm the width returns for the same selected image context.
15. Navigate to a different selected image URL on the same page.
16. Confirm stale parsed-field markers and digit-width overrides do not apply to the different image.
17. Clear a parsed text query value and confirm the projected URL retains the query container (for example, `key=`) while the reparsed field list becomes authoritative.
18. Clear a whole parsed text path segment and confirm the projected URL and field list reflect the removed segment.
19. Change a parsed numeric path field from `400` to `400/53`; confirm the projected URL contains two path segments and the Parsed fields rows immediately reflect both reparsed tokens. Repeat raw `?`, `&`, `=`, and `#` commits in applicable path/query fields, then confirm encoded spellings remain encoded.
20. Clear numeric and text fields; confirm each empty commit projects and the reparsed field rows match the resulting URL. Enter nonnumeric text without a delimiter in a numeric display and confirm its canonical value returns with a bounded error that does not echo the attempted value.
21. Apply a split, edit one child without invalidating the split, and confirm it remains split. Then clear or lengthen a child and confirm the edit is rejected, the value returns, and the split remains.
22. After an accepted edit changes parsed topology, confirm **Reset structure** appears beside **Reset all**. Change valid Include/Exclude or digit-width state, choose **Reset structure**, and confirm the baseline URL returns while valid current settings remain and invalid settings are pruned.
23. Confirm **Reset all** remains available and restores the original field-state snapshot.
24. Repeat rejected numeric and split edits in privacy mode; confirm labels, titles, and feedback expose no field values.
25. With a URL containing numeric filename, path, or query fields, open Settings and review Stepping presets.
26. Confirm no more than four deduplicated presets appear, each lists the exact field labels it will include, and split child fields are not offered.
27. Save one preset and confirm a normal URL template becomes active with precisely those included fields, without changing the selected image or issuing navigation.
28. Use Previous/Next and confirm the saved preset steps through the existing throttled and preloaded navigation path.
29. Clear the template.
30. Confirm it disappears from Settings and hidden fields are no longer hidden by that template.
