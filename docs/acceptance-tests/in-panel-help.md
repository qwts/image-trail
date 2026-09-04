# In-Panel Help

Acceptance coverage for the in-panel Help surface (issue #352).

## Behavior Rules

- A `?` toggle in the panel header opens and closes the Help section; it works
  like the Settings gear (state-backed, `aria-pressed`, no focus trap).
- Help renders the keyboard shortcut reference from the SAME shared registry
  the keyboard router and Settings use (`core/keyboard-shortcuts.ts`), so
  bindings and Help copy cannot drift; browser extension commands are
  distinguished from panel/page shortcuts.
- Help includes a concise static feature guide for the major panel areas:
  host target, URL editor, parsed fields, Recents, Queue, captured originals,
  import/export/backup, automation, and Settings.
- Help content is static copy only — no URLs, record labels, or
  captured-original details may appear, so privacy mode needs no special
  handling in Help.
- The attached Help section is a layout-reserved scroll region (same pattern
  as Settings, #367): opening it must not move controls out from under the
  pointer, and its internal scrolling keeps it from fighting the queue for
  space. It participates in the render scroll snapshot.
- Help is a registry section, so it is detachable into a floating window like
  the other sections.

## Steps

1. Open the panel, click the `?` header button.
2. Verify Browser shortcuts, Panel shortcuts, and the Feature guide render.
3. Navigate the section with keyboard (Tab/arrows) and confirm focus is never
   trapped; existing shortcuts still route.
4. Click `?` again and verify the section closes.

## Expected Result

- Help opens/closes from the header toggle; shortcut lists match the active
  bindings; no dynamic values appear; layout below Help does not shift while
  interacting inside it.
