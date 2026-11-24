# Discovery — Product & Feature Inventory

**Baseline:** `legacy/v-original` (WebToEpub v1.0.14.92, commit `31cc8714`)
**Status:** Complete
**Date:** 2025-11-23

---

## 1. What the extension does

WebToEpub is a browser extension that scrapes **web novels and other episodic web
content** and bundles it into a **standards-compliant EPUB file** for offline
reading.

The product exists because a large body of serialised fiction lives on
thousands of ad-heavy, structurally inconsistent web sites rather than in
ebook stores. There is no common API, no common markup, and no common
navigational model. WebToEpub's answer is a **site-parser architecture**: a
registry of ~440 site-specific scrapers ("parsers"), each of which knows how
to find a story's table of contents and extract clean chapter text from one
specific domain.

The user journey is:

1. Navigate the browser to a chapter page or table-of-contents page of a story.
2. Click the toolbar button.
3. The extension reads the live DOM of the current tab, picks the matching
   parser, auto-fills title/author/language, and enumerates the story's chapters.
4. The user optionally adjusts metadata, picks a cover, and trims the chapter range.
5. The user presses **Pack EPUB**.
6. The extension fetches every selected chapter, sanitises the HTML, downloads
   embedded images, assembles an EPUB 2 or EPUB 3 package, and saves it to disk.

A secondary feature, the **Library**, stores generated EPUBs inside the
extension so a story can be re-downloaded incrementally when new chapters are
published.

---

## 2. Feature inventory

Every user-visible capability in the baseline is listed here. Each row is
marked **Keep**, **Improve**, **Drop**, or **Replace** in the corresponding
ADR, and the revamp roadmap records the outcome. Nothing in this list is
silently dropped.

### 2.1 Core capture pipeline

| #   | Feature                             | Baseline behaviour                                                                                                                           | Disposition                                   |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| F1  | Toolbar button opens the tool       | `default_popup` is set, but the popup detects it is a popup and immediately re-opens itself in a **full browser tab**, then closes the popup | Replace — see ADR-0006                        |
| F2  | Read live DOM of the current tab    | Injects `ContentScript.js` via `chrome.scripting.executeScript`, receives `document.all[0].outerHTML` over `runtime.sendMessage`             | Keep, harden                                  |
| F3  | Automatic parser selection          | Exact-host map → URL rule → DOM-confidence rule → `DefaultParser` fallback                                                                   | Keep                                          |
| F4  | Manual parser selection             | Dropdown of manually-selectable parsers                                                                                                      | Keep                                          |
| F5  | Auto-extract metadata               | Title, author, language, filename; optional subject/description/publisher/published-date                                                     | Improve                                       |
| F6  | Manual metadata override            | Every field editable in the main form                                                                                                        | Keep                                          |
| F7  | Chapter list enumeration            | Site-specific `getChapterUrls()` returning `{sourceUrl, title, isIncludeable}`                                                               | Keep — the contract survives verbatim         |
| F8  | Chapter range selection             | "First Chapter" / "Last Chapter" `<select>` dropdowns                                                                                        | Improve                                       |
| F9  | Select all / unselect all / reverse | Toolbar buttons over the chapter table                                                                                                       | Keep                                          |
| F10 | Editable chapter titles             | Per-row `<input type="text">`                                                                                                                | Keep                                          |
| F11 | Chapter title filters               | Slide-in sidebar with frequency analysis and regex include/exclude                                                                           | Improve                                       |
| F12 | Shift-click range select            | Mouse-only; taught by a native `alert()` after 5 mis-clicks                                                                                  | Replace with a keyboard-accessible equivalent |
| F13 | `isIncludeable` default-unchecked   | Locked/VIP/premium chapters render unchecked                                                                                                 | Keep — feature parity required                |
| F14 | Download-state icons                | Sleeping / Downloading / Loaded / None / PreviouslyDownloaded                                                                                | Improve — a11y rewrite                        |
| F15 | Cover image selection               | URL field + scraped-image picker table                                                                                                       | Keep                                          |
| F16 | "Pack EPUB" primary action          | Fetches chapters → assembles EPUB → triggers browser download                                                                                | Keep                                          |
| F17 | "Add to Library" variant            | Same pipeline, result stored instead of downloaded                                                                                           | Keep                                          |
| F18 | "Pause to Library"                  | Actually **cancels**; nothing is resumable                                                                                                   | Replace with a truthful "Cancel"              |
| F19 | Rate limiting / throttle            | `minimumThrottle` (default 500 ms), `maxSimultanousFetchSize = 1`                                                                            | Keep                                          |
| F20 | Per-chapter manual delay            | User-specified extra delay per chapter                                                                                                       | Keep                                          |
| F21 | Multi-page TOC crawling             | `walkTocPages`, `getChaptersFromAllTocPages`                                                                                                 | Keep                                          |
| F22 | Multi-page chapter content          | `walkPagesOfChapter` merges "next page" content                                                                                              | Keep                                          |
| F23 | Site blocking                       | User can block a host from the error dialog                                                                                                  | Keep                                          |
| F24 | Captcha workflow                    | Error dialog offers "Open URL for Captcha" / "Copy URL for Captcha"                                                                          | Improve                                       |

### 2.2 EPUB production

| #   | Feature                                 | Baseline behaviour                                                     | Disposition |
| --- | --------------------------------------- | ---------------------------------------------------------------------- | ----------- | ---- |
| F25 | EPUB 2 / EPUB 3 choice                  | Preference `createEpub3`                                               | Keep        |
| F26 | OPF metadata                            | Title, author, language, publisher, subject, description, date, series | Keep        |
| F27 | Series metadata                         | Series name + volume index                                             | Keep        |
| F28 | Table of contents                       | NCX for EPUB 2, nav document for EPUB 3                                | Keep        |
| F29 | Image embedding                         | Downloaded, optionally resized/compressed, deduplicated                | Keep        |
| F30 | SVG image support                       | Optional; SVG wrapped into XHTML                                       | Keep        |
| F31 | Cover image as XHTML wrapper            | `coverImage.xhtml` page                                                | Keep        |
| F32 | Custom filename template                | User template with placeholders                                        | Keep        |
| F33 | Windows-illegal filename stripping      | `~/?<>\:\*                                                             | "`          | Keep |
| F34 | Duplicate-image removal                 | Preference `removeDuplicateImages`                                     | Keep        |
| F35 | Highest-resolution image selection      | Preference `highestResolutionImages`                                   | Keep        |
| F36 | Skip images                             | Preference `skipImages`                                                | Keep        |
| F37 | Information page                        | Optional extra front-matter page                                       | Keep        |
| F38 | Next/previous chapter hyperlink removal | Preference                                                             | Keep        |
| F39 | Author-note removal                     | Preference (parser-specific rows)                                      | Keep        |
| F40 | Chapter-number removal                  | Preference (parser-specific rows)                                      | Keep        |
| F41 | Original/translated text filtering      | Three parser-specific preferences                                      | Keep        |
| F42 | Footnote extraction                     | `FootnoteExtractor` for scripts-based footnotes                        | Keep        |
| F43 | WordPress cruft removal                 | Standard WP widget/metadata stripping                                  | Keep        |
| F44 | Cloudflare email decoding               | `decodeCloudflareProtectedEmails`                                      | Keep        |

### 2.3 Library

| #   | Feature                           | Baseline behaviour                                                 | Disposition                                            |
| --- | --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ |
| F45 | Store EPUB in extension storage   | Base64 data URL in `chrome.storage.local`                          | Replace — IndexedDB, drops `unlimitedStorage`          |
| F46 | Library grid / table views        | Compact thumbnail grid or full table                               | Keep, redesign                                         |
| F47 | Search for new chapters           | Re-fetches the story TOC and diffs against the stored chapter list | Keep                                                   |
| F48 | Update with new chapters          | Merge new chapters into the stored EPUB                            | Keep — but replace regex XML surgery with a real merge |
| F49 | Download stored EPUB              | Re-save from the library                                           | Keep                                                   |
| F50 | Delete stored EPUB                | Remove from library                                                | Keep                                                   |
| F51 | Edit metadata of stored EPUB      | In-place metadata editor                                           | Keep                                                   |
| F52 | Change story URL of stored EPUB   | Manual URL override + warning                                      | Keep                                                   |
| F53 | Import / export library           | ZIP or JSON                                                        | Keep                                                   |
| F54 | Add chapter from a different EPUB | Merge two EPUBs                                                    | Keep                                                   |
| F55 | Storage usage meter               | `getBytesInUse` + human-readable formatting                        | Keep                                                   |
| F56 | "In Progress" state               | 32 px red bold text                                                | Replace with a designed state                          |

### 2.4 Reading list & continuity

| #   | Feature                              | Baseline behaviour                                                             | Disposition    |
| --- | ------------------------------------ | ------------------------------------------------------------------------------ | -------------- |
| F57 | Remember last chapter read per story | `ReadingList` in `localStorage`; previously-downloaded chapters auto-unchecked | Keep           |
| F58 | Reading list view                    | Full-screen takeover listing stories with remove buttons                       | Keep, redesign |
| F59 | "Exclude from reading list" checkbox | Per-story opt-out                                                              | Keep           |

### 2.5 Default parser (no site-specific parser)

| #   | Feature                           | Baseline behaviour                               | Disposition    |
| --- | --------------------------------- | ------------------------------------------------ | -------------- |
| F60 | Heuristic TOC detection           | >40 % of text inside links ⇒ classified as TOC   | Keep, improve  |
| F61 | Heuristic content detection       | Scores candidate containers                      | Keep, improve  |
| F62 | Heuristic title detection         | Generates a CSS selector                         | Keep, improve  |
| F63 | CSS-selector authoring UI         | Content / title / remove selectors + test button | Keep, redesign |
| F64 | Per-hostname selector persistence | `DefaultParserConfigs` in `localStorage`         | Keep           |
| F65 | Apply saved selectors             | Automatically used when revisiting the host      | Keep           |

### 2.6 Options & personalisation

| #   | Feature                      | Baseline behaviour                     | Disposition                            |
| --- | ---------------------------- | -------------------------------------- | -------------------------------------- |
| F66 | Theme selection              | Always light / always dark / follow OS | Replace — real token-based themes      |
| F67 | Advanced options list        | ~45 flat controls                      | Replace — grouped, searchable settings |
| F68 | Export / import options file | JSON round-trip                        | Keep                                   |
| F69 | Accent colour                | —                                      | **New**                                |
| F70 | UI density                   | —                                      | **New**                                |
| F71 | Developer diagnostics        | Toggles verbose logging                | Keep                                   |

### 2.7 Metadata enrichment

| #   | Feature                                  | Baseline behaviour                            | Disposition                          |
| --- | ---------------------------------------- | --------------------------------------------- | ------------------------------------ |
| F72 | Load metadata from a URL                 | Fetches a page and scrapes title/tags         | Keep                                 |
| F73 | Auto-search NovelUpdates                 | Queries novelupdates.com for tags/description | Keep — with an explicit privacy note |
| F74 | Subject / description / publisher / date | Manual fields                                 | Keep                                 |

### 2.8 Error handling & diagnostics

| #   | Feature                                 | Baseline behaviour                                   | Disposition                                        |
| --- | --------------------------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| F75 | Error dialog                            | Six equal-weight buttons; shows a raw JS stack trace | Replace — designed dialog, human-readable messages |
| F76 | Error history                           | In-memory queue of recent errors                     | Keep                                               |
| F77 | Dump error log to file                  | Downloads a `.txt` of the log                        | Keep                                               |
| F78 | Retry / open URL / copy URL / block URL | Dialog actions                                       | Keep                                               |
| F79 | Skip chapters that fail to fetch        | Preference; inserts a placeholder chapter            | Keep                                               |

---

## 3. Technical inventory

| Area                 | Baseline                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Target browsers      | Chrome **and** Firefox (MV3)                                                                                             |
| Revamp target        | **Firefox only** (per the mission brief)                                                                                 |
| Background worker    | **None** — all logic runs in the extension page                                                                          |
| Language             | Vanilla ES6+, no build step for app code                                                                                 |
| Bundled runtime deps | `zip.js` (~2.7), `DOMPurify` (~3.2)                                                                                      |
| Dev deps             | ESLint 8, `web-ext`, `@xmldom/xmldom`, `copyfiles`, `http-server`                                                        |
| Test runner          | QUnit, run in a browser via `http-server`                                                                                |
| Tests                | ~40 `unitTest/Utest*.js` files + 7 `testdata/*.html` fixtures                                                            |
| Parsers              | 437 files in `plugin/js/parsers/`                                                                                        |
| i18n                 | 4 locales: `en`, `ru`, `uk`, `vi` (~310 message keys)                                                                    |
| Permissions          | `cookies`, `downloads`, `webRequest`, `declarativeNetRequest`, `scripting`, `storage`, `unlimitedStorage` + `<all_urls>` |
| Storage              | `localStorage` (preferences, reading list, parser configs) + `chrome.storage.local` (library)                            |
| CI                   | GitHub Actions: `node.js.yml`, `AutoRelease.yml`, `issue-check.yml`                                                      |
| Licence              | GPL-3.0-only                                                                                                             |

---

## 4. User flows (as observed in the baseline)

### Flow A — happy path

```
Toolbar icon click
  └─ popup opens → detects popup → opens popup.html in a NEW TAB → popup closes
       ├─ content script injected into the source tab
       ├─ DOM returned over runtime.sendMessage
       ├─ parser selected automatically
       ├─ metadata auto-filled
       ├─ chapter table populated
       └─ user presses [Pack EPUB]
            ├─ chapters fetched sequentially (throttled)
            ├─ images fetched
            ├─ EPUB assembled (zip.js)
            └─ chrome.downloads.download() → browser save dialog
```

### Flow B — chapter list is paginated

The parser's `getUrlsOfTocPages` returns N TOC page URLs; the base class
fetches each in sequence, rate-limited, updating the UI between pages.

### Flow C — a site is not supported

The `DefaultParser` heuristic scanner runs; the user is shown a wizard asking
for a CSS selector for the content element, and the answer is remembered per
hostname for next time.

### Flow D — incremental update via the Library

The user adds a story to the Library; later presses "Search new Chapters",
which re-fetches the TOC and diffs against the stored chapter list; "Update"
merges the new chapters into the stored EPUB.

### Flow E — a site is behind a challenge

A fetch returns a challenge page; the parser's `isCustomError` returns true;
the error dialog offers to open the URL so the user can solve the challenge,
after which "Retry" resumes.

---

## 5. What the baseline does well (preserve this)

1. **The parser contract is genuinely good.** `getChapterUrls` + `findContent` +
   a handful of optional hooks is a small, learnable surface that has supported
   440 sites. It survives the rewrite verbatim.
2. **The throttle model is respectful.** Sequential fetches with a configurable
   minimum delay avoid hammering hosts.
3. **The TOC-walking and multi-page-chapter helpers** solve genuinely hard
   problems (paginated TOCs, chapter content split across pages) and are
   reused by dozens of parsers.
4. **The `isIncludeable` flag** elegantly handles paywalled chapters by
   unchecking them rather than failing.
5. **The `DefaultParser` heuristic scanner** is a surprisingly effective
   fallback that lets the extension work on sites nobody has written a parser
   for.
6. **The library's "search for new chapters" flow** is a real differentiator —
   it turns the extension into an incremental reader.

## 6. What the baseline does badly (must change)

See [`02-audit-technical.md`](02-audit-technical.md) and
[`03-audit-ux.md`](03-audit-ux.md). In summary:

- The UI is a 2009-era unstyled HTML form: 15 literal hex colours, 3 font
  sizes, 6 border radii, zero ARIA, zero `:focus` styles, one animation, and a
  "dark mode" that is 5 declarations of inverted background colour.
- The primary action ("Pack EPUB") sits 13 rows below the top of the form and
  is visually indistinguishable from every other button.
- The error surface shows raw JavaScript stack traces to end users.
- `webRequest` is requested with blocking header access over `<all_urls>` for
  one narrow workaround that `declarativeNetRequest` can express.
- `unlimitedStorage` is requested because EPUBs are stored as base64 data URLs,
  an implementation accident.
- `Parser.setCustomErrorResponse` builds a correct response object and then
  returns `{}` — the entire custom-error path is broken.
- Failed images are packed into the EPUB as zero-byte files, producing
  corrupt EPUBs.
- Cookie cleanup is not in a `finally` block, leaking unpartitioned cookies
  into the browser's cookie jar on any network failure.
