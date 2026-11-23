# Kintsugi — UX & UI Guidelines

Companion to the [design system](./01-design-system.md). This document covers
how the screens work, what the flows feel like, and the rules that apply
across surfaces.

The screen-by-screen specifications — every wireframe, every measurement —
are in [03-screen-designs.md](./03-screen-designs.md).

---

## 1. Surfaces

The extension has **four** surfaces, not ten. The original had ten mutually
toggling `<section>` elements inside one document, which is why nothing had a
clear identity.

| Surface | Surface | Purpose |
|---|---|---|
| **Workbench** | A tab (`moz-extension://…/workbench.html`) | The main tool. Everything happens here. |
| **Popup** | The toolbar popup | A *launcher*, not the tool. Shows the current page's story and one big button. |
| **Options** | A tab (`moz-extension://…/options.html`) | Settings, library, reading list. |
| **First-run** | A tab | A 3-step introduction, shown once. |

### 1.1 Why the workbench is a tab, not the popup

The original declared `default_popup: popup.html` and then, at runtime,
detected that it was a popup and **re-opened itself in a tab**, closing the
popup. The user saw the popup flash and vanish. This is not a design detail;
it is the original's central architectural constraint.

The cause is real: **the browser kills a popup when it loses focus**, so a
30-minute download cannot live in one. The fix is architectural, not visual —
see [ADR-0005](../decisions/ADR-0005-background-worker.md). With a background
service worker owning the download, the *popup* can stay a popup for the
short interactions it is good at, and the *workbench* can be a tab for the
long ones.

**New behaviour:** clicking the toolbar icon opens the workbench in a tab
**directly** (no popup flash). If the workbench is already open for that
story, it focuses the existing tab. A small, optional popup remains
available for "add this page to my library" one-liners.

### 1.2 The popup, redesigned

```
┌────────────────────────────────┐
│  ◆ Kintsugi                   │
│                                │
│  ┌──────────────────────────┐  │
│  │  [cover]  The Wandering  │  │
│  │  84×120   Inn           │  │
│  │           innkeeper      │  │
│  │           318 chapters   │  │
│  └──────────────────────────┘  │
│                                │
│  [      Open workbench      ]  │
│                                │
│  ⤓ Add to library              │
└────────────────────────────────┘
```

- One card. One primary button.
- The card shows what the extension detected, so the user can sanity-check
  before committing.
- "Add to library" is a ghost action — it is for the impatient collector who
  does not want to review anything.

---

## 2. The workbench

### 2.1 Layout

```
┌───────────────────────────────────────────────────────────────────────┐
│ ◆ Kintsugi   The Wandering Inn · innkeeper      [ ⤓ Save ]  [ Pack ▸] │  ← app bar
├───────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────┐  ┌──────────────────────────────────────┐  │
│ │ STORY DETAILS    4   │  │ CHAPTERS                  318 found  │  │
│ │ Title                │  │ ┌──────────────────────────────────┐  │  │
│ │ [The Wandering Inn  ]│  │ │ ☐ ◔ 1. The Wandering Inn         │  │  │
│ │ Author               │  │ │ ☑ ◔ 2. Lily in the Woods        │  │  │
│ │ [innkeeper         ] │  │ │ ☑ ◑ 3. The Girl in the Woods     │  │  │
│ │ Language             │  │ │ ☐ ○ 4. Bits and Pieces           │  │  │
│ │ [English          ▾] │  │ │ …                              │  │  │
│ │                      │  │ └──────────────────────────────────┘  │  │
│ │ COVER            ▸   │  │  [All] [None] [Invert]  [Filters]    │  │
│ │ ▸                   │  │                                      │  │
│ │ OPTIONS         ▸   │  │                                      │  │
│ └──────────────────────┘  └──────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────────┤
│ ⣾ Fetching chapters   42 / 318   ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  13%    │  ← status bar
└───────────────────────────────────────────────────────────────────────┘
```

At **< 960 px** the two columns stack: the sidebar becomes a single column
above the chapter list, and the panels become collapsible accordions.

### 2.2 The app bar

- **Left:** the product mark, then the story title (truncated) and author.
  This is *live* — it reflects what the extension detected, and it updates
  when the user edits the title.
- **Right:** the **Pack EPUB** button. Always visible. Always the same size.
  This is the answer to the original's core UX failure, where the primary
  action was 13 rows down and looked like every other button.
- **Behaviour:** the Pack button is **disabled with an inline explanation**
  when there is nothing to pack (no chapters selected, or still loading), not
  silently inert. The reason appears in a tooltip on the disabled button.
  The original disabled it only during work, with no reason given.

### 2.3 Story details panel

Four fields: Title, Author, Language, Filename. Anything else is in
Advanced.

- The title field shows a **confidence hint**: if the site provides a title,
  it is pre-filled and marked as auto-detected (a small dot + tooltip). If the
  user edits it, the marker clears. This makes the difference between "the
  extension guessed" and "you typed this" legible.
- **Language** is a `<select>` of common languages, not a free-text field.
  The original's free-text language field meant most users left it as the
  parser's guess and never validated it; a select makes the common case one
  click and the uncommon case a typeahead.
- **Filename** is derived from the title but editable, with the extension
  applied. A `Reset` affordance restores the derived value.

### 2.4 Chapters panel — the core of the product

**Header row** (left to right): a tri-state **select-all** checkbox, the
word "Chapters", the count, and the range control.

**Range control.** The original had two separate "First Chapter" / "Last
Chapter" `<select>` dropdowns, which did not reveal that they were a *range*.
The new control is a **paired range selector**: two dropdowns joined by a
visual connector, with a live summary "Chapters 1–318 of 318". It also
supports typing a number.

**Bulk actions:** `All` · `None` · `Invert` · `Ranges…` · `Filters`.
`Ranges…` opens a small dialog where the user can define named ranges
("Volume 1", "Arc 2") — the feature the original's `alert()`-taught
shift-click gesture was gesturing at, but done properly.

**The list.** Virtualised, one row per chapter:

```
[☐] [◔] Chapter title                                        [12 KB]
```

- `◔` = queued, `◑` = fetching, `●` = loaded, `○` = not started,
  `✓` = already downloaded, `!` = failed.
- Every state has a **distinct shape**, so the list is readable without
  colour.
- The state icon is `aria-hidden`; the row's accessible name includes the
  state as text ("Chapter 12, loaded").
- The title is truncated with an ellipsis; the full title is in a tooltip and
  in the accessible name.
- **Double-click the title to edit it.** The original put an `<input>` in
  every row permanently, which made the list look like a spreadsheet and
  made 400 chapters 400 form controls.

**Filters.** The original's filter sidebar was a fixed 30 %-width overlay
with a regex built from raw user input (which could throw, and which had no
keyboard path). The new filters live in a **popover** anchored to the
toolbar, with:
- plain substring matching by default (safe, no regex),
- an opt-in "regular expression" mode that **validates the pattern and shows
  the error inline** instead of throwing,
- include/exclude chips with a proper tri-state,
- a live count of how many chapters match.

**Empty state.** When the parser finds nothing (or the page was not a
chapter list), the panel shows a designed `<k-empty>`: "No chapters found on
this page", an explanation, and two actions — **Try the default parser** and
**Open the selector builder**. The original just showed an empty table.

**Loading state.** While the TOC is being crawled, a skeleton of ~12 rows
plus a live "Searching for URLs… N found" line. The original showed a static
text div and dimmed rows.

### 2.5 Cover panel

- The cover preview is a **fixed 84×120 frame** (the standard EPUB cover
  ratio, 1:1.414), so the user sees the real proportion instead of an
  arbitrarily sized thumbnail.
- The URL field sits directly under the preview, labelled "Cover image URL".
- If the page had images, a **"Choose from page"** button opens a grid of
  thumbnails in a dialog. Each thumbnail is a real button with an accessible
  name.
- The original's cover thumbnail was `position: absolute` and out of flow,
  with an empty `<td>` next to it.

### 2.6 Options panel

Grouped and collapsible, per §6 of the design system. Two groups are
always available on the workbench without opening the options page:
**Include author notes** and **Include the TOC page as a chapter**, because
these are per-story decisions that users toggle often.

### 2.7 Status bar

The bottom strip is the only place progress lives.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⣾ Fetching chapters    42 / 318   ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░  13%  │
│                                            [ Cancel ]                │
└──────────────────────────────────────────────────────────────────────┘
```

- Determinate progress, eased.
- The phase label changes: *Preparing* → *Fetching chapters* → *Downloading
  images* → *Building EPUB* → *Saving*.
- **Cancel** appears only while work is in flight, and it **actually aborts**
  the in-flight HTTP requests (see [ADR-0004](../decisions/ADR-0004-fetch-layer.md)).
  The original's "Pause to Library" did not abort anything; it merely
  shortened the inter-chapter sleep.
- On completion the strip becomes a **success state**: "Saved as
  `The Wandering Inn.epub` · 8.4 MB" with an **Open folder** action and a
  dismiss.

---

## 3. Flows

### 3.1 First run

Shown once, on a tab, after install. Three steps, each a single screen:

1. **Welcome.** What Kintsugi does, in one sentence and one illustration.
   A live demo of a chapter being turned into a page.
2. **Pick a site.** A search field over the supported-site list, with a note
   that unsupported sites can still work via the selector builder.
3. **Theme & accent.** Choose light/dark/system and an accent colour. Both
   are applied **live on this screen**, so the choice is made by looking at
   it, not by reading about it.

There is no account, no sign-up, and no network call. The first-run screen
never appears again once dismissed.

### 3.2 The happy path

```
Click the toolbar button
  └─ workbench opens in a tab, already populated:
       • the current page's DOM read
       • the parser selected
       • the metadata filled
       • the chapter list shown
  └─ [ Pack EPUB ]  (top right, always visible)
       └─ work happens in the background worker
            └─ progress in the status bar
            └─ the file is saved
```

**Two clicks, zero scrolling.** That is the whole design.

### 3.3 Unsupported site

```
Parser not found
  └─ the selector builder opens automatically, pre-filled with the
     heuristic guess
  └─ the user adjusts the CSS selector, with a live preview pane
  └─ [ Save for this site ]
  └─ the selector is remembered per hostname
```

The original's builder was a table of four text inputs with a "Test" button
and a result viewport. The new one is a **split view**: the selector editor
on one side, a live preview of the extracted content on the other, updating
as you type. Invalid selectors show an inline error, not a silent empty
result.

### 3.4 Incremental update (the library)

The library is preserved but moved to the **options page**, because it is a
management surface, not part of the capture flow.

```
Options → Library
  └─ grid of covers
       └─ [ Search for new chapters ]  → diff against the stored chapter list
            └─ [ Update ]  → merge new chapters into the stored EPUB
```

The original's merge was **regex surgery on the OPF and NCX**, which silently
corrupts any EPUB not produced by the exact same serialiser. The new merge
uses a real EPUB reader/writer that parses the container, the package
document, and the spine, and rewrites them structurally.

### 3.5 Error handling

The original's error dialog was six equal-weight buttons and a raw stack
trace. The new one:

```
┌──────────────────────────────────────────────┐
│  ⚠  Could not fetch chapter 42               │
│                                              │
│  novelsite.com returned 503 after 3 tries.   │
│  The story may still download with this      │
│  chapter skipped.                            │
│                                              │
│  ▸ Show technical details                    │
│                                              │
│  [ Skip this chapter ]   [ Retry ]  [ Close ]│
└──────────────────────────────────────────────┘
```

- A **human message** first; the technical detail is behind a disclosure.
- **At most three actions**, with a clear primary.
- The dialog is focus-trapped, `Escape` closes it, and focus returns to the
  Pack button afterwards.
- Errors that are not fatal appear as a **toast** instead of a dialog, so the
  dialog remains meaningful.

---

## 4. Keyboard map

| Key | Action |
|---|---|
| `Ctrl/Cmd + Enter` | Pack EPUB |
| `Ctrl/Cmd + O` | Focus the URL field |
| `Ctrl/Cmd + F` | Focus the chapter filter |
| `Ctrl/Cmd + A` | Select all chapters (when the chapter list has focus) |
| `Ctrl/Cmd + D` | Deselect all chapters |
| `Ctrl/Cmd + Shift + I` | Invert selection |
| `Escape` | Close the active dialog / popover / drawer |
| `↑` `↓` | Move between chapters in the list |
| `Space` | Toggle the focused chapter |
| `Home` `End` | Jump to the first / last chapter |
| `Enter` | Edit the focused chapter's title |
| `?` | Show the keyboard shortcut sheet |
| `Tab` | The chapter list is **one** tab stop; arrow keys move within it |

---

## 5. Writing style

The UI is a product, so its copy is written like one.

| Rule | Example |
|---|---|
| Say what happened, then what to do | "Could not fetch chapter 42" → "Retry" |
| Never blame the user | Not "You entered an invalid URL" |
| No jargon in user-facing text | "Captcha" → "Verify your browser" |
| Buttons name the action | "Pack EPUB", not "Apply"; "Search for new chapters", not "Update" |
| Sentence case everywhere | "Remove author notes", not "Remove Author Notes" |
| No trailing colons on labels | "Cover image URL", not "Cover Image URL:" |
| Explain units | "Delay between requests (ms)", not "manualDelayPerChapter" |
| Keep the same word for the same thing | Always "chapter", never "page" or "part" for a chapter |

---

## 6. Responsive & zoom

- The workbench is fully usable from **320 px** to **2560 px** wide.
- At 200 % browser zoom on a 1280 px screen (an effective 640 px), the
  layout becomes the stacked single-column variant and **nothing is lost or
  clipped**.
- The options page uses a two-column layout ≥ 960 px and a single column
  below.
- The chapter list never causes horizontal scrolling. Long titles ellipsise.
