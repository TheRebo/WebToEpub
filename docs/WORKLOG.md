# Worklog

Running record of decisions, progress and open questions for the **Kintsugi**
revamp of WebToEpub.

Format: newest entries at the top of each section.

---

## Progress

| Phase | Status | Notes |
|---|---|---|
| 0 — Setup | ✅ | `legacy` branch + `legacy/v-original` tag created; `main` branched from the original |
| 1 — Discovery | ✅ | Product inventory, technical audit, UX/visual audit written |
| 2 — Vision & design | ✅ | Vision, design system, UX guidelines, screen designs, architecture, 10 ADRs, permissions rationale |
| 3 — Build from scratch | ⏳ | Next |
| 4 — Docs & release | 🔄 | `PRIVACY.md` and `SECURITY.md` drafted ahead of schedule because Phase 2 documents link to them |

---

## Decisions log

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
- The **parser contract is preserved verbatim**. 437 parsers are the
  product's real asset; replacing them was not on the table. A compat shim
  plus a codemod migrates them incrementally, with a parity harness
  proving no behaviour changed.
- The **EPUB pipeline is rebuilt on a real document model**. The baseline
  merged books with regex surgery on the OPF and NCX, which silently
  corrupts any EPUB not produced by its exact serialiser.
- **No unit tests or fixtures will be created for individual parsers**,
  per the repository's `AGENTS.md` rule for AI agents. The parity harness
  tests the *migration*, not individual parsers, so the rule is respected
  while still guaranteeing all 437 keep working.

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
- **Firefox is not installed** on this machine, so `web-ext run` cannot launch
  a browser here. Browser verification must happen on the user's machine, or
  Firefox must be installed. **Open.**
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
3. **Parser migration strategy** — 437 parsers exist. They must keep working.
   The contract is small and will be preserved, but each parser file will need
   at least a mechanical import/type change. This is the single biggest
   execution risk in the project.
   **Resolved in Phase 2:** ADR-0002 decides on a compat shim + codemod +
   parity harness. The risk is now *managed*, not *open*.
4. **i18n scope** — the baseline ships `en`, `ru`, `uk`, `vi`. A rewrite that
   changes every string must re-translate all four locales, or accept
   English-only fallbacks.
   **Resolved in Phase 2:** ADR-0010 — ship `en` complete, keep the other
   locales as a known-incomplete set with an explicit note, and make the
   i18n system fall back gracefully.
5. **Baseline `readme.md` is still the original.** It will be replaced in
   Phase 4. Its relative links are intentionally left alone until then.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| 437 parsers fail to migrate | High | Preserve the contract exactly; add a compat shim so old-style parsers keep working; migrate in batches with a test harness |
| Scope creep in the UI rebuild | High | Fix the design system first, then screens; no screen gets bespoke CSS |
| Losing the library feature | Medium | The library is the extension's differentiator; keep it, move it to IndexedDB |
| Screenshot capture for docs | Medium | Firefox needed; otherwise generate mockups from the real component code |

---

## Environment notes

- `npm install` runs a `postinstall` that copies `zip.js` and `DOMPurify` into
  `plugin/`. The rewrite will need its own equivalent vendor step.
- The baseline `npm test` opens a browser (`http-server -o unitTest/Tests.html`)
  — not CI-friendly. The rewrite should use a headless runner.
