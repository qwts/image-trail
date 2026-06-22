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

## Manual Acceptance

1. Open a page with a selected image URL that has parsed numeric or hex query fields.
2. Use the field parser increment/decrement controls until a changed image loads successfully.
3. Include one or more successful fields for Previous/Next.
4. Open Settings.
5. Confirm a URL template appears for the current hostname with included-field placeholders.
6. Change the active template's included-field checkboxes and confirm the templated URL updates without clearing the template.
7. Change the template match mode and toggle Hide excluded fields.
8. Confirm the settings persist after closing/reopening the panel on the same hostname, and Previous/Next uses the restored included fields.
9. Clear the template.
10. Confirm it disappears from Settings and hidden fields are no longer hidden by that template.
