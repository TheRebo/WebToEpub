# Kintsugi — Vision & Design Principles

> **金継ぎ (kintsugi)** — the Japanese art of repairing broken pottery with
> gold. The cracks are not hidden; they become the most beautiful part of the
> object. A vessel that has been broken and mended is worth more than one that
> never broke.

---

## 1. The name

**Kintsugi** is the name of the revamped extension.

The original, WebToEpub, describes a mechanism. *Kintsugi* describes the
philosophy we are bringing to it: the extension takes scattered, broken
web pages — different markup, different structures, different languages — and
mends them into one coherent, durable object. The seams between sites remain
visible as the gold: each site keeps its own character, but the result is a
single beautiful volume.

The name also sets the bar. A kintsugi repair is *never* merely functional.
It is an argument that the object deserves more than it had. That is exactly
the argument this revamp makes about the interface.

**Positioning line:** *Turn any web novel into a book worth keeping.*

---

## 2. What we are building

A Firefox extension that turns episodic web fiction into well-formed EPUB
files, and does it in an interface that feels like a product rather than a
utility.

The functional engine already exists and is genuinely good: 437 site parsers, a
paginated-TOC walker, a library that tracks new chapters, and a heuristic
fallback that handles sites nobody wrote a parser for. **That engine is the
asset.** The revamp is about everything *around* it:

| Before | After |
|---|---|
| A 1090-line HTML file with a 466-entry hand-maintained script list | A component-based UI with a real build step |
| 15 hardcoded hex colours, 3 font sizes, 6 border radii | A token-driven design system with scales, elevation, and motion |
| "Dark mode" = 5 declarations of inverted background | Three first-class themes, each designed |
| Primary action 13 rows below the fold, identical to every other button | A sticky header with one unmistakable primary action |
| 0 ARIA attributes, 0 focus styles, 1 heading | WCAG 2.2 AA: landmarks, labels, focus rings, live regions, dialogs |
| 1 animation, no reduced-motion support | A motion system with `prefers-reduced-motion` honoured throughout |
| 6 equal-weight error buttons, raw stack traces | A designed error surface with human-readable messages |
| No empty, loading, or error states anywhere | Every state designed |
| 7 permissions incl. `webRequest` + `unlimitedStorage` | 4 permissions, host access made optional |

---

## 3. Design principles

These are the rules we design against. When two options are equally good, the
one that better satisfies a principle wins. When an option conflicts with a
principle, the principle wins.

### P1 — The primary action is never ambiguous

A user should be able to open the extension and know, within one second, what
the main thing it does is. There is exactly **one** primary action per
screen, it is visually distinct from everything else, and it is always
reachable without scrolling.

> *In practice:* one filled accent button, top-right of a sticky header.
> Nothing else in the product uses that treatment.

### P2 — Design every state, or it doesn't exist

A control that has only a happy path is a bug. Empty, loading, error, offline,
success, disabled, focus, and "in progress" are all *designed* surfaces, not
accidents. The user should never encounter a raw, unstyled, or default-looking
state.

> *In practice:* a skeleton list while the chapter list loads; an illustrated
> empty state in the library; a designed dialog for errors; a spinner in the
> primary button while it works.

### P3 — Density is a feature, not an accident

Extension surfaces are small. The design must be **compact but breathable**:
a tight, consistent grid; a deliberate spacing scale; dense where density
helps (chapter lists, tables) and generous where it matters (the primary form,
empty states).

> *In practice:* an 8 px base grid, a 4/8/12/16/24/32 spacing scale, and a
> user-facing density toggle that scales the base unit.

### P4 — Motion explains, never decorates

Every animation must answer a question the user is asking: *did that work? is
something happening? where did that go?* Anything purely decorative is cut.
All motion is fast (80–240 ms), interruptible, and fully disabled under
`prefers-reduced-motion: reduce`.

> *In practice:* the progress bar eases between values; panels fade and lift;
> the primary button shows a spinner while working. Nothing bounces.

### P5 — Dark mode is designed, not inverted

Dark mode is a **first-class theme**, not a filter applied to a light theme. It
gets its own surfaces, its own elevation model, its own accent tuning, and
`color-scheme: dark` so native widgets match. Light and dark must feel like
two members of the same family.

> *In practice:* one token file, two token sets, one component library.

### P6 — Accessible by construction, not by audit

Labels, roles, focus order, focus visibility, and announcements are part of
the component definition, not a cleanup pass. If a component cannot be built
accessibly, the component is wrong.

> *In practice:* every input has a `<label for>`; every icon-only control has
> an accessible name; focus rings are a token, never removed; progress is
> announced via `aria-live`.

### P7 — The user's data stays on their machine

No telemetry, no accounts, no sync, no remote code. Preferences, reading
list, and library are local. Any request that leaves the machine for a
third party is opt-in, explained, and reversible.

> *In practice:* `data_collection_permissions: { required: ["none"] }` stays
> exactly as it is.

### P8 — Keyboard first, mouse second

Every action has a keyboard path. Every mouse-only gesture has a keyboard
equivalent. Focus is always visible.

> *In practice:* `Ctrl/Cmd+Enter` packs the EPUB; `Escape` closes any overlay;
> shift-click range selection has a keyboard equivalent; a skip link jumps
> past the chapter list.

### P9 — Honest about state and failure

If something failed, say what failed and what the user can do about it. If an
action is in progress, show it. If a control is unavailable, say why. Never
show a raw stack trace. Never silently produce a partial result.

> *In practice:* errors are a designed dialog with a human message, the
> technical detail behind a disclosure, and up to two clear next actions.

### P10 — One system, not a collection of screens

Every surface uses the same tokens and the same components. A new screen is
assembled from existing parts, never designed from scratch.

> *In practice:* one `Button`, one `Field`, one `Panel`, one `Table`. New UI
> is composition.

---

## 4. The three audiences we design for

**The impatient collector.** They have 40 tabs open and a 3 000-chapter novel
to get through. They want the chapter list, the range control, and Pack.
Nothing else should stand between them and the EPUB.

**The careful archivist.** They maintain a library, re-check metadata, and
care whether the cover is right. They need precision and the ability to undo.

**The first-time user.** They clicked the icon and have no idea what happens
next. They need the first thirty seconds to be self-explanatory.

Every screen is checked against all three.

---

## 5. What we are deliberately *not* doing

| Not doing | Why |
|---|---|
| Chrome support | The brief scopes the revamp to Firefox. MV3 in Chrome differs enough (no blocking `webRequest`, different service-worker lifecycle) that supporting it would compromise the Firefox-first design. The manifest still declares `minimum_chrome_version` so the code does not silently break if someone loads it. |
| A design system in the React sense | The extension needs to stay small and dependency-light. A hand-rolled component layer over native Web Components gives us the same consistency with a fraction of the bundle. |
| Telemetry, accounts, or sync | P7. Non-negotiable. |
| A redesign of the parser contract | 437 parsers depend on it. Changing it would burn the entire effort budget on migration for no user-visible gain. |
| Animated illustrations / decorative motion | P4. |

---

## 6. Success criteria

The revamp is done when:

1. A user can go from a chapter page to a saved EPUB in **two clicks and no
   scrolling**, on a 720 px-wide window.
2. Every screen has a designed empty, loading, error, and success state.
3. Light and dark themes are both first-class and share one component library.
4. The whole product passes axe-core with zero critical/serious violations,
   and every interactive element is reachable and operable by keyboard.
5. The permission set is **smaller** than the original and every permission
   has a written justification.
6. The chapter list renders 5 000 rows without a frame drop.
7. The core logic has a test suite that runs headlessly in CI.
8. The build produces a `.xpi` that installs in Firefox with zero warnings.
