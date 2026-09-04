# Extension-page destinations

Tracking: [#518](https://github.com/qwts/image-trail/issues/518). React boundary: [ADR-0002](adr/0002-react-ui-renderer-boundary.md).

Image Trail exposes Dashboard, Gallery, Recall, and Settings as real `chrome-extension://` pages. The shared production React shell is adapted from the handoff UI kit, but the prototype's globals, `localStorage`, shared mock session, and simulated browser chrome are not production dependencies.

## Ownership contract

| Destination | Durable or extension-owned state                                                            | Local page state                                                      | Source-tab-bound or unavailable                                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard   | Exact durable queue total plus a bounded 200-record pin/bookmark count snapshot             | loading, error, reload                                                | Target, Trail, Field Editor, and Controls are not cloned; the page says they remain in the source panel                                                             |
| Gallery     | Existing bookmark, album, encrypted-preview, and local-settings message-backed repositories | search draft, selected album, paging, open album menus, loading/error | Record activation opens a URL or requests an original preview; no source panel state is copied                                                                      |
| Recall      | Global durable queue producer from the current visible-pin offset, in pages of at most 100  | selected IDs, appended pages, loading/error/message                   | Recents and encrypted blob storage are never Recall inputs                                                                                                          |
| Settings    | Extension-owned local settings and build identity                                           | open groups, form drafts, loading/error/message                       | Active CryptoKey setup/unlock/backup, file-context actions, keybindings tracked by #519, and page-URL workspace reset remain source-bound or explicitly unavailable |

The Dashboard React state contains counts only, not record metadata. Recall display records are masked before presentation when privacy mode is on or a record is locked. Settings save through the existing validated runtime-message path.

## Routes and source tabs

- The canonical destination registry owns IDs, labels, glyphs, descriptions, paths, and query parsing.
- Dashboard, Recall, and Settings use `src/destinations/view.html?view=<id>`. Gallery keeps `src/gallery/gallery.html?view=gallery`.
- A modifier-click or explicit open-in-tab action may append `sourceTab=<numeric id>` when the request came from a supported HTTP(S) tab.
- Direct navigation is valid without a source and renders `Durable-only view`.
- A bound page can prove only that the source tab still exists and is a supported HTTP(S) page. It says `Source tab available`, not that the injected panel is still mounted.
- Return focuses that tab and its browser window. It does not proxy panel actions or recreate `PanelState`.
- Navigation inside the same supported source tab preserves the binding. Closing it, navigating it to an unsupported URL, or making it inaccessible changes the destination to `Source tab unavailable`; the return action disables.
- Duplicate destination tabs preserve the explicit source ID in their URL. Pages opened from different source tabs remain independently bound.
- Source status refreshes on mount, focus, visibility, and a bounded two-second poll; cleanup invalidates pending responses and removes every listener/timer.

## Refresh and failure behavior

- Dashboard, Recall, and Gallery subscribe to durable library notifications. Settings subscribes to its extension-owned storage record.
- Async generations suppress stale results after refresh, storage notification, rapid reload, or unmount.
- Page refresh and extension reload reconstruct state from repositories; no view state is persisted to host-page storage.
- Duplicate tabs are independent readers/writers over the same durable repositories. Settings updates and durable mutations propagate through existing notifications.
- Recall filters selections that disappear after a refresh, refills its fixed offscreen window after a move-to-front, and never adds the recalled record to Recents.
- Gallery tolerates records deleted between pages through its existing refresh and empty-state paths. Viewing, search, album membership, and paging do not update `queueUpdatedAt`.
- Dashboard and Recall expose reload actions after errors. Settings exposes Retry when its initial load fails. Gallery retains its existing Reload path.
- Dashboard reads at most 200 records and reports truncation; Recall reads at most 100 per page. Gallery obeys the existing user-configured Gallery page limit, including the explicit `0 = unlimited` option.

## Locked and private state

- No route, source-status response, title, or return control exposes a source URL.
- Dashboard renders aggregate counts only.
- Recall replaces URL-derived name, source, metadata, thumbnail, title, and accessible copy with generic private values when masked or locked. Stored-original state remains a separate indicator.
- Gallery retains the independent locked/private record contract and requests original bytes only after explicit activation.
- Settings describes active-key work as unavailable outside the source panel and never serializes a session-only `CryptoKey` into page state.

## Acceptance evidence

- Unit/controller: destination registry, query parsing, validated messages, source binding/focus/close, and sender context.
- DOM: accessible shell, source states, stale-response suppression, aggregate Dashboard, private Recall selection, Settings persistence and retry.
- Storybook: Dashboard; interactive/private/empty Recall; Settings; loading, Dashboard and Settings errors; narrow and reduced-motion states.
- Playwright: real packaged pages, shared navigation, durable Gallery, Recents exclusion, Recall move-to-front, Settings reload/duplicate persistence, source return/close, fixed 924x540 artifacts, and horizontal containment.
- `tests/e2e/coverage-map.json` owns the automated/manual matrix. `tests/e2e/visual-acceptance.json` maps the real-page shell and destination artifacts to #518.

Manual release smoke: open all four pages through the packaged panel at 924x540 and 360x740; compare with the handoff; verify real browser chrome only, source return/closed states, keyboard focus, private and locked records, reload and duplicate tabs, reduced motion, no horizontal overflow, and no failed stylesheet requests.
