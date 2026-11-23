# Kintsugi — Design System

Version 2.0 · Status: **authoritative**

This document defines every token, every component, and every rule the UI
follows. It is the contract between design and code: `src/ui/styles/tokens.css`
and `src/ui/styles/base.css` implement it literally, and the component
library in `src/ui/components/` may not deviate from it.

The screen-by-screen specifications are in
[03-screen-designs.md](./03-screen-designs.md); the behavioural rules are in
[02-ux-guidelines.md](./02-ux-guidelines.md).

---

## 1. Foundations

### 1.1 The three-layer token model

```
Layer 1  primitives   --raw-values      e.g.  --amber-500: #f59e0b
Layer 2  semantics   --role-values      e.g.  --accent: var(--amber-500)
Layer 3  components  --component-parts  e.g.  --button-bg: var(--accent)
```

Components may only reference **Layer 2 or 3**. A raw hex value appearing in
component CSS is a bug and is caught by the lint rule
`no-raw-colors-in-components`.

```
Primitives (Layer 1)  →  Semantics (Layer 2)  →  Components (Layer 3)
   palette ramps          role tokens             part tokens
   never used directly    referenced by          referenced by
                          components              components
```

This is what makes theming possible: a new accent colour, a new density, or a
new theme rewrites **Layer 2 only**.

### 1.2 Type scale

A 1.200 (major third-ish) scale, base 14 px, with a **1.25 ratio** used for
the display sizes so headings do not balloon in a narrow panel.

| Token | Size | Line height | Weight | Use |
|---|---|---|---|---|
| `--text-3xs` | 10 px | 1.4 | 500 | Legal, badge counters |
| `--text-2xs` | 11 px | 1.45 | 500 | Meta, captions, timestamps |
| `--text-xs` | 12 px | 1.5 | 500 | Dense table cells, helper text |
| `--text-sm` | 13 px | 1.5 | 400 | Secondary UI, table headers |
| `--text-base` | **14 px** | 1.55 | 400 | Body, inputs, buttons |
| `--text-md` | 15 px | 1.5 | 500 | Card titles |
| `--text-lg` | 17 px | 1.4 | 600 | Section headings |
| `--text-xl` | 20 px | 1.3 | 650 | Page titles |
| `--text-2xl` | 25 px | 1.25 | 680 | Hero numerals, splash |

**Font stack:** `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
Arial, sans-serif`. One stack, everywhere. The original's "Arial on buttons,
system-ui on everything else" split is eliminated.

**Numeric tabular figures:** any number that can change in place (chapter
counts, byte totals, progress percentage) uses
`font-variant-numeric: tabular-nums` so it does not jitter as it updates.

### 1.3 Spacing scale

Base unit **4 px**. The scale is deliberately short — long scales invite
off-scale values.

| Token | Value | Typical use |
|---|---|---|
| `--space-0` | 0 | reset |
| `--space-1` | 2 px | hairline nudges, icon gaps |
| `--space-2` | 4 px | icon-to-label, dense list items |
| `--space-3` | 8 px | between related controls, cell padding |
| `--space-4` | 12 px | input padding, list item padding |
| `--space-5` | 16 px | between groups, card padding (compact) |
| `--space-6` | 24 px | card padding (comfortable), section gap |
| `--space-7` | 32 px | major section separation |
| `--space-8` | 48 px | hero / splash spacing |
| `--space-9` | 64 px | oversized empty-state spacing |

**Rule:** every margin, padding, and gap in the product is one of these
values. `--space-half` (2 px) and `--space-double` (32 px) are aliases for
components that need them.

### 1.4 Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4 px | checkboxes, small chips, table cells |
| `--radius-sm` | 6 px | inputs, small buttons, badges |
| `--radius-md` | 10 px | buttons, dropdown menus, popovers |
| `--radius-lg` | 14 px | cards, panels |
| `--radius-xl` | 20 px | dialogs, hero surfaces |
| `--radius-full` | 9999 px | pills, avatars, spinner |

### 1.5 Elevation

Two real shadows plus a border, because flat-but-separated is the modern
idiom and pure flat loses hierarchy in dark mode.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--shadow-1` | `0 1px 2px rgb(16 12 4 / .06), 0 1px 1px rgb(16 12 4 / .04)` | `0 1px 2px rgb(0 0 0 / .40)` | Resting card, button |
| `--shadow-2` | `0 6px 16px -4px rgb(16 12 4 / .12), 0 2px 6px -2px rgb(16 12 4 / .06)` | `0 6px 16px -4px rgb(0 0 0 / .55)` | Popover, dropdown, sticky header when scrolled |
| `--shadow-3` | `0 24px 48px -12px rgb(16 12 4 / .28)` | `0 24px 48px -12px rgb(0 0 0 / .70)` | Dialog |
| `--ring` | `0 0 0 3px var(--focus-ring)` | same | Focus ring (offset from the element) |

### 1.6 Motion

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.22, 1, .36, 1)` | Entrances, most transitions |
| `--ease-in-out` | `cubic-bezier(.65, 0, .35, 1)` | Reversible state changes |
| `--ease-spring` | `cubic-bezier(.34, 1.56, .64, 1)` | The **only** overshoot allowed, and only for the toast |
| `--dur-instant` | 80 ms | hover, press |
| `--dur-fast` | 140 ms | focus ring, small reveals |
| `--dur-base` | 200 ms | panel transitions, dropdowns |
| `--dur-slow` | 320 ms | dialogs, large reveals |

**Rules:**
- Only `transform`, `opacity`, and `background-color`/`border-color` animate.
  Never `width`, `height`, `top`, `left`, or `margin` — those cause layout
  thrash and break the 60 fps budget.
- Every animation is wrapped in
  `@media (prefers-reduced-motion: no-preference)`.
- Under `prefers-reduced-motion: reduce`, transitions collapse to `1ms` and
  transforms are removed, but the *end state* is always identical.

### 1.7 Layering

| Token | z-index | Use |
|---|---|---|
| `--z-base` | 0 | Page content |
| `--z-sticky` | 10 | Sticky header, sticky table header |
| `--z-drawer` | 40 | Slide-over panels |
| `--z-dropdown` | 50 | Menus, popovers |
| `--z-toast` | 70 | Toasts |
| `--z-dialog` | 80 | Modal dialogs |
| `--z-tooltip` | 90 | Tooltips |

---

## 2. Colour

### 2.1 Accent: "Gold"

The kintsugi metaphor gives us the accent for free: **gold**. But the raw
gold of a kintsugi repair is a warm yellow-brown, which fails contrast as a
button background and reads as "warning" in a Western UI. So the accent is
tuned: a **saturated amber-gold** for light theme, and a slightly cooler,
brighter gold for dark theme where it needs to survive on a dark field.

Light theme accent: `#B5751A` → contrast on white **4.6:1** ✓
Dark theme accent: `#F0B429` → contrast on `#17151200` **8.9:1** ✓

Accent ramp (light theme is anchored at 600, dark theme at 400):

| Step | Light | Dark |
|---|---|---|
| `--accent-100` | `#FDF3E0` | `#3A2C10` |
| `--accent-200` | `#FAE5BE` | `#4E3B16` |
| `--accent-300` | `#F4CE84` | `#6B511C` |
| `--accent-400` | `#EDB44A` | `#E5A82E` |
| `--accent-500` | `#D99224` | `#F0B429` |
| `--accent-600` | `#B5751A` | `#D9A031` |
| `--accent-700` | `#8E5A14` | `#B37D22` |
| `--accent-800` | `#6B4310` | `#8C611C` |
| `--accent-900` | `#4E300C` | `#6B4A16` |

The user can override the accent with a **user-chosen hue** (see §6.3). The
override shifts the ramp by hue rotation, preserving lightness, so contrast is
guaranteed. Four curated options are offered: **Gold** (default), **Ink**
(indigo), **Verdigris** (teal), **Plum** (magenta).

### 2.2 Neutral ramp — "Ash"

A **warm** neutral, so the interface sits in the same family as the gold
accent and the paper-like subject matter. A pure grey ramp next to a gold
accent looks cheap.

| Step | Light | Dark | Typical role |
|---|---|---|---|
| `--gray-0` | `#FFFFFF` | `#171512` | Page background (light) / deepest surface (dark) |
| `--gray-50` | `#FAF8F4` | `#201D19` | Subtle surface |
| `--gray-100` | `#F2EFE8` | `#282420` | Panel background, input background |
| `--gray-200` | `#E5E0D5` | `#353028` | Dividers, table borders |
| `--gray-300` | `#CFC8B9` | `#4A443B` | Strong borders, disabled border |
| `--gray-400` | `#A69E8D` | `#6A6355` | Placeholder text, icon |
| `--gray-500` | `#7C7466` | `#8C8474` | Secondary text |
| `--gray-600` | `#5A5348` | `#ADA595` | Body text (dark) |
| `--gray-700` | `#403B33` | `#CFC8BA` | Strong text (dark) |
| `--gray-800` | `#2A261F` | `#EDE8DD` | Heading text (dark) |
| `--gray-900` | `#1A1713` | `#F7F4ED` | Heading text (light) |

### 2.3 Status ramp

| Role | Light | Dark | Contrast on surface |
|---|---|---|---|
| `--success` | `#1F7A4D` | `#5DD39E` | 4.9:1 / 9.2:1 ✓ |
| `--warning` | `#9A5B00` | `#F5B740` | 5.1:1 / 10.1:1 ✓ |
| `--danger` | `#B3261E` | `#FF8A80` | 5.6:1 / 8.4:1 ✓ |
| `--info` | `#1D5FA8` | `#79B8FF` | 5.4:1 / 8.9:1 ✓ |

Note the original's `#ff0000` warning text measured **4.00:1** — a WCAG AA
failure. `--warning` here measures **5.1:1** on the light surface.

### 2.4 Semantic tokens (Layer 2)

```
/* surfaces */
--bg                 page background
--bg-subtle         recessed background (empty-state wells, code blocks)
--surface            card / panel background
--surface-raised     dropdown, popover
--surface-sunken     table header strip, wells

/* content */
--text               primary text
--text-secondary     supporting text
--text-muted         placeholder, disabled
--text-on-accent     text on a filled accent surface
--text-inverse       text on an inverted (toast) surface

/* lines */
--border             default border
--border-strong      emphasised border, input border
--border-subtle      hairline divider

/* brand */
--accent             primary accent
--accent-hover
--accent-active
--accent-subtle      tinted background (selected rows, badges)
--accent-text        accent-coloured text on a neutral surface

/* status */
--success / --success-subtle
--warning / --warning-subtle
--danger  / --danger-subtle
--info    / --info-subtle

/* focus */
--focus-ring         the focus ring colour
--focus-ring-width
```

### 2.5 Theme definitions

**Light** (`data-theme="light"`):

```css
--bg:            var(--gray-0);   /* #FFFFFF */
--bg-subtle:     var(--gray-50);
--surface:       var(--gray-0);
--surface-raised: var(--gray-0);
--surface-sunken: var(--gray-50);
--text:          var(--gray-900);
--text-secondary:var(--gray-600);
--text-muted:    var(--gray-500);
--border:        var(--gray-200);
--border-strong: var(--gray-300);
--accent:        var(--accent-600);
```

**Dark** (`data-theme="dark"`):

```css
--bg:            var(--gray-0);   /* #171512 */
--bg-subtle:     var(--gray-50);
--surface:       var(--gray-50);
--surface-raised:var(--gray-100);
--surface-sunken:var(--gray-50);
--text:          var(--gray-800);
--text-secondary:var(--gray-700);
--text-muted:    var(--gray-600);
--border:        var(--gray-200);
--border-strong: var(--gray-300);
--accent:        var(--accent-400);
```

**System** — the `data-theme` attribute is resolved at runtime by the theme
controller, which listens to `matchMedia("(prefers-color-scheme: dark)")`.
The stylesheet only ever sees `light` or `dark`; there is no third
stylesheet, no `disabled` attribute toggling, and no cascade-order
dependency. This eliminates the original's biggest dark-mode fragility.

---

## 3. Layout

### 3.1 The shell

```
┌──────────────────────────────────────────────┐
│  ◆ Kintsugi        [Story Title]   [Pack ▸]  │  ← sticky app bar (56px)
├──────────────────────────────────────────────┤
│                                              │
│              <main>  scroll region           │  ← the only scroll container
│                                              │
├──────────────────────────────────────────────┤
│  ◷ 42 / 318 chapters          ▓▓▓▓░░░  13%  │  ← status bar (32px)
└──────────────────────────────────────────────┘
```

- **App bar (sticky):** product mark, live story title (truncated with
  ellipsis, `title` attribute for the full text), and the **single primary
  action** on the right.
- **Main:** the one scroll region. Everything else is fixed. This is what
  keeps the primary action reachable at any scroll position.
- **Status bar (sticky bottom):** live progress — chapter counter, phase
  label, and a determinate progress bar. Doubles as the place where the
  cancel action appears.

### 3.2 Panel model

Content is organised into **panels** — collapsible sections with a header
that always shows a title and a summary. A panel is the unit of the
information hierarchy.

```
┌─ Story details ───────────────────  4 fields ─┐
│  Title    [The Wandering Inn              ]    │
│  Author   [ innkeeper                      ]    │
└────────────────────────────────────────────────┘
```

Header: `title` (left) · `summary` (right, muted) · chevron (right).
Collapsed panels show only the header. Expanded panels show the body.

Panels are **not** all expanded by default. The default expansion depends on
the panel's importance:

| Panel | Default | Rationale |
|---|---|---|
| Story details | expanded | Needs review before packing |
| Chapters | expanded | The main event |
| Cover | collapsed | Usually right already |
| Advanced metadata | collapsed | Rarely needed |
| Options | collapsed | Rarely needed |

### 3.3 Responsive behaviour

The extension runs in a **tab**, so width varies a lot. Three breakpoints:

| Range | Layout |
|---|---|
| `< 560px` | Single column. App bar collapses the title to nothing; the Pack button becomes icon+label. |
| `560–959px` | Single column, full padding, two-column form grids where the label is short enough. |
| `≥ 960px` | **Two-column**: a fixed 320 px sidebar (Story details, Cover, Options) beside a fluid main column (Chapters, Advanced metadata). This is the "reading room" layout. |

The two-column layout at ≥960 px is the reason the revamp is worth doing in a
tab: on a wide screen the chapter list gets room to breathe while the
metadata stays in view.

### 3.4 The chapter list

The densest surface, and the one that must feel fast.

- **Virtualised.** Only visible rows are in the DOM. 5 000 chapters must not
  cost 5 000 DOM nodes.
- **Row height 32 px** (comfortable) or 28 px (compact).
- **Columns:** `[checkbox 28] [state icon 20] [title — flexible] [size 56]`.
- Title is **one line, ellipsised**, with the full title in a `title`
  attribute and in the accessible name. The original sized the `<input>` to
  the longest title, which blew out the table; that is gone.
- The title is editable via **double-click**, which swaps the text for an
  input. Editing is opt-in, so the default view stays clean and fast.
- Selected rows get `--accent-subtle` background. Hover gets `--surface-sunken`.
- The state icon has a **visible** shape for every state including "not
  started" (a hollow ring) — the original used a transparent 32×32 PNG, so
  "not started" was indistinguishable from "failed to render".

---

## 4. Components

Every component is a native Web Component with a Shadow DOM, so its internal
CSS cannot leak and cannot be broken by page styles. Each one is documented
here with its states, its accessibility contract, and its keyboard contract.

### 4.1 `<k-button>`

**Variants:** `primary` · `secondary` · `ghost` · `danger` · `subtle`

| Variant | Rest | Hover | Active | Use |
|---|---|---|---|---|
| `primary` | `--accent` bg, `--text-on-accent` | `--accent-hover` | `--accent-active`, `scale(.98)` | The one primary action |
| `secondary` | `--surface` bg, `--border-strong` | `--bg-subtle` | `--surface-sunken` | Everything else |
| `ghost` | transparent | `--bg-subtle` | `--surface-sunken` | Toolbar actions, dismiss |
| `danger` | `--danger` bg, white text | `--danger-hover` | — | Destructive, confirmed first |
| `subtle` | `--accent-subtle` bg, `--accent-text` | `--accent-bg-hover` | — | Inline, low emphasis |

**Sizes:** `sm` (28 px, `--text-xs`) · `md` (34 px, `--text-sm`) ·
`lg` (42 px, `--text-base`)

**States:** `rest` · `hover` · `active` · `focus-visible` · `disabled` ·
`loading` · `icon-only`

**Loading:** the label is replaced by a spinner of the same optical size and
the accessible name is preserved (`aria-busy="true"`). The button does **not**
change width when it enters the loading state — a layout shift on the
primary action is unacceptable.

**Icon-only:** must supply `aria-label`. Minimum hit target 32×32 (comfortable)
or 28×28 (compact).

**Accessibility:** native `<button>` under the hood → free semantics, free
activation, free `:focus-visible`.

### 4.2 `<k-field>`

Label + control + optional hint + optional error, in a vertical stack.

```
Label                      ← --text-sm, --text-secondary, weight 500
[ input                    ← --text-base, full width, --radius-sm
  ]                        ← --border-strong, --surface-raised
Hint text                  ← --text-xs, --text-muted
```

- The `<label>` is a real `<label for>` — **not** a `<td>`.
- `hint` is wired via `aria-describedby`; `error` via `aria-describedby` +
  `aria-invalid="true"`.
- The error message has an icon and `--danger` text. The border also turns
  `--danger` — the error is not conveyed by colour alone.
- `horizontal` variant puts the label to the left (fixed 132 px) for dense
  forms.

### 4.3 `<k-checkbox>`

Native `<input type="checkbox">` with a custom 16 px box.

- Indeterminate state is supported and rendered as a dash.
- The label is **part of the component**, so clicking the text toggles the
  box — the original's `<td>label</td><td><input>` pattern made the text
  unclickable.
- `disabled` renders at `--text-muted` on `--surface-sunken`, not at
  `opacity: 0.5` (which in dark mode made disabled look enabled).

### 4.4 `<k-panel>`

The collapsible section described in §3.2.

```html
<k-panel heading="Story details" summary="4 fields" ?open>
  …body…
</k-panel>
```

- Uses `<details>`/`<summary>` semantics under the hood → free keyboard
  behaviour, free screen-reader semantics.
- `aria-expanded` managed by the native element.
- Animation: the body fades and translates 4 px over `--dur-base`.
  Height animation is **not** used (layout cost); the body simply appears.

### 4.5 `<k-select>`

Native `<select>` with a custom chevron. Styling a native select is limited,
but keeping it native preserves OS picker behaviour, mobile support, and
accessibility for free. The custom chevron is `pointer-events: none`.

### 4.6 `<k-progress>`

Determinate progress bar.

- `<progress>` semantics with `aria-valuenow`/`aria-valuetext`.
- The fill animates over `--dur-base` with `--ease-out`, so the bar *glides*
  between chapter counts instead of teleporting. This is the single
  highest-value motion in the product: a run can take 30 minutes, and a
  teleporting bar reads as "stuck".
- The bar sits in the **status bar**, not as a giant slab in the middle of the
  page. At idle it is hidden entirely, not shown empty.
- Companion `aria-live="polite"` region announces "Chapter 42 of 318" at
  most every 5 seconds, so a screen reader is not flooded.

### 4.7 `<k-list>` / `<k-list-item>`

The chapter list primitive.

- `<k-list>` is a `role="list"` container with a roving-tabindex
  virtualisation model: exactly one item is tabbable at a time; arrow keys
  move within the list; Home/End jump to the ends; Space toggles selection.
- This turns 5 000 chapters from 10 000 tab stops into **one**.
- `<k-list-item>` exposes `aria-selected` for the checkbox state and
  announces the download state in its accessible name.

### 4.8 `<k-dialog>`

A modal dialog using the native `<dialog>` element.

- `showModal()` gives focus trapping, `Escape` handling, and the top layer
  for free, with correct inertness of the background.
- Backdrop is `--bg` at 55 % plus a 2 px backdrop blur.
- The dialog is `--radius-xl`, `--shadow-3`, `--surface-raised`.
- Header: title + close button. Body. Footer: actions, right-aligned, with
  the destructive action separated by a divider.

### 4.9 `<k-toast>`

Transient, non-blocking, bottom-right.

- `role="status"` + `aria-live="polite"` (or `role="alert"` for errors).
- Auto-dismisses after 6 s, with a visible progress bar and a pause on hover.
- `prefers-reduced-motion` removes the slide, keeps the fade.

### 4.10 `<k-empty>`

The designed empty state.

- Centred composition: an inline SVG illustration (a 96 px line-art glyph
  drawn on a 2 px stroke grid, matching the icon system), a heading, a
  sentence explaining *what would go here*, and — where relevant — a primary
  action that creates it.
- Illustrations are **line art**, not filled cartoons, matching the icon
  system exactly.

### 4.11 `<k-skeleton>`

The designed loading state.

- A shimmer block matching the shape of the content that is coming.
- `aria-hidden="true"`; the loading region carries `aria-busy="true"` and a
  visually-hidden "Loading…" label.
- The shimmer is a 1.2 s translate of a gradient; disabled under reduced
  motion (the skeleton simply stays static).

### 4.12 `<k-tooltip>`

- Shown on hover **and** `:focus-visible`.
- Positioned with a CSS anchor where available, with a JS fallback.
- `role="tooltip"`, wired via `aria-describedby`.
- Never the *only* way to get information — the download-state icon also
  carries a text label in its accessible name.

### 4.13 `<k-switch>`

A binary setting that takes effect immediately (as opposed to a checkbox
that needs "Apply").

- Native `<input type="checkbox" role="switch">`.
- Used for theme, density, and other immediate-effect preferences.

### 4.14 `<k-menu>`

An overflow menu for secondary actions — used to collapse the original's
six-button error row into two visible buttons plus a menu.

- Native `<button aria-haspopup="menu">` + a `role="menu"` list.
- Arrow-key navigation, `Escape` closes and restores focus.

### 4.15 Icon system

- One set: **24×24 viewBox, 2 px stroke, round caps and joins**, drawn on a
  24-unit grid.
- Icons inherit `currentColor`; they never hardcode a colour.
- Sizes: 16 (inline, in text), 20 (table cells, buttons), 24 (toolbar,
  empty states at 48).
- Stroke weight is constant. No filled variants except where a filled state is
  meaningful (a selected checkbox).
- Total set: ~28 icons, hand-authored as inline SVG in a single
  `icons.ts` module.

---

## 5. Typography rules

- **One font stack.** No exceptions.
- Body text is `--text-base` / 14 px. Table cells `--text-xs` / 12 px.
- **Headings carry weight, not size alone.** A section heading is 17 px / 600;
  a card title is 15 px / 500. Weight does the work.
- Line length: paragraph text is capped at **68ch**. The extension has no
  long-form paragraphs, but the "About this story" description field does.
- **Truncation:** single-line with `text-overflow: ellipsis` and a `title`
  attribute for the full value. Never truncate mid-word without the tooltip.
- **Numbers** that change in place use `font-variant-numeric: tabular-nums`.
- Uppercase is used **only** for small section eyebrows (11 px, `--text-2xs`,
  `letter-spacing: .06em`, `--text-muted`) — never for headings or buttons.

---

## 6. Settings & personalisation

The settings surface is a **grouped list**, not a flat wall of 45 controls.
Each group is a panel with a heading.

| Group | Contents |
|---|---|
| **Appearance** | Theme (system / light / dark), Accent colour, Density (comfortable / compact), Reduce motion override |
| **Story** | Default filename template, Default language, Remove author notes, Remove chapter numbers, Include the TOC page as a chapter |
| **EPUB** | EPUB version (2 / 3), Add an information page, Remove next/previous chapter links, Include the source URL in each chapter |
| **Images** | Skip images, Remove duplicates, Prefer highest resolution, Use SVG, Compress images, Max resolution |
| **Behaviour** | Skip chapters that fail to fetch, Retry on empty page, Minimum delay per request, Max chapters per EPUB, Custom delay per chapter |
| **Privacy** | NovelUpdates metadata lookup (off by default), Send the story URL to the metadata service (off by default) |
| **Advanced** | Developer diagnostics, Export settings, Import settings, Reset all settings |

Two new switches live here:
- **Accent colour** — Gold / Ink / Verdigris / Plum. Applied by rewriting
  Layer 2 only.
- **Density** — Comfortable / Compact. Scales `--space-*` by 1.0 / 0.75 and
  switches the base font to 13 px.

---

## 7. Motion catalogue

| Interaction | Motion | Duration |
|---|---|---|
| Button hover | `background-color` | `--dur-instant` |
| Button press | `scale(0.98)` | `--dur-instant` |
| Focus ring | `box-shadow` fade-in | `--dur-fast` |
| Panel expand/collapse | opacity + `translateY(4px)` | `--dur-base` |
| Dialog open | opacity + `scale(.97)` + backdrop fade | `--dur-base` |
| Dropdown open | opacity + `translateY(-4px)` | `--dur-fast` |
| Progress fill | `width` via `transform: scaleX()` | `--dur-base` |
| Toast in/out | `translateY(8px)` + opacity | `--dur-base` |
| Skeleton shimmer | background-position sweep | 1.2 s loop |
| List row selection | `background-color` | `--dur-instant` |

**Nothing else moves.** No page transitions, no parallax, no animated icons.

---

## 8. Accessibility contract (binding)

1. Every interactive element is reachable by keyboard and operable with
   `Enter` / `Space` / arrows where appropriate.
2. Every input has an accessible name via `<label for>` or `aria-label`.
3. Every icon-only control has `aria-label`.
4. Focus is **always** visible: `--ring` is never removed, and
   `:focus-visible` is used (not `:focus`) so mouse users do not see rings.
5. Colour is never the sole carrier of information (status icons have shapes;
   errors have icons and text).
6. Text contrast ≥ **4.5:1**; large text ≥ 3:1; UI borders ≥ 3:1.
7. Dialogs use native `<dialog>` → focus trap, `Escape`, and inertness for
   free.
8. Live regions: `aria-live="polite"` for progress and toasts,
   `role="alert"` for errors.
9. The chapter list uses a roving tabindex — one tab stop, not thousands.
10. `prefers-reduced-motion: reduce` removes transforms and shortens
    transitions to 1 ms. End states are identical.
11. The layout works at 200 % browser zoom without horizontal scrolling of
    the primary form.

---

## 9. Anti-patterns (do not do these)

| Anti-pattern | Why | Instead |
|---|---|---|
| Raw hex in component CSS | Breaks theming | Layer 2 tokens |
| `opacity: 0.5` for disabled | Unreadable in dark mode | `--text-muted` + `--surface-sunken` |
| `<td>label</td>` next to an input | Not a label; text isn't clickable | `<k-field>` |
| `alert()` / `confirm()` | Unstyled, blocking, unfocusable | `<k-dialog>` |
| A `<div>` as a close button | Not focusable, no name | `<k-button variant="ghost">` |
| `visibility: hidden` tooltips | Not in the a11y tree | `:focus-visible` too |
| Animating `width`/`height`/`top` | Layout thrash | `transform` / `opacity` |
| `transition: all` | Animates unintended properties | Name the property |
| `!important` in component CSS | Specificity wars | Custom properties |
| `font-size` on the icon | Distorts stroke | Fixed icon sizes |
| A permanently visible empty progress bar | Wastes the largest visual element | Hide until work starts |
| Native `select`/`input` styled only by colour | Poor contrast | Tokenised variants |
