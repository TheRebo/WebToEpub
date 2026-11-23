# Kintsugi — Screen designs

Version 2.0 · Status: **authoritative**

Companion to the [design system](./01-design-system.md) and the
[UX guidelines](./02-ux-guidelines.md). Those two documents define *rules*.
This one defines *surfaces* — every screen, in wireframe form, with the
specific values each one uses.

> **Note on imagery.** The diagrams here are wireframes drawn in text. The
> rendered screenshots live in `docs/screenshots/` and are produced from the
> real component code, not from mock-ups — a mock-up that does not match the
> shipped pixels is worse than no mock-up at all.

---

## 1. Surface inventory

| # | Surface | Entry point | Contains |
|---|---|---|---|
| S1 | Workbench | Toolbar button, `workbench.html` | Capture, chapter list, pack |
| S2 | Popup | Toolbar button (secondary) | Launcher + live progress |
| S3 | Options | `options.html` | Settings, library, permissions |
| S4 | Onboarding | First run | Three-step introduction |
| S5 | Selector builder | From S1, on failure | Split-view CSS selector editor |
| S6 | Chapter range dialog | From S1 | Named ranges |
| S7 | Cover picker | From S1 | Grid of page images |
| S8 | Shortcut sheet | `?` in S1 | Keyboard reference |

---

## 2. S1 — The Workbench

The main tool. Everything of consequence happens here.

### 2.1 Anatomy

```
┌───────────────────────────────────────────────────────────────────────────┐
│  ⬡ Kintsugi    The Wandering Inn · innkeeper        [ Save ] [ ⤓ Pack ]  │ 56
├────────────────────────────┬──────────────────────────────────────────────┤
│ SIDEBAR 320px              │ MAIN                                          │
│                            │                                              │
│ ┌────────────────────────┐ │ ┌──────────────────────────────────────────┐ │
│ │ STORY DETAILS      4   │ │ │ ☐  Chapters            318 found          │ │ 40
│ │                        │ │ ├──────────────────────────────────────────┤ │
│ │ Title                 │ │ │ ☐  ○  Chapter 1 — The Wandering Inn       │ │ 32
│ │ [The Wandering Inn    ]│ │ │ ☑  ◔  Chapter 2 — Lily in the Woods      │ │
│ │                        │ │ │ ☑  ◔  Chapter 3 — The Girl in the Woods  │ │
│ │ Author                │ │ │ ☐  ○  Chapter 4 — Bits and Pieces        │ │
│ │ [innkeeper            ]│ │ │ ☐  ○  Chapter 5 — The Merchant           │ │
│ │                        │ │ │ …                                         │ │
│ │ Language              │ │ │                                          │ │
│ │ [English            ▾] │ │ │                                          │ │
│ │                        │ │ │                                          │ │
│ │ Filename              │ │ │                                          │ │
│ │ [The Wandering Inn.ep]│ │ └──────────────────────────────────────────┘ │
│ │                        │ │ [All] [None] [Invert]  [Ranges…] [Filter]  │ 40
│ └────────────────────────┘ │                                              │
│ ┌────────────────────────┐ │                                              │
│ │ COVER                ▸ │ │                                              │
│ └────────────────────────┘ │                                              │
│ ┌────────────────────────┐ │                                              │
│ │ OPTIONS             ▸ │ │                                              │
│ └────────────────────────┘ │                                              │
├────────────────────────────┴──────────────────────────────────────────────┤
│ ⣾ Fetching chapters   42 / 318   ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░  13%  │ 40
│                                              [ Cancel ]                   │
└───────────────────────────────────────────────────────────────────────────┘
```

### 2.2 App bar — 56 px

```
┌───────────────────────────────────────────────────────────────────────────┐
│  ⬡  Kintsugi   │  The Wandering Inn · innkeeper         │  [Save] [⤓ Pack]│
└───────────────────────────────────────────────────────────────────────────┘
  ↑ product mark   ↑ live title + author, ellipsised         ↑ secondary ↑ primary
```

| Element | Spec |
|---|---|
| Product mark | 20 px icon, `--accent-text`; `⌘`-shaped kintsugi seam glyph |
| Title | `--text-md`, `--text`; ellipsised; `title` attribute carries the full value |
| Author | `--text-sm`, `--text-secondary`; hidden below 560 px |
| **Pack EPUB** | `<k-button variant="primary" size="md">`; **always visible, always the same size** |
| Save | `<k-button variant="ghost">`; shown only when metadata has unsaved edits |

The Pack button is disabled with an **inline explanation** (not silently inert)
when it cannot run:

- *No chapters selected* → tooltip "Select at least one chapter."
- *Still loading the chapter list* → tooltip "Waiting for the chapter list."

### 2.3 Sidebar — 320 px

The sidebar holds everything that is **metadata about the book**. It is
deliberately narrow so the chapter list — the thing the user came for — gets
the remaining space.

#### Story details panel (expanded by default)

```
┌─ STORY DETAILS                              4 fields ─┐
│                                                       │
│  Title                                    ● detected   │
│  ┌───────────────────────────────────────────────┐    │
│  │ The Wandering Inn                             │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  Author                                               │
│  ┌───────────────────────────────────────────────┐    │
│  │ innkeeper                                     │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  Language                                            │
│  ┌───────────────────────────────────────────────┐    │
│  │ English                                   ▾   │    │
│  └───────────────────────────────────────────────┘    │
│                                                       │
│  Filename                                            │
│  ┌───────────────────────────────────────────────┐    │
│  │ The Wandering Inn.epub                  ↺     │    │
│  └───────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────┘
```

- **● detected** is a 6 px accent dot with a tooltip: *"Filled in from the
  page."* It disappears the moment the user edits the field, so "the
  extension guessed" and "you typed this" are never confused.
- **Filename** shows the extension explicitly. The **↺** button restores the
  derived name.
- Fields are `<k-field vertical>`, labels `--text-sm` / `--text-secondary`.
- Language is a native `<select>` with the ~30 most common languages, sorted
  by the site's detected language first.

#### Cover panel (collapsed by default)

```
┌─ COVER                                    no cover ─┐
│                                                       │
│   ┌────────┐                                          │
│   │        │  Cover image URL                          │
│   │  84×   │  ┌───────────────────────────────────┐   │
│   │  120   │  │ https://…/cover.jpg                │   │
│   │        │  └───────────────────────────────────┘   │
│   └────────┘  [Choose from page]  [Remove]             │
└───────────────────────────────────────────────────────┘
```

The preview frame is a **fixed 84×120** box (the EPUB cover ratio, 1 : 1.414).
A missing image shows a line-art placeholder, never a broken-image icon.

#### Options panel (collapsed by default)

Two always-visible toggles, then a link into the full options page:

```
┌─ OPTIONS ────────────────────────────────────────────┐
│  ☑ Include author notes                              │
│  ☐ Include the table of contents as a chapter        │
│                                                       │
│  More options →                                      │
└───────────────────────────────────────────────────────┘
```

### 2.4 Chapters panel — the core

```
┌─ ☐  Chapters                              318 found ──┐
├────────────────────────────────────────────────────────┤
│                                                        │
│  ☐  ○  Chapter 1 — The Wandering Inn           12 KB   │
│  ☑  ◔  Chapter 2 — Lily in the Woods            —      │
│  ☑  ◔  Chapter 3 — The Girl in the Woods        —      │
│  ☐  ○  Chapter 4 — Bits and Pieces             —      │
│                                                        │
│                        (virtualised — ~30 rows live)   │
└────────────────────────────────────────────────────────┘
│ [All] [None] [Invert]        [Ranges…]  [Filter ▾]    │
```

#### Column geometry

| Column | Width | Notes |
|---|---|---|
| Checkbox | 28 px | `<k-checkbox>`; click target 28×28 |
| State | 20 px | Icon, `aria-hidden`; the state is in the row's accessible name |
| Title | flexible | One line, ellipsised; double-click to edit |
| Size | 56 px | Right-aligned, `--text-xs`, `tabular-nums`; `—` until loaded |

#### State icons

Every state has a **distinct shape**, so the list is readable with no colour
at all:

| State | Icon | Meaning |
|---|---|---|
| Not started | `○` hollow ring | Queued, not yet fetched |
| Queued | `◔` half-filled ring | Scheduled |
| Fetching | `◑` ring with a rotating arc | In flight |
| Loaded | `●` filled disc | Content fetched |
| Downloaded | `✓` check | Already in the library |
| Failed | `!` in a triangle | Fetch or parse failed |

#### Header

- **Tri-state select-all**: unchecked → indeterminate (some selected) →
  checked. Indeterminate is rendered as a dash, never as a partial box.
- **Count** uses `tabular-nums` so it does not jitter while chapters load.
- **Range control** — the baseline's two separate "First Chapter" / "Last
  Chapter" dropdowns are replaced by a **paired range selector** with a
  connector, showing a live summary:

```
  ┌────────────┐   ┐   ┌────────────┐
  │ Chapter 1  │ ──┼── │ Chapter 318│   Chapters 1–318 of 318
  └────────────┘   │   └────────────┘
```

Both ends are typeable. Invalid input shows an inline error and does not
apply.

#### Toolbar

| Control | Action |
|---|---|
| **All** | Select every chapter |
| **None** | Clear the selection |
| **Invert** | Toggle every chapter |
| **Ranges…** | Open the named-range dialog (S6) |
| **Filter** | Open the filter popover |

#### Filters popover

Anchored to the Filter button. **Plain substring matching by default** — the
baseline built a `RegExp` from raw user input, which could throw and had no
keyboard path.

```
┌─ Filter chapters ───────────────────────┐
│                                          │
│  Search      [                    ]      │
│  ☑ Use regular expression               │
│  ┌──────────────────────────────────────┐│
│  │ /pattern/                            ││
│  └──────────────────────────────────────┘│
│  ⚠ Invalid pattern: nothing to repeat   ││
│                                          │
│  ☑ Include  arc two                     ││
│  ☐ Exclude  author's note               ││
│                                          │
│  87 of 318 chapters match                │
│                                          │
│  [Clear]                       [Apply]   │
└──────────────────────────────────────────┘
```

- The regex is compiled **before** being applied, in a `try`, and the error is
  shown inline. The pattern is length-capped and executed with a timeout
  ([ADR-0007](../decisions/ADR-0007-permissions.md), security posture).
- The match count updates live, so the effect of a filter is visible before
  it is committed.

### 2.5 Status bar — 40 px

The only place progress lives. Idle, it is **hidden entirely** — not shown as
an empty bar.

```
┣━┫━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ⣾ ┃ Fetching chapters   42 / 318   ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░  13% ┃
┗━┛━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Phases, in order:

| Phase | Label |
|---|---|
| 1 | Preparing |
| 2 | Fetching chapters |
| 3 | Downloading images |
| 4 | Building EPUB |
| 5 | Saving |

Success state:

```
┣━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ✓ ┃ Saved as “The Wandering Inn.epub” · 8.4 MB    [Open folder]  ┃
┗━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Failure state:

```
┣━┳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ! ┃ 3 chapters could not be saved. View details.      [Retry]     ┃
┗━┻━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

### 2.6 Responsive behaviour

| Width | Layout |
|---|---|
| `< 560 px` | Single column. The author is hidden. The Pack button becomes icon + label. Panel summaries stay visible. |
| `560–959 px` | Single column with `--space-6` page padding. The sidebar becomes an accordion stack above the chapter list. |
| `≥ 960 px` | **Two columns**: a fixed 320 px sidebar, and a fluid main column. |

---

## 3. S2 — The Popup

The popup is a **launcher**, not the tool. It fits in 360 px and does three
things.

```
┌────────────────────────────────────┐
│  ⬡ Kintsugi                        │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ ┌──────┐  The Wandering Inn  │  │
│  │ │cover │  innkeeper          │  │
│  │ │56×80 │  318 chapters       │  │
│  │ └──────┘                     │  │
│  └──────────────────────────────┘  │
│                                    │
│  ┌──────────────────────────────┐  │
│  │      Open workbench       →  │  │
│  └──────────────────────────────┘  │
│                                    │
│  ⤓  Add to library                 │
│  ⚙  Settings                       │
└────────────────────────────────────┘
```

### 3.1 States

| State | Content |
|---|---|
| **Story detected** | The card above |
| **No story here** | The card is replaced by: *"No story detected on this page."* + **Try anyway** (opens the workbench with the generic parser) |
| **Unsupported site** | The card shows the site name and a "Use the selector builder" link |
| **A download is running** | The card is replaced by a **live progress strip**: phase label, chapter count, a slim progress bar, and **Cancel**. This is the popup's most valuable job — it answers "is it still going?" without opening a tab. |
| **Extension context invalidated** | A single line: *"Reload the page to use Kintsugi."* |

The popup never navigates itself to a tab. It opens one **on request**.

### 3.2 Measurements

- Width: **360 px** (Firefox's maximum popup width is 800 px; 360 fits a
  book cover and a card comfortably).
- Padding: `--space-5` (16 px).
- Cover thumbnail: **56×80**.
- The popup ships **no parser code** — it asks the background worker, which
  holds the parser registry.

---

## 4. S3 — The Options

A tab. Two columns at ≥ 960 px.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  ⬡ Kintsugi                                        [ Search settings ]   │
├────────────────────────────┬──────────────────────────────────────────────┤
│  APPEARANCE                │                                              │
│    Theme        [System  ▾] │   ┌────────────────────────────────────┐     │
│    Accent      [● Gold ]   │   │  Appearance                        │     │
│    Density     [Comfortable]│   │  ────────────────────────────────  │     │
│                            │   │  Theme      ○ System ○ Light ○ Dark│     │
│  STORY                      │   │  Accent    ● Gold ● Ink ● Verdig…  │     │
│    Filename template [...]  │   │  Density   ● Comfortable ○ Compact │     │
│    Language     [English ▾] │   │                                    │     │
│    Remove author notes  ☑   │   └────────────────────────────────────┘     │
│                            │                                              │
│  EPUB                       │   ┌────────────────────────────────────┐     │
│    Version        [3     ▾] │   │  Story                              │     │
│    Add info page       ☐   │   │  ...                                │     │
│    ...                     │   └────────────────────────────────────┘     │
│                            │                                              │
│  IMAGES / BEHAVIOUR / ...  │                                              │
│                            │   ┌────────────────────────────────────┐     │
│  PRIVACY                   │   │  Privacy                            │     │
│    NovelUpdates lookup  ☐  │   │  Kintsugi sends nothing to anyone.  │     │
│    Send story URL        ☐  │   │  These two are off by default.      │     │
│                            │   └────────────────────────────────────┘     │
│  ADVANCED                  │                                              │
│    Export settings          │   ┌────────────────────────────────────┐     │
│    Import settings          │   │  Site access                        │     │
│    Reset all settings        │   │  novelsite.com        [Revoke]     │     │
│                            │   │  royalroad.com        [Revoke]     │     │
│                            │   │  [Revoke all]                       │     │
│                            │   └────────────────────────────────────┘     │
└────────────────────────────┴──────────────────────────────────────────────┘
```

The **nav column** is a jump-list of settings groups; the **content column**
holds the groups themselves. The nav is sticky and the content scrolls.

### 4.1 Library

A separate tab within the options page, not a section in the settings list.

```
┌─ Library ──────────────────────────────────────────────┐
│  [ Search ]  [Import EPUB]  [Export all]                │
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────┐                    │
│  │ cover  │  │ cover  │  │ cover  │                    │
│  │        │  │        │  │        │                    │
│  │ Title  │  │ Title  │  │ Title  │                    │
│  │ author │  │ author │  │ author │                    │
│  │ 318 ch │  │  12 ch │  │  8 ch  │                    │
│  └────────┘  └────────┘  └────────┘                    │
│                                                         │
│  ▸ The Wandering Inn                                   │
│    318 chapters · 8.4 MB · updated 2 days ago           │
│    [ Search for new chapters ]  [Export EPUB]  [Delete] │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Incremental update

```
┌──────────────────────────────────────────────────────┐
│  Search for new chapters — The Wandering Inn         │
│                                                       │
│  Last checked 2 days ago                              │
│                                                       │
│  ⣾ Checking…                                          │
│                                                       │
│  ───────────────────────────────────────────────────  │
│  New chapters found: 7                                │
│                                                       │
│  ☐ Chapter 319 — The Hollow Court                    │
│  ☐ Chapter 320 — A Dagger in the Dark                 │
│  ☑ Chapter 321 — The Last Ember                      │
│  ...                                                  │
│                                                       │
│  [Cancel]                        [ Add 7 chapters ]   │
└──────────────────────────────────────────────────────┘
```

### 4.3 Reading list

A flat list of the stories the user has saved to the library but not yet
packed, with the source URL, the chapter count, and a **Pack** action per row.

---

## 5. S4 — Onboarding

Shown once, in a tab. Three full-screen steps. No network calls, no account.

### 5.1 Step 1 — Welcome

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│              ╭──────────────╮                           │
│              │              │                           │
│              │   ⬡ (large)  │                           │
│              │              │                           │
│              ╰──────────────╯                           │
│                                                          │
│              Welcome to Kintsugi                          │
│                                                          │
│   Turn any web novel into a book worth keeping.         │
│   Point it at a chapter list, and it builds a clean      │
│   EPUB — cover, table of contents, and all.              │
│                                                          │
│                                                          │
│                     [ Get started → ]                    │
│                                                          │
│              No account. No tracking. Works offline.     │
└──────────────────────────────────────────────────────────┘
```

### 5.2 Step 2 — Pick a site

```
┌──────────────────────────────────────────────────────────┐
│  ● ● ○   Step 2 of 3                                     │
│                                                          │
│  Which site are you reading?                             │
│  [ Search 437 supported sites…                    ]      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Royal Road                          novelsite.com  │  │
│  │ Scribble Hub                        scribblehub…   │  │
│  │ Novel Updates                       novelupdates…  │  │
│  │ Webnovel                            webnovel.com   │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Not listed? Kintsugi can still read it — you can build  │
│  a selector yourself.                                    │
│                                                          │
│                     [ Back ]  [ Next → ]                 │
└──────────────────────────────────────────────────────────┘
```

### 5.3 Step 3 — Theme & accent

The theme and accent apply **live on this screen**, so the choice is made by
looking at it.

```
┌──────────────────────────────────────────────────────────┐
│  ● ● ●   Step 3 of 3                                     │
│                                                          │
│  Make it yours                                          │
│                                                          │
│  Theme                                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                  │
│  │  Light  │  │  Dark   │  │ System  │                  │
│  │  ▣▣▣    │  │  ▓▓▓    │  │  ▤▤▤    │                  │
│  └─────────┘  └─────────┘  └─────────┘                  │
│                                                          │
│  Accent                                                  │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐                            │
│  │ ●  │ │ ●  │ │ ●  │ │ ●  │                            │
│  │Gold│ │Ink │ │Verd│ │Plum│                            │
│  └────┘ └────┘ └────┘ └────┘                            │
│                                                          │
│                      [ Finish ]                          │
└──────────────────────────────────────────────────────────┘
```

---

## 6. S5 — The Selector builder

Opened automatically when no parser matches, pre-filled with a heuristic guess.

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Selector builder                          novelsite.com/series/thing    │
├──────────────────────────────────┬────────────────────────────────────────┤
│  CHAPTER LIST                    │  PREVIEW                             │
│  ┌────────────────────────────┐  │  ┌──────────────────────────────────┐  │
│  │ .chapter-list a            │  │  │  Chapter 1 — The Wandering Inn   │  │
│  └────────────────────────────┘  │  │  Chapter 2 — Lily in the Woods  │  │
│                                  │  │  Chapter 3 — The Girl in the…   │  │
│  CONTENT                         │  │                                  │  │
│  ┌────────────────────────────┐  │  │  3 chapters match                │  │
│  │ .chapter-content           │  │  │                                  │  │
│  └────────────────────────────┘  │  └──────────────────────────────────┘  │
│                                  │                                        │
│  ⚠ Selector matched 0 elements   │                                        │
│                                  │                                        │
│  [ Reset ]              [ Save for this site ]                            │
└──────────────────────────────────┴────────────────────────────────────────┘
```

- The preview updates **as you type**, debounced at 150 ms.
- A selector that matches nothing shows the count inline, in `--warning` —
  never an empty box with no explanation.
- Saved selectors are stored per hostname, and are listed in the options page
  under **Site access → Custom parsers**.

---

## 7. S6 — Chapter ranges

```
┌──────────────────────────────────────────────────────┐
│  Chapter ranges                                       │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Volume 1        Chapter 1 – 48         [✕]      │  │
│  │ Arc 2           Chapter 120 – 176      [✕]      │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  [ Add range ]                                        │
│                                                       │
│  [Cancel]                              [Apply ranges]  │
└──────────────────────────────────────────────────────┘
```

This is the feature the baseline gestured at with a shift-click gesture taught
via an `alert()` dialog. It is now explicit, named, and reachable.

---

## 8. S7 — Cover picker

```
┌──────────────────────────────────────────────────────────┐
│  Choose a cover image                     24 on this page│
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │        │ │        │ │        │ │        │ │        │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐  │
│  │        │ │        │ │        │ │        │ │        │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘  │
│                                                          │
│  [Cancel]                                     [Use this] │
└──────────────────────────────────────────────────────────┘
```

Each thumbnail is a real `<button>` with an accessible name
("Image 3, 640 × 480"). The chosen thumbnail gets an accent ring.

---

## 9. S8 — Shortcut sheet

Opened with `?`.

```
┌──────────────────────────────────────────────────────┐
│  Keyboard shortcuts                             [✕] │
│  ┌──────────────────────┬──────────────────────┐      │
│  │ Ctrl/⌘ + Enter       │ Pack EPUB            │      │
│  │ Ctrl/⌘ + O           │ Focus the URL field  │      │
│  │ Ctrl/⌘ + F           │ Focus the filter     │      │
│  │ Ctrl/⌘ + A           │ Select all chapters  │      │
│  │ Ctrl/⌘ + D           │ Deselect all         │      │
│  │ Ctrl/⌘ + Shift + I   │ Invert selection     │      │
│  │ ↑ ↓                  │ Move in the list     │      │
│  │ Space                │ Toggle a chapter     │      │
│  │ Enter                │ Edit the title       │      │
│  │ Home / End           │ First / last chapter │      │
│  │ Esc                  │ Close a dialog      │      │
│  │ ?                    │ This sheet           │      │
│  └──────────────────────┴──────────────────────┘      │
└──────────────────────────────────────────────────────┘
```

---

## 10. Error presentation

The baseline's error dialog had **six equal-weight buttons** and a raw stack
trace. The new one has at most three actions and a human message first.

```
┌──────────────────────────────────────────────────────┐
│  ⚠  Could not fetch chapter 42                       │
│                                                       │
│  novelsite.com returned 503 after 3 tries.            │
│  The book may still download with this chapter        │
│  skipped.                                             │
│                                                       │
│  ▸ Show technical details                            │
│  ┌─────────────────────────────────────────────────┐  │
│  │ GET https://novelsite.com/chapter/42 → 503      │  │
│  │ after 3 attempts (0.4s, 1.2s, 3.6s)             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  [ Skip this chapter ]      [ Retry ]   [ Close ]     │
└──────────────────────────────────────────────────────┘
```

- The technical detail sits behind a `<details>` disclosure, collapsed.
- Non-fatal problems become a **toast** instead, so the dialog stays
  meaningful.
- Focus returns to the Pack button when the dialog closes.

---

## 11. The toast

```
                                          ┌────────────────────────────┐
                                          │ ✓ Chapter 42 skipped   [✕] │
                                          │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
                                          └────────────────────────────┘
```

Bottom-right, `--surface-raised`, `--shadow-2`, `--radius-lg`. Auto-dismisses
after 6 s with a visible progress bar that pauses on hover. Errors use
`role="alert"`; everything else uses `role="status"`.

---

## 12. Empty and loading states

| Where | Empty | Loading |
|---|---|---|
| Chapter list | `<k-empty>` — "No chapters found on this page", an explanation, and two actions: **Try the default parser** / **Open the selector builder** | A skeleton of ~12 rows plus a live "Searching for URLs… N found" line |
| Cover | A line-art placeholder inside the 84×120 frame | A shimmering placeholder |
| Library | `<k-empty>` — "Your library is empty", with **Import an EPUB** | Shimmer grid |
| Filters | "No chapters match these filters" + **Clear filters** | — |

---

## 13. Implementation mapping

Every screen above is implemented with the components in the design system; no
screen contains bespoke CSS.

| Screen | Components used |
|---|---|
| Workbench | `k-panel`, `k-field`, `k-checkbox`, `k-switch`, `k-select`, `k-list`, `k-list-item`, `k-button`, `k-progress`, `k-empty`, `k-skeleton`, `k-dialog`, `k-menu`, `k-toast` |
| Popup | `k-button`, `k-progress`, `k-card` (plain), `k-icon` |
| Options | `k-field`, `k-switch`, `k-select`, `k-radio-group`, `k-button`, `k-panel`, `k-dialog`, `k-empty` |
| Onboarding | `k-button`, `k-radio-group`, `k-icon` |
| Selector builder | `k-field`, `k-button`, `k-split-view` (plain) |
| Ranges / cover / shortcuts | `k-dialog`, `k-button`, `k-field`, `k-list` |

---

## 14. Related documents

- [Design system](./01-design-system.md)
- [UX guidelines](./02-ux-guidelines.md)
- [Vision](./00-vision.md)
- [Architecture](../architecture/README.md)
