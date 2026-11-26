# Development Guide

Everything you need to build, run, debug, test, and release Kintsugi.

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [The daily loop](#the-daily-loop)
- [Running the extension in Firefox](#running-the-extension-in-firefox)
- [Debugging](#debugging)
- [Testing](#testing)
- [Adding a message](#adding-a-message)
- [Adding a site parser](#adding-a-site-parser)
- [Release](#release)
- [Repository layout](#repository-layout)

---

## Prerequisites

| Requirement | Version | Why                                                |
| ----------- | ------- | -------------------------------------------------- |
| Node.js     | ≥ 20    | The build and the tooling are plain ESM.           |
| npm         | ≥ 10    | Comes with Node.                                   |
| Firefox     | ≥ 140   | The manifest declares `strict_min_version: 140.0`. |

A Git client is assumed. The repository is a fork; `origin` points at
upstream, so **check your remotes before you push**.

```bash
git remote -v
```

---

## Setup

```bash
npm install
npm run build
```

`npm install` also installs the pre-commit hook through `husky`. If you
cloned with `--no-verify` or the hook is missing, restore it with:

```bash
npx husky
```

---

## The daily loop

| Command                | What it does                                               |
| ---------------------- | ---------------------------------------------------------- |
| `npm run build`        | Production build into `dist/`.                             |
| `npm run build:dev`    | Development build — unminified, inline source maps.        |
| `npm run watch`        | _(not provided — run `build:dev` again after each change)_ |
| `npm run lint`         | ESLint over the whole tree, including the custom rules.    |
| `npm run lint:fix`     | The same, with the fixes applied.                          |
| `npm run typecheck`    | `tsc --noEmit` over `src/` and `tests/`.                   |
| `npm run format`       | Prettier over the whole tree.                              |
| `npm run format:check` | Prettier in check mode — what CI runs.                     |
| `npm run test`         | The unit and integration suite (Vitest).                   |
| `npm run test:e2e`     | The browser tier — a real Firefox, driven by Marionette.   |
| `npm run web-ext:lint` | `web-ext lint` over `dist/`, with the accepted warnings.   |
| `npm run verify`       | Everything CI runs, in order.                              |

`npm run verify` is the gate. If it passes, the change is shippable.

### The pre-commit hook

`husky` runs `lint-staged` on the files you stage, then `npm run typecheck`.
ESLint and Prettier run on the staged files only, so the hook is fast. It does
**not** run the browser tier — that is CI's job.

---

## Running the extension in Firefox

```bash
npm run build
npm run web-ext:run
```

`web-ext run` opens a Firefox with the extension loaded as a temporary add-on.
Two things worth knowing:

- **The extension is not signed.** Firefox will warn about it. That is
  expected for a development build.
- **The build is not watched.** `web-ext run` serves `dist/` as it is on disk,
  so after a code change you need `npm run build` again, then reload the
  extension in `about:debugging` (or restart `web-ext run`).

To load the build by hand instead:

1. Open `about:debugging#/runtime/this-firefox`.
2. **Load Temporary Add-on…**
3. Choose `dist/manifest.json`.

### The pages

| Page       | URL                                    | What it is                                    |
| ---------- | -------------------------------------- | --------------------------------------------- |
| Popup      | `moz-extension://<id>/popup.html`      | The launcher. Opens on the toolbar button.    |
| Workbench  | `moz-extension://<id>/workbench.html`  | The main tool. Also reachable from the popup. |
| Settings   | `moz-extension://<id>/options.html`    | Preferences, library, site access.            |
| Onboarding | `moz-extension://<id>/onboarding.html` | The first-run walkthrough.                    |

To open a page directly, copy the extension's UUID from
`about:debugging` — the ID shown there is not the UUID.

---

## Debugging

### The background worker

The worker's console is in the **browser console**, not the page console:
`about:debugging` → **Inspect** on the extension → **Console**.

In a packaged build the worker logs nothing by default. Turn on the
diagnostics setting in **Settings → Advanced → Developer diagnostics** to get
verbose logging.

The diagnostics logger writes to the console with a `[kintsugi]` prefix. It is
opt-in, it never leaves the machine, and it records _shapes_ — the parser that
matched, how many chapters were found, how long a response was — rather than
the text of a chapter. URLs are redacted before they are logged: the query
string and the fragment are dropped, because that is where a session token
lives. See `src/core/util/diagnostics.ts`.

### The pages

Each page is a normal document. Open it in a tab and use the **developer
tools** (`F12`) as usual. The workbench and settings pages are the easiest to
inspect, because they are ordinary tabs.

Because the pages use Shadow DOM, the inspector's element picker will show
`<k-button>` rather than the `<button>` inside it. Enable **Settings → Show
Shadow DOM** in the inspector to see through.

### The live page read

The extension declares **no content script**: nothing is injected into the
pages the user visits. When the extension needs the story page as the user
sees it, it calls `browser.scripting.executeScript` for that one tab, running
a small function that returns the page's markup, and reads the result in the
worker.

To watch it happen, open the story page, open the **browser console**
(`Ctrl+Shift+J`), and look for the worker's diagnostics — the read is logged
when diagnostics are on. To inspect the page the extension saw, run
`document.documentElement.outerHTML` in the page's own console: that is the
same thing the extension receives.

See [ADR-0033](./decisions/ADR-0033-read-the-page-the-user-is-looking-at.md).

### Logging

`console.log` is not used. The only console output in the shipped extension is
the diagnostics logger described above (off by default), plus `console.error`
and `console.warn` for genuine failures — a page that would not start, a
parser hook that threw, a missing translation. Nothing writes to the console
during normal operation, and there is no telemetry of any kind.

---

## Testing

### The unit and integration tier — Vitest

```bash
npm run test              # once
npm run test:watch        # on every change
npm run test:coverage     # with a coverage report
```

Tests live in `tests/unit/`. They run in `happy-dom`, which is close enough to
a browser for the DOM-dependent code and fast enough to run on every save.

### The browser tier — Marionette

```bash
npm run test:e2e           # run the checks
npm run test:e2e:shots     # regenerate docs/screenshots/
```

This tier launches a **real Firefox**, installs `dist/` as a temporary add-on,
and drives the real UI through Firefox's own Marionette protocol. It is the
tier that catches the defects a unit test cannot see — a stylesheet that a
component deletes, a theme that resolves to the wrong palette, a control with
no accessible name.

It needs a Firefox on the machine:

```bash
npm run test:e2e:install-firefox
```

installs the Playwright build of Firefox, which the harness prefers. Set
`KINTSUGI_FIREFOX` to point at any other binary.

The fixture site (`tools/e2e-fixture.mjs`) serves a synthetic novel, so the
tests never touch the public internet.

### The linter

```bash
npm run web-ext:lint
```

runs `web-ext lint` over `dist/` and fails on anything the accepted-warning
list does not cover. The accepted warnings are enumerated in
`tools/lint-extension.mjs`, with the reason each is acceptable. **Add to that
list only with a reason.** A new warning means something changed for the
worse.

---

## Adding a message

The message bus is typed. A message that is not in the type will not compile.

1. **Declare it** in `src/core/message/bus.ts` — add the request to the
   `Request` union and the response to the matching `Response` map.
2. **Handle it** in `src/core/background.ts`.
3. **Call it** from a page with `sendRequest(adapter, "message:name", payload)`.

The adapter is `{ sendMessage }`, which differs between the background worker
and a page. `src/core/browser-api.ts` provides the right one for each context.

---

## Adding a site parser

The original's parsers are preserved and wrapped by the compatibility shims
([ADR-0002](./decisions/ADR-0002-parser-contract.md)). A **new** parser is
written against the modern `Parser` interface in `src/core/parsers/`.

1. Create `src/core/parsers/<site>-parser.ts`.
2. Extend `Parser` and implement `getChapterUrls` and `findContent`.
3. Register it in `src/core/parsers/register-all.ts`.
4. Add the host to the registry in `src/core/parsers/registry.ts`.

`register-all.ts` is generated at build time by `tools/migrate-parsers.mjs`.
**Do not hand-edit the generated parser files** — change the generator.

> The repository's `AGENTS.md` asks that AI agents **not** write unit tests or
> fixtures for individual parsers. That rule still applies: a parser's
> correctness is proven by the site working, not by a mock.

---

## Release

```bash
npm run verify          # everything CI runs
npm run package         # writes release/kintsugi-<version>/kintsugi-<version>.xpi
```

`npm run package` produces an unsigned `.xpi`. It is an artefact for manual
installation and for distribution through a channel that does not require a
signed build.

The version lives in `package.json`. The manifest's version is derived from it
by `tools/build.mjs`, which strips any pre-release suffix — Firefox rejects
`2.0.0-alpha.1` in a manifest outright, so it is published as `2.0.0` while
the pre-release identity stays in `package.json` and in the release tag.

### Tagging

```bash
git tag -a v2.0.0-alpha.1 -m "Kintsugi 2.0.0-alpha.1"
git push origin v2.0.0-alpha.1
```

Tags are annotated and follow SemVer. `v2.0.0-alpha.1`, `v2.0.0-beta.1`,
`v2.0.0`.

---

## Repository layout

```
src/
  core/            the domain — no DOM beyond what it is handed
    background.ts  the service worker
    browser-api.ts the only file that touches browser.*
    epub/          the EPUB document model, reader, writer, packer
    message/       the typed message bus
    net/           the fetch client, the cookie bridge, the DNR rules
    parsers/       the site parsers and their compatibility shims
    storage/       the settings, library and site-selector stores
    util/          focused utilities
    vendor/        the vendored third-party builds
  ui/              the presentation
    components/    the Web Components
    pages/         popup · workbench · options · onboarding
    styles/        the design tokens and the base stylesheet
  _locales/        the generated translation catalogues

tools/             the build, the tests, the lint wrappers
tests/
  unit/            the Vitest suite
  e2e/             the Marionette checks

docs/
  discovery/       what the original was, and what was wrong with it
  design/          the design system and the UX guidelines
  architecture/    how the system is put together
  decisions/       the ADRs
  screenshots/     the screenshots in this repository
```

---

## Related documents

- [Architecture](./architecture/README.md) — how the system is put together.
- [The design system](./design/01-design-system.md) — the tokens and the rules.
- [The UX guidelines](./design/02-ux-guidelines.md) — how a new surface is built.
- [The permissions rationale](./permissions.md) — why each permission exists.
- [The ADRs](./decisions/README.md) — why the project is the way it is.
