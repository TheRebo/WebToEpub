# Contributing to Kintsugi

Kintsugi is a Firefox extension that turns web novels into EPUBs. It has a few
hundred site parsers, a small design system, and a browser tier of tests that
drive the real extension in a real Firefox.

This guide covers what a change is expected to look like.

- [Getting set up](#getting-set-up)
- [The shape of a change](#the-shape-of-a-change)
- [Commit messages](#commit-messages)
- [Translations](#translations)
- [Adding a site parser](#adding-a-site-parser)
- [Design changes](#design-changes)
- [Pull requests](#pull-requests)
- [Reporting a bug](#reporting-a-bug)

---

## Getting set up

```bash
npm install
npm run build
npm run verify
```

`npm run verify` runs everything CI runs: lint, typecheck, unit tests, build,
`web-ext lint`, and the browser tier. It is the gate for every change.

The full walkthrough — running the extension, debugging it, the test tiers —
is in the [development guide](./docs/development.md).

---

## The shape of a change

A change should leave the repository in a **working state**. That means:

- `npm run verify` passes.
- The new behaviour is covered by a test, or the change is a change to
  documentation, or the change is to a site parser (see below).
- Anything a user can see is designed in **both** themes, in **every** state,
  and it is keyboard-reachable.

### What belongs in a commit

One logical change per commit. A commit that fixes a bug and reformats a file
is two commits. A commit that adds a feature and fixes an unrelated typo is
two commits.

The pre-commit hook runs ESLint and Prettier on the files you stage, then
typechecks. It does not run the browser tier — that is CI's job, and it is
slow enough that running it on every commit would be rude.

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary>

<body>

<footer>
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`,
`perf`, `style`.

**Scopes:** the area of the tree — `ui`, `core`, `parser`, `e2e`, `design`,
`i18n`, `build`.

The summary is imperative, in the present tense, under 72 characters, and it
does not end with a full stop.

```
fix(ui): honour the hidden attribute against class rules
feat(core): cancel the download when the chapter list changes
docs: document the Marionette command-set gaps
```

Write a body when the _why_ is not obvious from the diff. The diff already
shows what changed.

```
fix(ui): honour the hidden attribute against class rules

The user agent's [hidden] rule loses to any author display rule, so
the workbench's empty state stayed in the layout and pushed the
chapter list out of the panel. A global rule with !important puts
the attribute back in charge.
```

---

## Translations

The message catalogue lives in `tools/make-locales.mjs`. **English is the
source**; the four translated catalogues are in `tools/locales/`.

To add a message:

1. Add the key to `SOURCE` in `tools/make-locales.mjs`, with the message text
   **and** a description of where it appears.
2. Add the key to `tools/locales/{de,fr,id,ja}.mjs` with the translation and
   the same description.
3. Run `node tools/make-locales.mjs` to regenerate `src/_locales/`.

The `tests/unit/locales.test.ts` suite enforces exact key parity across all
five catalogues, real translations (no English left in a foreign catalogue),
consistent `$PLACEHOLDER$` tokens, and a description for every message.

A message that has no translation yet **falls back to English** at runtime
([ADR-0010](./docs/decisions/ADR-0010-i18n.md)). A missing translation is
therefore not a crash — but it is a gap, and the test suite will say so.

---

## Adding a site parser

The original's parsers are preserved and wrapped by compatibility shims
([ADR-0002](./docs/decisions/ADR-0002-parser-contract.md)). A **new** parser
is written against the modern `Parser` interface.

> **The repository's `AGENTS.md` asks that AI agents do not write unit tests or
> mock fixtures for individual parsers.** That rule still applies. A parser is
> proven by the site working, not by a mock.

What a new parser needs:

- `getChapterUrls(dom)` returning `{ sourceUrl, title, isIncludeable? }`.
- `findContent(dom)` returning the element that holds the chapter's text.
- `extractTitleImpl(dom)` and `extractAuthor(dom)`.
- A `minimumThrottle` that respects the site. Cloudflare-protected sites need
  3 000–12 000 ms; a well-behaved site is fine at the default 500 ms.

Set `isIncludeable: false` on chapters that are paywalled, VIP, locked, or
otherwise not part of the free text. Those rows appear in the workbench
unchecked, so the user can pack the book without fetching them — and can check
one by hand if they have access.

---

## Design changes

The UI is built from a design system, not one-offs
([ADR-0003](./docs/decisions/ADR-0003-design-system.md)).

A design change means:

- **Tokens first.** A colour, a spacing step, a radius, a duration — it goes
  in `src/ui/styles/tokens.css`. A component may only reference Layer 2
  (semantic) or Layer 3 (component) tokens. ESLint enforces the ban on raw
  colours.
- **Both themes.** The dark theme is a first-class design, not an inversion.
  If a new colour is needed, it is needed in both. Contrast is checked against
  the surface it sits on, in both themes.
- **Every state.** Empty, loading, error, offline, success, first-run. A state
  that was not designed is a state that looks unfinished.
- **Keyboard and screen reader.** Every interactive element is reachable, has
  an accessible name, and shows a visible focus ring.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce)` is respected,
  and the _setting_ does the same thing for people who want it regardless of
  their system.

The guidelines are in [docs/design/](./docs/design/).

---

## Pull requests

A pull request should:

- Do **one** thing.
- Say what it does and why, in the description — not what the diff shows.
- Include a screenshot for anything visual, in both themes.
- Pass `npm run verify`.
- Keep the `CHANGELOG.md`'s `[Unreleased]` section up to date.

If a change departs from a decision recorded in
[`docs/decisions/`](./docs/decisions/), it needs a new ADR. An ADR is never
deleted; a reversed decision is a new ADR that supersedes the old one.

---

## Reporting a bug

A good report has:

- What you did, and what you expected to happen.
- What happened instead.
- The site, if it is about a specific site.
- Firefox's version, and Kintsugi's version (both are in
  `about:debugging`).
- A screenshot, if it is visual.

If the report is about a site that has a parser, the most useful thing you can
attach is the **URL of the chapter list** and the URL of one chapter that came
out wrong. A parser's selectors are almost always the whole story.

---

## Code of conduct

Participation in this project is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md).
