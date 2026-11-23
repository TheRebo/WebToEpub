# ADR-0002 — Preserve the parser contract, add a compat shim

- **Status:** Accepted
- **Date:** 2025-11-23
- **Relates to:** [ADR-0001](ADR-0001-rewrite-from-scratch.md)

---

## Context

The extension's value is its 437 site parsers. The baseline parser contract
is small and has proven itself across 437 implementations:

```ts
interface Parser {
    getChapterUrls(dom, chapterUrlsUI): Chapter[] | Promise<Chapter[]>;
    findContent(dom): Element | null;
    extractTitleImpl(dom): Element | string;
    extractAuthor(dom): string;
    // …plus optional hooks
}
```

with a `Chapter` shape of `{ sourceUrl, title, isIncludeable?, previousDownload? }`.

A rewrite that changed this contract would need to rewrite all 437 parsers.
A rewrite that preserved it exactly could leave every parser untouched — but
the baseline's contract is defined by _ambient globals_ and _implicit
conventions_ (for instance, `removeUnwantedElementsFromContentElement` must
call `super`; `extractTitleImpl` returns an `Element` in some parsers and a
`string` in others; `Parser.WEB_TO_EPUB_CLASS_NAME` is a magic string).

## Decision

We define the parser contract as an explicit **TypeScript interface** in the
new core, mirroring the baseline semantics exactly, and we ship a **compat
shim** that lets a legacy-style parser work unmodified.

### The contract

```ts
export interface Chapter {
    sourceUrl: string;
    title: string;
    /** false ⇒ unchecked by default (paywalled, VIP, unreleased, non-story) */
    isIncludeable?: boolean;
    /** set by the reading list when the chapter was already downloaded */
    previousDownload?: boolean;
}

export abstract class Parser {
    /** Minimum delay in ms between HTTP requests. Increase for rate-limited sites. */
    minimumThrottle = 500;
    /** Concurrent chapter fetches. MUST remain 1 — politeness, not a tuning knob. */
    readonly maxSimultanousFetchSize = 1;

    // ── required ────────────────────────────────────────────────────────
    abstract getChapterUrls(
        dom: Document,
        chapterUrlsUI: ChapterUrlsUI,
    ): Chapter[] | Promise<Chapter[]>;
    abstract findContent(dom: Document): Element | null;
    abstract extractTitleImpl(dom: Document): Element | string;
    abstract extractAuthor(dom: Document): string;

    // ── optional metadata ────────────────────────────────────────────────
    extractLanguage?(dom: Document): string | undefined;
    extractSubject?(dom: Document): string | undefined;
    extractDescription?(dom: Document): string | undefined;
    extractPublisher?(dom: Document): string | undefined;
    extractDatePublished?(dom: Document): string | undefined;
    findCoverImageUrl?(dom: Document): string | null;
    findChapterTitle?(dom: Document): Element | string | null;

    // ── processing hooks ─────────────────────────────────────────────────
    preprocessRawDom?(webPageDom: Document): void;
    customRawDomToContentStep?(chapter: WebPage, content: Element): void;
    removeUnwantedElementsFromContentElement?(element: Element): void;
    webPageToEpubItems?(webPage: WebPage, index: number): EpubItem[];

    // ── error / challenge hooks ─────────────────────────────────────────
    isCustomError?(response: WrappedResponse): boolean;
    setCustomErrorResponse?(
        url: string,
        wrapOptions: WrapOptions,
        checked: WrappedResponse,
    ): CustomErrorResponse | undefined;
    isNoContentToError403AndContentNull?(response: WrappedResponse): boolean;
    setNoContentToError403Response?(
        url: string,
        wrapOptions: WrapOptions,
        checked: WrappedResponse,
    ): CustomErrorResponse;
}
```

### The compat shim

The shim provides the legacy ambient surface to a parser that has not yet
been migrated:

- `util`, `HttpClient`, `UIText`, `ErrorLog`, `parserFactory`,
  `ChapterUrlsUI`, `Parser` are injected into the parser's module scope at
  build time by a **codemod**, not by a runtime global.
- `super.removeUnwantedElementsFromContentElement(element)` continues to work
  — the base class provides the same default implementation.
- `Parser.makeEmptyDocForContent`, `Parser.findConstructedContent`,
  `Parser.addTextToChapterContent`, `Parser.WEB_TO_EPUB_CLASS_NAME`,
  `getChapterUrlsFromMultipleTocPages`, `getChaptersFromAllTocPages`,
  `walkTocPages`, `walkPagesOfChapter` are all preserved with identical
  signatures.

### Migration policy

1. **Every parser must work.** A parser that fails to migrate is a bug, not
   a removal.
2. Migration is **mechanical and per-file**, applied by a codemod, then
   reviewed. The codemod handles the 90 % case (adding imports, converting
   `var`/`let` to `const`, adding type annotations to the signature).
3. **Parity is enforced by test.** A harness fetches each parser's registered
   domain's sample fixture (where one exists in `testdata/`) and asserts the
   same chapters are produced as the legacy implementation. For parsers
   without fixtures, the harness asserts that the parser constructs, registers,
   and returns a well-formed chapter list shape.
4. Migration is tracked per parser in `docs/WORKLOG.md` and must reach 100 %
   before the revamp ships.

## Alternatives considered

| Alternative                                                  | Why rejected                                                                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redefine the contract freely                                 | Would require rewriting all 437 parsers — the entire effort budget for no user-visible gain.                                                                                          |
| Keep the baseline's implicit contract verbatim, with globals | Preserves the untestable, order-dependent architecture that [ADR-0001](ADR-0001-rewrite-from-scratch.md) rejects. The contract can be _preserved_ without preserving the _mechanism_. |
| Drop parsers that are hard to migrate                        | The parsers are the product. A parser that breaks is a lost site. Rejected.                                                                                                           |
| Only support the top 100 sites                               | Would be a significant product regression and a betrayal of the extension's purpose. Rejected.                                                                                        |

## Consequences

**Positive**

- The 437-site support surface survives the rewrite intact.
- The contract becomes compiler-checked, so a parser with a wrong signature
  is a build error.
- The shim means the migration can be incremental and independently
  verifiable; a half-migrated tree still builds and works.

**Negative**

- The shim is real complexity. It must be deleted once migration reaches
  100 %, and its removal is tracked as an explicit exit criterion.
- During the transition, the tree contains two idioms. The lint config
  enforces the new idiom on newly-migrated files so the transitional state
  shrinks monotonically.

**Neutral**

- `isIncludeable` keeps its exact semantics — including that it defaults to
  `true` when omitted.
