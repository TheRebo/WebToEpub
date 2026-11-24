# Discovery — Technical & Architecture Audit

**Baseline:** `legacy/v-original` (v1.0.14.92, commit `31cc8714`)
**Scope:** `plugin/js/**` core (non-parser) modules, `plugin/manifest.json`,
`plugin/_locales/**`, `eslint/**`, `unitTest/**`
**Status:** Complete

---

## 1. Module map

### 1.1 Load order

Everything is a **global script tag** in `plugin/popup.html` — no bundler, no
modules. Load order determines runtime availability.

| Order    | Module                 | Lines     | Responsibility                                                        |
| -------- | ---------------------- | --------- | --------------------------------------------------------------------- |
| 623      | `UIText.js`            | 124       | Centralised localised UI strings, namespaced by area                  |
| 624      | `ReadingList.js`       | 185       | Remembers the last chapter downloaded per story                       |
| 625      | `UserPreferences.js`   | 295       | 45 preferences, localStorage persistence, observer pattern            |
| 626      | `EpubMetaInfo.js`      | 256       | EPUB metadata value object                                            |
| 627      | `ErrorLog.js`          | 158       | Queued error dialog + error history                                   |
| 628      | `Util.js`              | 1288      | DOM / URL / string / EPUB utilities (self-described "dumping ground") |
| 629      | `FootnoteExtractor.js` | 39        | Script-embedded footnote extraction                                   |
| 630      | `Firefox.js`           | 49        | Firefox-only workarounds                                              |
| 631      | `Download.js`          | 183       | Cross-browser download wrapper, filename templating                   |
| 632      | `HttpClient.js`        | 438       | Fetch wrapper, cookie partitioning, DNR rules, retries                |
| 633      | `HeuristicScanner.js`  | 155       | Heuristic TOC/content/title detection                                 |
| 634      | `EpubItem.js`          | 333       | Chapter/image/font value objects + DOMPurify boundary                 |
| 635      | `ParserFactory.js`     | 178       | Parser registry + selection strategy                                  |
| 636      | `ImageCollector.js`    | 732       | Image discovery, download, dedup, compression                         |
| 637      | `Imgur.js`             | 112       | Imgur gallery expansion                                               |
| 638      | `ChapterUrlsUI.js`     | 726       | Chapter table UI + filter sidebar                                     |
| 639      | `DefaultParserUI.js`   | 301       | Per-host CSS-selector config + wizard                                 |
| 640      | `ProgressBar.js`       | 47        | Progress control + tab-title percentage                               |
| 641      | `Parser.js`            | 902       | Base parser class + orchestration engine                              |
| 642      | `Library.js`           | 1301      | Persistent EPUB library                                               |
| 645–1080 | `parsers/*.js`         | 437 files | 434 site parsers                                                      |
| 1081     | `zip.js` (vendor)      | —         | ZIP writer                                                            |
| 1082     | `DOMPurify` (vendor)   | —         | HTML sanitiser                                                        |
| 1083     | `EpubItemSupplier.js`  | 58        | Adapter between Parser and EpubPacker                                 |
| 1084     | `CoverImageUI.js`      | 167       | Cover URL input + image picker                                        |
| 1085     | `SonakoParser.js`      | —         | Fandom/Wikia parser (out of alphabetical order)                       |
| 1086     | `EpubPacker.js`        | 430       | OPF/NCX/nav/manifest assembly                                         |
| 1087     | `main.js`              | 722       | Popup orchestrator                                                    |

`ContentScript.js` (12 lines) is not in the manifest; it is injected
programmatically via `chrome.scripting.executeScript`.

### 1.2 Dead code

| Item                                  | Evidence                                                                                                    | Disposition                                        |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `plugin/js/DebugUtil.js`              | Not referenced from `popup.html`; zero references anywhere. Self-labelled "Not included in release product" | Delete                                             |
| `FetchCache` class (`Parser.js:9-27`) | Defined but never instantiated. Also buggy: caches on `pathname` only, ignoring the query string            | Delete (or reimplement correctly if a use appears) |
| `plugin/js/parsers/SonakoParser.js`   | Loaded at `popup.html:1085`, out of alphabetical order                                                      | Reorder                                            |
| `unitTest/UtestDebugUtil.js`          | Tests the dead module                                                                                       | Delete                                             |
| `#testSection` (`popup.html:540`)     | Empty `<section>`, never referenced                                                                         | Delete                                             |
| `window.sessionStorage`               | Zero reads or writes project-wide                                                                           | n/a                                                |

---

## 2. Data flow

### 2.1 DOM acquisition

```
Toolbar icon → popup opens → main.isOpenInBrowserTab() detects a popup
   → main.openTabWindow() creates a NEW TAB of popup.html?id=<tabId> → popup closes
        → chrome.scripting.executeScript(ContentScript.js) into the source tab
        → ContentScript posts {messageType:"ParseResults", document: outerHTML, url}
        → main.onMessageListener() rebuilds the DOM with DOMParser
```

The DOM crosses the process boundary as a **serialised HTML string**, not a
structured clone. This loses live DOM identity, and the extension rebuilds it.

**Architectural consequence:** the extension _must_ run in a tab, because the
browser kills the popup when it loses focus — a 30-minute download would die.
The absence of a background service worker is what forces this.

### 2.2 Pack EPUB

```
main.fetchContentAndPackEpub()
  → util.resetSleepController()
  → metaInfoFromControls()                       (read UI fields)
  → ChapterUrlsUI.limitNumOfChapterS(maxChaptersPerEpub)
  → window.workInProgress = true; disable Pack button
  → parser.onStartCollecting()
  → await parser.fetchContent()
       → Parser.fetchWebPages()
            → filter isIncludeable
            → imageCollector.reset()
            → parserFactory.addParsersToPages()   (per-page parser for cross-domain TOCs)
            → group by maxSimultanousFetchSize (== 1)
            → for each page:
                 → await rateLimitDelay()
                 → pageParser.fetchChapter(url) → HttpClient.wrapFetch
                 → preprocessRawDom(dom)
                 → removeUnusedElementsToReduceMemoryConsumption()
                 → findContent(dom)
                 → imageCollector.preprocessImageTags + findImagesUsedInDocument + fetchImages
  → packEpub(metaInfo)
       → new EpubPacker(metaInfo, version)
       → parser.epubItemSupplier()
       → webPagesToEpubItems → webPageToEpubItems → convertRawDomToContent
       → EpubItem.makeChapterDoc → util.sanitizeNode (DOMPurify)   ← sanitisation boundary
       → epub.assemble(supplier) → zip.BlobWriter → Blob
  → window.workInProgress = false
  → Download.save(blob, fileName, ...)
       → URL.createObjectURL → chrome.downloads.download / browser.downloads.download
  → parser.updateReadingList()
  → ErrorLog.showLogToUser()
```

### 2.3 Messaging summary

There is exactly **one** runtime message in the entire product:
`{messageType: "ParseResults", document, url}` from the injected content
script to the extension page (`ContentScript.js:7-12` → `main.js:9-17`).
There is no background page, no long-lived port, no messaging between
extension contexts.

Chapter fetching does **not** go through the content script — the extension
page fetches chapter URLs directly with `fetch()`.

---

## 3. Storage

| Store                  | Keys                       | Shape                                                                  |
| ---------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `localStorage`         | 45 preference keys         | Booleans stored as the **strings** `"true"`/`"false"`                  |
| `localStorage`         | `"ReadingList"`            | `{"epubs":[{"toc":"<story TOC URL>","lastUrl":"<last chapter URL>"}]}` |
| `localStorage`         | `"DefaultParserConfigs"`   | Array of `[hostname, {contentCss, titleCss, removeCss, testUrl}]`      |
| `chrome.storage.local` | `"LibArray"`               | Array of library IDs                                                   |
| `chrome.storage.local` | `"LibEpub<ID>"`            | The EPUB as a **base64 data URL**                                      |
| `chrome.storage.local` | `"LibStoryURL<ID>"`        | Source story URL                                                       |
| `chrome.storage.local` | `"LibFilename<ID>"`        | Filename without extension                                             |
| `chrome.storage.local` | `"LibCover<ID>"`           | Cover image as a data URL                                              |
| `chrome.storage.local` | `"LibNewChapterCount<ID>"` | New-chapter count (`"-1"` sentinel)                                    |
| `sessionStorage`       | —                          | **Unused**                                                             |

No key namespacing — a rewrite should namespace by extension ID.

---

## 4. The parser contract (must survive the rewrite)

### 4.1 Mandatory hooks (no base implementation)

| Hook               | Signature              | Returns                                 |
| ------------------ | ---------------------- | --------------------------------------- |
| `getChapterUrls`   | `(dom, chapterUrlsUI)` | `Chapter[]` or `Promise<Chapter[]>`     |
| `findContent`      | `(dom)`                | `Element` (content container) or `null` |
| `extractTitleImpl` | `(dom)`                | `Element` or `string`                   |
| `extractAuthor`    | `(dom)`                | `string`                                |

### 4.2 Chapter object

```ts
{
  sourceUrl: string;     // required; must be a valid URL
  title: string;         // trimmed
  isIncludeable?: boolean; // default true; false ⇒ unchecked by default
  previousDownload?: boolean; // set by ReadingList
}
```

### 4.3 Optional metadata hooks

`extractLanguage`, `extractSubject`, `extractDescription`,
`extractPublisher`, `extractDatePublished`, `findCoverImageUrl`,
`findChapterTitle`, `getInformationEpubItemChildNodes`,
`cleanInformationNode`, `populateUIImpl`, `disabled`, `onStartCollecting`,
`extractSeriesInfo`.

### 4.4 Processing extension points

| Hook                                                 | When                                              |
| ---------------------------------------------------- | ------------------------------------------------- |
| `preprocessRawDom(webPageDom)`                       | On the raw fetched DOM, before content extraction |
| `customRawDomToContentStep(chapter, content)`        | On the content element, before cleaning           |
| `removeUnwantedElementsFromContentElement(element)`  | Strip site junk; **must call `super`**            |
| `webPageToEpubItems(webPage, index)`                 | Override for multi-item chapters                  |
| `fetchChapter(url)`                                  | Override for non-HTML chapters                    |
| `removeUnusedElementsToReduceMemoryConsumption(dom)` | Memory reduction                                  |

### 4.5 Error / challenge hooks

| Hook                                                                | Contract                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `isCustomError(response)`                                           | `true` if the response is a challenge or custom failure                                                                                                                  |
| `setCustomErrorResponse(url, wrapOptions, checkedresponse)`         | Must return `{url, wrapOptions, response:{url, status, retryDelay?}, errorMessage?}`. `status: 403` prompts the user for a captcha; `999` auto-retries with `retryDelay` |
| `isNoContentToError403AndContentNull(response)`                     | Treat an empty page as a 403                                                                                                                                             |
| `setNoContentToError403Response(url, wrapOptions, checkedresponse)` | Returns a 403 response                                                                                                                                                   |

### 4.6 Base-class helpers to preserve

`Parser.makeEmptyDocForContent(baseUrl)`,
`Parser.findConstructedContent(dom)`,
`Parser.addTextToChapterContent(newDoc, text)`,
`getChapterUrlsFromMultipleTocPages`, `getChaptersFromAllTocPages`,
`walkTocPages`, `walkPagesOfChapter`.

### 4.7 Registration & matching

`parserFactory.register(host, ctor)` (throws on duplicate),
`registerDeadSite`, `reregister`, `registerManualSelect`,
`registerRule(test, ctor)` (confidence score), `registerUrlRule(test, ctor)`.

Matching order: exact host (with `www.` stripped and `web.archive.org`
unwrapped) → URL rule → highest-confidence DOM rule → `DefaultParser`.

---

## 5. Defects

Ordered by severity. Every "High" item below must be absent from the rewrite.

### HIGH

| ID     | Defect                                                                     | Location                                                                    | Impact                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **H1** | `setCustomErrorResponse` builds a correct response object then `return {}` | `Parser.js:82-96` → consumed at `HttpClient.js:233-234`                     | `TypeError` on every custom-error path; the captcha workflow is dead and the true cause is masked                                                             |
| **H2** | Failed images are still packed into the EPUB                               | `ImageCollector.js:440-445` → `EpubItem.js:209-212` (`new Blob([null])`)    | Zero-byte image entries in the manifest ⇒ many readers reject the EPUB as corrupt                                                                             |
| **H3** | "Pause" does not abort in-flight requests                                  | `HttpClient.js:157-159`, `:216-225` — no `signal` is ever passed to `fetch` | Cancel appears to work but the download continues                                                                                                             |
| **H4** | Cookie cleanup is not in a `finally`                                       | `HttpClient.js:224-227` vs `:238-241`                                       | On any network failure the temporary **unpartitioned** cookies created at `:273-309` stay in the browser cookie jar and are sent to every site in that eTLD+1 |
| **H5** | "Clear Library" calls `chrome.storage.local.clear()`                       | `Library.js:243-253`                                                        | Wipes _all_ extension storage, not just library keys                                                                                                          |
| **H6** | Library write/read race during import                                      | `Library.js:1167-1178`, `:291-299`                                          | `LibArray` can reference IDs whose `LibEpub<ID>` was never persisted                                                                                          |
| **H7** | `webRequest` granted with blocking header access over `<all_urls>`         | `manifest.json:9-20`, `Firefox.js:21-27`                                    | Read/write access to the headers of every request the browser makes, for one narrow workaround that DNR can express                                           |
| **H8** | `unlimitedStorage` granted because EPUBs are stored as base64 data URLs    | `manifest.json:16`, `Library.js:874-879`                                    | A blanket permission forced by an implementation accident                                                                                                     |

### MEDIUM

| ID  | Defect                                                                                              | Location                                                        |
| --- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| M1  | `Parser.getBaseUrl` throws when the page has no `<base>` tag                                        | `Parser.js:433-435`                                             |
| M2  | `convertRawDomToContent` dereferences a possibly-null `content`                                     | `Parser.js:128-152`                                             |
| M3  | Fetch errors are swallowed; the user gets a silently incomplete EPUB                                | `Parser.js:625-628`, `:662-669`                                 |
| M4  | `fetchContentAndPackEpub` has no `try/finally` — the UI can lock up permanently                     | `main.js:160-169` (and `main.js:566-573` then blocks tab close) |
| M5  | `Download.save` overwrites the "IllegalFileName" fallback, producing `".epub"`                      | `Download.js:77-81`                                             |
| M6  | `Download.CustomFilename` throws on a malformed URL (`new URL()` in a field initialiser)            | `Download.js:33`                                                |
| M7  | `fetchJson`/`fetchText` `delete` the parser from the caller's options object                        | `HttpClient.js:186`, `:197`                                     |
| M8  | `setDeclarativeNetRequestRules` removes _all_ session rules — concurrent parsers clobber each other | `HttpClient.js:261-270`                                         |
| M9  | `FetchCache` keys on `pathname` only, ignoring the query string                                     | `Parser.js:23-26`                                               |
| M10 | `removeEventHandlers` strips only `onclick`                                                         | `Util.js:282-292`                                               |
| M11 | The chapter filter builds a `RegExp` from raw user text; `RegExp.escape` has no fallback            | `ChapterUrlsUI.js:573`, `:643-644`, `:671`                      |
| M12 | `ErrorLog` queue displays a different message than it queues                                        | `ErrorLog.js:12-28`                                             |
| M13 | `ErrorLog.getMsgText` assumes `msg.stack` and `msg.message` exist                                   | `ErrorLog.js:77-88`                                             |
| M14 | `ReadingList.update` can index past the end of the filtered chapter list                            | `ReadingList.js:79-86`                                          |
| M15 | Library merge is regex surgery on the OPF/NCX — silently corrupts foreign EPUBs                     | `Library.js:60-198`                                             |
| M16 | `ImageInfo.findImageSuffix` yields `"."` for extension-less filenames                               | `EpubItem.js:214-233`                                           |
| M17 | Imgur gallery expansion builds `http://` image URLs on an HTTPS page                                | `Imgur.js:45`                                                   |
| M18 | `setPartitionCookies` hardcodes `https://` regardless of the page protocol                          | `HttpClient.js:299`, `:330`                                     |
| M19 | Parser-rule tie-breaking is order-dependent and undocumented                                        | `ParserFactory.js:99-100`                                       |
| M20 | Default-parser CSS validation only checks non-emptiness; a typo yields a silently empty EPUB        | `DefaultParserUI.js:25-28`                                      |
| M21 | The TOC heuristic is a blunt 40 %-of-text-in-links threshold                                        | `HeuristicScanner.js:39-56`                                     |
| M22 | `main.findnovelupdatesurl` swallows every error in an empty `catch`                                 | `main.js:649-651`                                               |
| M23 | The library renders by string concatenation with unquoted attribute interpolation                   | `Library.js:329-614`                                            |

### LOW

| ID  | Defect                                                                                                            | Location                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| L1  | Global mutable singletons everywhere — untestable in isolation                                                    | `ParserFactory.js:178`, `Util.js:11`, `ErrorLog.js:157-158`, `Download.js:182` |
| L2  | `util` is a 1288-line dumping ground                                                                              | `Util.js:1-6`                                                                  |
| L3  | No explicit CSP in the manifest                                                                                   | `manifest.json`                                                                |
| L4  | `browser.storage` promise API unused; the Chrome callback API is used directly, including on Firefox              | `Library.js` throughout                                                        |
| L5  | `getImageDimensions` rejects after already computing fallback dimensions, so the fallback is discarded            | `ImageCollector.js:311-317`                                                    |
| L6  | `Download.onDownloadStarted` leaks the object URL if the download never completes                                 | `Download.js:163-179`                                                          |
| L7  | `Download.saveOnFirefox` swallows errors — a failed download resolves as success                                  | `Download.js:135`                                                              |
| L8  | `Parser.tagNameToTocDepth` is unchecked — `<h7>` yields depth 6                                                   | `EpubItem.js:88-91`                                                            |
| L9  | `Download.toCleanup` and `ErrorLog.history` grow unbounded                                                        | `Download.js:182`, `ErrorLog.js:158`                                           |
| L10 | `main.js` keeps `initialWebPage`, `initialMetaInfo`, `parser`, `userPreferences`, `library` as file-scope globals | `main.js:21-25`                                                                |

---

## 6. Permissions — required vs. granted

| Permission              | Actual use                                                                                                                                                                                         | Verdict                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `downloads`             | `Download.saveOnChrome` / `saveOnFirefox` / `onChanged`                                                                                                                                            | **Needed**                                                                                  |
| `scripting`             | Injecting `ContentScript.js` into the source tab (`main.js:273-276`)                                                                                                                               | **Needed**                                                                                  |
| `storage`               | The entire Library feature                                                                                                                                                                         | **Needed**                                                                                  |
| `declarativeNetRequest` | Header spoofing for Cloudflare-protected sites (`HttpClient.js:254-271`), correctly restricted to the extension's own `initiatorDomains`                                                           | **Needed**                                                                                  |
| `cookies`               | Copying partitioned (CHIPS) cookies to unpartitioned so extension fetches can authenticate (`HttpClient.js:273-338`). Behaviourally narrow (registrable-domain scoped) but the _grant_ is unscoped | **Needed, but should be host-scoped**; also fix the `https://` bug at `:299`/`:330`         |
| `webRequest`            | **Firefox only.** One thing: strip `Origin: moz-extension://` from extension-originated fetches (`Firefox.js:14-27`)                                                                               | **Replaceable by a scoped DNR rule — drop it**                                              |
| `unlimitedStorage`      | Only because EPUBs are stored as base64 data URLs (`Library.js:874-879`)                                                                                                                           | **Replaceable by IndexedDB — drop it**                                                      |
| `<all_urls>`            | Fetching arbitrary chapter/image hosts; content-script injection                                                                                                                                   | **Inherent to the product**, but should be `optional_host_permissions` with per-site opt-in |

**Target permission set for the rewrite:**

```
"permissions":      ["downloads", "scripting", "storage", "declarativeNetRequest"]
"host_permissions": ["<all_urls>"]        →  optional_host_permissions: ["*://*/*"]
```

That is a **net reduction of 3 permissions** while adding none.

---

## 7. Test coverage assessment

| Area            | Baseline                                                                          | Gap                                                                                          |
| --------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Parser contract | ~40 QUnit files, one per major parser                                             | **No tests for the core engine** — `Parser`, `HttpClient`, `Util`, `EpubPacker` are untested |
| EPUB assembly   | `UtestEpubPacker`, `UtestEpubItem` exist                                          | Thin; no round-trip test that opens a generated EPUB                                         |
| DOM utilities   | —                                                                                 | **Zero** coverage of a 1288-line grab-bag                                                    |
| Storage         | —                                                                                 | Zero                                                                                         |
| UI components   | `UtestChapterUrlsUI` only                                                         | **No UI component tests**                                                                    |
| Integration     | —                                                                                 | **No end-to-end test** of the Pack EPUB flow                                                 |
| Test runner     | QUnit in a browser via `http-server` — requires a browser to run; not CI-friendly | Replace with a headless runner                                                               |

---

## 8. Performance & privacy assessment

### Performance

| Issue                       | Detail                                                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No background worker        | Every fetch, ZIP assembly, and storage write runs in a page that the user must keep open. Closing the tab aborts the work                                     |
| Sequential fetching         | `maxSimultanousFetchSize = 1` is correct for politeness, but there is **no pipeline**: the next request does not start until the previous one is fully parsed |
| Whole-document HTML strings | The DOM crosses the process boundary as `outerHTML`, then is re-parsed. For a 3 MB chapter page this is a large serialise/parse round trip                    |
| `Library` stores base64     | ~33 % size inflation plus a base64 decode on every read                                                                                                       |
| No progress granularity     | The progress bar jumps by whole chapters; a 4 000-chapter novel looks identical to a 4-chapter one                                                            |

### Privacy

| Issue                        | Detail                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| No telemetry                 | **Good.** The extension phones nobody. `data_collection_permissions.required = ["none"]` in the manifest is correct and must be preserved |
| NovelUpdates auto-search     | Queries a third-party site with the story title, revealing the user's reading interests. Opt-in only, and it must stay opt-in             |
| Unpartitioned cookie leakage | `HttpClient.setPartitionCookies` creates **unpartitioned** cookies and does not clean them up on failure (H4)                             |
| Broad host permission        | `<all_urls>` means a compromised extension page could read any site the user visits                                                       |
| Local data only              | Preferences, reading list and library stay local. Good. Must not regress to any sync/telemetry                                            |

---

## 9. Architecture observations for the rewrite

1. **The parser contract is the asset.** Everything else is replaceable; the
   434 parsers are the moat. The rewrite must keep
   `getChapterUrls`/`findContent`/metadata hooks **source-compatible**.
2. **The UI must be split.** One 1090-line HTML file with a hand-maintained
   466-entry script manifest is unmaintainable. The rewrite needs a build step
   that generates the parser registry from the filesystem.
3. **Global script tags must become ES modules.** The current design makes the
   core impossible to unit-test in isolation (L1).
4. **Storage must be namespaced and typed.** `localStorage` string booleans
   and unprefixed keys are fragile.
5. **A background worker is not optional.** MV3 Firefox terminates an idle
   extension page. A 30-minute download cannot live in a page the browser may
   kill. The rewrite needs `background.service_worker` for orchestration and
   the download, with the page as a thin UI.
6. **TypeScript would pay for itself** in the parser contract: 434 parsers
   implementing a shared interface is exactly the case a compiler catches.
7. **DOMPurify must remain the single sanitisation boundary**, and it must be
   applied to _every_ path into the EPUB — including the library import path.
