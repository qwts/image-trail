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
- Reloading or reopening the panel on the same hostname restores the active template's included fields for Previous/Next navigation.
- Settings must allow the active template's included fields to be reviewed and changed without clearing the template.
- If a template is configured to hide excluded fields, the panel field list should show only the template's included fields while preserving a settings path to change or clear the template.
- Parsed-field work-in-progress state is stored as extension-owned metadata for the current hostname/page and selected image context. It may restore active, successful, unchanged, failed, included/excluded, split-field, and draft URL state after panel close, extension reload, or page recovery.
- Numeric parsed fields infer padding only from leading zeroes by default. For example, `001` increments to `002`, but `1000` decrements to `999`.
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
17. Clear the template.
18. Confirm it disappears from Settings and hidden fields are no longer hidden by that template.
