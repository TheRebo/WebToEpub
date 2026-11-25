/**
 * The legacy parser base class.
 *
 * The 437 site parsers are the product's core asset, and every one of them
 * was written against the baseline's `Parser` class. This module is that
 * class, reimplemented.
 *
 * It extends the rewrite's `Parser` so that the new registry, the new
 * download pipeline and the new EPUB packer all accept a migrated parser
 * unchanged — but it restores the baseline's *semantics* for every method a
 * parser might call through `super`, because that is what the parsers were
 * written against.
 *
 * The differences between this class and the rewrite's `Parser` are not
 * accidents. They are the contract:
 *
 *  - `extractAuthor` returns `"<unknown>"`, not `null`, because a parser that
 *    falls through to it expects a string it can call `.trim()` on;
 *  - `removeUnwantedElementsFromContentElement` strips WordPress cruft,
 *    Microsoft Word cruft and share buttons, because that is what makes a
 *    chapter readable;
 *  - `extractLanguage` reads `og:locale` before the `<html lang>` attribute,
 *    because sites that set `lang="en-US"` but serve Spanish set the former;
 *  - `walkTocPages` reports only the *new* chapters on each page, not the
 *    accumulated list, because the baseline's table replaced its contents.
 *
 * The baseline's `Parser` also had methods that no parser should have been
 * able to reach — `extractWrappingUrl`, `isImageWrapperElement`,
 * `onResponseError` and `setIndex` are called through `super` by five
 * parsers, but they live on `ImageCollector`, `HttpClient` and `EpubItem`.
 * In the baseline those calls threw a `TypeError`. Here they are harmless
 * stubs, so a migrated parser cannot crash on a path the baseline never
 * exercised successfully anyway.
 *
 * See ADR-0002.
 */

"use strict";

import { Parser } from "../parser";
import type { ParserServices, ParserUtilities, TocProgress, WebPage } from "../parser";
import { NULL_TOC_PROGRESS, listChapterUrls } from "../parser";
import type { ChapterLink } from "../../util/dom";
import { util } from "./legacy-util";
import { HttpClient } from "./legacy-http-client";
import type { LegacyWrapOptions } from "./legacy-http-client";
import {
    ImageCollector,
    VariableSizeImageCollector,
    makeLegacyUserPreferences,
    type LegacyUserPreferences,
} from "./legacy-image-collector";
import { ChapterEpubItem, EpubItemSupplier, EpubMetaInfo } from "./legacy-epub-items";
import type { EpubItem } from "./legacy-epub-items";
import {
    ChapterUrlsUI,
    CoverImageUI,
    ErrorLog,
    Imgur,
    ProgressBar,
    UIText,
    main,
} from "./legacy-globals";
import { peekParserServices } from "../services-context";

/**
 * A chapter, as the legacy contract describes it.
 *
 * The legacy shape carries a `newArc` key, which the rewrite's
 * `ChapterLink` does not have. Parsers read it, so the compat base uses the
 * legacy shape wherever a chapter is passed around.
 */
export interface LegacyChapter {
    /** The chapter's absolute URL. */
    sourceUrl: string;
    /** The chapter's title. */
    title: string;
    /** The arc the chapter starts, if any. */
    newArc: unknown;
    /** Whether the chapter is included by default. */
    isIncludeable?: boolean;
    /** The chapter's DOM, once fetched. */
    rawDom?: Document | null;
    /** The failure, if the chapter could not be fetched. */
    error?: Error | null;
    /** The "next" and "previous" chapter URLs. */
    nextPrevChapters?: Set<string>;
    /** The parser that will fetch this chapter. */
    parser?: LegacyParser;
    /** The chapter's row in the chapter table. */
    row?: unknown;
    /** The index of the chapter. */
    index?: number;
}

/**
 * The legacy parser state.
 */
export class LegacyParserState {
    /** The chapters to fetch, keyed by URL. */
    webPages = new Map<string, LegacyChapter>();
    /** The URL of the table of contents. */
    chapterListUrl: string | null = null;
    /** The first page's DOM. */
    firstPageDom: Document | null = null;

    /**
     * Set the chapters to fetch.
     *
     * Each chapter records the URLs of its neighbours, so that the "remove
     * the next and previous chapter links" step can find them.
     */
    setPagesToFetch(urls: LegacyChapter[]): void {
        let nextPrevChapters = new Set<string>();
        this.webPages = new Map();
        for (let i = 0; i < urls.length; ++i) {
            const page = urls[i] as LegacyChapter;
            if (i < urls.length - 1) {
                nextPrevChapters.add(util.normalizeUrlForCompare(urls[i + 1]?.sourceUrl ?? ""));
            }
            page.nextPrevChapters = nextPrevChapters;
            this.webPages.set(page.sourceUrl, page);
            nextPrevChapters = new Set<string>();
            nextPrevChapters.add(util.normalizeUrlForCompare(page.sourceUrl));
        }
    }
}

/**
 * The legacy parser base class.
 */
export class LegacyParser extends Parser {
    /** The class name used for constructed content. */
    static readonly WEB_TO_EPUB_CLASS_NAME = "webToEpubContent";

    /** The parser's state. */
    state: LegacyParserState = new LegacyParserState();

    /**
     * The image collector.
     *
     * The legacy contract uses a much richer collector than the rewrite's
     * service, so the compat class carries its own.
     */
    imageCollector: ImageCollector;

    /** The user's preferences. */
    userPreferences: LegacyUserPreferences = makeLegacyUserPreferences();

    /**
     * The nodes for the EPUB's information page.
     *
     * The baseline's base class deliberately did *not* define this, and
     * checked for its presence before adding an information page. It is
     * declared optional here for the same reason.
     */
    getInformationEpubItemChildNodes?: (dom: Document) => Node[];

    /**
     * The parent node of a chapter link that should be removed.
     *
     * A parser overrides this when the "next chapter" link is wrapped in
     * elements that should be removed with it.
     */
    findParentNodeOfChapterLinkToRemoveAt?: (link: Element) => Element;

    /**
     * Build a parser.
     *
     * The legacy parsers call `super()`, or `super(imageCollector)`, so the
     * services are resolved from the active context when they are not given.
     */
    constructor(servicesOrImageCollector?: ParserServices | ImageCollector) {
        const isServices =
            servicesOrImageCollector !== undefined &&
            typeof (servicesOrImageCollector as ParserServices).fetchHtml === "function";
        const services = isServices
            ? (servicesOrImageCollector as ParserServices)
            : peekParserServices();
        super(services ?? makeFallbackServices());

        this.imageCollector = isServices
            ? new ImageCollector()
            : ((servicesOrImageCollector as ImageCollector | undefined) ?? new ImageCollector());

        // The user's preferences are part of the services, so a parser is
        // never built without them. A parser that was built with the defaults
        // would remove the author notes or not, add the information page or
        // not, according to nothing the user had asked for.
        const preferences = this.services.preferences;
        if (isLegacyUserPreferences(preferences)) {
            this.onUserPreferencesUpdate(preferences);
        }

        this.#guardTocProgress();
    }

    /**
     * Make sure the progress reporter is never missing inside a parser.
     *
     * A migrated parser overrides `getChapterUrls` and dereferences the
     * reporter it is given, without a guard — the baseline always passed one.
     * The runtime asks for the chapter list through `listChapterUrls`, which
     * supplies one, but the method is public: a parser that calls itself, or
     * any other caller, would still hand it `undefined`.
     *
     * Wrapping the instance's own method is what closes that hole. The
     * wrapper is installed in the base constructor, which runs after the
     * subclass's prototype is in place, so it wraps the subclass's override
     * rather than the base's.
     */
    #guardTocProgress(): void {
        const original = this.getChapterUrls.bind(this);
        this.getChapterUrls = (dom, chapterUrlsUI) =>
            original(dom, chapterUrlsUI ?? NULL_TOC_PROGRESS);
    }

    /* ------------------------------------------------------------------
     * The baseline's `super` surface
     * ------------------------------------------------------------------ */

    /** The story's title. */
    override extractTitleImpl(dom: Document): Element | string | null {
        return LegacyParser.extractTitleDefault(dom);
    }

    /**
     * The story's title, as a string.
     *
     * Falls back to the default extractor when a parser returns nothing.
     */
    extractTitle(dom: Document): string {
        let title: Element | string | null = this.extractTitleImpl(dom);
        if (title === null || title === undefined) {
            title = LegacyParser.extractTitleDefault(dom);
        }
        if (typeof title !== "string" && title.textContent !== undefined) {
            title = title.textContent;
        }
        return String(title).trim();
    }

    /** The default title extractor: the Open Graph title, or the document title. */
    static extractTitleDefault(dom: Document): string {
        const title = dom.querySelector("meta[property='og:title']");
        return title === null ? dom.title : (title.getAttribute("content") ?? dom.title);
    }

    /**
     * The story's author.
     *
     * The baseline returned `"<unknown>"` rather than `null`, because the
     * metadata builder called `.trim()` on the result without checking.
     */
    override extractAuthor(_dom: Document): string {
        return "<unknown>";
    }

    /**
     * The story's language.
     *
     * The Open Graph locale comes first: sites that serve one language but
     * label the page in another set `og:locale` correctly.
     */
    override extractLanguage(dom: Document): string {
        const locale = dom.querySelector("meta[property='og:locale']");
        if (locale !== null) {
            const content = locale.getAttribute("content");
            if (content) return content.substring(0, 2);
        }
        const html = dom.querySelector("html");
        const lang = html?.getAttribute("lang") ?? "en";
        return lang.split("-")[0] ?? "en";
    }

    /** The story's subject. */
    override extractSubject(_dom: Document): string {
        return "";
    }

    /**
     * The story's description.
     *
     * When the parser offers an information page, the description is that
     * page's text.
     */
    override extractDescription(dom: Document): string {
        const infoDiv = document.createElement("div");
        if (this.getInformationEpubItemChildNodes !== undefined) {
            this.populateInfoDiv(infoDiv, dom);
        }
        return infoDiv.textContent ?? "";
    }

    /** The story's publisher. */
    override extractPublisher(dom: Document): string {
        const publisher = dom.querySelector("meta[property='og:site_name']");
        const content = publisher?.getAttribute("content")?.trim();
        if (content) return content;
        try {
            const url = new URL(dom.baseURI);
            return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : "";
        } catch {
            return "";
        }
    }

    /** The story's publication date. */
    override extractDatePublished(dom: Document): string | null {
        const published = dom.querySelector(
            "meta[property='article:published_time'], time[itemprop='datePublished']",
        );
        if (published === null) return null;
        return published.getAttribute("content") ?? published.getAttribute("datetime");
    }

    /**
     * The cover image.
     *
     * The default is the first image in the chapter's content, which is
     * right far more often than it is wrong.
     */
    override findCoverImageUrl(dom: Document): string | null {
        if (dom === null || dom === undefined) return null;
        const content = this.findContent(dom);
        if (content === null) return null;
        const cover = content.querySelector("img");
        return cover === null ? null : cover.getAttribute("src");
    }

    /** The chapter's title, when it lives outside the content element. */
    override findChapterTitle(_dom: Document, _webPage?: unknown): Element | null {
        return null;
    }

    /**
     * Strip the elements that do not belong in a chapter.
     *
     * The baseline's list is long and site-agnostic, which is why a chapter
     * from an unknown site still reads well: the ads, the share buttons, the
     * WordPress widgets and the Microsoft Word leftovers all go.
     */
    override removeUnwantedElementsFromContentElement(element: Element): void {
        util.removeScriptableElements(element);
        util.removeComments(element);
        util.removeElements(element.querySelectorAll('noscript, input, [aria-hidden="true"]'));
        util.removeUnwantedWordpressElements(element);
        util.removeMicrosoftWordCrapElements(element);
        util.removeShareLinkElements(element);
        util.removeLeadingWhiteSpace(element);
    }

    /**
     * Find the chapter's content.
     *
     * The baseline's base class had no `findContent`, so a parser that
     * called `super.findContent(dom)` threw a `TypeError`. Here it returns
     * `null`, which the pipeline reads as "this chapter has no content" and
     * turns into a visible placeholder rather than a crash.
     */
    override findContent(_dom: Document): Element | null {
        return null;
    }

    /**
     * The chapter list.
     *
     * The baseline's base class had no `getChapterUrls` either. Returning an
     * empty list is the honest answer: the parser does not know how to find
     * its chapters.
     */
    override getChapterUrls(_dom: Document, _chapterUrlsUI?: TocProgress): LegacyChapter[] {
        return [];
    }

    /**
     * Fetch a chapter's DOM.
     *
     * The baseline's version went through `HttpClient`, so that a parser's
     * custom error handling applied. The rewrite's fetch client is behind
     * that same facade, so the behaviour is preserved.
     */
    override async fetchChapter(url: string): Promise<Document | null> {
        if (this.userPreferences.noContentToError403.value) {
            const options = { parser: this };
            return (await HttpClient.wrapFetch(url, options)).responseXML;
        }
        return (await HttpClient.wrapFetch(url)).responseXML;
    }

    /** Modify the raw DOM before the content is extracted. */
    override preprocessRawDom(_webPageDom: Document): void {
        // Overridden by parsers that need to reformat the raw page.
    }

    /** Clean up a node from the information page. */
    cleanInformationNode(_node: Node): void {
        // Overridden by parsers that need to.
    }

    /** The parser has been disabled. */
    disabled(): null {
        return null;
    }

    /** Nothing to do when the user presses "pack EPUB". */
    onStartCollecting(): void {
        // Overridden by parsers that need to.
    }

    /* ------------------------------------------------------------------
     * The baseline's `super` calls that had no base method
     * ------------------------------------------------------------------ */

    /**
     * The URL of the page that holds an image's copies.
     *
     * In the baseline this lived on `ImageCollector`, and five parsers
     * reached for it through `super`, where it threw. Here it is a stub.
     */
    extractWrappingUrl(_element: Element): string | null {
        return null;
    }

    /**
     * Whether an element wraps an image.
     *
     * In the baseline this lived on `ImageCollector`. Here it is a stub.
     */
    isImageWrapperElement(_element: Element): boolean {
        return false;
    }

    /**
     * Handle an HTTP-level failure.
     *
     * In the baseline this lived on `HttpClient`. The rewrite's fetch client
     * owns retries, so this is a stub that keeps the call harmless.
     */
    onResponseError(
        _url: string,
        _wrapOptions: unknown,
        _response: unknown,
        _errorMessage?: string,
    ): Promise<never> {
        return Promise.reject(new Error("The request failed."));
    }

    /**
     * Set an item's index.
     *
     * In the baseline this lived on `EpubItem`. Here it is a stub.
     */
    setIndex(_index: number): void {
        // Overridden by parsers that build their own EPUB items.
    }

    /* ------------------------------------------------------------------
     * State
     * ------------------------------------------------------------------ */

    /** Take over another parser's state. */
    copyState(otherParser: LegacyParser): void {
        this.state = otherParser.state;
        this.imageCollector.copyState(otherParser.imageCollector);
        this.userPreferences = otherParser.userPreferences;
    }

    /** Set the chapters to fetch. */
    setPagesToFetch(urls: LegacyChapter[]): void {
        this.state.setPagesToFetch(urls);
    }

    /** The chapters to fetch. */
    getPagesToFetch(): Map<string, LegacyChapter> {
        return this.state.webPages;
    }

    /** Take the user's preferences into account. */
    onUserPreferencesUpdate(userPreferences: LegacyUserPreferences): void {
        this.userPreferences = userPreferences;
        this.imageCollector.onUserPreferencesUpdate(userPreferences);
    }

    /* ------------------------------------------------------------------
     * Content processing
     * ------------------------------------------------------------------ */

    /**
     * Turn a chapter's raw DOM into its content element.
     *
     * This is the baseline's full cleanup pipeline. The rewrite's download
     * pipeline applies a subset of it — the sanitiser and the packer do the
     * rest — but a parser that calls this directly gets the baseline's
     * behaviour.
     */
    convertRawDomToContent(webPage: LegacyChapter): Element | null {
        const rawDom = webPage.rawDom;
        if (!rawDom) return null;
        const content = this.findContent(rawDom);
        if (!content) return null;

        this.customRawDomToContentStep(webPage, content);
        util.decodeCloudflareProtectedEmails(content);
        if (this.userPreferences.removeNextAndPreviousChapterHyperlinks.value) {
            this.removeNextAndPreviousChapterHyperlinks(webPage, content);
        }
        this.removeUnwantedElementsFromContentElement(content);
        this.replaceWpBlockSpacersWithHR(content);
        this.addTitleToContent(webPage, content);
        util.fixBlockTagsNestedInInlineTags(content);
        this.imageCollector.replaceImageTags(content);
        util.removeUnusedHeadingLevels(content);
        util.makeHyperlinksRelative(rawDom.baseURI, content);
        util.setStyleToDefault(content);
        util.prepForConvertToXhtml(content);
        util.removeEmptyAttributes(content);
        util.removeSpansWithNoAttributes(content);
        util.removeEmptyDivElements(content);
        util.removeTrailingWhiteSpace(content);
        if (util.isElementWhiteSpace(content)) {
            ErrorLog.showErrorMessage(UIText.Warning.warningNoVisibleContent(webPage.sourceUrl));
        }
        return content;
    }

    /** Add the chapter's title to the content, if it is not already there. */
    addTitleToContent(webPage: LegacyChapter, content: Element): void {
        const rawDom = webPage.rawDom;
        if (!rawDom) return;
        const found = this.findChapterTitle(rawDom, webPage);
        if (found !== null && found !== undefined) {
            const title = found instanceof HTMLElement ? (found.textContent ?? "") : String(found);
            if (webPage.title === "[placeholder]") {
                webPage.title = title.trim();
            }
            if (!this.titleAlreadyPresent(title, content)) {
                const titleElement = rawDom.createElement("h1");
                titleElement.appendChild(rawDom.createTextNode(title.trim()));
                content.insertBefore(titleElement, content.firstChild);
            }
        } else if (webPage.title === "[placeholder]") {
            webPage.title = rawDom.title;
        }
    }

    /** Whether the content already starts with the chapter's title. */
    titleAlreadyPresent(title: string, content: Element): boolean {
        const existingTitle = content.querySelector("h1, h2, h3, h4, h5, h6");
        return existingTitle !== null && title.trim() === (existingTitle.textContent ?? "").trim();
    }

    /** Replace the WordPress block spacers with horizontal rules. */
    replaceWpBlockSpacersWithHR(content: Element): void {
        const owner = content.ownerDocument;
        [...content.querySelectorAll("div.wp-block-spacer")].forEach((element) => {
            element.replaceWith(owner.createElement("hr"));
        });
    }

    /** Remove the links to the next and previous chapters. */
    removeNextAndPreviousChapterHyperlinks(webPage: LegacyChapter, element: Element): void {
        const elementToRemove = this.findParentNodeOfChapterLinkToRemoveAt
            ? this.findParentNodeOfChapterLinkToRemoveAt.bind(this)
            : (link: Element) => link;

        const chapterLinks = [...element.querySelectorAll("a")]
            .filter((link) =>
                webPage.nextPrevChapters?.has(
                    util.normalizeUrlForCompare((link as HTMLAnchorElement).href),
                ),
            )
            .map((link) => elementToRemove(link));
        util.removeElements(chapterLinks);
    }

    /** Mark the elements that are the author's notes. */
    tagAuthorNotes(elements: Iterable<Element>): void {
        for (const element of elements) {
            element.classList.add("webToEpub-author-note");
        }
    }

    /** Remove or mark the author's notes, depending on the user's preference. */
    tagAuthorNotesBySelector(element: Element, selector: string): void {
        const notes = element.querySelectorAll(selector);
        if (this.userPreferences.removeAuthorNotes.value) {
            util.removeElements(notes);
        } else {
            this.tagAuthorNotes(notes);
        }
    }

    /** Remove the elements that are not needed once the content is extracted. */
    removeUnusedElementsToReduceMemoryConsumption(webPageDom: Document): void {
        util.removeElements(webPageDom.querySelectorAll("select, iframe"));
    }

    /* ------------------------------------------------------------------
     * Table of contents
     * ------------------------------------------------------------------ */

    /**
     * Walk the table of contents, page by page.
     *
     * The baseline reported only the chapters found on the current page,
     * because its table replaced its contents. The rewrite accumulates.
     * Here the baseline's behaviour is preserved.
     */
    override async walkTocPages(
        dom: Document,
        chaptersFromDom: (dom: Document) => LegacyChapter[],
        nextTocPageUrl: (dom: Document, chapters?: unknown, partial?: unknown) => string | null,
        chapterUrlsUI?: TocProgress,
    ): Promise<LegacyChapter[]> {
        let chapters = chaptersFromDom(dom);
        chapterUrlsUI?.showTocProgress(chapters);
        let url = nextTocPageUrl(dom, chapters, chapters);
        while (url !== null) {
            await this.rateLimitDelay();
            const nextDom = (await HttpClient.wrapFetch(url)).responseXML;
            const partialList = chaptersFromDom(nextDom);
            chapterUrlsUI?.showTocProgress(partialList);
            chapters = chapters.concat(partialList);
            url = nextTocPageUrl(nextDom, chapters, partialList);
        }
        return chapters;
    }

    /**
     * Fetch a known list of table-of-contents pages and gather their chapters.
     */
    override async getChaptersFromAllTocPages(
        chapters: LegacyChapter[],
        extractPartialChapterList: (dom: Document) => LegacyChapter[],
        urlsOfTocPages: string[],
        chapterUrlsUI?: TocProgress,
        wrapOptions?: unknown,
    ): Promise<LegacyChapter[]> {
        if (chapters.length > 0) {
            chapterUrlsUI?.showTocProgress(chapters);
        }
        for (const url of urlsOfTocPages) {
            await this.rateLimitDelay();
            const newDom = (await HttpClient.wrapFetch(url, wrapOptions as LegacyWrapOptions))
                .responseXML;
            const partialList = extractPartialChapterList(newDom);
            chapterUrlsUI?.showTocProgress(partialList);
            chapters = chapters.concat(partialList);
        }
        return chapters;
    }

    /**
     * Extract the table-of-contents page URLs, then fetch them all.
     */
    override async getChapterUrlsFromMultipleTocPages(
        dom: Document,
        extractPartialChapterList: (dom: Document) => LegacyChapter[],
        getUrlsOfTocPages: (dom: Document) => string[],
        chapterUrlsUI?: TocProgress,
    ): Promise<LegacyChapter[]> {
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
     * Fetch a chapter that is split across several pages.
     */
    override async walkPagesOfChapter(
        url: string,
        moreChapterTextUrl: (dom: Document, url?: string, count?: number) => string | null,
    ): Promise<Document> {
        const dom = (await HttpClient.wrapFetch(url)).responseXML;
        let count = 2;
        let nextUrl = moreChapterTextUrl(dom, url, count);
        const oldContent = this.findContent(dom);
        while (nextUrl !== null) {
            await this.rateLimitDelay();
            const nextDom = (await HttpClient.wrapFetch(nextUrl)).responseXML;
            const newContent = this.findContent(nextDom);
            nextUrl = moreChapterTextUrl(nextDom, url, ++count);
            if (oldContent && newContent) {
                oldContent.appendChild(dom.createElement("br"));
                util.moveChildElements(newContent, oldContent);
            }
        }
        return dom;
    }

    /* ------------------------------------------------------------------
     * Throttling
     * ------------------------------------------------------------------ */

    /**
     * The delay between requests, in milliseconds.
     *
     * The user's manual delay wins over the parser's own minimum, unless
     * the parser asks for its minimum to be authoritative.
     */
    override getRateLimit(): number {
        const manual = Number.parseInt(
            this.userPreferences?.manualDelayPerChapter?.value ?? "",
            10,
        );
        const manualDelay = Number.isNaN(manual) ? this.minimumThrottle : manual;
        if (!this.userPreferences.overrideMinimumDelay.value) {
            return Math.max(this.minimumThrottle, manualDelay);
        }
        return manualDelay;
    }

    /**
     * Turn a chapter's DOM into the content element that will be packed.
     *
     * The baseline ran a longer cleanup pipeline than the rewrite's default:
     * it decoded Cloudflare-protected email addresses, removed the next and
     * previous chapter links, added the chapter's title when the page did not
     * already carry it, made the hyperlinks relative, and prepared the content
     * for conversion to XHTML.
     *
     * All of that is preserved here, because it is what makes the migrated
     * parsers produce the same books they always did.
     */
    override extractChapterContent(dom: Document, chapter: WebPage): Element | null {
        const webPage = chapter as LegacyChapter;
        webPage.rawDom = dom;
        this.preprocessRawDom(dom);
        this.removeUnusedElementsToReduceMemoryConsumption(dom);
        return this.convertRawDomToContent(webPage);
    }

    /** Wait for the rate limit to expire. */
    async rateLimitDelay(): Promise<void> {
        await util.sleep(this.getRateLimit());
    }

    /* ------------------------------------------------------------------
     * Metadata
     * ------------------------------------------------------------------ */

    /** The metadata of the book. */
    getEpubMetaInfo(dom: Document, useFullTitle = false): EpubMetaInfo {
        const metaInfo = new EpubMetaInfo();
        metaInfo.uuid = dom.baseURI;
        metaInfo.title = this.safeCall(() => this.extractTitle(dom), "");
        metaInfo.author = this.safeCall(() => this.extractAuthor(dom).trim(), "");
        metaInfo.language = this.safeCall(() => this.extractLanguage(dom), "");
        metaInfo.fileName = this.safeCall(
            () => this.makeSaveAsFileNameWithoutExtension(metaInfo.title, useFullTitle),
            "web.epub",
        );
        metaInfo.subject = this.safeCall(() => this.extractSubject(dom), "");
        metaInfo.description = this.safeCall(() => this.extractDescription(dom), "");
        metaInfo.publisher = this.safeCall(() => this.extractPublisher(dom), "");
        metaInfo.datePublished = this.safeCall(() => this.extractDatePublished(dom), null);
        this.extractSeriesInfo(dom, metaInfo);
        return metaInfo;
    }

    /** Add the series information to the metadata. */
    extractSeriesInfo(_dom: Document, _metaInfo: EpubMetaInfo): void {
        // Overridden by parsers that know about series.
    }

    /** Load the metadata that needs a network request. */
    async loadEpubMetaInfo(_dom: Document): Promise<void> {
        // Overridden by parsers that fetch their metadata.
    }

    /** Call a function, returning a fallback if it throws. */
    private safeCall<T>(fn: () => T, fallback: T): T {
        try {
            return fn();
        } catch {
            return fallback;
        }
    }

    /** The story, when it is a single chapter. */
    singleChapterStory(baseUrl: string, dom: Document): LegacyChapter[] {
        return [
            {
                sourceUrl: baseUrl,
                title: this.extractTitle(dom),
                newArc: null,
            },
        ];
    }

    /** The document's base URL. */
    getBaseUrl(dom: Document): string {
        const base = dom.getElementsByTagName("base")[0] as HTMLBaseElement | undefined;
        return base?.href ?? dom.baseURI;
    }

    /** The file name to save the book under, without the extension. */
    makeSaveAsFileNameWithoutExtension(title: string | null, useFullTitle = false): string {
        const maxLength = useFullTitle ? 512 : 20;
        let fileName = title === null ? "web" : util.safeForFileName(title, maxLength);
        if (util.isStringWhiteSpace(fileName)) {
            // The title is probably not English, so keep it as it is.
            fileName = title ?? "web";
        }
        return fileName;
    }

    /* ------------------------------------------------------------------
     * EPUB items
     * ------------------------------------------------------------------ */

    /** Whether the chapter should be packed into the book. */
    isWebPagePackable(webPage: LegacyChapter): boolean {
        return (
            webPage.isIncludeable !== false &&
            ((webPage.rawDom !== null && webPage.rawDom !== undefined) || webPage.error !== null)
        );
    }

    /** The EPUB items for a chapter. */
    webPageToEpubItems(webPage: LegacyChapter, epubItemIndex: number): EpubItem[] {
        const content = this.convertRawDomToContent(webPage);
        if (content === null) return [];
        return [new ChapterEpubItem(webPage, content, epubItemIndex)];
    }

    /** The EPUB item for a chapter that could not be fetched. */
    makePlaceholderEpubItem(webPage: LegacyChapter, epubItemIndex: number): EpubItem[] {
        const temp = LegacyParser.makeEmptyDocForContent(webPage.sourceUrl);
        temp.content.textContent = UIText.Default.chapterPlaceholderMessage(
            webPage.sourceUrl,
            webPage.error?.message ?? "",
        );
        util.convertPreTagToPTags(temp.dom, temp.content);
        return [new ChapterEpubItem(webPage, temp.content, epubItemIndex)];
    }

    /** The information page's EPUB item. */
    makeInformationEpubItem(dom: Document): EpubItem {
        const titleText = UIText.Default.informationPageTitle;
        const title = document.createElement("h1");
        title.appendChild(document.createTextNode(titleText));
        const div = document.createElement("div");
        const urlElement = document.createElement("p");
        const bold = document.createElement("b");
        bold.textContent = UIText.Default.tableOfContentsUrl;
        urlElement.appendChild(bold);
        const link = document.createElement("a");
        link.classList.add("webToEpub-table-of-content-url");
        link.href = this.state.chapterListUrl ?? "";
        link.textContent = this.state.chapterListUrl ?? "";
        urlElement.appendChild(link);
        div.appendChild(urlElement);
        const infoDiv = document.createElement("div");
        this.populateInfoDiv(infoDiv, dom);
        const chapter = {
            sourceUrl: this.state.chapterListUrl ?? "",
            title: titleText,
            newArc: null,
        };
        return new ChapterEpubItem(chapter, { childNodes: [title, div, infoDiv] }, 0);
    }

    /** Fill the information page's container. */
    populateInfoDiv(infoDiv: Element, dom: Document): void {
        const childNodes = this.getInformationEpubItemChildNodes;
        if (childNodes === undefined) return;
        for (const node of childNodes(dom).filter((n) => n !== null && n !== undefined)) {
            const clone = util.sanitizeNode(node);
            if (clone) this.cleanInformationNode(clone);
            if (clone !== null) infoDiv.appendChild(clone);
        }
        // The information page does not go through the image collector.
        util.removeChildElementsMatchingSelector(infoDiv, "img");
    }

    /** The EPUB items for every chapter. */
    webPagesToEpubItems(webPages: LegacyChapter[]): EpubItem[] {
        const epubItems: EpubItem[] = [];
        let index = 0;

        if (
            this.userPreferences.addInformationPage.value &&
            this.getInformationEpubItemChildNodes !== undefined &&
            this.state.firstPageDom
        ) {
            epubItems.push(this.makeInformationEpubItem(this.state.firstPageDom));
            ++index;
        }

        for (const webPage of webPages.filter((c) => this.isWebPagePackable(c))) {
            const newItems =
                webPage.error === null || webPage.error === undefined
                    ? // The chapter's own parser builds the items, not this
                      // one. A chapter can be fetched by a different parser
                      // from the one that listed it — the chapter list can
                      // link to a site with its own parser — and that parser
                      // may split the chapter into several EPUB items.
                      (webPage.parser ?? this).webPageToEpubItems(webPage, index)
                    : this.makePlaceholderEpubItem(webPage, index);
            epubItems.push(...newItems);
            index += newItems.length;
            delete webPage.rawDom;
        }
        return epubItems;
    }

    /** The collection of items that make up the book. */
    epubItemSupplier(): EpubItemSupplier {
        const epubItems = this.webPagesToEpubItems([...this.state.webPages.values()]);
        this.fixupHyperlinksInEpubItems(epubItems);
        return new EpubItemSupplier(this, epubItems, this.imageCollector);
    }

    /** Point the book's internal links at the book's own files. */
    fixupHyperlinksInEpubItems(epubItems: EpubItem[]): void {
        const targets = this.sourceUrlToEpubItemUrl(epubItems);
        for (const item of epubItems) {
            for (const link of item
                .getHyperlinks()
                .filter((l) => this.isUnresolvedHyperlink(l))
                .filter((l) => !l.classList.contains("webToEpub-table-of-content-url"))) {
                if (!this.hyperlinkToEpubItemUrl(link, targets)) {
                    this.makeHyperlinkAbsolute(link);
                }
            }
        }
    }

    /** Map each source URL to the file it became. */
    sourceUrlToEpubItemUrl(epubItems: EpubItem[]): Map<string, string> {
        const targets = new Map<string, string>();
        for (const item of epubItems) {
            const key = util.normalizeUrlForCompare(item.sourceUrl);
            // A source URL may produce several items; the first one wins.
            if (!targets.has(key)) {
                targets.set(key, util.makeRelative(item.getZipHref()));
            }
        }
        return targets;
    }

    /** Whether a link still points outside the book. */
    isUnresolvedHyperlink(link: Element): boolean {
        const href = link.getAttribute("href");
        if (href === null) return false;
        return !href.startsWith("#") && !href.startsWith("../Text/");
    }

    /** Point a link at the book's own file, if there is one. */
    hyperlinkToEpubItemUrl(link: Element, targets: Map<string, string>): boolean {
        const key = util.normalizeUrlForCompare((link as HTMLAnchorElement).href);
        const targetInEpub = targets.has(key);
        if (targetInEpub) {
            link.setAttribute("href", `${targets.get(key)}${(link as HTMLAnchorElement).hash}`);
        }
        return targetInEpub;
    }

    /** Make a link absolute, if it is not already. */
    makeHyperlinkAbsolute(link: Element): void {
        const anchor = link as HTMLAnchorElement;
        if (anchor.href !== anchor.getAttribute("href")) {
            anchor.setAttribute("href", anchor.href);
        }
    }

    /* ------------------------------------------------------------------
     * The download pipeline
     * ------------------------------------------------------------------ */

    /** The chapters the parser found, cleaned up. */
    cleanWebPageUrls(webPages: LegacyChapter[]): LegacyChapter[] {
        const foundUrls = new Set<string>();
        return webPages
            .map((webPage) => this.fixupImgurGalleryUrl(webPage))
            .filter((p) => util.isUrl(p.sourceUrl))
            .filter((webPage) => {
                if (foundUrls.has(webPage.sourceUrl)) return false;
                foundUrls.add(webPage.sourceUrl);
                return true;
            });
    }

    /** Add the `?grid` suffix an Imgur gallery needs. */
    fixupImgurGalleryUrl(webPage: LegacyChapter): LegacyChapter {
        webPage.sourceUrl = Imgur.fixupImgurGalleryUrl(webPage.sourceUrl);
        return webPage;
    }

    /** Add the first page to the chapter list, if it is not already there. */
    addFirstPageUrlToWebPages(
        url: string,
        firstPageDom: Document,
        webPages: LegacyChapter[],
    ): LegacyChapter[] {
        const present = webPages.find((e) => e.sourceUrl === url);
        if (present) return webPages;
        return [
            {
                sourceUrl: url,
                title: this.extractTitle(firstPageDom),
                newArc: null,
            },
            ...webPages,
        ];
    }

    /**
     * The parser has loaded the first page.
     *
     * The rewrite's pipeline does not use this — the workbench asks the
     * worker for the chapter list directly — but a parser may override it,
     * so it is kept.
     */
    async onLoadFirstPage(url: string, firstPageDom: Document): Promise<void> {
        this.state.firstPageDom = firstPageDom;
        this.state.chapterListUrl = url;
        this.userPreferences.readingList.setReadingListCheckbox(url);

        try {
            let chapters = await listChapterUrls<LegacyChapter>(this, firstPageDom);
            if (this.userPreferences.chaptersPageInChapterList.value) {
                chapters = this.addFirstPageUrlToWebPages(url, firstPageDom, chapters);
            }
            chapters = this.cleanWebPageUrls(chapters);
            chapters?.forEach((chapter) => {
                chapter.title = chapter.title?.trim() ?? "";
            });
            await this.userPreferences.readingList.deselectOldChapters(url, chapters);
            const first = chapters[0];
            if (first !== undefined && first.sourceUrl === url) {
                first.rawDom = firstPageDom;
                this.updateLoadState(first);
            }
            this.setPagesToFetch(chapters);
        } catch (error) {
            ErrorLog.showErrorMessage(error);
        }
    }

    /** The user pressed "fetch". */
    onFetchChaptersClicked(): void {
        if (this.state.webPages.size === 0) {
            ErrorLog.showErrorMessage(UIText.Error.noChaptersFoundAndFetchClicked());
        } else {
            void this.fetchWebPages();
        }
    }

    /** Fetch the chapters. */
    fetchContent(): Promise<void> {
        return this.fetchWebPages();
    }

    /** Show the loading progress. */
    setUiToShowLoadingProgress(length: number): void {
        main.getPackEpubButton().disabled = true;
        ProgressBar.setMax(length + 1);
        ProgressBar.setValue(1);
    }

    /** Fetch every chapter. */
    async fetchWebPages(): Promise<void> {
        const pagesToFetch = [...this.state.webPages.values()].filter(
            (c) => c.isIncludeable !== false,
        );
        if (pagesToFetch.length === 0) {
            throw new Error("No chapters found.");
        }

        this.setUiToShowLoadingProgress(pagesToFetch.length);
        this.imageCollector.reset();
        this.imageCollector.setCoverImageUrl(CoverImageUI.getCoverImageUrl());

        await this.addParsersToPages(pagesToFetch);
        let index = 0;
        try {
            let group = this.groupPagesToFetch(pagesToFetch, index);
            while (group.length > 0) {
                await Promise.all(group.map(async (webPage) => this.fetchWebPageContent(webPage)));
                index += group.length;
                group = this.groupPagesToFetch(pagesToFetch, index);
                if (util.getSleepController().signal.aborted) break;
            }
        } catch (error) {
            ErrorLog.log(error);
            // The error is re-thrown after being logged, so a caller awaiting
            // the fetch can tell that it failed. Swallowing it here made a
            // failed run look like a successful one.
            throw error;
        }
    }

    /** Give every chapter the parser that will fetch it. */
    async addParsersToPages(pagesToFetch: LegacyChapter[]): Promise<void> {
        const { parserFactory } = await import("./legacy-factory");
        await parserFactory.addParsersToPages(this, pagesToFetch);
    }

    /** The next group of chapters to fetch. */
    groupPagesToFetch(webPages: LegacyChapter[], index: number): LegacyChapter[] {
        return webPages.slice(index, index + this.maxSimultanousFetchSize);
    }

    /** Fetch one chapter. */
    async fetchWebPageContent(webPage: LegacyChapter): Promise<void> {
        ChapterUrlsUI.showDownloadState(webPage.row, ChapterUrlsUI.DOWNLOAD_STATE_SLEEPING);
        await this.rateLimitDelay();
        ChapterUrlsUI.showDownloadState(webPage.row, ChapterUrlsUI.DOWNLOAD_STATE_DOWNLOADING);
        const pageParser = webPage.parser ?? this;
        try {
            const webPageDom = await pageParser.fetchChapter(webPage.sourceUrl);
            delete webPage.error;
            webPage.rawDom = webPageDom;
            pageParser.preprocessRawDom(webPageDom as Document);
            pageParser.removeUnusedElementsToReduceMemoryConsumption(webPageDom as Document);
            const content = pageParser.findContent(webPage.rawDom as Document);
            if (content === null) {
                if (this.userPreferences.noContentToError403.value) {
                    throw new Error(
                        UIText.Warning.warningNoContentTo403ErrorResponse(
                            new URL(webPage.sourceUrl).hostname,
                        ),
                    );
                }
                throw new Error(UIText.Error.errorContentNotFound(webPage.sourceUrl));
            }
            return this.fetchImagesUsedInDocument(content, webPage);
        } catch (error) {
            if (this.userPreferences.skipChaptersThatFailFetch.value) {
                ErrorLog.log(error);
                webPage.error = error instanceof Error ? error : new Error(String(error));
            } else {
                webPage.isIncludeable = false;
                throw error;
            }
        }
    }

    /** Collect the images a chapter uses. */
    async fetchImagesUsedInDocument(content: Element, webPage: LegacyChapter): Promise<void> {
        const revisedContent = await this.imageCollector.preprocessImageTags(
            content,
            webPage.sourceUrl,
        );
        this.imageCollector.findImagesUsedInDocument(revisedContent);
        await this.imageCollector.fetchImages(
            () => this.updateProgressBarOneStep(),
            webPage.sourceUrl,
        );
        this.updateLoadState(webPage);
    }

    /** Advance the progress bar. */
    updateProgressBarOneStep(): void {
        ProgressBar.updateValue(1);
    }

    /** Record that a chapter has loaded. */
    updateLoadState(webPage: LegacyChapter): void {
        ChapterUrlsUI.showDownloadState(webPage.row, ChapterUrlsUI.DOWNLOAD_STATE_LOADED);
        ProgressBar.updateValue(1);
    }

    /** Update the reading list. */
    updateReadingList(): void {
        this.userPreferences.readingList.update(this.state.chapterListUrl ?? "", [
            ...this.state.webPages.values(),
        ]);
    }

    /* ------------------------------------------------------------------
     * The popup's settings
     * ------------------------------------------------------------------ */

    /**
     * Populate the popup's controls.
     *
     * The rewrite's popup is a thin client that asks the worker for
     * everything, so there is nothing to populate here. A parser that
     * overrides `populateUIImpl` — twenty-five of them do — may add its own
     * settings, and those settings live in the workbench.
     */
    populateUI(dom: Document): void {
        this.populateUIImpl(dom);
    }

    /** Populate the popup's parser-specific controls. */
    populateUIImpl(_dom?: Document): void {
        // Overridden by parsers that add their own settings.
    }

    /* ------------------------------------------------------------------
     * Constructed content
     * ------------------------------------------------------------------ */

    /**
     * Create a synthetic document for content that is built rather than
     * scraped.
     */
    static makeEmptyDocForContent(baseUrl?: string | null): {
        dom: Document;
        content: Element;
    } {
        const dom = document.implementation.createHTMLDocument("");
        if (baseUrl !== null && baseUrl !== undefined) {
            util.setBaseTag(baseUrl, dom);
        }
        const content = dom.createElement("div");
        content.className = LegacyParser.WEB_TO_EPUB_CLASS_NAME;
        dom.body.appendChild(content);
        return { dom, content };
    }

    /** Find the content element in a constructed document. */
    static findConstructedContent(dom: Document): Element | null {
        return dom.querySelector(`div.${LegacyParser.WEB_TO_EPUB_CLASS_NAME}`);
    }

    /** Add raw text to a constructed document, one paragraph per line. */
    static addTextToChapterContent(
        newDoc: { dom: Document; content: Element },
        contentText: string,
    ): void {
        const lines = contentText
            .replace(/\r/g, "\n")
            .replace(/\n\n/g, "\n")
            .split("\n")
            .filter((s) => !util.isNullOrEmpty(s));
        for (const line of lines) {
            const paragraph = newDoc.dom.createElement("p");
            paragraph.textContent = line;
            newDoc.content.appendChild(paragraph);
        }
    }
}

/**
 * Whether a value is a set of legacy preferences.
 *
 * The preferences reach the parsers through the services, which are typed
 * loosely because the rewrite's `Parser` does not know about the legacy
 * shape. This check keeps the type honest without a cast.
 *
 * @param value The value to check.
 * @returns Whether it looks like the legacy preferences.
 */
function isLegacyUserPreferences(value: unknown): value is LegacyUserPreferences {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<LegacyUserPreferences>;
    // A handful of the flags is enough to tell the preferences apart from any
    // other object that might have been put in the services.
    const markers = [
        candidate.removeAuthorNotes,
        candidate.skipImages,
        candidate.useSvgForImages,
        candidate.addInformationPage,
    ];
    return markers.every(
        (marker) => typeof marker === "object" && marker !== null && "value" in marker,
    );
}

/**
 * The services to use when none were injected.
 *
 * A parser constructed outside the worker — in a test, or by a tool that
 * only wants the parser's metadata — still has to be constructible. The
 * stand-in services fail loudly rather than silently doing nothing.
 */
function makeFallbackServices(): ParserServices {
    const fail = (): never => {
        throw new Error(
            "This parser was constructed without services. The background worker injects them.",
        );
    };
    return {
        fetchHtml: async () => fail(),
        fetchJson: async () => fail(),
        // The legacy `util` is a superset of the parser utilities: it has the
        // same functions, with a couple of extra optional parameters and the
        // legacy chapter shape. Every call the parser interface makes is
        // satisfied by it, so the cast is safe.
        util: util as unknown as ParserUtilities,
        imageCollector: {
            images: new Map<string, unknown>(),
            addImage: async () => undefined,
        },
    };
}

/** The image collector that lets the user pick the image size. */
export { VariableSizeImageCollector };

/** The chapter shape the legacy contract uses. */
export type { ChapterLink };
