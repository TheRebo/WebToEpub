# AGENTS.md: Developer & Agent Guide for Kintsugi (WebToEpub)

This is the main technical reference for AI agents and developers working on
**Kintsugi**, the rewrite of WebToEpub. It covers the architecture and the
parser APIs.

---

## 1. Project overview & architecture

Kintsugi is a **Firefox** extension (Manifest V3, Firefox 140+). It scrapes web
novels and episodic stories and packs them into EPUB files. The original
WebToEpub tree is preserved on the `legacy` branch. The rewrite lives in `src/`
and is written in TypeScript. Chromium is not a supported target.

| Where                          | What                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `src/core/background.ts`       | The background event page: message handlers, the parser registry, downloads            |
| `src/core/download-manager.ts` | A download job: fetch chapters and images, build the book, save it                     |
| `src/core/net/`                | The fetch layer (`fetch-client.ts`), URL policy, cookie bridge, network rules          |
| `src/core/epub/`               | The EPUB writer and packer                                                             |
| `src/core/parsers/`            | The parser contract, the registry, and the parsers themselves                          |
| `src/core/parsers/compat/`     | The shims that let the original parsers run unchanged (`Parser`, `util`, `HttpClient`) |
| `src/ui/`                      | The popup, workbench, settings and onboarding pages, and their components              |
| `docs/decisions/`              | Architecture decision records. Read the relevant one before changing behaviour         |

`npm run build` writes the extension to `dist/`. `npm run verify` runs every
check CI runs: lint, typecheck, unit tests, build, extension lint, package,
and the Firefox end-to-end tests.

### Typical agent tasks

- **Creating a new site parser**: support for a new novel or translation site.
- **Fixing or updating a broken parser**: new selectors or a new request
  strategy, when a site changes its layout, pagination, API or anti-bot
  protection.

---

## 2. Where parsers live

There are two homes, and the difference matters:

- **`src/core/parsers/legacy/sites/`**: the 434 parsers migrated from the
  original extension. `tools/migrate-parsers.mjs` **generates** this folder
  and `legacy-parsers.ts` from the `legacy` branch. It deletes and rewrites
  both, so a file added here by hand is lost on the next migration. Fix a
  migrated parser here only when the fix is also made on `legacy`. Otherwise,
  `node tools/migrate-parsers.mjs --check` reports the difference.
- **`src/core/parsers/sites/`**: new parsers. Each one is imported from
  `src/core/parsers/site-parsers.ts`, in alphabetical order. A contract test
  fails if a file in `sites/` is not imported.

Both kinds are plain JavaScript modules written against the compat layer, so
the original API below works in either place.

---

## 3. Core reference (available functions & APIs)

Study these before implementing or changing a parser.

### 1. `src/core/parsers/compat/legacy-parser.ts`: the `Parser` base class

Import it as `import { LegacyParser as Parser } from "../compat/legacy-parser.js";`.
It provides download orchestration, DOM cleanup, rate limiting and metadata.

- **Rate limiting & throttle**:
    - `this.minimumThrottle`: the minimum delay between requests, in ms
      (default `500`). Raise it (for example to `3000`–`12000`) for
      Cloudflare-protected or heavily rate-limited sites. The user's own
      per-chapter delay is added on top by the download manager.
    - Chapters are fetched one at a time. Never try to fetch in parallel.
      `this.rateLimitDelay()` waits for the parser's rate limit.
- **TOC & pagination helpers**:
    - `walkTocPages(dom, chaptersFromDom, nextTocPageUrl, chapterUrlsUI)`:
      crawls Table of Contents pages one after another until
      `nextTocPageUrl` returns `null`, reporting progress as it goes.
    - `getChaptersFromAllTocPages(chapters, extractPartialChapterList, urlsOfTocPages, chapterUrlsUI, wrapOptions)`:
      fetches a known list of TOC URLs and collects the chapters.
    - `getChapterUrlsFromMultipleTocPages(dom, extractPartialChapterList, getUrlsOfTocPages, chapterUrlsUI)`.
    - `walkPagesOfChapter(url, moreChapterTextUrl)`: follows "next page"
      links within a multi-page chapter.
- **The chapter list and `isIncludeable`**: `getChapterUrls(dom, chapterUrlsUI)`
  returns `{ sourceUrl, title, isIncludeable? }[]`.
    - `isIncludeable: false` (paywalled, VIP, locked, unreleased, or non-story
      chapters) shows the chapter **unticked** in the workbench. The user
      can still tick it by hand, if they have access. "Select all" and the
      other bulk actions leave it alone.
- **State kept between listing and downloading**: the worker reuses the same
  parser instance that listed the chapters, so properties set on `this` in
  `getChapterUrls` (a slug, an API id) are still there when chapters are
  fetched. `this.state.chapterListUrl` and `this.state.firstPageDom` are set
  before `getChapterUrls` runs.
- **Constructed content** (for parsers that build chapters from JSON):
    - `Parser.makeEmptyDocForContent(baseUrl)` returns `{ dom, content }`.
    - `Parser.findConstructedContent(dom)` returns the content built that way.
    - `Parser.addTextToChapterContent(newDoc, contentText)` wraps each line of
      text in a `<p>`.
- **Metadata hooks**: `extractTitleImpl(dom)`, `extractAuthor(dom)`,
  `extractLanguage(dom)`, `extractSubject(dom)`, `extractDescription(dom)`,
  `extractPublisher(dom)`, `extractDatePublished(dom)`,
  `findCoverImageUrl(dom)`. Metadata that needs a request of its own is
  fetched in `async loadEpubMetaInfo(dom)`, which runs before the extractors.
  An extractor that throws costs only that field.
- **DOM & content cleaning**: `findContent(dom)` (**required**),
  `findChapterTitle(dom)`, `preprocessRawDom(webPageDom)`,
  `removeUnwantedElementsFromContentElement(element)`,
  `customRawDomToContentStep(chapter, content)`.
- **Custom errors & challenges**: `isCustomError(response)`,
  `setCustomErrorResponse(url, wrapOptions, checkedResponse)` (return status
  `403` for a challenge, or `999` with a `retryDelay` list for an automatic
  retry), `isNoContentToError403AndContentNull(response)`.
- **Disabled sites**: a parser whose `disabled()` returns a message is
  refused, and the message is shown. Use this when a site has asked not to be
  scraped.

What does **not** work: `populateUIImpl()` per-site options, `onLoadFirstPage`
overrides, and opening tabs or running scripts in other pages. Nothing in the
rewrite calls these. A handful of the original parsers read form controls
from the old popup (`document.getElementById("removeChapterNumberCheckbox")`).
Inert stand-ins are provided for them, but a new parser must not rely on that.

### 2. `src/core/parsers/compat/legacy-http-client.ts`: `HttpClient`

It wraps the extension's fetch layer, which handles cookies, retries, URL
policy and redirects.

- **`HttpClient.wrapFetch(url, wrapOptions)`**: fetches any page or API.
  Returns `.responseXML` (a parsed document), `.json`, `.text`,
  `.arrayBuffer` and `.response`. Pass
  `makeTextDecoder: () => new TextDecoder("gbk")` for a site that lies about
  its encoding. A page's declared charset is otherwise honoured. Transient
  errors (429, 5xx, timeouts) are retried automatically.
- **`HttpClient.fetchJson(url, options)`**:
  `(await HttpClient.fetchJson(url, options)).json`. Pass `{ parser: this }`
  to route responses through `isCustomError`.
- **`HttpClient.fetchText(url, options)`** and **`HttpClient.fetchHtml(url)`**.
- **`HttpClient.setDeclarativeNetRequestRules(rules)`**: session request
  rules scoped to the extension's own requests (for example, `referer` or
  `sec-fetch-*` headers for Cloudflare-protected sites).

The fetch layer refuses `file:`, `data:` and `blob:` URLs, and it refuses any
private-network host the user has not allowed by name, including when a
redirect leads there. See ADR-0032 and ADR-0045.

### 3. `src/core/parsers/compat/legacy-util.ts`: `util`

Import it as `import { util } from "../compat/legacy-util.js";`. Check it
before writing your own regex or DOM loops.

- **Chapter links**: `util.hyperlinksToChapterList(element)`,
  `util.hyperLinkToChapter(aElement)`.
- **Removal**: `util.removeChildElementsMatchingSelector(element, selector)`,
  `util.removeElements(list)`, `util.removeComments(node)`,
  `util.removeUnwantedWordpressElements(element)`,
  `util.removeShareLinkElements(element)`,
  `util.removeEmptyDivElements(element)`, `util.removeLeadingWhiteSpace(element)`,
  `util.removeTrailingWhiteSpace(element)`.
- **Images & formatting**: `util.getFirstImgSrc(dom, selector)`,
  `util.convertPreTagToPTags(dom, element, delimiter)` (refills the element in
  place), `util.moveChildElements(from, to)`, `util.sanitize(html)`.
- **URLs & strings**: `util.normalizeUrlForCompare(url)`,
  `util.safeForFileName(title, maxLen)`, `util.isNullOrEmpty(str)`,
  `util.sleep(ms)`.

---

## 4. Parser template

```javascript
// Ai generated + <Ai model>
"use strict";

import { LegacyParser as Parser } from "../compat/legacy-parser.js";
import { util } from "../compat/legacy-util.js";
import { parserFactory } from "../compat/legacy-factory.js";

// 1. Register the host (lower case, without "www.").
parserFactory.register("example.com", () => new ExampleParser());

export class ExampleParser extends Parser {
    constructor() {
        super();
        // Optional: the minimum pause between requests, in ms.
        this.minimumThrottle = 2000;
    }

    // 2. The chapters: [{ sourceUrl, title, isIncludeable? }].
    //    isIncludeable: false starts a locked or paid chapter unticked.
    async getChapterUrls(dom, chapterUrlsUI) {
        // eslint-disable-line no-unused-vars
        let menu = dom.querySelector("div.chapter-list");
        return util.hyperlinksToChapterList(menu);
    }

    // 3. Each chapter's content.
    findContent(dom) {
        return dom.querySelector("article.entry-content");
    }

    // 4. The story's title.
    extractTitleImpl(dom) {
        return dom.querySelector("h1.novel-title");
    }

    // 5. The author, as a string.
    extractAuthor(dom) {
        let authorLabel = dom.querySelector("span.author a");
        return authorLabel?.textContent ?? super.extractAuthor(dom);
    }

    // 6. Optional: the cover.
    findCoverImageUrl(dom) {
        return util.getFirstImgSrc(dom, "div.cover-art");
    }

    // 7. Optional: the chapter title, when it is outside the content.
    findChapterTitle(dom) {
        return dom.querySelector("h2.chapter-heading");
    }

    // 8. Optional: remove the site's own clutter.
    removeUnwantedElementsFromContentElement(element) {
        util.removeChildElementsMatchingSelector(
            element,
            ".advertisement, .watermark",
        );
        super.removeUnwantedElementsFromContentElement(element);
    }
}
```

---

## 5. Architectural patterns, with examples

The paths below are under `src/core/parsers/legacy/sites/`.

- **A: Server-rendered HTML, multi-page TOC.** `MznovelsParser.js` works out
  the TOC page URLs from `.pagination` and collects them with
  `getChaptersFromAllTocPages`. It uses `preprocessRawDom` with
  `util.convertPreTagToPTags` for author notes.
- **B: Sequential TOC crawling and header rules.** `ScribblehubParser.js`
  sets `referer` and `sec-fetch-*` with `setDeclarativeNetRequestRules`,
  walks TOC pages until there are none left, reports progress, and uses
  `minimumThrottle = 7500`.
- **C: A REST API and constructed content.** `BotitranslationParser.js`
  lists chapters from a JSON endpoint and builds each chapter with
  `Parser.makeEmptyDocForContent`. `findContent` returns
  `Parser.findConstructedContent(dom)`.
- **D: A single-page app with challenges.** `WtrlabParser.js` reads
  `__NEXT_DATA__`, POSTs for chapter content, and detects Turnstile or locked
  chapters in `isCustomError`. Its `setCustomErrorResponse` returns `403` (a
  captcha) or `999` (a retry).

---

## 6. Checklist for adding a new parser

1. **Analyse the site.** Is the content in the HTML or loaded from an API? Is
   the TOC one page, several pages, or an API? Is it behind Cloudflare, or
   rate-limited?
2. **Write the parser** in `src/core/parsers/sites/<SiteName>Parser.js`:
    - The first line is the header comment `// Ai generated + <Ai model>`.
    - The second line is `"use strict";`.
    - Import from `../compat/…` as in the template.
    - Register each host with `parserFactory.register("<domain>", () => new <SiteName>Parser())`.
    - Implement `getChapterUrls`, `findContent`, `extractTitleImpl` and
      `extractAuthor`.
3. **Load it.** Add `import "./sites/<SiteName>Parser.js";` to
   `src/core/parsers/site-parsers.ts`, keeping the imports in alphabetical
   order. Without this the parser is never loaded, and the contract test fails.
4. **Check it.** Run `npm run lint`, `npm run typecheck` and `npm test`. Add
   `// eslint-disable-line no-unused-vars` for parameters the API requires
   but the parser does not use.
5. **Do not create unit tests or fixtures for a parser.** No
   `tests/unit/*Parser*` files and no saved pages.

---

## 7. Coding standards & conventions

- **AI header comment.** A new parser written by an AI starts with
  `// Ai generated + <Ai model>`. Migrated parsers carry no such line unless
  the original had one.
- **No parser unit tests from AI agents**, as above. Tests of the compat layer
  and the core are welcome; they live in `tests/unit/`.
- **Strict mode.** Every JavaScript parser starts with `"use strict";`.
  TypeScript modules are strict by configuration.
- **No new runtime dependencies** in parser code: plain modern JavaScript only.
- **User preferences.** Never force a behaviour change on users without a
  setting. A new setting is added to `src/core/storage/settings-store.ts`
  and to the settings page, defaulting to the safe behaviour.
- **Anti-scraping etiquette.** Set a `minimumThrottle` that the site can bear.
- **Decisions are written down.** A change in behaviour gets an ADR in
  `docs/decisions/`, numbered after the last one.
