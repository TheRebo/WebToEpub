/**
 * The parser contract.
 *
 * This is the interface every one of the 437 site parsers implements, and
 * the single most valuable asset the project owns. It is preserved
 * **verbatim** from the baseline so that every parser keeps working
 * unchanged.
 *
 * The baseline's contract was a bag of global ambient functions
 * (`Parser`, `util`, `HttpClient`, `parserFactory`) with no types. The
 * rewrite keeps the *shape* of every method a parser overrides, but makes
 * the dependencies explicit and injected.
 *
 * See ADR-0002.
 */
import type { ChapterLink } from "../util/dom";

/** The chapter object a parser produces. */
export interface WebPage {
    /** The absolute URL of the chapter. */
    sourceUrl: string;
    /** The chapter's title, as it should appear in the book. */
    title?: string;
    /**
     * Whether the chapter should be included by default.
     *
     * `false` marks a locked or paywalled chapter: it appears unchecked in
     * the UI, so a run does not fail on it, but the user can still select it.
     */
    isIncludeable?: boolean;
    /** The fetched DOM, once the chapter has been loaded. */
    rawDom?: Document | null;
    /** The failure, if the chapter could not be loaded. */
    error?: Error | null;
    /** The next and previous chapter URLs, for the "remove navigation links" step. */
    nextPrevChapters?: Set<string>;
    /** Extra data a parser wants to carry through to the EPUB stage. */
    data?: Record<string, unknown>;
}

/** The progress reporter the TOC helpers call. */
export interface TocProgress {
    /** Report the chapters found so far. */
    showTocProgress(chapters: ChapterLink[]): void;
}

/** The image collector, which parsers use to gather chapter images. */
export interface ImageCollector {
    /** Add an image to the collection. */
    addImage(url: string, context?: { isCover?: boolean }): Promise<void>;
    /** The images collected so far. */
    readonly images: Map<string, unknown>;
}

/** The services a parser may use. */
export interface ParserServices {
    /** Fetch a page and parse it as HTML. */
    fetchHtml(
        url: string,
        options?: { signal?: AbortSignal },
    ): Promise<{ dom: Document; url: string }>;
    /** Fetch a JSON body. */
    fetchJson(url: string, options?: { signal?: AbortSignal }): Promise<{ json: unknown }>;
    /** The utility functions. */
    util: ParserUtilities;
    /** The image collector. */
    imageCollector: ImageCollector;
    /** Report progress to the UI. */
    progress?: TocProgress;
}

/** The utility functions a parser may call. */
export interface ParserUtilities {
    hyperlinksToChapterList(element: Element): ChapterLink[];
    hyperLinkToChapter(anchor: Element): ChapterLink | null;
    removeChildElementsMatchingSelector(element: Element, selector: string): void;
    removeElements(nodes: ArrayLike<Element> | null | undefined): void;
    removeComments(node: Node): void;
    removeUnwantedWordpressElements(element: Element): void;
    removeShareLinkElements(element: Element): void;
    removeEmptyDivElements(element: Element): void;
    removeLeadingWhiteSpace(element: Element): void;
    removeTrailingWhiteSpace(element: Element): void;
    moveChildElements(source: Element, target: Element): void;
    getFirstImgSrc(dom: Document, containerSelector: string): string | null;
    convertPreTagToPTags(dom: Document, preElement: Element, delimiter?: string): void;
    normalizeUrlForCompare(url: string): string;
    safeForFileName(title: string, maxLength?: number): string;
    isNullOrEmpty(value: string | null | undefined): boolean;
}

/**
 * The base class every parser extends.
 *
 * A parser overrides a small, well-defined set of methods:
 *
 *  - `getChapterUrls(dom, chapterUrlsUI)` — required. The chapter list.
 *  - `findContent(dom)` — required. The element holding the chapter body.
 *  - `extractTitleImpl(dom)` — optional. The story title.
 *  - `extractAuthor(dom)` — optional. The author.
 *  - `findCoverImageUrl(dom)` — optional. The cover.
 *  - `findChapterTitle(dom)` — optional. A title outside the content element.
 *  - `removeUnwantedElementsFromContentElement(element)` — optional. Site-specific cleanup.
 *  - `customRawDomToContentStep(chapter, content)` — optional. Custom transformation.
 */
export abstract class Parser {
    /**
     * The minimum delay between HTTP requests, in milliseconds.
     *
     * Raise this for heavily rate-limited or Cloudflare-protected sites. The
     * baseline used 500 ms; several parsers raise it to 3–12 seconds.
     */
    minimumThrottle = 500;

    /**
     * The number of concurrent chapter fetches.
     *
     * This must stay at 1. Concurrent fetching gets users rate-limited.
     */
    maxSimultanousFetchSize = 1;

    /** The services this parser uses. */
    protected readonly services: ParserServices;

    /** The signal that aborts an in-flight download. */
    signal?: AbortSignal;

    constructor(services: ParserServices) {
        this.services = services;
    }

    /** The utility functions, for parsers that use them. */
    protected get util(): ParserUtilities {
        return this.services.util;
    }

    /**
     * The image collector service.
     *
     * The name is not `imageCollector` because the legacy contract uses that
     * name for a richer object — the collector that owns the whole image
     * pipeline. The legacy base class shadows it with its own, more capable
     * version. See ADR-0002.
     */
    protected get collector(): ImageCollector {
        return this.services.imageCollector;
    }

    /**
     * Extract the chapter list from the table of contents.
     *
     * The one method every parser must implement.
     */
    abstract getChapterUrls(
        dom: Document,
        chapterUrlsUI?: TocProgress,
    ): Promise<ChapterLink[]> | ChapterLink[];

    /**
     * Find the element holding the chapter's content.
     *
     * The other method every parser must implement.
     */
    abstract findContent(dom: Document): Element | null;

    /* ------------------------------------------------------------------
     * Optional overrides
     * ------------------------------------------------------------------ */

    /** The story title. */
    extractTitleImpl(_dom: Document): Element | string | null {
        return null;
    }

    /** The author. */
    extractAuthor(dom: Document): string | null {
        const element = dom.querySelector('[rel="author"], .author, [itemprop="author"]');
        return element?.textContent?.trim() ?? null;
    }

    /** The language, as an ISO 639 code. */
    extractLanguage(dom: Document): string | null {
        const element = dom.querySelector("html[lang]");
        return element?.getAttribute("lang") ?? null;
    }

    /** The subject or genre. */
    extractSubject(dom: Document): string | null {
        const element = dom.querySelector('[property="genre"], .genre, .tags a');
        return element?.textContent?.trim() ?? null;
    }

    /** The description. */
    extractDescription(dom: Document): string | null {
        const element = dom.querySelector('[property="description"], meta[name="description"]');
        return element?.getAttribute("content") ?? element?.textContent?.trim() ?? null;
    }

    /** The publisher. */
    extractPublisher(dom: Document): string | null {
        const element = dom.querySelector('[property="publisher"], .publisher');
        return element?.textContent?.trim() ?? null;
    }

    /** The publication date. */
    extractDatePublished(dom: Document): string | null {
        const element = dom.querySelector('[property="published"], time[datetime]');
        return element?.getAttribute("datetime") ?? element?.textContent?.trim() ?? null;
    }

    /** The cover image URL. */
    findCoverImageUrl(dom: Document): string | null {
        const content = this.findContent(dom);
        const image = content?.querySelector("img");
        return image?.getAttribute("src") ?? null;
    }

    /**
     * The chapter title, when it lives outside the content element.
     *
     * The second parameter is the chapter being processed. The legacy
     * contract passes it, and a parser that needs it may declare it.
     */
    findChapterTitle(_dom: Document, _webPage?: unknown): Element | null {
        return null;
    }

    /**
     * Strip site-specific elements from the extracted content.
     *
     * The default removes scripts and comments, which no EPUB should ever
     * contain.
     */
    removeUnwantedElementsFromContentElement(element: Element): void {
        element
            .querySelectorAll("script, style, noscript, iframe, object, embed")
            .forEach((node) => {
                node.remove();
            });
        this.services.util.removeComments(element);
    }

    /**
     * A custom transformation applied to the content after extraction.
     */
    customRawDomToContentStep(_chapter: WebPage, _content: Element): void {
        // Overridden by parsers that need to reformat the content.
    }

    /**
     * Whether the response represents a challenge or custom site failure.
     *
     * The parameter is deliberately loose. The legacy contract passes the
     * baseline's response wrapper, which carries the parsed document; the
     * rewrite's fetch client passes the raw `Response` and the body text.
     * Both are accepted, because the legacy parsers are the contract.
     */
    isCustomError(_response: unknown, _bodyText?: string): boolean {
        return false;
    }

    /**
     * The custom response for a detected error.
     *
     * Returning a status of `403` asks the user to solve a captcha;
     * returning `999` asks for an automatic retry after `retryDelay`
     * milliseconds.
     *
     * The parameters are loose for the same reason as `isCustomError`: the
     * legacy contract passes the URL, the wrap options, and the response.
     */
    setCustomErrorResponse(
        _url: string,
        _wrapOptions?: unknown,
        _checkedResponse?: unknown,
    ): unknown {
        return undefined;
    }

    /**
     * Whether an empty page should be treated as a 403.
     *
     * Accepts either a document or the legacy response wrapper.
     */
    isNoContentToError403AndContentNull(response: unknown): boolean {
        const dom = documentFromResponse(response);
        return dom === null ? false : this.findContent(dom) === null;
    }

    /**
     * Modify the raw DOM before the content is extracted.
     *
     * A parser that needs to reformat author notes, or decrypt content, does
     * it here.
     */
    preprocessRawDom(_webPageDom: Document): void {
        // Overridden by parsers that need to reformat the raw page.
    }

    /**
     * The delay between requests to this site, in milliseconds.
     *
     * The legacy contract lets the user override a parser's minimum delay, so
     * the effective delay is asked for here rather than read from
     * `minimumThrottle` directly.
     */
    getRateLimit(): number {
        return this.minimumThrottle;
    }

    /**
     * Turn a chapter's DOM into the content element that will be packed.
     *
     * This is the one place that knows the order of the cleanup steps, so
     * that the download pipeline does not have to know it:
     *
     *  1. `preprocessRawDom` — the parser reformats the raw page.
     *  2. `findContent` — the content element is located.
     *  3. `customRawDomToContentStep` — the parser's own transformation.
     *  4. `removeUnwantedElementsFromContentElement` — the shared cleanup.
     *
     * The legacy base class overrides this with the baseline's full pipeline,
     * which is longer. See ADR-0002.
     *
     * @param dom The chapter's DOM.
     * @param chapter The chapter being processed.
     * @returns The content element, or `null` when the page has no content.
     */
    extractChapterContent(dom: Document, chapter: WebPage): Element | null {
        this.preprocessRawDom(dom);
        const content = this.findContent(dom);
        if (content === null) return null;
        this.customRawDomToContentStep(chapter, content);
        this.removeUnwantedElementsFromContentElement(content);
        return content;
    }

    /* ------------------------------------------------------------------
     * Helpers the baseline provided, preserved for parser compatibility
     * ------------------------------------------------------------------ */

    /**
     * Fetch a chapter's DOM.
     *
     * A failure is thrown, not swallowed: the download pipeline needs to tell
     * "the site refused" from "the chapter is empty", and only the caller
     * knows how to report that.
     */
    async fetchChapter(url: string): Promise<Document | null> {
        const result = await this.services.fetchHtml(url, { signal: this.signal });
        return result.dom;
    }

    /**
     * Walk a paginated table of contents, accumulating chapters.
     *
     * @param dom The first page's DOM.
     * @param chaptersFromDom Extracts the chapters from one page.
     * @param nextTocPageUrl Returns the next page's URL, or `null` at the end.
     * @param chapterUrlsUI The progress reporter.
     */
    async walkTocPages(
        dom: Document,
        chaptersFromDom: (dom: Document) => ChapterLink[],
        nextTocPageUrl: (dom: Document) => string | null,
        chapterUrlsUI?: TocProgress,
    ): Promise<ChapterLink[]> {
        let chapters = chaptersFromDom(dom);
        chapterUrlsUI?.showTocProgress(chapters);

        let nextUrl = nextTocPageUrl(dom);
        let guard = 0;
        while (nextUrl !== null) {
            // A site with a broken pagination loop would otherwise fetch
            // forever.
            if (++guard > 1000) break;
            const result = await this.services.fetchHtml(nextUrl, { signal: this.signal });
            chapters = chapters.concat(chaptersFromDom(result.dom));
            chapterUrlsUI?.showTocProgress(chapters);
            nextUrl = nextTocPageUrl(result.dom);
        }
        return chapters;
    }

    /**
     * Fetch a known list of TOC pages and aggregate their chapters.
     */
    async getChaptersFromAllTocPages(
        chapters: ChapterLink[],
        extractPartialChapterList: (dom: Document) => ChapterLink[],
        urlsOfTocPages: string[],
        chapterUrlsUI?: TocProgress,
    ): Promise<ChapterLink[]> {
        if (chapters.length > 0) chapterUrlsUI?.showTocProgress(chapters);

        for (const url of urlsOfTocPages) {
            const result = await this.services.fetchHtml(url, { signal: this.signal });
            const partial = extractPartialChapterList(result.dom);
            chapters = chapters.concat(partial);
            chapterUrlsUI?.showTocProgress(chapters);
        }
        return chapters;
    }

    /**
     * Extract the TOC page URLs, then fetch them all.
     */
    async getChapterUrlsFromMultipleTocPages(
        dom: Document,
        extractPartialChapterList: (dom: Document) => ChapterLink[],
        getUrlsOfTocPages: (dom: Document) => string[],
        chapterUrlsUI?: TocProgress,
    ): Promise<ChapterLink[]> {
        const chapters = extractPartialChapterList(dom);
        const urls = getUrlsOfTocPages(dom);
        return this.getChaptersFromAllTocPages(
            chapters,
            extractPartialChapterList,
            urls,
            chapterUrlsUI,
        );
    }

    /**
     * Handle a chapter split across several pages.
     *
     * @param url The first page's URL.
     * @param moreChapterTextUrl Returns the next page's URL from the DOM, or
     *   `null` when the chapter ends.
     */
    async walkPagesOfChapter(
        url: string,
        moreChapterTextUrl: (dom: Document) => string | null,
    ): Promise<Document> {
        const first = await this.services.fetchHtml(url, { signal: this.signal });
        let dom = first.dom;
        let count = 2;
        let nextUrl = moreChapterTextUrl(dom);

        while (nextUrl !== null && count < 1000) {
            const result = await this.services.fetchHtml(nextUrl, { signal: this.signal });
            const content = this.findContent(result.dom);
            if (content) {
                const target = this.findContent(dom);
                if (target) this.services.util.moveChildElements(content, target);
            }
            dom = result.dom;
            nextUrl = moreChapterTextUrl(dom);
            count += 1;
        }
        return dom;
    }

    /** Whether the error is a custom error raised by the parser. */
    protected isCustomErrorResponse(error: unknown): boolean {
        return error instanceof Error && error.name === "FetchError";
    }
}

/**
 * Get the document from either a document or the legacy response wrapper.
 *
 * The legacy contract's `isNoContentToError403AndContentNull` received the
 * baseline's response wrapper, which carries the parsed document as
 * `responseXML`. The rewrite's contract passes the document itself.
 */
function documentFromResponse(response: unknown): Document | null {
    if (response === null || response === undefined) return null;
    if (typeof (response as Document).querySelector === "function") {
        return response as Document;
    }
    const wrapper = response as { responseXML?: Document };
    if (wrapper.responseXML && typeof wrapper.responseXML.querySelector === "function") {
        return wrapper.responseXML;
    }
    return null;
}
