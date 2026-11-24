# ADR-0009 — A headless test stack: Vitest + Playwright + axe-core

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0003](ADR-0003-design-system.md)

---

## Context

The baseline's tests are QUnit files run in a browser via
`http-server -o unitTest/Tests.html`. Consequences:

- `npm test` **opens a browser window** and requires a human to look at it.
- Tests cannot run in CI without a headless browser and a result reporter.
- There are ~40 test files, mostly per-parser, and **no tests for the core
  engine**: `Parser`, `HttpClient`, `Util`, `EpubPacker` are untested.
- There are **no UI component tests** and **no end-to-end test** of the Pack
  EPUB flow.
- The fixture set is 7 HTML files in `testdata/`.

The baseline also has no linting of its own beyond ESLint over a concatenated
`packed.js`, no type checking, and no `prettier`.

## Decision

We adopt a modern, headless, CI-first test stack.

### 1. Unit and integration tests — Vitest

- **Vitest** with a **happy-dom** environment for the DOM-dependent units
  (the EPUB pipeline, the DOM utilities, the parser base class).
- Node environment for the pure-logic units (the retry policy, the settings
  schema, the URL helpers).
- Tests are **co-located** with the code they test (`src/core/foo.test.ts`),
  not in a separate `unitTest/` folder, so a refactor cannot orphan a test.
- `npm run test` runs headlessly and exits non-zero on failure. It is
  CI-ready without a browser.

### 2. Component and accessibility tests — Playwright + axe-core

- **Playwright** loads the built extension into **Firefox** and drives the
  real UI.
- **@axe-core/playwright** runs against every surface and asserts
  **zero critical or serious violations**. This makes WCAG 2.2 AA a
  _build-breaking_ condition rather than an aspiration.
- Component tests exercise the interactive and stateful elements:
    - the primary button's loading state swaps its label but not its width,
    - the chapter list's roving tabindex means one tab stop for 5 000 rows,
    - the dialog traps focus and `Escape` closes it and restores focus,
    - the filter popover validates a bad regular expression inline instead of
      throwing,
    - the theme switch updates `data-theme` on the root element,
    - reduced-motion emulation removes the transitions,
    - the progress bar's `aria-valuenow` tracks the fetch count.

### 3. End-to-end tests

One test drives the real flow against a **local fixture server** that serves
a synthetic novel site:

```
toolbar click → workbench opens → metadata populated → chapter list shown
  → Ctrl+Enter → progress advances → EPUB file produced → file is a valid ZIP
    whose content.opf parses and whose chapter count matches
```

The fixture server serves a paginated TOC and a chapter-per-path site, so
the TOC walker and the throttling are exercised for real.

### 4. Parser parity harness

A separate harness (not part of `npm test`, but part of CI) runs every
registered parser against its fixture where one exists and asserts:

- the parser constructs without throwing,
- it registers exactly once,
- `getChapterUrls` returns a well-formed chapter list,
- the chapters produced match the legacy implementation's output for the same
  fixture.

This is the mechanism that lets the 434-parser migration proceed safely
([ADR-0002](ADR-0002-parser-contract.md)).

### 5. Quality tooling

| Tool                     | Purpose                                                    | Gate                   |
| ------------------------ | ---------------------------------------------------------- | ---------------------- |
| **ESLint** (flat config) | Lint, with a custom rule banning raw colours in components | `npm run lint`         |
| **Prettier**             | Formatting                                                 | `npm run format:check` |
| **TypeScript**           | `tsc --noEmit` over `src/` **and** the parsers             | `npm run typecheck`    |
| **Vitest**               | Unit + integration                                         | `npm run test`         |
| **Playwright**           | Component, a11y, e2e                                       | `npm run test:e2e`     |
| **web-ext lint**         | Extension manifest and packaging validity                  | `npm run lint:ext`     |

A **pre-commit hook** (via `husky` + `lint-staged`) runs lint, format check,
and typecheck on staged files. `npm run verify` runs everything and is what
CI calls.

## Alternatives considered

| Alternative                   | Why rejected                                                                                                                     |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Keep QUnit in the browser** | Requires a human to read results; awkward in CI; the runner is a static HTML page.                                               |
| **Jest**                      | Mature, but Vitest's ESM-native, Vite-powered setup matches the bundler we already need and is faster.                           |
| **Cypress**                   | Heavier, and its model (a persistent app + network interception) does not fit extension-context testing as well as Playwright's. |
| **jsdom**                     | Less complete than happy-dom for the DOM features the EPUB pipeline relies on (serialization, `DOMParser` edge cases).           |
| **Playwright only**           | Playwright is for browser-level tests; unit tests need to be fast and granular. Both layers are needed.                          |
| **Manual a11y testing only**  | Not enforceable and does not scale. axe-core in CI is what makes the accessibility contract binding.                             |
| **No pre-commit hook**        | The brief requires one. It catches the "forgot to run the formatter" class of noise before it reaches CI.                        |

## Consequences

**Positive**

- `npm test` is headless and CI-ready.
- Accessibility regressions **fail the build**.
- The 434-parser migration has a safety net.
- The core engine, previously untested, gains a test suite.

**Negative**

- Playwright must download a Firefox build in CI. This adds ~90 s to a cold
  CI run and ~400 MB to the CI cache.
- happy-dom is not a perfect DOM implementation; a small number of tests
  need a real browser and live in the Playwright tier.
- The custom ESLint rule and the token-contrast test are bespoke and must be
  maintained.

**Neutral**

- The baseline's QUnit tests and `testdata/` fixtures are **preserved on the
  `legacy` branch** and selectively ported. Fixtures for parsers that gain
  parity tests are copied forward as test inputs — the fixture data itself is
  test data, not implementation.
