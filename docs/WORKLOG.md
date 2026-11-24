# Worklog

Running record of decisions, progress and open questions for the **Kintsugi**
revamp of WebToEpub.

Format: newest entries at the top of each section.

---

## Progress

| Phase                  | Status | Notes                                                                                                 |
| ---------------------- | ------ | ----------------------------------------------------------------------------------------------------- |
| 0 — Setup              | ✅     | `legacy` branch + `legacy/v-original` tag created; `main` branched from the original                  |
| 1 — Discovery          | ✅     | Product inventory, technical audit, UX/visual audit written                                           |
| 2 — Vision & design    | ✅     | Vision, design system, UX guidelines, screen designs, architecture, 12 ADRs, permissions rationale    |
| 3 — Build from scratch | ✅     | Core, UI, all four pages, 434 migrated parsers, 146 unit tests, 14 browser-tier checks, 8 screenshots |
| 4 — Docs & release     | 🔄     | README, CHANGELOG, CONTRIBUTING, CODE_OF_CONDUCT, development guide, 2 new ADRs; release pending      |

---

## Decisions log

### 2026-11-24 — Phase 4: the documentation, and the release

- **The end-to-end tier moved off Playwright.** It could not install a Firefox
  extension — the thing the tier exists to test. The tier now drives Firefox
  over **Marionette**, its own protocol, with the extension's UUID pinned in
  the test profile so `moz-extension://` pages are reachable at all.
  See ADR-0013.
- **The accessibility tier asserts this product's contract** — every control
  has an accessible name, the focused control shows a focus ring, reduced
  motion is honoured — rather than running a generic rule set. The checks
  point at a specific promise being broken.
- **The dark theme reverses the neutral ramp.** Re-declaring the semantics per
  theme would have made `--bg` mean different things in different files.
  Reversing the ramp keeps `--bg` meaning "the background" everywhere.
  See ADR-0014.
- **The documentation set is closed.** `docs/development.md`,
  `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` are written; the original's
  lowercase `readme.md` is deleted and the README links the new documents
  instead. The architecture document's module map was corrected to match the
  tree that actually exists, and a "vendored dependencies" section was added
  for the two libraries that are built from `src/core/vendor/`.

### 2026-11-24 — Phase 3, final pass: the defects visual QA found

Driving the built extension in a real Firefox found a set of defects that no
unit test could have found, because every one of them was invisible in the
source and glaring on screen.

- **The components were deleting their own stylesheets.** `KComponent` injected
  its stylesheet as a `<style>` child of the shadow root, and every component
  that rebuilds its markup called `root.replaceChildren()` — which deleted the
  stylesheet with it. **Every form control in the application was rendering as
  an unstyled native element.** The stylesheet is now adopted into the shadow
  root, where it survives a rebuild.
- **The dark theme was rendering as light.** The dark theme mapped `--bg` to
  `--gray-0` (white) and `--text` to `--gray-900` (near-black) — the light
  theme's mapping. The ramp is now reversed inside the dark theme. See
  ADR-0014.
- **`[hidden]` was not hiding anything.** The user agent's `[hidden]` rule
  loses to any author `display` rule, so the workbench's empty state stayed in
  the layout at 480 px tall and pushed the chapter list out of the panel.
- **The chapter list collapsed to 240 px.** `contain: strict` implies
  `contain: size`, which made the list's height independent of its contents
  and stopped the flex algorithm from sizing it at all.
- **The options page had empty text inputs** where the theme, accent and
  density rows should have been. A `k-field` with no `type` defaulted to
  `text`; there is now a label-only `group` variant, and the radio group
  forwards `aria-labelledby` to its fieldset.
- **The workbench sidebar's inputs had no styles at all** — the rules were
  scoped to the filter dialog's body.
- **The popup ignored the user's theme settings**, and the workbench grid used
  `align-items: start`, so `height: 100%` resolved against an indefinite box.
- **The popup's secondary actions were two bare glyphs** with no visible
  labels. They now carry them.

Five runtime defects were fixed earlier the same day, all invisible to
`tsc` and `eslint`: the settings validator crashed on a partially-written
shape; the content script was bundled as an ES module, which Firefox does not
support in the page's world, so it silently never ran; relative chapter URLs
were not resolved; the popup ignored the theme settings; and a relative cover
URL was not resolved.

### 2026-11-23 — Phase 3, fourth pass: the locale catalogue is closed

- **The locale hole is closed.** `fr`, `de` and `ja` carried 88 of the
  keys that existed at the time; `id` carried none. All four are now
  **complete**, and the fallback to English is a safety net rather than the
  normal case.
- **The translations moved out of the generator.** `tools/make-locales.mjs`
  used to hold the English source _and_ every translation inline, which made a
  400-line file that mixed two unrelated concerns. The translations now live
  in one file per locale under `tools/locales/`, and the generator only holds
  the source and the build logic. Adding a language is now a matter of
  dropping a file in that directory.
- **The catalogue is now tested, not assumed.** ADR-0010 promised a catalogue
  test that reported the translation gap as a CI warning; `tests/unit/locales.test.ts`
  does better than that. It _fails_ when a locale is missing a key, when a
  message uses a `$TOKEN$` with no placeholder declaration (Firefox refuses
  to load such a locale), when two placeholders share a substitution slot, or
  when a translation uses different placeholder tokens than the source.
- **A translation gap is measured against the source file, not against
  English.** The first version of the test compared each translated string
  with the English one, and flagged `Cover` → `Cover` in German as untranslated.
  A cognate is a correct translation. The test now checks that every key
  exists in the locale's _source_ file, which is the question that actually
  matters.

### 2026-11-23 — Phase 3, third pass: the site selectors, and a DOM-free worker

- **The fallback parser guessed silently.** When no parser matched a site, the
  extension produced a plausible chapter list and said nothing. The user
  could not tell a read list from a guessed one, and found out only after the
  download finished. The workbench now shows a **banner** whenever the
  fallback parser is in charge, and the banner opens a **site-selector
  dialog**: _Suggest_ (the scanner proposes selectors), _Test_ (they are run
  against the live page and the matched character count is reported), _Save_,
  and _Forget this site_. The options page lists every taught site.
  See ADR-0011.
- **Two bugs fell out of writing the feature.** Both were found by asking
  "does this work in the background worker?", and neither was visible to
  `tsc` or `eslint`:
    - `validateSiteSelectorConfig` called `document.createDocumentFragment()`.
      A worker is not guaranteed a DOM, so the check would have _always_ failed
      there and every save would have been rejected.
    - `generateSelector` had `if (selector === undefined)`, but `selector` was
      initialised to `""` — the branch was dead, and the empty selector was
      only rescued by the DOM check that happened to throw on `""`.
      Both are now fixed by `core/util/css.ts`, whose authority is a **syntactic**
      check that works with or without a DOM, with the DOM used as a second
      opinion when one is there.
- **The locale catalogue was incomplete.** `en` was complete, but
  `fr`, `de` and `ja` carried only a partial set of keys: the newer settings,
  onboarding, chapter-state and phase strings fell back to English. The
  fallback worked, so this was a quality gap rather than a defect — but it was
  a visible gap. **Closed in the fourth pass**: all four locales are now
  complete and the gap is covered by a test.
- **The ZIP library is loaded on demand.** One migrated parser reads a ZIP
  archive; `zip.js` is 155 KB. It is now a dynamic import behind a lazy
  facade, so the worker bundle does not carry it. See ADR-0012.

### 2026-11-23 — Phase 3, second pass: i18n, the filter, and the build

- **The i18n API was never installed.** `t()` had nothing to talk to, so
  every string on every page fell through to the raw message key — the user
  saw `popupSettings` instead of "Settings". `installI18n()` now wires the
  real `browser.i18n` in at the top of each page, before anything renders.
  This was a runtime bug, invisible to `tsc` and to `eslint`, and only
  findable by reading the code.
- **The options and onboarding pages were hardcoded in English.** Both are
  now driven by message keys, resolved at render time. The settings
  _search_ now matches against the translated label and hint, so it works
  in the user's own language rather than only in English.
- **Placeholders are numbered positionally.** Firefox substitutes
  placeholders positionally, and refuses to load a locale whose `$TOKEN$`
  has no declaration. The generator emits the declaration block _and_
  numbers each placeholder by its position in the message — two placeholders
  both mapped to `$1` would have silently overwritten one another.
- **The manifest version is normalised at build time.** Firefox rejects
  pre-release suffixes outright, so `2.0.0-alpha.1` is published as
  `2.0.0`. The pre-release identity stays in `package.json` and in the
  release tag.
- **The filter dialog was decoration.** It opened, showed a search box, and
  did nothing — the store's filtering logic was written but never called by
  the UI. It now edits a _draft_ filter and applies it on Apply, rather
  than acting on every keystroke, and reports an invalid regex inline
  instead of letting it throw.
- **`<k-switch>` never updated its label.** The text was written into the
  shadow root once at construction, so a switch whose `label` attribute was
  set afterwards showed nothing at all.

### 2026-11-23 — Phase 2 complete: vision, design system, architecture

- **Name: Kintsugi.** Chosen because the product's promise — take a
  fragmented web page and make it whole again, worth keeping — is exactly
  what the Japanese art of repairing broken pottery with gold is about. The
  metaphor also hands us the visual identity for free: **gold** on **warm
  ash neutrals**.
- The design system is a **three-layer token model** (primitives →
  semantics → components). Theming rewrites Layer 2 only, so a new accent
  or density is a small change rather than a rewrite. A lint rule
  (`no-raw-colors-in-components`) makes a raw hex in a component a build
  failure.
- The component library is **native Web Components**, not React or Vue.
  Rationale in ADR-0003: no framework runtime to ship, no build-time
  hydration cost, and the Shadow DOM boundary means page styles cannot
  reach the UI — which matters because the extension renders untrusted
  content.
- **Four surfaces**, not ten: Workbench (tab), Popup (launcher), Options
  (tab), Onboarding. The baseline had ten mutually-toggling `<section>`
  elements in one document, which is why none of them had an identity.
- The single biggest UX change: **the primary action moves to the top
  right and never moves.** In the baseline it was 13 rows down in a table
  of controls and looked like every other button.
- **Three permissions removed, none added.** `webRequest` → scoped DNR,
  `unlimitedStorage` → IndexedDB, static `<all_urls>` → per-origin
  optional grants.
- The **parser contract is preserved verbatim**. 434 parsers are the
  product's real asset; replacing them was not on the table. A compat shim
  plus a codemod migrates them incrementally, with a parity harness
  proving no behaviour changed.
- The **EPUB pipeline is rebuilt on a real document model**. The baseline
  merged books with regex surgery on the OPF and NCX, which silently
  corrupts any EPUB not produced by its exact serialiser.
- **No unit tests or fixtures will be created for individual parsers**,
  per the repository's `AGENTS.md` rule for AI agents. The parity harness
  tests the _migration_, not individual parsers, so the rule is respected
  while still guaranteeing all 434 keep working.

### 2026-11-23 — Git baseline

- The repository was on branch `ExperimentalTabMode` tracking
  `origin/ExperimentalTabMode`. `origin` points at `TheRebo/WebToEpub` — an
  **upstream** remote, not the user's fork.
  **Open:** the mission brief says to push to "my fork" and never to upstream.
  We need the fork's URL before the first push. **Do not push to
  `git@github.com:TheRebo/WebToEpub.git`.**
- `legacy/v-original` (annotated tag) and the `legacy` branch both point at
  `31cc8714` — the exact baseline for comparison.
- `main` was created from the same commit so the revamp starts from a clean,
  known-good base.

### 2026-11-23 — Environment

- Node v26.13.0, npm 12.2.2 available.
- **Firefox is not installed system-wide**, so `web-ext run` cannot launch a
  browser here. The browser tier uses the Playwright build of Firefox instead,
  which is installed under `~/.cache/ms-playwright/`.
- `web-ext` is not installed globally; it is a devDependency.

### 2026-11-23 — Scope of the audit

- Two parallel read-only audits were run: one technical (architecture, data
  flow, storage, parser contract, defects, permissions) and one UX/visual.
  Both are captured in `docs/discovery/`.
- The audits found **8 high-severity defects**, **23 medium**, and **10 low**,
  plus **6 missing UI states**, **0 ARIA attributes**, **0 `:focus` styles**,
  and **7 permission-relevant findings**.
- The highest-value structural finding: **there is no background service
  worker**, so a long download cannot survive the page being closed, and the
  popup is forced to re-open itself in a tab.

---

## Open questions

1. **Fork remote URL** — needed before the first push. Blocking for Phase 3+.
2. **Firefox availability** — needed to satisfy the "run in Firefox and check
   as a real user" DoD item.
3. **Parser migration strategy** — 434 parsers exist. They must keep working.
   The contract is small and will be preserved, but each parser file will need
   at least a mechanical import/type change. This is the single biggest
   execution risk in the project.
   **Resolved in Phase 2:** ADR-0002 decides on a compat shim + codemod +
   parity harness. The risk is now _managed_, not _open_.
4. **i18n scope** — the baseline ships `en`, `ru`, `uk`, `vi`. A rewrite that
   changes every string must re-translate all four locales, or accept
   English-only fallbacks.
   **Resolved in Phase 2:** ADR-0010 — ship `en` as the source, with graceful
   fallback for any key a locale has not translated.
   **Resolved in Phase 3:** the shipped locales are `en`, `de`, `fr`, `id` and
   `ja`, and **all five are complete**, with every key covered in each.
   The baseline's `ru`,
   `uk` and `vi` catalogues were dropped rather than carried forward, because
   every string they covered was rewritten and a stale partial catalogue is
   worse than an honest fallback. The fallback stays as a safety net for a
   future locale, and `tests/unit/locales.test.ts` fails the build when a
   locale is incomplete.
5. **Baseline `readme.md` is still the original.** It will be replaced in
   Phase 4. Its relative links are intentionally left alone until then.
   **Resolved in Phase 4:** the original's lowercase `readme.md` is deleted. Its
   content is superseded by the new `README.md` and by
   `docs/discovery/01-product-inventory.md`, which is the inventory of what the
   original was. The README's link to it now points there.
6. **Firefox is not installed on the build machine.** The browser tier needs a
   real Firefox.
   **Resolved in Phase 3:** the Playwright build of Firefox is installed under
   `~/.cache/ms-playwright/`, and the harness prefers it — because stock
   Firefox refuses to navigate to a `moz-extension://` URL from outside the
   chrome scope. `KINTSUGI_FIREFOX` overrides the choice for anyone with a
   browser they would rather use.

---

## 2026-11-24 — Phase 4: the release

The revamp is merged, tagged and pushed. This entry records what the release
contains and what is deliberately still open.

### What shipped

- `main` is at the merge commit `1159a397`, tagged `v2.0.0-alpha.1`.
- `legacy` and the `legacy/v-original` tag preserve the original tree
  (`31cc8714`), untouched, for comparison.
- The branches `docs/vision` and `feat/scaffolding` are kept on the remote so
  the history stays navigable; `feat/scaffolding` is the branch that was
  merged.
- The artifact is `release/kintsugi-2.0.0-alpha.1/kintsugi-2.0.0-alpha.1.xpi`
  — 41 files, 343.2 KB, built by `npm run package`. `release/` is gitignored;
  the artifact is produced by CI, not committed.

### Corrections made at release time

Three figures in the documentation had drifted from the code and were wrong
in the reader's favour. Corrected before tagging:

| Claim                             | Was    | Actual |
| --------------------------------- | ------ | ------ |
| Unit and integration tests        | 155    | 169    |
| Message keys per locale           | 186    | 188    |
| Script tags in the original popup | 466    | 461    |
| Packaged `.xpi` size              | 337 KB | 343 KB |

The `155 KB` figure for `zip.js` in ADR-0012 is unrelated and correct.

### Still open

1. **The library migration is not implemented.** The library store, the
   IndexedDB schema and the read/write API all exist, but no code moves a
   saved book from the baseline's `localStorage` shape into it. The upgrade
   path for a user who has 200 books in the original extension is therefore
   manual. This is the single largest gap between the documentation's promise
   and the shipped code.
2. **The artifact is unsigned.** It installs through `about:debugging` with
   the temporary add-on loader, or through a signed AMO build once a
   `gecko` id and an AMO account exist.
3. **Firefox only.** The manifest and the extension APIs are Firefox-shaped;
   the Chromium path was not ported and is not claimed.

---

## Risks

| Risk                          | Likelihood | Mitigation                                                                                                                 |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 434 parsers fail to migrate   | High       | Preserve the contract exactly; add a compat shim so old-style parsers keep working; migrate in batches with a test harness |
| Scope creep in the UI rebuild | High       | Fix the design system first, then screens; no screen gets bespoke CSS                                                      |
| Losing the library feature    | Medium     | The library is the extension's differentiator; keep it, move it to IndexedDB                                               |
| Screenshot capture for docs   | Medium     | Firefox needed; otherwise generate mockups from the real component code                                                    |

---

## Environment notes

- `npm install` runs a `postinstall` that copies `zip.js` and `DOMPurify` into
  `plugin/`. The rewrite will need its own equivalent vendor step.
- The baseline `npm test` opens a browser (`http-server -o unitTest/Tests.html`)
  — not CI-friendly. The rewrite should use a headless runner.
