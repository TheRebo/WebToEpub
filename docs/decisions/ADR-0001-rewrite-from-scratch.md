# ADR-0001 — Rewrite from scratch in a new source tree

- **Status:** Accepted
- **Date:** 2025-11-23
- **Deciders:** Revamp team
- **Relates to:** [Mission brief](../discovery/01-product-inventory.md), Phase 3

---

## Context

The baseline is a single-page, global-script, no-build extension: one
1090-line `popup.html` containing 466 hand-maintained `<script src>` tags,
9 211 lines of core JavaScript in 24 global-scope modules, and 437 parser
files. The core depends on ambient globals (`util`, `parserFactory`,
`HttpClient`, `UIText`, `BlockedHostNames`, …) that are resolved at runtime
by script-tag order. There is no module system, no type checking, and no
way to unit-test a core module in isolation.

The mission brief requires that the revamp be **written from scratch** — not
copied, auto-converted, or lightly refactored — while remaining
_source-compatible_ with the 437 site parsers, because those parsers are the
product's real asset.

## Decision

We build a **new source tree** (`src/`) with a real build step, and move the
baseline out of the active tree onto the `legacy` branch (tag
`legacy/v-original`).

Within the new tree:

- **Application code is TypeScript**, compiled to ES modules.
- **Modules import each other explicitly.** No ambient globals, no
  script-tag ordering contract.
- **The parser contract is preserved verbatim** as an interface, so that a
  parser is a small, self-contained class that imports only what it needs.
- **The build produces the extension** (`dist/`), concatenating and hashing
  assets, generating the parser registry, and emitting an `.xpi`.

## Alternatives considered

| Alternative                                                     | Why rejected                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Refactor in place**                                           | Explicitly disallowed by the brief; and the ambient-global architecture would have to be dismantled incrementally, which is slower and leaves dead code behind.                                                                                              |
| **Keep the global-script architecture, modernise the CSS only** | Leaves the untestable core, the 466-entry script list, and the "no background worker" constraint in place. The UI work alone would not fix the download-abort problem.                                                                                       |
| **Adopt a UI framework (React/Svelte/Vue)**                     | Would deliver the design system faster, but the extension's whole value proposition is being _small and dependency-light_. A framework plus a runtime would roughly triple the bundle for capabilities a hand-rolled Web Component layer provides. Rejected. |
| **Keep plain JavaScript, add JSDoc**                            | Loses the compiler's ability to catch contract violations across 437 parser files — precisely the place where a type error would be most valuable.                                                                                                           |
| **Rewrite the parser contract freely**                          | Would require rewriting all 437 parsers. That is the entire effort budget, spent on something with no user-visible gain. Rejected in favour of a _compat shim_.                                                                                              |

## Consequences

**Positive**

- The core becomes unit-testable: modules can be imported and instantiated in
  isolation with injected dependencies.
- The parser contract becomes compiler-checked, so a broken parser is a build
  error rather than a runtime error in front of a user.
- The script-tag manifest problem disappears; the registry is generated from
  the filesystem.
- Types let the reviewer and the compiler enforce the same rules.

**Negative**

- The 437 parsers still need mechanical migration. We mitigate this with a
  **compat shim** (see [ADR-0002](ADR-0002-parser-contract.md)) that lets a
  legacy-style parser keep working with zero edits while it is migrated, so
  the migration can be done incrementally and validated against the whole
  registry at any point.
- A build step is now required for development. This is a real cost for
  contributors, offset by `npm run dev` with live reload.

**Neutral**

- The extension's user-visible behaviour is intentionally unchanged except
  where the ADR series says otherwise. This is a rewrite, not a redesign of
  the product's function.

## Validation

- `npm run build` produces `dist/` and a `.xpi` with zero warnings from
  `web-ext lint`.
- `npm run typecheck` passes with zero errors.
- The parser registry test asserts that every parser file in
  `src/parsers/` is registered exactly once and that no parser is
  unreachable.
