# ADR-0003 — A design-token-driven component library on native Web Components

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0001](ADR-0001-rewrite-from-scratch.md), [Design system](../design/01-design-system.md)

---

## Context

The baseline UI is one 1090-line HTML file. Its visual language is:

- 15 literal hex colours across 3 CSS files, with **no CSS custom properties**,
- 3 font sizes and **no type scale**, with a two-typeface split
  (`Arial` on buttons, system-ui everywhere else),
- 15+ arbitrary spacing values and **no spacing scale**,
- 6 different border radii and **exactly one shadow**,
- 0 ARIA attributes, 0 `:focus` styles, 1 heading element,
- a "dark mode" implemented as 5 declarations of inverted background colour,
  whose correctness depends on stylesheet load order,
- 1 animation, no `prefers-reduced-motion` support,
- no empty, loading, or error states on any surface.

Meanwhile the codebase's 18 inline `style=` attributes and ~10 hardcoded
colours in JavaScript show how hard it is to keep a theme coherent in a
markup-and-script codebase without tokens.

We need a design system that:

1. makes light and dark both first-class,
2. makes theming (accent colour, density) possible without touching
   component code,
3. is enforceable, not merely documented,
4. keeps the bundle small.

## Decision

We build a **token-driven component library using native Web Components with
Shadow DOM**, with no UI framework dependency.

### Layer 1 — Primitives

Raw palette ramps and scales, defined once in `tokens.css`:
`--gray-0` … `--gray-900`, `--accent-100` … `--accent-900`, status ramps,
the type scale, the spacing scale, the radius scale, the elevation scale, the
motion tokens, and the z-index scale.

Primitives are **never referenced by components**.

### Layer 2 — Semantics

Role tokens that map primitives to meaning:
`--bg`, `--surface`, `--text`, `--text-secondary`, `--border`, `--accent`,
`--danger`, `--focus-ring`, …

The **entire light/dark difference lives here**. A theme is a single block of
Layer 2 overrides. Adding a theme, changing the accent, or changing the
density never touches a component.

### Layer 3 — Component parts

Per-component part tokens (`--button-bg`, `--input-border`, …) defined in each
component's stylesheet, referencing Layer 2.

### Enforcement

- A custom ESLint rule (`no-raw-colors-in-components`) fails the build if a
  component stylesheet contains a raw hex, `rgb()`, or a named colour.
- A unit test parses `tokens.css` and asserts that every Layer 2 token is
  defined in **both** the light and dark theme blocks — so a token cannot be
  added to one theme and forgotten in the other.
- A unit test computes the WCAG contrast ratio of every foreground/background
  token pair that the design system documents, and fails below the required
  threshold. The original's `#ff0000` warning text (4.00:1) and its
  `Chartreuse` badge (~1.4:1) would both fail this test.

### Why Web Components

- **Style encapsulation for free.** A component's CSS cannot leak out and
  page styles cannot leak in. The baseline had 18 inline styles fighting
  three stylesheets.
- **No framework.** The bundle stays small, which matters for an extension
  that Firefox must load instantly.
- **Native semantics.** `<k-dialog>` wraps a native `<dialog>`, which gives
  focus trapping, `Escape`, and top-layer rendering for free — the exact
  things the baseline's error dialog had to fake with `hidden` toggling.

### Why not a framework

A framework would have brought component patterns faster, but it also brings a
runtime. For a 15-component extension surface, a hand-rolled layer over
native elements is roughly a quarter of the size and has no upgrade treadmill.
The design system's rigour comes from the **token model and the lint/test
enforcement**, not from the component implementation technology.

## Alternatives considered

| Alternative                                        | Why rejected                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plain CSS + a shared stylesheet, no components** | The baseline proved this fails: markup drifts, states are re-implemented per screen, and ARIA is never applied consistently.                                                       |
| **React / Preact**                                 | A runtime dependency and a build step for 15 components. Rejected on bundle size.                                                                                                  |
| **Tailwind**                                       | Utility classes keep the markup honest, but they push design decisions into the markup rather than into a token system, and they make the "no raw colours" enforcement impossible. |
| **CSS custom properties only, no components**      | Solves theming but not the state, ARIA, and focus-management problems.                                                                                                             |
| **Shadow DOM everywhere**                          | Adopted, with the caveat that it makes cross-component styling harder; mitigated by a documented token contract and `part`/`exportparts` only where genuinely needed.              |

## Consequences

**Positive**

- Light and dark become genuinely first-class: one token file, two token
  sets, one component library. The load-order fragility disappears entirely.
- The accent colour and density become user-facing features for free.
- The design system is **enforceable**, so it cannot silently rot.
- No framework runtime; the bundle stays small.

**Negative**

- Shadow DOM blocks global CSS from reaching components. Any deliberate
  cross-component override must go through `::part()`, which is more
  ceremony than a global stylesheet.
- Native Web Components lack a mature ecosystem: no virtual list, no
  focus-trap library, no portal. We implement the three we need
  (virtual list, dialog, popover) ourselves — which is also why they are
  small and dependency-free.

**Neutral**

- The colour palette changes. This is intentional: the baseline palette
  fails WCAG AA in six places, and the accent colour — which the baseline
  did not have at all — is a deliberate new brand signal.
