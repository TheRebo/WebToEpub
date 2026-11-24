# ADR-0014 — Reverse the neutral ramp in the dark theme instead of re-declaring it

- **Status:** Accepted
- **Date:** 2025-11-24
- **Relates to:** [ADR-0003](ADR-0003-design-system.md)

---

## Context

The design system has three layers of token ([ADR-0003](ADR-0003-design-system.md)):

1. **Primitives** — `--gray-0` … `--gray-900`, `--accent-100` … `--accent-900`.
2. **Semantics** — `--bg`, `--text`, `--border`, `--accent`, and so on.
3. **Components** — declared in each component's own stylesheet.

A theme change is supposed to rewrite **Layer 2 only**. That is the property
that makes a new accent colour, a new density, or a new theme a one-file
change, and it is what the design system's whole argument rests on.

The neutral ramp is ordered **light to dark**: `--gray-0` is white, `--gray-900`
is near-black. The light theme maps the semantics onto that ramp in the
obvious way:

```css
:root {
    --bg: var(--gray-0); /* white */
    --text: var(--gray-900); /* near-black */
}
```

The dark theme needs the opposite: a near-black background and a near-white
text. There are two ways to write that.

**Option A — re-declare the semantics.** Each semantic token is mapped onto a
different step of the ramp:

```css
[data-theme="dark"] {
    --bg: var(--gray-900);
    --text: var(--gray-0);
}
```

**Option B — reverse the ramp.** The _primitive_ names change their meaning
inside the dark theme, so the semantics keep their meaning too:

```css
[data-theme="dark"] {
    --gray-0: #14120f; /* the darkest step is now "gray-0" */
    --gray-900: #f7f3ea; /* the lightest step is now "gray-900" */
}
```

Option A is the obvious first attempt, and it is what the dark theme was
originally written as. It fails in a way that is invisible in the source.

## Decision

We use **Option B**: the dark theme reverses the neutral ramp, and the
semantic tokens keep the same mapping they have in the light theme.

The reversal is a single, clearly-commented block inside
`src/ui/styles/tokens.css`, immediately above the dark theme's semantic
tokens, so that a reader who lands on the file sees _why_ the primitive names
have swapped meaning before they see the semantics that depend on it.

## Alternatives considered

| Alternative                                         | Why rejected                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Re-declare the semantics** (Option A)             | The tokens read correctly in isolation but mean different things in the two themes. "The background" is `--gray-0` in one theme and `--gray-900` in the other, so every component that reaches past Layer 2 — and every future component that will — has to know which theme it is in. That is the exact coupling the three-layer model exists to prevent. |
| **A separate stylesheet per theme**                 | Doubles the cascade, and makes "which stylesheet is loaded?" a question with two answers. The theme controller resolves "system" to one of two attributes on `<html>`; there is no third stylesheet and no load-order dependency.                                                                                                                          |
| **A dark theme that uses a different hue entirely** | The warm grey ramp is part of the identity: it sits in the same family as the gold accent. A cold grey ramp next to gold looks cheap, so the dark theme reverses the same hues rather than inventing new ones.                                                                                                                                             |
| **Duplicate every primitive in the dark theme**     | The reversal already duplicates them; declaring a _second_ ramp as well would be redundant and would invite the two to drift apart.                                                                                                                                                                                                                        |

## Consequences

### Positive

- The semantic tokens are theme-agnostic. `--bg` is "the background" in both
  themes, and a component never has to ask which theme it is in.
- The dark theme is a **first-class design**, not an inversion. The ramp is
  hand-tuned for dark surfaces rather than being the light theme's values
  flipped.
- A new semantic token has to be written once. It works in both themes
  because both themes map it the same way.
- The intent is legible to the next reader, because the reversal is one
  commented block rather than a scatter of per-token overrides.

### Negative

- The primitive names are **counter-intuitive inside the dark theme**:
  `--gray-0` is the darkest colour there. This is the cost of the decision,
  and it is why the block carries a comment explaining itself.
- A primitive used directly in a component — rather than through a semantic
  token — would render incorrectly in one of the two themes. The ESLint rule
  that bans raw colour in components is what keeps that from happening; the
  rule bans any literal colour, and the component stylesheets are checked
  against it.

### Neutral

- The accent ramp is **not** reversed. Its light steps are used for the dark
  theme's backgrounds and its dark steps for its foregrounds, which is already
  the right relationship for a dark surface, and the ramp's lightness ordering
  is what the contrast of the accent against its own background depends on.
