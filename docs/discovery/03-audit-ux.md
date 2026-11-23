# Discovery — UX & Visual Design Audit

**Baseline:** `legacy/v-original` (v1.0.14.92)
**Scope:** `plugin/popup.html`, `plugin/css/*`, `plugin/images/*`,
`plugin/js/{ChapterUrlsUI,DefaultParserUI,CoverImageUI,ProgressBar,UIText,Library,main,ErrorLog,ReadingList,UserPreferences}.js`,
`doc/*.png`
**Status:** Complete

---

## 0. Executive summary

The functional engine behind this UI is substantial — 437 parsers, a library,
an EPUB packer, a reading list. The **interface** is a 2010-era unstyled HTML
form that has grown by accretion.

A single 1090-line `popup.html` presents **10 mutually-toggling `<section>`s**
of raw `<table>` markup, with:

- **15 literal hex colours** and **no CSS custom properties**
- **3 font sizes** and **no type scale**
- **6 border radii** and **no elevation model**
- **1 animation** and **zero `prefers-reduced-motion` handling**
- **0 ARIA attributes**, **0 `:focus` styles**, and **1 heading** (`<h3>`, skipping `<h1>` and `<h2>`)
- a "dark mode" implemented as **5 declarations** of inverted background colour

**42 % of `popup.html` (28.4 KB) is a hand-maintained list of 466 `<script>`
tags.** There is no build step, no bundler, no template.

---

## 1. Screen inventory

The app is **not** a multi-page app. It is one document with sections toggled
via the `hidden` attribute. There is no router and no URL state.

| # | Section | DOM structure | Lines | Purpose |
|---|---|---|---|---|
| 1 | `#extensionVersionSection` | bare `<section>` + `<span>` | 13–15 | Version string |
| 2 | `#readingListSection` | `<section>` + button + `<table>` | 16–20 | Stories read. Full-screen takeover |
| 3 | `#errorSection` | `<section>` + `<table>` with 6 buttons + `<pre>` | 21–37 | The only error surface. Full-screen takeover |
| 4 | `#defaultParserSection` | `<section>` + `<p class="i18n">` + `<table>` + 3 buttons + result viewport + instructions | 38–90 | CSS-selector wizard for unsupported sites |
| 5 | `#inputSection` | `<section>` + `<table id="inputTable">` with 13 rows | 91–154 | Primary metadata form. Labels are `<td>`, not `<label for>` |
| 6 | `.progressSection` | flex `<div>` | 156–162 | Pack EPUB, progress bar, Add to Library, Pause |
| 7 | `.HiddenButtonSection` | flex `<div>` | 163–166 | Library + Advanced Options toggles |
| 8 | `#hiddenBibSection` | `<section>` with a 90-line `<table>` template + a live `<div>` | 167–273 | Library. Content built as raw HTML strings in `Library.js` |
| 9 | `#advancedOptionsSection` | `<section>` with **two** `<table>`s (12 + 33 rows) | 275–539 | **The largest screen: 265 lines, ~26 % of the markup.** 45 undifferentiated controls, no headings |
| 10 | `#imageSection` | `<section>` + `<table>` + `.scrollingtable` | 541–555 | Cover picker. Reachable only for Baka-Tsuki |
| 11 | `#outputSection` | `<section>` + range selects + 5-button toolbar + chapter `<table>` | 556–605 | Chapter list. The densest screen |
| 12 | `#sbOptions` / `#sbFilters` | fixed `<div>` sidebar + `<form>` | 608–619 | Regex filter panel. The only element with a transition |
| 13 | script manifest | 466 `<script src>` tags | 621–1088 | 28.4 KB, not a screen |
| 14 | `#testSection` | empty `<section>` | 540 | Dead placeholder |

### Screens that do not exist but should

- **Onboarding / first-run** — nothing explains the product to a new user.
- **Settings** — Advanced Options *is* the settings screen, merged with
  per-story options.
- **Confirmation dialog** — uses native `alert()`/`confirm()`.
- **Success state** — a successful pack just triggers the browser save dialog.
- **Empty states** — see §3.

---

## 2. Visual design audit

### 2.1 Colour

15 distinct hex values across 3 CSS files. **No CSS custom property anywhere.**

| Hex | Uses |
|---|---|
| `#CCC` | All borders (container, inputs, progress, divider, table header rule) |
| `#ffffff` / `#f6f6f6` | Button gradient top/bottom, button bg, tooltip text |
| `#ff0000` | `.warning` — the only semantic colour in the app |
| `#dcdcdc` / `#dcdcdc75` | Button border, sidebar close-button border |
| `#bb0000` | Sidebar "exclude" checkbox accent |
| `#808080` | Tooltip background |
| `#666666` | Button text |
| `#2f2f2f` / `#2b2b2b` / `#eee` / `#222222` | Dark-mode overrides |

**Hardcoded colours leak into JS**, which is the real problem:

| Location | Value |
|---|---|
| `DefaultParserUI.js:184`, `:199` | `#666` |
| `DefaultParserUI.js:209`, `:212`, `:215`, `:219` | `green`, `orange`, `red` |
| `main.js:693` | `red` |
| `Library.js:377`, `:419` | `Chartreuse` — the "new chapters" badge |
| `Library.js:1216` | `yellow` — the URL-change warning |
| `ChapterState*.svg` | `blue`, `green`, `#965607` |

The app therefore has **at least six independent notions of "red"** that were
never reconciled. The extension's own brand mark (`book128.png`, a teal open
book) appears **nowhere** in the UI, and there is **no accent colour at all**.

### 2.2 Typography

- Font stack: `Arial` on `button` **only** (`default.css:201`); everything else
  inherits the browser default ⇒ **two typefaces on one screen**.
- Font sizes: **three** declared values — `2em`, `12px`, `16px`. No
  `body { font-size }`, so the whole UI scales with OS zoom rather than a
  designed scale.
- Weights: only `bold` and `bolder`. No 500/600.
- **No type scale.** The only heading element in the whole document is
  `<h3>Instructions</h3>` (`popup.html:82`) — it skips `<h1>` and `<h2>`.
- Buttons at 12 px Arial next to inputs at the OS default size ⇒ **mismatched
  text sizes on the same row**, and blurry text on HiDPI.

### 2.3 Spacing

**No spacing system.** Distinct values in the CSS: `auto ×5`, `5px ×5`,
`4px ×4`, `0 ×3`, `3px ×2`, `7px`, `5px 10px`, `4px 8px`, `39px`, `30px`,
`20px`, `10px`. Plus 18 inline `style=` attributes in the HTML.

Magic numbers encoding fragile layouts:

- `.progressSection { padding-left: 39px }` (`default.css:225`) — exists only
  to centre a button group under an absolutely-positioned progress bar.
- `#progressString { position: absolute; left: 46% }` (`default.css:16-25`) —
  a percentage-pixel hybrid that overlays the bar's fill.
- `#coverUrlSection img { position: absolute; top: 41px; right: 7% }`
  (`default.css:230-236`) — the cover thumbnail is **out of flow**, pinned to
  the section, leaving its `<td rowspan="2">` empty and decorative.
- `.scrollingtable { height: 300px }` (`default.css:11-14`) — a fixed 300 px
  box even when empty.
- `Library.js:385` — `max-height: 154.4px; max-width: 120.6px` (computed as
  `772/column` and `603/column`).

A 4/8/12/16/24 scale would fit this UI.

### 2.4 Shape & elevation

Border radii in use: **3, 5, 6, 8, 10 px** — inputs 3, container 5, tooltip 5,
button 6, progress bar 5 (value 8), progress section 8, sidebar close 10, and
the default-parser preview **0**.

Borders: **5** distinct treatments. Shadows: **exactly one** in the whole app
— `inset 0 1px 0 #ffffff` on buttons (`default.css:193`), a 2010-era
Bootstrap-style top highlight. **No elevation shadows**, so the sidebar, which
overlays content, has no visual separation beyond its background colour.

### 2.5 Density

**Cramped in the middle:**

- `#inputSection` puts a 75 px label column next to inputs at `width: 69%`
  *of the section*, while `input` also has `min-width: 356px; max-width: 400px`.
  The result is a **fixed ~600 px floor** (`.minWidth { min-width: 600px }`).
  Labels like *"Remove Next and Previous Chapter Hyperlinks"* **overflow their
  cell and collide** with the adjacent checkbox.
- The **chapter list** forces `width: 101.5%; position: relative; left: -16px`
  (`default.css:171-176`) — a negative-offset hack to make inputs overflow
  their cell — combined with `ChapterUrlsUI.resizeTitleColumnToFit` setting
  `input.size` to the longest title's character count. **One 300-character
  title blows out the entire table.**
- `#chapterUrlsTable > tr > td:first-child { width: 3px }` makes the checkbox
  column vanish, but the 13 px checkbox overflows its 3 px cell.

**Wasteful at the edges:**

- `.progressSection` is `height: 60px` with `padding-top: 30px` — half the box
  is empty space above the buttons.
- `#advancedOptionsSection` is 265 rows of ungrouped, unlabelled controls with
  **no section headings**.
- The whole popup has **no max-height and no scrolling container**.

### 2.6 Iconography

Six SVGs in **three mutually incompatible styles**:

| File | Style | Size | Colour |
|---|---|---|---|
| `ChapterStateNone.svg` | empty canvas | 32×32 | transparent |
| `ChapterStateDownloading.svg` | filled `<rect>` + `<polygon>` | 32×32 | `blue` |
| `ChapterStateLoaded.svg` | 2 px `<line>` checkmark | 32×32 | `green` |
| `ChapterStateSleeping.svg` | 2 px "Zzz" glyphs | 32×32 | `#965607` |
| `FileEarmarkCheckFill.svg` | Bootstrap Icons | 16×16 | `green` |
| `FileEarmarkCheck.svg` | Bootstrap Icons | 16×16 | `dodgerblue` |

Problems: **two icon systems** (hand-drawn vs Bootstrap), **two grids** (32 vs
16) forced into one 16 px column by `img.downloadState { height: 1em }`, a
**blank "None" state indistinguishable from a rendering failure**, **no `alt`
attributes anywhere**, and tooltips that are `visibility: hidden` until
`:hover` — so **unavailable to keyboard and screen-reader users**.

The only other icon is the sidebar close button: the text glyph `✖`
(`popup.html:609`) — a `<div>`, not a `<button>`, no `aria-label`.

### 2.7 Overall impression

It reads as dated and default-browser. Concretely:

- `doc/product-screenshot.png` shows a plain `<table>` of left-aligned labels
  and inputs inside a 1 px grey rounded border, floating in white browser
  chrome.
- **The "Pack EPUB" button is visually identical to "Select All".** The
  primary action has zero hierarchy.
- The **progress bar is permanently visible** as a large empty grey slab at
  idle — the largest visual element on screen, permanently showing nothing.
- The **"Advanced Options" button sits inside the progress box** while
  "Library" sits below it — the two navigation actions are separated and
  inconsistently placed.
- The **error dialog's six buttons** are in one row of identical styling:
  OK / Retry / Open URL for Captcha / Copy URL for Captcha / Block Website /
  Cancel. Six equal-weight choices is a decision-overload failure.
- The chapter table has a `<th>` row that is a **direct child of `<table>`**
  (no `<thead>`/`<tbody>`), and JS appends `<tr>`s to the same `<table>`. The
  HTML is **invalid**, browsers silently repair it, and the CSS selectors
  `#chapterUrlsTable tbody > tr > th` and `#chapterUrlsTable > tr > td:first-child`
  **do not match the same rows**. This is why the layout rules are so fragile.

---

## 3. State inventory

### Designed states

`button` (default/hover/active/disabled), `input` (default/disabled),
`td.disabled` (opacity 0.5), five chapter download states, `progress` value,
the sidebar open/closed, and section shown/hidden via `hidden`.

### Missing states — the important part

| Missing | Where | Evidence |
|---|---|---|
| **Empty** | Library, chapter list, cover picker, reading list, default-parser preview | `#LibRenderResult` is an empty `<div>` (`popup.html:271`). `Library.LibRenderSavedEpubs` renders nothing for 0 items. `CoverImageUI.js:49` appends "No images found" to the *parent* of the table — **and never removes it**, so it accumulates duplicates on every repopulate |
| **Loading (visual)** | "Searching for URLs. Please wait." | `popup.html:593` is a **static text div** — not a spinner, not a skeleton. `ChapterUrlsUI.showTocProgress` appends dimmed rows with **no live count** |
| **Loading (on buttons)** | Pack EPUB, Load and Analyse | `main.js:419` disables the button but **never changes its label**. `main.js:161` disables Pack EPUB and leaves the label as-is |
| **Disabled (semantic)** | Pack EPUB with 0 chapters selected | Only disabled *during* work. **No pre-flight validation** disables it when the chapter list is empty |
| **Focus / focus-visible** | Every element | **Zero `:focus` rules** in all three CSS files |
| **Error on fields** | URL input, CSS-selector inputs | `DefaultParserUI` shows a global status line, but **the input itself gets no error state**. The URL input has no `required` and no `:invalid` styling |
| **In progress** | Library per-EPUB | `Library.js:818-827` uses `<div class="warning">` = `#ff0000` at `2em` bold — a 32 px red "In Progress...." as a routine loading state. The loudest element in the app |
| **Success** | After packing | None |
| **Hover on rows** | Chapter list | None |
| **Active nav** | Library / Advanced Options toggles | **Never show which panel is open.** No `aria-pressed`, no active class |

---

## 4. Accessibility gaps

### 4.1 ARIA — essentially absent

`grep -oniE 'aria-[a-z]+="[^"]*"' plugin/popup.html` → **0 matches**.
`grep 'role='` → **0 matches**.

- No `aria-live` on `#progressString`, `#findingChapterUrlsMessageRow`, or
  `#spanChapterCount` — the progress counter, the "searching" message, and the
  chapter count are **silent to screen readers**.
- No `aria-expanded` on the Library / Advanced Options / Filters / Reading List
  toggles.
- No `aria-busy` during a pack.
- No `role="dialog"` / `aria-modal` on `#errorSection` — it is not announced
  as a dialog when it takes over the screen.
- No `role="alert"` on the error `<pre>`.
- The `<progress>` element has **no accessible name**.
- `popup.html:616` `<form id="sbFiltersForm" disabled>` — `disabled` is **not
  a valid attribute on `<form>`** and has no effect.

### 4.2 Labels

- The main form has **13 rows of `<td>label</td><td><input>`** with no
  `<label for>` (`popup.html:93-153`). Screen readers announce these inputs as
  **"edit text, blank"** with no name. **WCAG 1.3.1 / 4.1.2 failure on the
  primary form.**
- Only **one `<label>` element exists in the whole document**
  (`popup.html:195`) — a `for`-less wrapper used as a click-target hack.
- The Advanced Options table has the same problem across ~33 rows.
- **Checkboxes are in a separate `<td>` from their label text** — clicking the
  text does **not** toggle the checkbox. `td.disabled` (opacity) signals "not
  applicable" instead of disabling the input, so the checkbox **remains
  clickable and silently does nothing**.
- `<img id="sampleCoverImg">` has **no `alt`**.
- The `input type="file"` elements (`popup.html:184`, `:199`, `:535`) have no
  associated label.
- `#sbClose` is a `<div>` — **not focusable**, no accessible name.
- Chapter download-state `<img>`s have **no `alt`**.
- The library cover images are clickable `<img>`s with **no `alt`** and no
  keyboard access.
- The chapter title `<input>`s have **no label** and no row context for SR.

### 4.3 Keyboard & focus

- **No `:focus` styling anywhere.** The only indicator is the UA default
  outline, but `button:active { position: relative; top: 1px }` shifts the
  button on press, making keyboard navigation visually ambiguous.
- `#sbClose` is not focusable — the sidebar can only be closed with a mouse.
- **No `Escape` handler anywhere** (`grep -r "Escape" plugin/js/*.js` → 0
  matches). The sidebar, the reading-list takeover, and the error dialog all
  need it.
- **No keyboard shortcut for the primary action.** `Ctrl/Cmd+Enter` → Pack
  EPUB is absent.
- **Shift-click range select is mouse-only** (`ChapterUrlsUI.js:272-276`) with
  no keyboard equivalent, taught by an `alert()` after 5 mis-clicks.
- The sidebar's tri-state "exclude" checkbox uses `indeterminate`, which is
  **not conveyed to screen readers**, and relies on `accent-color: #bb0000` —
  **1.98:1** against the dark sidebar background.

### 4.4 Contrast

| Pair | Ratio | Verdict |
|---|---|---|
| Button text `#666` on `#ffffff` | 5.74:1 | Passes AA |
| `.warning` red `#ff0000` on white | **4.00:1** | **Fails AA** (needs 4.5:1) |
| `.warning` red `#ff0000` on `#2b2b2b` | **3.54:1** | **Fails AA** |
| Tooltip `#808080` bg + white text | **3.95:1** | **Fails AA** |
| `#666` on `#2b2b2b` (dark mode) | **2.47:1** | **Fails badly** |
| Sidebar accent `#bb0000` on `#2f2f2f` | **1.98:1** | **Fails** |
| `ChapterStateLoaded.svg` green on white | **1.37:1** | **Fails** |
| `Chartreuse` badge on white | ~1.4:1 | **Fails** |
| `Library.js:1216` `yellow` on white | ~1.07:1 | **Fails — effectively invisible** |
| `#CCC` border on `#ffffff` | **1.61:1** | Fails 1.4.11 (3:1 for UI boundaries) — **input borders are invisible in light mode** |

### 4.5 Document structure

- **No `<h1>`** — not even the app name.
- **Exactly one heading in the whole document**: `<h3>Instructions</h3>`
  (`popup.html:82`) — skips `<h1>` and `<h2>`.
- **No landmarks** — no `<main>`, `<header>`, `<nav>`. The 10 `<section>`s have
  **no accessible names**, so each becomes a nameless generic region.
- The chapter table has **no `<caption>`** and its header row has **no
  `scope="col"`**.

### 4.6 Popup-specific issues

- **No focus management on section transitions.** When the error dialog or the
  reading list takes over, focus is not moved, not trapped, and the background
  is not `inert`. A keyboard user pressing Tab continues into the hidden
  sections with no announcement.
- **No focus restoration** on close.
- **The error `<pre>` shows a raw JavaScript stack trace** to end users.
- **The `.scrollingtable` double-scroll region has no `tabindex="0"`**, so
  keyboard users cannot scroll it.
- `beforeunload` fires a **native browser confirm** on close during work.

---

## 5. Motion

**There is exactly one animation in the entire product:**

```css
.sidebar { transition: 0.25s; }   /* default.css:272 */
```

That is the `transition` **shorthand with no property**, i.e.
`transition-property: all` — so it transitions *every* animatable property
on the sidebar.

Everything else is instant: progress-bar fill (teleports), button hover,
panel show/hide (hard cut), chapter rows appearing, the "searching" message,
and there is **no spinner, no skeleton, no toast**.

**`prefers-reduced-motion` is completely unhandled** — zero occurrences in any
CSS file.

Highest-value motion additions: transition the progress-bar fill (the run can
last 30+ minutes and currently the bar teleports), scope the sidebar
transition to `width`, add a designed show/hide pattern for panels, add a
spinner for the TOC crawl, and use `transform: translateY(1px)` instead of
`top: 1px` for the button press (the latter causes reflow).

---

## 6. Dark mode

### Implementation

Three stylesheets: `default.css`, `autoDark.css`, `alwaysDark.css`.
`UserPreferences.SetTheme()` (`UserPreferences.js:283-294`) toggles the
`disabled` attribute on the two theme links.

### Verdict: **an inverted afterthought, not a dark theme.**

`autoDark.css` is 15 lines; `alwaysDark.css` is 14. They are byte-for-byte
identical except for the `@media` wrapper:

```css
body { background: #2f2f2f; color: #eee; }
input, button, select, progress, textarea { background: #2b2b2b; color: #eee; }
button:hover { color: #222222; }
```

**Five declarations covering the entire app.** Everything else is untouched.

### What breaks

1. **Every border stays light.** `#CCC` is used for the container border, input
   borders, the progress-section border, the divider, and the table-header
   rule. In dark mode they remain bright, glowing lines on a dark card.
2. **Buttons keep their light gradient.** `default.css:193-195` sets
   `background: linear-gradient(...)`; the dark sheet's `background: #2b2b2b`
   shorthand resets `background-image` to none — so it works **by accident of
   cascade order**. Load the sheets in the other order and every button
   renders as a white gradient slab on a dark page.
3. **Button hover flips to near-black on near-white** — a jarring full
   inversion, not a dark-theme hover.
4. **`.warning` red is 3.54:1** on the dark background.
5. **`#progressString { color: white }` is invisible in light mode** for the
   first half of a run: it is positioned at `left: 46%` over the **unfilled**
   (white) part of the progress track. The primary progress indicator is
   unreadable exactly when the user wants to read it.
6. **Disabled buttons at `opacity: 0.5`** on `#2b2b2b` over `#2f2f2f` are
   nearly indistinguishable from the background — **disabled looks enabled**.
7. **`color-scheme` is never set**, so native widgets (scrollbars, form
   controls, the file picker) render light in a dark page.
8. **`<option>` elements are unstyled** — Firefox renders the dropdown with the
   OS palette inside a `#2b2b2b` select.
9. **Theme switching is instant and jarring** — it toggles a `<link disabled>`
   attribute, causing a full repaint.
10. **The theme control is buried** 45 controls deep in Advanced Options, even
    though it is the most-used personalisation setting.

---

## 7. Theming & personalisation

**Complete inventory of what exists:**

| Option | Where | Type |
|---|---|---|
| Theme (light / dark / OS) | `popup.html:333-341` | `<select>` — buried in Advanced Options |
| Advanced Options visible by default | `popup.html:419-422` | checkbox |
| Library compact layout | `popup.html:262-265` | checkbox — the only density control, library-only |
| Show advanced library options | `popup.html:258-261` | checkbox |
| Custom filename template | `popup.html:325-328` | text input |

**What does not exist:** accent/brand colour picker, font family or size
control, global density mode, colour-blind/high-contrast mode, per-section
collapse state, "remember my last section", icon theme.

The extension's own teal brand mark from `book128.png` is never applied.

---

## 8. UX friction

### 8.1 Clicks to produce an EPUB

| Step | Clicks |
|---|---|
| Click toolbar icon → popup opens → detects it is a popup → **opens a new tab** → popup closes | 1 |
| Parse, populate metadata and chapters | 0 (automatic) |
| *(optional)* adjust chapter range | 0–2 |
| Click **Pack EPUB** | 1 |
| Browser save dialog → Save | 1 (browser) |
| **Total** | **2 (+1 browser)** |

The count is fine. The **experience** is not:

- **Friction A — the icon opens a different UI than the popup.** The manifest
  declares `default_popup: popup.html`, but the page detects that it is a
  popup and refuses to run there, redirecting to a tab. So the popup **flashes
  and immediately closes** and a tab opens. The extension's entire UI lives at
  an internal `chrome-extension://…/popup.html?id=132` URL with **no title
  and a visible query string**.
- **Friction B — "Load and Analyse" is a dead end.** `main.js:345` hides it as
  soon as a parser is set, which happens automatically.

### 8.2 The information hierarchy is inverted

```
[ 13-row metadata form ]
[ Pack EPUB | progress | Add to Library ]
[ Library ] [ Advanced Options ]
```

The primary action is **13 rows down**, and the two navigation toggles are
**below** the primary CTA. Meanwhile the progress bar — the largest visual
element — sits permanently visible and empty.

### 8.3 Misleading labels

| Key | English text | Problem |
|---|---|---|
| `label_Select_Translation_Google` | "Download raw (no login)" | **Key and translation have completely diverged** |
| `label_Chapters_Page_In_Chapters_List` | "Add Page with Chapters to Chapters List" | Grammatically broken |
| `label_no_additional_metadata` | "no Additional Metadata" | Lowercase fragment |
| `label_auto_search_metadata` | "auto search Metadata on novelupdates (long loading time)" | Lowercase, names a third-party site, buries the caveat |
| `label_less_tags` | "less tags" | Meaningless without context |
| `label_Metadata_description` | "Epub description" | Should be "Description" |
| `label_Range_Start_Chapter` | "First Chapter" | Doesn't reveal it is a *range* control |
| `button_Lib_Template_Update_new_Chapters` | "Update" | Way too vague beside "Search new Chapters" |
| `button_error_Open_URL` | "Open URL for Captcha" | Exposes the internal term "Captcha" for **every** error type |
| `button_error_Block_URL` | "Block Website for future requests" | 6 words in a 6-button row |
| `button_finished_default_parser` | "Apply" | Apply what? |
| `label_Using_Default_Parser` | "No parser found for this URL.  Default Parser will be used. Please specify…" | A 2-sentence paragraph at body size as the section heading |
| `label_Use_SVG_for_Images` | "Use &lt;svg&gt; for images" | The **entity renders literally** because localisation uses `textContent` |
| `label_Lib_Warning_In_Progress_` | "In Progress...." | Four dots, styled as 32 px red bold |
| `label_Overwrite_Epub_When_Filename_Duplicte` | "Overwrite existing EPUB file with same name" | Key has a typo |
| `button_Help` ×3 | "Help..." | Three different wiki anchors, three visually identical buttons — **the user cannot tell them apart** |

### 8.4 Missing affordances

- No indication the chapter list is still loading (no spinner, no count, no ETA).
- No indication which chapters are already downloaded unless you hover a tiny
  icon, and the "None" state is a blank image.
- **No confirmation before destructive actions** — "Clear Library"
  (`Library.js:243-253`, which calls `chrome.storage.local.clear()`) and
  "Reset" (`main.js:589`) both wipe data with no confirmation.
- **No empty state anywhere.**
- **No tooltip on the toolbar icon** — `manifest.json:23` sets
  `"default_title": ""`, so the browser shows a blank entry in the extensions
  menu. One-line fix, real discoverability impact.
- No badge/notification on the toolbar icon during a run.
- The **tab title** is replaced with the progress percentage
  (`ProgressBar.js:40-46`) — clever, but the user loses the original page
  title entirely.

### 8.5 Redundant & conflicting controls

1. **Two show/hide toggles that fight each other.** Opening Advanced Options
   closes the Library and vice versa (`main.js:360-382`), but **neither button
   reflects the state**.
2. **"Show more Metadata options" appears below the table it controls**
   (`popup.html:276-318` vs `:319-323`), and its state depends on the
   *persisted preference* rather than the checkbox's current value — so the
   two can desync.
3. **Two sibling tables with no headings** read as one 45-row list.
4. **"Library" appears twice** — the toggle and the "Add to Library" action
   button do completely different things.
5. **The library template markup is structurally broken** — orphaned
   `<button>`/`<input type="file">` as direct children of `<tr>`
   (`popup.html:181-185`), two consecutive `<tr>` open tags (`:231-232`), and a
   `</td>` that closes a cell opened in a previous row (`:246-250`). The
   browser's foster-parenting makes the layout unpredictable.
6. **Two "Cover Image URL" controls** — in the main form and in the library
   metadata editor — with the same label and different behaviour.
7. **Two "Apply Changes" buttons** with the same label and handler.
8. **Two "Help..." buttons** opening different wiki anchors, visually identical.
9. **"Pause to Library" is a misnomer** — it cancels; nothing is resumable.
10. **`#packEpubButton` and `#LibAddToLibrary` differ only by a
    `data-libclick="yes"` dataset attribute** — a behavioural branch driven by
    a DOM data attribute rather than a separate function.

### 8.6 Keyboard shortcuts

**Present:** `Shift+Click` range select (mouse-only, taught by an `alert()`);
two `beforeinput` validators.

**Absent:** `Ctrl/Cmd+Enter` → Pack EPUB; `Escape` → close sidebar / reading
list / error dialog; `Ctrl+A`/`Ctrl+D` → select-all / deselect-all chapters;
a skip link past the chapter list.

**Tab order:** the chapter list contributes **2 tab stops × N chapters** with
no skip mechanism — a 400-chapter novel means 800 tab stops.

---

## 9. Prioritised recommendations

### P0 — correctness & accessibility blockers

| # | Recommendation | Touches |
|---|---|---|
| 1 | Add `label for` / `aria-label` to every form input; replace the `<td>label</td>` pattern | `popup.html:93-153`, `:319-537`, `:40-72` |
| 2 | Introduce CSS custom properties for the palette; replace all 15 literal hex values and all JS-hardcoded colours | `plugin/css/*`, `DefaultParserUI.js:184-219`, `Library.js:377,419,1216`, `main.js:693` |
| 3 | Rebuild dark mode as a single token-override block with `color-scheme: dark`, themed borders, and a proper hover | `alwaysDark.css`, `autoDark.css`, `default.css:101,112,193-200,223,180` |
| 4 | Fix the failing contrast pairs (`.warning` red, tooltip grey, `Chartreuse` badge, `yellow` warning, `#CCC` borders) | `default.css:6,112,156-157`; `Library.js:377,419,1216` |
| 5 | Fix `#progressString { color: white }` — invisible over the unfilled track in light mode | `default.css:16-25` |
| 6 | Replace `alert()`/`confirm()` with in-page dialogs | `ChapterUrlsUI.js:137,502`; `DefaultParserUI.js:239` |
| 7 | Add `Escape` handling, focus management, `role="dialog"`, `aria-modal` | `main.js:525-561`; `ErrorLog.js:23-27`; `popup.html:21-37` |
| 8 | Add `aria-live="polite"` to the progress, chapter-count and searching messages | `popup.html:159,575,593` |

### P1 — high leverage

| # | Recommendation | Touches |
|---|---|---|
| 9 | Restructure into a real layout: sticky header with title/author + primary action, then collapsible sections | `popup.html:91-166,275-539` |
| 10 | Give "Pack EPUB" a distinct filled-accent treatment | `default.css:192-216`; `popup.html:157` |
| 11 | Add a real loading state: spinner, button label change, skeleton rows | `popup.html:593,99`; `ChapterUrlsUI.js:59-71`; `main.js:419` |
| 12 | Fix the malformed library template markup | `popup.html:181-185,195-199,231-232,246-250` |
| 13 | Scope the sidebar transition and transition the progress fill | `default.css:272,58-68` |
| 14 | Replace the negative-offset input hack with `table-layout: fixed` + ellipsis; cap the title column | `default.css:171-176`; `ChapterUrlsUI.js:316-322` |
| 15 | Normalise label grammar; fix the diverged key; decode `&lt;svg&gt;` | `popup.html:132,147,252,284,288,292,413,475,544,548` |
| 16 | Give the download-state icons real `alt` text and a `:focus-within` tooltip; make "None" a visible glyph | `default.css:153-169`; `ChapterUrlsUI.js:80-101,286-288`; `ChapterStateNone.svg` |
| 17 | Add `Ctrl/Cmd+Enter` for Pack EPUB, `Escape` for overlays, and a skip link past the chapter list | `main.js:575-604`; `ChapterUrlsUI.js` |

### P2 — polish & depth

| # | Recommendation | Touches |
|---|---|---|
| 18 | Introduce a spacing scale (4/8/12/16/24) and a type scale (12/13/14/16/20/24) | `default.css` |
| 19 | Unify border-radius to 3 values and add a 2-level elevation scale | `default.css:47,55,61,67,83,105,113,160,196,226,256,287,304` |
| 20 | Add an accent-colour preference driven by `--accent` | `default.css`; `popup.html:333-341`; `UserPreferences.js:120,283-294` |
| 21 | Add a global UI density preference | `default.css`; `popup.html:262-265`; `UserPreferences.js:128` |
| 22 | Replace the 6-icon grab-bag with one consistent set | `plugin/images/*`; `ChapterUrlsUI.js:710-716` |
| 23 | Add empty states for library, chapter list, reading list, cover picker, preview | `Library.js:321-337`; `popup.html:18,271,553`; `CoverImageUI.js:48-50` |
| 24 | Replace the 6-button error row with a primary/secondary split + overflow menu | `popup.html:25-30`; `ErrorLog.js:91-147` |
| 25 | Show a human-readable error message, not a raw `msg.stack` | `ErrorLog.js:77-88` |
| 26 | Add `alt` to cover images and download-state icons; make library covers real buttons | `popup.html:152`; `Library.js:385,410`; `CoverImageUI.js:60-62` |
| 27 | Set `manifest.json` `default_title` to a real string | `plugin/manifest.json:23` |
| 28 | Rename "Pause to Library" → "Cancel"; give the running state a visible treatment | `popup.html:161`; `main.js:202-211` |
| 29 | Clear the "no images" text node before appending a new one | `CoverImageUI.js:44-50` |
| 30 | Add `prefers-reduced-motion` guards to every animation as they are introduced | `default.css:272` |
| 31 | Give the filter form a heading and a reset affordance; drop the invalid `disabled` on `<form>` | `popup.html:610-616`; `main.js:525-535` |
| 32 | Make the Library / Advanced Options toggles mutually exclusive **and visibly active** | `main.js:360-382`; `popup.html:163-166` |
| 33 | Move "Show more Metadata options" above the table it controls | `popup.html:276-323` |
| 34 | Move Theme out of Advanced Options into the header | `popup.html:333-341,163-166` |

---

## 10. Closing assessment

The functional engine is substantial. The interface is an unstyled HTML form
grown by accretion, and the three highest-leverage interventions are:

**(a) tokenise the palette and rebuild dark mode on top of it,**
**(b) label and structure the primary form properly,**
**(c) restructure the information hierarchy so the primary CTA is not 13 rows
down.**

Those three alone move the product from "a 2009 web form" to "a maintained
extension" — without touching a single parser.
