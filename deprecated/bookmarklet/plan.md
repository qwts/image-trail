## Bookmarklet Plan

### 1. Core approach

Build a **single generic URL-token editor bookmarklet**, not a growing pile of hardcoded regex matchers.

The bookmarklet will:

1. Find the best image URL from the current page.
2. Parse it into editable URL parts.
3. Render a transparent control panel on the left side.
4. Let you mutate any numeric/hex segment with +/- controls.
5. Update the `<img>` source immediately.
6. Optionally update the browser location bar using `history.pushState()` when allowed.
7. Auto-skip 404s in the selected direction.
8. Persist state/history in `localStorage`.

---

## 2. URL source selection

The bookmarklet should extract candidate URLs from:

1. `location.href`
2. Largest visible `<img>`
3. `<img src>`
4. `<img currentSrc>`
5. `<img data-src>`
6. `<source srcset>` inside `<picture>`
7. Optional manually entered full URL from the panel text field

Selection priority:

```text
manual full URL field
→ largest image currentSrc/src
→ location.href
```

The full URL field remains editable at all times.

---

## 3. URL normalization

The script needs to handle both normal and encoded paths.

Examples:

```text
/videos_screenshots/149000/149192/preview.jpg
%2Fvideos_screenshots%2F86000%2F86177%2Fpreview.jpg
images/pinporn/2023/03/24/29117305.jpg
contents/albums/sources/1000/1204/51315.jpg
%2Fattachments%2Fdbl-les-0084-005-v-jpg.792350%2F&amp;f=1&amp;nofb=1&amp;ipt=
/14208967/1920/1080/8.jpg
```

Normalization rules:

```text
&amp; → &
%2F / %252F preserved where possible
relative URLs resolved against location.href
domain extracted when URL has one
path extracted even when path is encoded inside query-like content
query fields parsed where possible
```

Important: the script should preserve the original encoding style when rebuilding the URL. For example, an encoded slash URL should stay encoded rather than becoming a normal slash URL unless unavoidable.

---

## 4. Parsed URL model

Internally represent the URL as editable tokens.

### URL-level fields

```text
protocol
domain
path
query
hash
```

### Path segment fields

Each path segment becomes a row:

```text
segment index
segment raw value
segment decoded display value
numeric type: none | int | hex
format width
editable text field
+ / - buttons when numeric or hex
```

Example:

```text
/videos_screenshots/149000/149192/preview.jpg
```

Panel rows:

```text
videos_screenshots
149000       int, width 6
149192       int, width 6
preview.jpg  filename
```

---

## 5. Filename parsing

The filename should be further parsed into subfields.

Examples:

### `/29117305.jpg`

```text
filename number: 29117305
extension: jpg
```

### `/1947423_03250_3.jpg`

```text
field A: 1947423
field B: 03250
field C: 3
extension: jpg
```

### `dbl-les-0084-005-v-jpg.792350`

```text
text: dbl-les-
field: 0084
separator: -
field: 005
text: -v-jpg.
field: 792350
```

### `/14208967/1920/1080/8.jpg`

```text
path field: 14208967
path field: 1920
path field: 1080
filename field: 8
extension: jpg
```

The bookmarklet should not need a hardcoded matcher for each shape. It should tokenize any filename into alternating text and numeric/hex fields.

---

## 6. Numeric detection

A token is numeric when it matches:

```text
decimal integer: 00001, 149192, 29117305
hex integer: 2f6, 0AF3, deadbeef
```

Detection rules:

```text
decimal preferred unless letters A-F/a-f are present
preserve leading zeros
preserve original width by default
allow width override per field
```

Examples:

```text
03250 + 1 → 03251
00001 + 1 → 00002
999 + 1   → 1000
```

For hex:

```text
2f6 + 1 → 2f7
2ff + 1 → 300
```

---

## 7. Field controls

Each editable field row should contain:

```text
label
text field
minus button
plus button
width field
type indicator: text / int / hex
active toggle or select button
```

For non-numeric text fields:

```text
editable field only
no +/- controls
```

For numeric fields:

```text
- button decrements by global step
+ button increments by global step
width controls zero-padding
```

---

## 8. Active field behavior

There should be one active numeric field at a time.

Keyboard controls operate on the active field:

```text
Left Arrow  → decrement active field
Right Arrow → increment active field
Space       → move in current direction
Down / d    → download current image
A/B/etc.    → optional quick-select for detected numeric fields
```

When a user clicks inside a field or clicks its row, that field becomes active.

The panel should visibly indicate active field.

---

## 9. Direction and step settings

Panel settings:

```text
Direction: up / down
Step: text field, default 1
```

Behavior:

```text
up   = +step
down = -step
```

Keyboard:

```text
Right Arrow forces one up move
Left Arrow forces one down move
Space uses selected direction
```

---

## 10. Image update behavior

When URL changes:

1. Remove `srcset` and `sizes` from target image.
2. Remove `srcset` and `sizes` from parent `<picture><source>` elements.
3. Set `img.src`.
4. Set `img.setAttribute("src", url)`.
5. Update full URL field.
6. Update status line.
7. Save current state.
8. Add previous URL to history.

---

## 11. Browser location bar update

Requirement:

```text
full url [textfield] - on update changes image and update location bar without changing page if possible
```

Feasibility:

```text
history.pushState() can update the location bar without reload only for same-origin URLs.
```

So behavior should be:

```text
same-origin URL:
  update location bar using history.pushState()

cross-origin URL:
  do not pushState
  update the panel URL field only
  show status: "location bar not changed: cross-origin"
```

This avoids breaking the page.

---

## 12. Image/page styling

Panel settings:

```text
Page background color
Image object-fit
Image width
Image height
```

Defaults:

```text
html background: #000
body background: #000
image background: #000
image width: 100%
image height: 100%
object-fit: contain
body margin: 0
body overflow: hidden
```

Object-fit options:

```text
contain
cover
fill
scale-down
none
```

The image should be made the primary visible item on the page, but the bookmarklet should avoid destructively removing the original DOM. It should restyle the chosen image and optionally hide overflow.

---

## 13. Left-side transparent panel

Panel placement:

```text
position: fixed
left: 0
top: 0
bottom: 0
width: around 360px
background: rgba(0,0,0,0.72)
color: white
z-index: maximum practical value
overflow-y: auto
```

Panel sections:

```text
Title / image name
Status
Full URL field
Domain field
Path segment editor
Filename field editor
Query field editor
Settings
History
Buttons
```

Buttons:

```text
Apply URL
Back
Forward
Download
Auto
Stop
Save State
Clear History
Close Panel
```

---

## 14. Title / image name

Display title should be derived from:

```text
document.title if useful
filename if available
URL hostname fallback
```

Preferred order:

```text
filename
document.title
domain
```

---

## 15. Query field parsing

For query strings like:

```text
?f=1&nofb=1&ipt=
```

Panel rows:

```text
f     = 1
nofb  = 1
ipt   =
```

Each value is editable.

Numeric query values get +/- controls.

The script should preserve blank values.

---

## 16. Encoded HTML entity handling

For URLs containing:

```text
&amp;
```

Panel should display editable `&`, but when writing back to `img.src`, it should produce a valid browser URL.

The script should avoid double-encoding:

```text
%2F should not become %252F unless it was already %252F
&amp; should not remain literal &amp; inside img.src
```

---

## 17. Auto mode / 404 traversal

Auto mode settings:

```text
Auto mode: on/off
Auto count: max attempts
Auto delay: short delay, default around 250–350ms
Direction: up/down
Step: current global step
```

Behavior:

1. Apply next URL.
2. Wait for `img.onload` or `img.onerror`.
3. If load succeeds:

   - stop auto traversal
   - update status

4. If 404/error:

   - decrement remaining count
   - continue in selected direction

5. If count reaches zero:

   - stop
   - show status

Space should stop or toggle auto mode depending on current state.

Preferred behavior:

```text
Space while idle: move once in selected direction
Space during auto mode: stop auto mode
```

This is cleaner than toggling a hidden mode accidentally.

---

## 18. Download behavior

Download button and Down/d key:

```text
download current image URL
filename from URL path
fallback filename: image
```

Optional later enhancement:

```text
auto-download every successfully loaded image during auto mode
```

Initial implementation should include:

```text
manual download
auto-download toggle
```

When auto-download is enabled:

```text
on successful image load → download image
```

---

## 19. Local storage state

Persist under one namespaced key:

```text
__url_image_navigator_state_v1
```

State contents:

```text
lastUrl
lastDomain
activeFieldId
direction
step
autoCount
autoDelay
autoDownload
pageBackground
imageObjectFit
imageWidth
imageHeight
history
```

History should store objects:

```text
url
timestamp
title
```

History limit:

```text
50 or 100 entries
```

Deduplicate by URL.

---

## 20. History UI

Panel history section:

```text
recent URLs list
click to load URL
small remove button per item
clear history button
```

When a URL is loaded from history:

1. Set full URL field.
2. Re-parse fields.
3. Apply to image.
4. Update location bar if same-origin.

---

## 21. Main keyboard behavior

Global keys should work only when the focused element is **not** an input/text field.

When focus is inside an editable field:

```text
normal typing/editing must work
Enter applies the edited field
Escape blurs the field
```

When focus is outside editable fields:

```text
Left Arrow  → decrement active field
Right Arrow → increment active field
Space       → move selected direction / stop auto
Down        → download
d           → download
a/b/c/etc.  → optional select numeric field by index
```

This avoids breaking text editing.

---

## 22. URL rebuild strategy

Every editable value should map back to its exact position in the URL model.

Do not rely on global replacement of repeated numbers because this can mutate the wrong field.

Correct approach:

```text
parse URL into ordered parts
edit part by part
rebuild from parts
```

This prevents bugs where changing `1080` might accidentally change another `1080`.

---

## 23. Matcher strategy

Use generic tokenization first. Keep legacy matcher knowledge only as comments/examples.

Generic detection covers these existing patterns:

```text
/videos_screenshots/149000/149192/preview.jpg
%2Fvideos_screenshots%2F86000%2F86177%2Fpreview.jpg
images/pinporn/2023/03/24/29117305.jpg
contents/albums/sources/1000/1204/51315.jpg
%2Fattachments%2Fdbl-les-0084-005-v-jpg.792350%2F&f=1&nofb=1&ipt=
/14208967/1920/1080/8.jpg
/1947423_03250_3.jpg
/2264/preview.jpg
```

Legacy matcher comments can remain in the script for reference, but runtime should prefer generic fields.

---

## 24. Error/status handling

Status line should show:

```text
loaded
404 / image error
auto stopped
field updated
URL applied
same-origin location updated
cross-origin location not updated
no image found
invalid URL
```

Console should log structured-ish messages:

```text
[img-nav] parsed
[img-nav] updated
[img-nav] 404
[img-nav] auto stop
[img-nav] download
```

---

## 25. Implementation order

### Phase 1: Basic shell

Build bookmarklet wrapper, panel, image selection, state load/save.

### Phase 2: URL parser

Parse full URL into:

```text
domain
path segments
filename tokens
query fields
hash
```

Handle encoded slash paths.

### Phase 3: Field editor

Render editable fields, active field selection, numeric detection, width preservation.

### Phase 4: URL rebuild/apply

Rebuild URL from current field model and apply to image.

### Phase 5: Navigation

Implement:

```text
direction
step
left/right
space
+/- controls
```

### Phase 6: 404 auto mode

Implement `onload`, `onerror`, auto-count, stop behavior.

### Phase 7: Download/history/localStorage

Add download button, history list, state persistence.

### Phase 8: Styling controls

Add object-fit/background/size controls.

---

## 26. Acceptance checklist

The bookmarklet is acceptable when it can do all of this:

```text
Loads as a bookmarklet
Finds main image
Displays left transparent panel
Shows full URL
Shows domain
Shows path segments
Shows filename token fields
Shows query fields
Lets fields be edited manually
Detects decimal integer fields
Detects hex fields
Preserves zero padding
Allows width override
Lets user select active field
Back/Forward mutate active field
Direction and step work
Space moves in selected direction when idle
Space stops auto mode when running
Down and d download
Image is 100% width/height
Image uses object-fit contain by default
html/body/image backgrounds are black by default
Can change object-fit
Can change background color
Updates image src without navigating page
Updates location bar only when same-origin
Auto-skips 404s
Stops auto after count
Stores state in localStorage
Stores URL history
Can reload URL from history
Handles encoded slash paths
Handles normal slash paths
Handles jpg/jpeg/png/webp
```

---

## 27. Deliberate constraints

I will not build this as many one-off regex branches. That approach already caused fragility.

The better design is:

```text
URL → parser → editable token model → rebuild URL
```

Regex remains useful for token detection, but not as the primary architecture.
