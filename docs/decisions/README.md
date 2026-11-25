# Architecture Decision Records

Every significant decision in the Kintsugi revamp is recorded here. Each ADR
states the context, the decision, the alternatives considered, and the
consequences — positive _and_ negative.

| ADR                                                 | Title                                                                       | Status   | Key outcome                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| [0001](./ADR-0001-rewrite-from-scratch.md)          | Rewrite from scratch in a new source tree                                   | Accepted | New `src/` tree, TypeScript, real build step, legacy preserved on a branch             |
| [0002](./ADR-0002-parser-contract.md)               | Preserve the parser contract, add a compat shim                             | Accepted | The 434-parser contract survives verbatim; incremental migration is safe               |
| [0003](./ADR-0003-design-system.md)                 | A design-token-driven component library on native Web Components            | Accepted | 3-layer token model; no raw colour can reach a component (lint-enforced)               |
| [0004](./ADR-0004-fetch-layer.md)                   | Rewrite the fetch layer around `AbortSignal` and a single retry policy      | Accepted | Cancel really cancels; cookie cleanup in `finally`; the custom-error contract is fixed |
| [0005](./ADR-0005-background-worker.md)             | Move the download into a background service worker                          | Accepted | Downloads survive the tab closing; the popup stops flashing and closing                |
| [0006](./ADR-0006-storage.md)                       | Typed storage: `browser.storage` for settings, IndexedDB for the library    | Accepted | `unlimitedStorage` dropped; the import race and over-broad clear are impossible        |
| [0007](./ADR-0007-permissions.md)                   | Reduce the permission set and make host access optional                     | Accepted | 3 fewer permissions; `webRequest` → scoped DNR; `<all_urls>` → optional                |
| [0008](./ADR-0008-epub-pipeline.md)                 | Rebuild the EPUB pipeline on a real EPUB reader/writer                      | Accepted | No regex touches XML; a failed image can never corrupt the EPUB                        |
| [0009](./ADR-0009-testing.md)                       | A headless test stack: Vitest + a browser-driven tier                       | Accepted | Tests run in CI; accessibility failures break the build                                |
| [0010](./ADR-0010-i18n.md)                          | Internationalisation: one catalogue, five locales, graceful fallback        | Accepted | The `__MSG_` sweep is gone; missing keys fall back to English                          |
| [0011](./ADR-0011-site-selectors.md)                | The default parser: a visible guess, and a way to replace it with an answer | Accepted | Unknown sites announce the guess and can be taught once                                |
| [0012](./ADR-0012-lazy-zip.md)                      | Load the ZIP library on demand, behind a lazy facade                        | Accepted | 155 KB of ZIP code is fetched only by the one parser that needs it                     |
| [0013](./ADR-0013-marionette-end-to-end-testing.md) | Drive the end-to-end tests through Firefox's own Marionette protocol        | Accepted | The tier tests the artefact a user installs, with no browser to download               |
| [0014](./ADR-0014-dark-theme-token-ramp.md)         | Reverse the neutral ramp in the dark theme instead of re-declaring it       | Accepted | `--bg` is "the background" in both themes; the dark theme is a first-class design      |
| [0015](./ADR-0015-epub-container.md)                | Build the EPUB container ourselves, and store the `mimetype` entry          | Accepted | Every book carries a valid `mimetype` entry; the archive's bytes are asserted          |

---

## ADR lifecycle

- **Proposed** → under discussion, not yet binding.
- **Accepted** → in force. Deviating from it requires a new ADR that
  supersedes this one.
- **Superseded by ADR-NNNN** → kept for history, with a pointer.
- **Deprecated** → no longer relevant, kept for history.

An ADR is **never deleted**. If a decision is reversed, the reversal is a new
ADR.

## Template

```markdown
# ADR-NNNN — <Title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** YYYY-MM-DD
- **Deciders:** <who>
- **Relates to:** <links>

## Context

<What forces are at play? What constraints apply? What does the reader need
to know to understand the decision?>

## Decision

<What was decided, stated in the active voice: "We will …">

## Alternatives considered

<A table of the options and why each was rejected.>

## Consequences

### Positive

### Negative

### Neutral
```
