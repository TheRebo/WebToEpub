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
| 2 — Vision & design | ⏳ | Next |
| 3 — Build from scratch | ⏳ | |
| 4 — Docs & release | ⏳ | |

---

## Decisions log

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
4. **i18n scope** — the baseline ships `en`, `ru`, `uk`, `vi`. A rewrite that
   changes every string must re-translate all four locales, or accept
   English-only fallbacks. **Recommendation:** ship `en` complete, keep the
   other locales as a known-incomplete set with an explicit note, and make
   the i18n system fall back gracefully.

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
