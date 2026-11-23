# Kintsugi — Roadmap

The revamp of WebToEpub, from the baseline `legacy/v-original` to a
production-ready Firefox extension.

Legend: ✅ done · 🔄 in progress · ⬜ not started

---

## Phase 0 — Foundation ✅

| # | Item | Status |
|---|---|---|
| 0.1 | Preserve the baseline as tag `legacy/v-original` and branch `legacy` | ✅ |
| 0.2 | Create `main` from the baseline | ✅ |
| 0.3 | Establish the branch strategy (`main` / `legacy` / short-lived feature branches) | ✅ |
| 0.4 | Write the mission brief into the repository (`prompt.md`) | ✅ |

---

## Phase 1 — Discovery ✅

| # | Item | Status |
|---|---|---|
| 1.1 | Map every module, its public API, and its dependencies | ✅ |
| 1.2 | Trace the end-to-end data flow (DOM acquisition → chapters → EPUB → download) | ✅ |
| 1.3 | Map every storage mechanism, key, and value shape | ✅ |
| 1.4 | Document the parser contract that must survive | ✅ |
| 1.5 | Rank the defects (8 high / 23 medium / 10 low) with file:line references | ✅ |
| 1.6 | Audit the UX, visual design, states, accessibility, motion, and dark mode | ✅ |
| 1.7 | Audit permissions against actual code usage | ✅ |
| 1.8 | Produce the feature inventory (79 features) with a disposition for each | ✅ |

**Outputs:** `docs/discovery/01-product-inventory.md`,
`docs/discovery/02-audit-technical.md`, `docs/discovery/03-audit-ux.md`.

---

## Phase 2 — Vision & design ✅

| # | Item | Status |
|---|---|---|
| 2.1 | Choose the name and write the vision | ✅ |
| 2.2 | Define the design principles | ✅ |
| 2.3 | Define the token model: colour, type, spacing, radius, elevation, motion, layers | ✅ |
| 2.4 | Define the component inventory with states and a11y contracts | ✅ |
| 2.5 | Design every surface from scratch | ✅ |
| 2.6 | Write the ADRs | ✅ |
| 2.7 | Write the architecture document with diagrams | ✅ |
| 2.8 | Write the roadmap | ✅ |

**Outputs:** `docs/design/00-vision.md`, `docs/design/01-design-system.md`,
`docs/design/02-ux-guidelines.md`, `docs/design/03-screen-designs.md`,
`docs/architecture/README.md`, `docs/decisions/ADR-0001…0010`,
`docs/permissions.md`, `ROADMAP.md`.

---

## Phase 3 — Build from scratch ⬜

### 3.1 Scaffolding and tooling

| # | Item | Status |
|---|---|---|
| 3.1.1 | `src/` tree: `core/`, `ui/`, `parsers/`, `_locales/`, `assets/` | ⬜ |
| 3.1.2 | TypeScript config, strict mode, path aliases | ⬜ |
| 3.1.3 | Build: esbuild bundle + CSS + asset hashing + manifest generation | ⬜ |
| 3.1.4 | `.xpi` packaging (zip with the right root layout) | ⬜ |
| 3.1.5 | ESLint flat config + the custom `no-raw-colors-in-components` rule | ⬜ |
| 3.1.6 | Prettier + `.editorconfig` + `.gitattributes` | ⬜ |
| 3.1.7 | Vitest + happy-dom, Playwright + axe-core | ⬜ |
| 3.1.8 | `husky` + `lint-staged` pre-commit hook | ⬜ |
| 3.1.9 | `npm run verify` — lint, format, typecheck, test, build | ⬜ |

### 3.2 The design system (first, per the brief)

| # | Item | Status |
|---|---|---|
| 3.2.1 | `tokens.css` — Layer 1 primitives and Layer 2 semantics, light + dark | ⬜ |
| 3.2.2 | `base.css` — reset, typography, focus policy, the app shell | ⬜ |
| 3.2.3 | The icon set — 24×24, 2 px stroke, `currentColor` | ⬜ |
| 3.2.4 | `k-button`, `k-field`, `k-checkbox`, `k-switch`, `k-select` | ⬜ |
| 3.2.5 | `k-panel`, `k-dialog`, `k-toast`, `k-tooltip`, `k-menu` | ⬜ |
| 3.2.6 | `k-progress`, `k-list`, `k-list-item`, `k-empty`, `k-skeleton` | ⬜ |
| 3.2.7 | The token-contrast unit test (fails below the WCAG threshold) | ⬜ |
| 3.2.8 | The theme controller — system/light/dark, accent, density | ⬜ |

### 3.3 The core

| # | Item | Status |
|---|---|---|
| 3.3.1 | `FetchClient` — `AbortSignal`, the retry policy, cookie scoping | ⬜ |
| 3.3.2 | `UserFacingError` and the exhaustive error mapping | ⬜ |
| 3.3.3 | The `Parser` base class + the `ParserContext` adapter surface | ⬜ |
| 3.3.4 | `ParserFactory` — host, URL rule, confidence rule, default | ⬜ |
| 3.3.5 | The typed EPUB document model + reader + writer | ⬜ |
| 3.3.6 | `EpubPacker` — OPF, NCX, nav, manifest, spine | ⬜ |
| 3.3.7 | The structural EPUB merge | ⬜ |
| 3.3.8 | `SettingsStore` — schema-validated, namespaced | ⬜ |
| 3.3.9 | `LibraryStore` — IndexedDB, transactional | ⬜ |
| 3.3.10 | The legacy-storage import | ⬜ |
| 3.3.11 | The message bus + the typed protocol + boundary validation | ⬜ |

### 3.4 The surfaces

| # | Item | Status |
|---|---|---|
| 3.4.1 | The workbench shell — app bar, sidebar, panels, chapter list | ⬜ |
| 3.4.2 | The chapter list — virtualised, roving tabindex, editable titles | ⬜ |
| 3.4.3 | The filters popover — safe by default, validated regex opt-in | ⬜ |
| 3.4.4 | The cover picker | ⬜ |
| 3.4.5 | The status bar — phases, progress, cancel | ⬜ |
| 3.4.6 | The selector builder — split view with a live preview | ⬜ |
| 3.4.7 | The options page — grouped settings, library, reading list, permissions | ⬜ |
| 3.4.8 | The popup — launcher + live progress | ⬜ |
| 3.4.9 | The onboarding flow — three steps, live theme preview | ⬜ |
| 3.4.10 | Every empty / loading / error / success state | ⬜ |

### 3.5 The parsers

| # | Item | Status |
|---|---|---|
| 3.5.1 | The compat shim so legacy-style parsers run unmodified | ⬜ |
| 3.5.2 | The codemod for the mechanical migration | ⬜ |
| 3.5.3 | The parity harness | ⬜ |
| 3.5.4 | Migrate all 437 parsers — tracked in `docs/WORKLOG.md` | ⬜ |
| 3.5.5 | Delete the shim once migration reaches 100 % | ⬜ |

### 3.6 Packaging and hardening

| # | Item | Status |
|---|---|---|
| 3.6.1 | The manifest — the reduced permission set, the CSP, the static DNR rule | ⬜ |
| 3.6.2 | The optional host-permission request flow + the revoke UI | ⬜ |
| 3.6.3 | The background service worker + the checkpoint/resume path | ⬜ |
| 3.6.4 | The `web-ext lint` clean-up | ⬜ |

---

## Phase 4 — Documentation & release ⬜

| # | Item | Status |
|---|---|---|
| 4.1 | `README.md` — a polished landing page with real screenshots | ⬜ |
| 4.2 | `CHANGELOG.md` — Keep a Changelog + SemVer + the migration notes | ⬜ |
| 4.3 | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `PRIVACY.md` | ⬜ |
| 4.4 | `LICENSE.md` — the original GPL-3.0 terms, unaltered | ⬜ |
| 4.5 | `docs/development.md` — setup, build, run in Firefox, debug, test, release | ⬜ |
| 4.6 | `docs/permissions.md` — the permission rationale | ⬜ |
| 4.7 | CI — GitHub Actions running `npm run verify` and producing the artifact | ⬜ |
| 4.8 | The release tag (`v2.0.0-alpha.1`) and the packaged `.xpi` | ⬜ |

---

## Milestones

| Milestone | Definition | Status |
|---|---|---|
| **M1 — Design system complete** | Every component exists, with every state, and the token-contrast test passes | ⬜ |
| **M2 — Core complete** | The fetch layer, the EPUB pipeline, and the stores are implemented and unit-tested | ⬜ |
| **M3 — A book can be produced** | A chapter page → a valid EPUB, end to end, in Firefox | ⬜ |
| **M4 — Parser parity** | All 437 parsers migrated and verified by the parity harness | ⬜ |
| **M5 — Accessible** | axe-core reports zero critical/serious violations on every surface | ⬜ |
| **M6 — Shippable** | `lint`, `typecheck`, `test`, `build`, and `web-ext lint` all pass; the `.xpi` installs with zero warnings | ⬜ |

---

## Explicitly out of scope

- Chrome support (Firefox-first per the brief).
- Telemetry, accounts, cloud sync, or any remote code.
- A rewrite of the parser contract.
- An animated or decorative illustration style.
