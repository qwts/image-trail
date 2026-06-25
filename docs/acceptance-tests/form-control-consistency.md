# Form Control Consistency

Purpose: verify that Image Trail form controls feel like one system across URL editing, parsed fields, Settings, import/export, and compact target controls.

## Product Rules

- Text inputs, numeric inputs, password inputs, textareas, selects, file pickers, checkboxes, and compact fit controls should have consistent sizing, borders, focus states, disabled states, and wrapping behavior.
- Settings selects must use the shared settings select treatment, including Recents overflow and URL template/grab strategy selects.
- Settings textareas should use the same input surface and focus treatment as other editable controls.
- File picker buttons should expose keyboard focus through the visible picker button while the native file input stays visually hidden.
- Checkbox/toggle controls should keep visible checked and keyboard-focus states without changing their dispatch behavior.
- Privacy mode must not place sensitive URL, field, or metadata values in visible form values or placeholders.

## Manual Scenario

1. Open Image Trail and select a host image.
2. Focus the URL editor textarea.
3. Verify it uses the same focus outline and border color as parsed-field inputs.
4. Open Parsed fields and focus a field input, digit-width input, and split-pattern input.
5. Verify each input keeps text inside its box, shows a consistent focus state, and does not shift adjacent field controls.
6. Open Settings.
7. Focus `Visible pins`, Recents `Visible recents`, Recents `Overflow`, URL review status `Max records per site`, URL template `Match`, and grab strategy controls.
8. Verify settings inputs/selects share the same border, sizing, focus state, and disabled treatment.
9. For a linked-page grab strategy, focus the image extractor textarea.
10. Verify the textarea uses the same input surface and focus state while still allowing vertical resize.
11. Focus an import/export file picker through keyboard navigation.
12. Verify the visible picker button shows the focus state, not a hidden 1px input.
13. Enable Privacy mode.
14. Verify URL editor and parsed-field controls show private placeholders/values only, with no original URL or field values visible in form values, placeholders, or titles.

## Expected Result

- Form controls look and focus consistently across the panel.
- Compact controls fit at the current panel width without clipping labels or values.
- Existing settings, URL edits, field edits, imports, exports, and privacy-mode behavior remain unchanged.
