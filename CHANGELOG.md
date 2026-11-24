# Changelog

All notable changes to **Kintsugi** — the from-scratch rewrite of the WebToEpub browser extension — are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Versioning policy

The extension itself is published to Firefox with a simplified `major.minor.patch` version: `tools/build.mjs` (`manifestVersion()`) strips any pre-release suffix from the `package.json` version before writing `manifest.json`, so `2.0.0-alpha.1` ships in the browser as `2.0.0`. The full Semantic Version — including the pre-release suffix — lives in `package.json` and on the GitHub release tag, so alpha builds are distinguishable from the final release in the tag history, in CI artefacts, and in this changelog.

## [Unreleased]

Nothing yet.

## [2.0.0-alpha.1] - 2026-11-23

The first alpha of the revamp: a full rewrite of WebToEpub on a modern MV3 / TypeScript foundation, with a new workbench UI, a new storage model, a tightened permission set, and all 434 legacy site parsers migrated onto a preserved parser contract.

### Added

- **New workbench surface.** The main interface is now a full-page _workbench_ (story, cover and options panels, chapter list with filtering, progress, and a site-selector banner) instead of a single crowded popup. See [ADR-0005](docs/decisions/ADR-0005-background-worker.md).
- **Popup as a launcher.** The popup is now a small launcher: it shows one card for the page the user is on (title, author, cover, chapter count), follows a running download's progress, and offers actions to open the workbench, the library or the settings. It never fetches a page or loads a parser itself.
- **Four pages instead of ten sections.** Popup, workbench, options and onboarding replace the original set of mutually-toggling `<section>` views.
- **Design system.** A shared component layer in `src/ui/components/` — 13 native Web Components (`k-button`, `k-field`, `k-checkbox`, `k-switch`, `k-radio-group`, `k-panel`, `k-progress`, `k-dialog`, `k-toast`, `k-empty`, `k-skeleton`, `k-list`, `k-list-item`) with Shadow DOM, plus a central theme controller at `src/ui/styles/theme-controller.ts`. See [ADR-0003](docs/decisions/ADR-0003-design-system.md) and [docs/design/01-design-system.md](docs/design/01-design-system.md).
- **Light / dark / system themes**, four accent palettes (gold, ink, verdigris, plum), comfortable/compact density, and a reduced-motion switch, all resolved through `data-theme`, `data-accent`, `data-density` and `data-reduceMotion` attributes on the document root.
- **Onboarding flow** — three skippable steps (what the extension does, where it works, how it should look) shown once on first run. It makes no network call, asks for no account or permission, and writes only the `onboardingComplete` setting.
- **Internationalisation.** All UI strings go through `browser.i18n` with five locales — `en` (source), `fr`, `de`, `ja` and `id` — with the full set of 188 message keys translated in each. Strings are resolved at the point of use through a memoised `t()` helper (`src/ui/i18n.ts`), with a graceful fallback to English when a key is missing. See [ADR-0010](docs/decisions/ADR-0010-i18n.md).
- **"Site selectors" feature** — teach Kintsugi how to read a site it does not have a dedicated parser for. A heuristic scanner (`src/core/parsers/heuristic-scanner.ts`) suggests content, title and removal selectors, the workbench offers _Suggest / Test / Save / Forget this site_, and learned selectors are persisted in `src/core/storage/site-selectors-store.ts`. See [ADR-0011](docs/decisions/ADR-0011-site-selectors.md).
- **Typed message bus.** Pages talk to the background worker over a discriminated-union protocol with per-message validation (`src/core/message/bus.ts`), replacing ad-hoc `chrome.runtime.sendMessage` calls.
- **Typed EPUB pipeline.** `src/core/epub/` models the book as a typed `EpubDocument` and builds XML with `DOMParser` / `XMLSerializer` instead of string surgery, generating both EPUB 2 NCX and EPUB 3 navigation. See [ADR-0008](docs/decisions/ADR-0008-epub-pipeline.md).
- **Library store.** Saved books are kept in IndexedDB (`kintsugi-library`) with a `books` object store indexed by `sourceUrl` and `updatedAt`, replacing the previous base64-in-extension-storage approach.
- **Tooling and CI.** ESLint (including a custom rule against raw colours in components), Prettier, `tsc --noEmit` type checking, `web-ext lint`, a husky pre-commit hook, and GitHub Actions workflows for CI and releases.
- **Test suite.** 169 tests across 9 files (Vitest), including a contract test that constructs every registered parser and asserts the parser contract, plus a locale-completeness test.

### Changed

- **Parser registry.** 434 site parsers were migrated into `src/core/parsers/legacy/sites/`, registering 659 host names in total.
- **Background service worker.** Fetching, EPUB assembly, saving and library persistence moved into the MV3 background worker (`src/core/background.ts`). Pages are clients, not workers.
- **Content script** is now a read-only "reader" that reports a page summary; it no longer injects UI or performs fetches.
- **Storage moved from `localStorage` to `browser.storage.local`** with a typed, schema-validated store (`src/core/storage/settings-store.ts`). Settings are grouped into `appearance`, `story`, `epub`, `images`, `behaviour`, `privacy` and `advanced` sections, with booleans stored as real booleans rather than the string `"true"` / `"false"`.
- **Chapter listings** honour `isIncludeable`: a chapter a parser marks as locked, paid or non-story starts unchecked, and it cannot be selected by the bulk actions.
- **Throttling and concurrency** are enforced centrally: concurrent chapter fetches stay at 1 and the default minimum delay between requests is 500 ms.
- **Error handling** surfaces human-readable messages through a `UserFacingError` type instead of raw stack traces, and per-request cancellation now aborts in-flight fetches via `AbortSignal`.
- **Declarative network request rules** are additive and scoped to `initiatorDomains` (`src/core/net/dnr-rules.ts`) rather than mutating global request behaviour.
- **UI text** is resolved lazily through `browser.i18n` instead of eager, class-definition-time message lookups.
- **ZIP building is lazy.** The ZIP library is dynamically imported only when a parser actually needs it, instead of shipping in the main bundle. See [ADR-0012](docs/decisions/ADR-0012-lazy-zip.md).

### Deprecated

- **The legacy parser compatibility shim** (`src/core/parsers/compat/`) is a migration aid and is explicitly marked for deletion once parser migration reaches 100%. See [ADR-0002](docs/decisions/ADR-0002-parser-contract.md).
- **The original `localStorage` conventions** (`ReadingList`, `DefaultParserConfigs`, and the flat set of ~45 un-namespaced preferences) are deprecated in favour of `browser.storage.local` and IndexedDB. See [ADR-0006](docs/decisions/ADR-0006-storage.md).
- **The original `__MSG_` DOM-sweep localisation approach** is deprecated in favour of resolving each string at the point of use.
- **Direct use of the callback-style `chrome.*` APIs** is deprecated in new code; the promise-shaped facade in `src/core/browser-api.ts` resolves the namespace once instead.

### Removed

- **The original popup-as-whole-UI workflow.** The old sequence — open the popup, check the details tab, pick a cover, tick chapters, press pack — is gone. The popup stays a small launcher, and the workbench opens as its own titled page in a tab. There is no "the popup flashes and closes" dance, no native `beforeunload` confirmation when you close the tab, and no UI parked at an internal `popup.html?id=…` URL.
- **Closing the tab no longer kills the download.** The work runs in the background service worker, so the download survives the workbench being closed or the popup being dismissed, and re-opening the workbench re-attaches to the running job and shows its progress.
- **The ten mutually-toggling `<section>` surfaces**, replaced by four dedicated pages.
- **`localStorage` usage** for settings, reading list and parser configs.
- **Base64 EPUB storage** in extension storage, and the zero-byte files produced by failed image downloads (failed images are now visible placeholders in the EPUB).
- **The over-broad `chrome.storage.local.clear()`** call, which wiped unrelated extension data; clearing is now scoped to the library store.
- **Regex-based OPF/NCX merging**, replaced by proper XML document construction.
- **The `__MSG_` placeholder sweep.** The baseline walked the DOM on every open and replaced text starting with `__MSG_`, against a brittle whitelist of element types — which also meant a chapter title beginning with `__MSG_` could be rewritten. Strings are now resolved where they are used.
- **Locales `ru`, `uk` and `vi`**, replaced by `fr`, `de`, `ja` and `id`.
- **Three permissions and all static host access** — see the permission notes below.

### Fixed

- **Component stylesheets are no longer deleted by the component itself.** Every component that rebuilds its shadow root was wiping the `<style>` element the base class had injected into it, so every form control in the application rendered as an unstyled native element. Stylesheets are now adopted into the shadow root, where they survive a rebuild (`src/ui/components/base.ts`).
- **The dark theme is dark.** The dark theme mapped `--bg` to the lightest step of the neutral ramp and `--text` to the darkest, which is the light theme's mapping. The ramp is now reversed inside the dark theme, so `--bg` means "the background" in both themes ([ADR-0014](docs/decisions/ADR-0014-dark-theme-token-ramp.md)).
- **`[hidden]` is honoured.** The user agent's `[hidden]` rule loses to any author `display` rule, so the workbench's empty state stayed in the layout and pushed the chapter list out of the panel. A global rule puts the attribute back in charge (`src/ui/styles/base.css`).
- **The chapter list fills its panel.** `contain: strict` implies `contain: size`, which made the list's height independent of its contents and stopped the flex algorithm from sizing it at all. It now uses `contain: content` (`src/ui/components/k-list.ts`).
- **The content script runs.** It was bundled as an ES module, which Firefox does not support in the page's world; the browser rejected it with a syntax error and the content script silently never ran. It is now bundled as a classic script (`tools/build.mjs`).
- **The settings validator no longer crashes.** Reading settings with a partially-written or older shape threw, which left the settings page unusable.
- **The popup honours the user's theme.** It ignored the theme, accent, and density settings entirely, so a user who configured a dark interface got a light popup.
- **The theme control works.** Changing the theme in the settings page did not change anything.
- **The reduced-motion setting was inert.** It was stored and never applied.
- **Relative chapter URLs are resolved.** A parser that returned a site-relative chapter URL produced a broken link; relative URLs are now resolved against the page.
- **Relative cover URLs are resolved**, for the same reason.
- **The default parser reports a title**, instead of an empty string.
- **The workbench shows an error banner** when a page cannot be analysed, instead of failing silently.

- **Cancelled requests are actually cancelled.** In-flight fetches are aborted through `AbortSignal` instead of running to completion in the background.
- **Cookies are always cleaned up.** Partitioned cookies are removed in a `finally` block, so an error mid-request no longer leaves stale cookies behind (`src/core/net/fetch-client.ts`, `src/core/net/cookie-bridge.ts`).
- **Failed image downloads no longer produce empty files**; they become visible placeholders so the broken asset is obvious in the EPUB reader.
- **Base URL resolution no longer throws** when a document has no usable base; it falls back to `dom.baseURI`.
- **`RegExp.escape` is polyfilled** with a safe fallback on engines that do not provide it.
- **The custom-error path works.** The baseline's `setCustomErrorResponse` returned an empty object, so a parser asking for a `403` (captcha prompt) or a `999` (auto-retry) got nothing. The fetch layer now evaluates the handler and honours a typed `{ status, retryDelay? }` result (`src/core/net/fetch-client.ts`).
- **Failed chapters are visible.** A chapter that could not be fetched becomes a placeholder in the EPUB that says what happened, and the failure is counted in the job progress, instead of producing a silently incomplete book.
- **DNR rules are additive and scoped.** The baseline removed _all_ session rules when a parser set its own, so concurrent parsers clobbered each other; each rule is now removed by its own id and matched by initiator domain.
- **Library writes are transactional** and clearing the library no longer touches unrelated data.

### Security

- **Vendored DOMPurify.** Sanitisation uses a locally bundled copy of DOMPurify (`src/core/vendor/dompurify.ts`); there is no CDN, no remote code and no remotely loaded script.
- **No static host permissions.** The manifest requests no host access up front; `*://*/*` is only an _optional_ host permission, requested on demand for the site the user is working on.
- **Tightened manifest.** The content security policy is `script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'`, `incognito` is set to `spanning`, and `strict_min_version` is `140.0`. See [docs/permissions.md](docs/permissions.md).
- **Declarative network request rules are additive and scoped**, so header spoofing cannot leak into unrelated requests.
- **Data collection is declared as none.** `data_collection_permissions` is `{ required: ["none"], optional: [] }`.

### Migration notes: what's different from the original

Kintsugi keeps the _what_ of WebToEpub — scrape a story, pick the chapters, pack an EPUB — but changes a lot of the _how_. The notes below are aimed at users upgrading from the original extension.

#### Removed or changed behaviour

- The old popup flow, where every step of the process lived inside the extension popup, is gone. The popup is now a launcher; the workbench opens as a regular tab and holds the whole process. Chapter selection, cover choice, options and packing all happen there.
- The original ten toggling sections have been reorganised into four pages: popup (launcher), workbench (main surface), options (preferences) and onboarding (first run).
- Behaviour that was previously implicit or invisible is now explicit: locked and paid chapters are listed but start unchecked via `isIncludeable`, request throttling is centralised, and failures are reported as readable messages instead of console noise.
- The original extension's saved data is **not** read automatically. There is no one-time import of the old library or preferences in this alpha: the legacy `localStorage` and `chrome.storage.local` data is left untouched, settings start from their documented defaults, and the site-selector feature starts empty.

#### UI/UX changes

- A consistent design system replaces the original's ad-hoc markup and styling: a shared component layer under `src/ui/components/`, driven by a central theme controller, with documented spacing, type scale, colour and elevation rules ([docs/design/01-design-system.md](docs/design/01-design-system.md), [docs/design/00-vision.md](docs/design/00-vision.md)).
- Light, dark and system themes are supported, with system preference resolved through `prefers-color-scheme`. Accent colour, density and reduced-motion are also user-selectable.
- The workbench adds a chapter filter dialog, progress reporting, a cover panel, and an in-flow banner when Kintsugi has fallen back to a generic parser for a site it does not know.
- Onboarding walks a new user through three steps — what the extension does, the sites it supports, and a live theme/accent preview — instead of dropping them into a settings form. It can be skipped at any point.

#### Storage format changes

The original extension kept its preferences in `localStorage` under un-namespaced keys, with booleans stored as the strings `"true"` and `"false"`, and kept the library in `chrome.storage.local` as base64 data. Kintsugi replaces all of that:

| Data                   | Original                                                                            | Kintsugi                                                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Settings               | `localStorage`, ~45 flat un-namespaced keys, string booleans                        | `browser.storage.local`, key `kintsugi.settings`, nested typed object, validated against a schema on read                                                                          |
| Learned site selectors | `localStorage` key `DefaultParserConfigs` (JSON array of `[host, selectors]` pairs) | `browser.storage.local`, key `kintsugi.siteSelectors`, objects keyed by normalised hostname (lowercased, `www.` stripped) with `contentCss`, `titleCss`, `removeCss` and `testUrl` |
| Library / saved books  | `chrome.storage.local`, base64-encoded EPUB data                                    | IndexedDB database `kintsugi-library`, object store `books` (key path `id`), indexed by `sourceUrl` and `updatedAt`, with cover bytes stored alongside the entry                   |

The typed settings shape is:

```text
kintsugi.settings = {
  appearance: { theme, accent, density, reduceMotion },
  story:      { filenameTemplate, defaultLanguage, removeAuthorNotes,
                removeChapterNumbers, includeTocPage },
  epub:       { version, addInfoPage, removeNextPrevLinks, includeSourceUrl },
  images:     { skipImages, removeDuplicates, preferHighestResolution,
                useSvg, compress, maxResolution },
  behaviour:  { skipFailedChapters, retryOnEmptyPage, minimumDelay,
                maxChapters, delayPerChapter },
  privacy:    { metadataLookup, sendStoryUrl },
  advanced:   { diagnostics },
  onboardingComplete
}
```

Resetting settings removes only the `kintsugi.settings` key and leaves site selectors and the library untouched.

#### Permission changes

The original manifest requested seven permissions — `cookies`, `downloads`, `webRequest`, `declarativeNetRequest`, `scripting`, `storage` and `unlimitedStorage` — plus static `<all_urls>` host access for every site. Kintsugi requests **five** permissions:

| Permission               | Change      |
| ------------------------ | ----------- |
| `downloads`              | kept        |
| `scripting`              | kept        |
| `storage`                | kept        |
| `declarativeNetRequest`  | kept        |
| `cookies`                | kept        |
| `webRequest`             | **removed** |
| `unlimitedStorage`       | **removed** |
| `<all_urls>` host access | **removed** |

There are no static host permissions at all. Instead, `*://*/*` is declared as an _optional_ host permission, and host access is requested per site at the moment the user picks one — the background worker exposes `permissions:check`, `permissions:request`, `permissions:list` and `permissions:revoke` handlers for that flow. Full rationale is in [docs/permissions.md](docs/permissions.md) and [ADR-0007](docs/decisions/ADR-0007-permissions.md).

#### Parser compatibility

All 434 site parsers were migrated into `src/core/parsers/legacy/sites/` and still work. The parser contract was preserved verbatim, so the migration is a code-motion exercise rather than a rewrite: `getChapterUrls` and `findContent` remain required, `extractTitleImpl` and `extractAuthor` keep their original meaning and return types, `isIncludeable` defaults to `true`, concurrent chapter fetches must stay at 1, the default minimum throttle is 500 ms, and the chapter shape remains `{ sourceUrl, title, isIncludeable?, previousDownload? }`.

A compatibility shim provides the legacy globals (`util`, `HttpClient`, `UIText`, `ErrorLog`, `parserFactory`, `ChapterUrlsUI` and the `Parser` base class) to the migrated parsers, so the original parser source continues to run unchanged — including base-class helpers such as `makeEmptyDocForContent`, `findConstructedContent`, `addTextToChapterContent`, `walkTocPages` and `getChaptersFromAllTocPages`. A contract test in `tests/integration/parser-contract.test.ts` constructs every registered parser and asserts the contract, so breakage is caught in CI rather than at runtime.

What _has_ changed is the plumbing around the parsers, not the parsers themselves: fetching, retrying, throttling and error classification are handled centrally by the background worker, so a parser no longer owns its own HTTP concerns. See [ADR-0002](docs/decisions/ADR-0002-parser-contract.md) and [ADR-0005](docs/decisions/ADR-0005-background-worker.md).

### Notes

- Build output is approximately 1.18 MB unpacked, and the packaged `.xpi` is approximately 337 KB.
- The full source is not needed to run the extension: DOMPurify is vendored and no code is fetched at runtime.

## [Comparison links]

- [Unreleased]: https://github.com/kintsugi/webtoepub/compare/v2.0.0-alpha.1...HEAD
- [2.0.0-alpha.1]: https://github.com/kintsugi/webtoepub/releases/tag/v2.0.0-alpha.1
- [Keep a Changelog]: https://keepachangelog.com/en/1.1.0/
- [Semantic Versioning]: https://semver.org/spec/v2.0.0.html
