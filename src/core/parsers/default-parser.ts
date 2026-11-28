/**
 * The default parser.
 *
 * The fallback used when no site-specific parser matches. It works in two
 * modes:
 *
 *  - **Guessing.** It looks for the common shapes a novel site's table of
 *    contents and chapter body take, and it does nothing clever.
 *  - **Answering.** When the user has saved selectors for the host name — the
 *    workbench's **site selector** panel writes them — those selectors are
 *    used instead, and they are applied to every chapter.
 *
 * The baseline's default parser was a 200-line heuristic that produced garbage
 * on sites that were not novel sites at all. The guessing half here is small,
 * and the failure mode is obvious — the user sees no chapters and reaches for
 * the selector panel, which is a better outcome than a wrong chapter list.
 *
 * See ADR-0011.
 */
import { Parser } from "./parser";
import type { ChapterLink } from "../util/dom";
import { hyperlinksToChapterList } from "../util/dom";
import { siteSelectors } from "../storage/site-selectors";
import { normaliseHostName } from "../storage/site-selectors-store";

/** The selectors that commonly hold a chapter list, in order of confidence. */
const TOC_SELECTORS = [
    "div.chapter-list",
    "div#chapters",
    "div.chapters",
    "ul.chapter-list",
    "ol.chapter-list",
    "div.entry-content ul",
    "main ul",
    "article ul",
];

/** The selectors that commonly hold a chapter's body. */
const CONTENT_SELECTORS = [
    "div.chapter-content",
    "div#content",
    "article .entry-content",
    "article",
    "main",
    "div.post-content",
    "div.text",
];

/** The selectors that commonly hold a novel's title, in order of confidence. */
const TITLE_SELECTORS = [
    "h1.title",
    "h1.entry-title",
    "h1.post-title",
    "h1",
    ".novel-title",
    ".story-title",
];

/** The default parser. */
export class DefaultParser extends Parser {
    /**
     * The selectors saved for a host name, cached.
     *
     * The cache is keyed by host name, because a book may be read from more
     * than one host.
     */
    #saved = new Map<string, ReturnType<typeof siteSelectors.peek>>();

    constructor(services: ConstructorParameters<typeof Parser>[0]) {
        super(services);
        this.minimumThrottle = 1000;
    }

    /**
     * Find the chapter list.
     *
     * Tries the known selectors first, then falls back to the largest list
     * of links on the page.
     */
    async getChapterUrls(dom: Document): Promise<ChapterLink[]> {
        for (const selector of TOC_SELECTORS) {
            const container = dom.querySelector(selector);
            if (!container) continue;
            const chapters = hyperlinksToChapterList(container);
            if (chapters.length >= 2) return chapters;
        }

        // Fall back to the densest list of links on the page. A table of
        // contents is almost always the page's biggest list of links.
        const candidates = Array.from(dom.querySelectorAll("a[href]"));
        const grouped = new Map<Element, ChapterLink[]>();
        for (const anchor of candidates) {
            const parent = anchor.parentElement;
            if (!parent) continue;
            const list = grouped.get(parent) ?? [];
            const chapter = this.util.hyperLinkToChapter(anchor);
            if (chapter) list.push(chapter);
            grouped.set(parent, list);
        }

        let best: ChapterLink[] = [];
        for (const list of grouped.values()) {
            if (list.length > best.length) best = list;
        }
        return best;
    }

    /** Find the chapter's body. */
    findContent(dom: Document): Element | null {
        const saved = this.#savedSelectors(dom);
        if (saved) {
            const element = querySafely(dom, saved.contentCss);
            if (element) return element;
        }

        for (const selector of CONTENT_SELECTORS) {
            const element = dom.querySelector(selector);
            if (element && (element.textContent?.trim().length ?? 0) > 200) return element;
        }
        return dom.querySelector("body");
    }

    /** Find the chapter's title. */
    override findChapterTitle(dom: Document): Element | null {
        const saved = this.#savedSelectors(dom);
        if (saved && saved.titleCss !== "") {
            return querySafely(dom, saved.titleCss);
        }
        return null;
    }

    /**
     * Find the story's title.
     *
     * The default parser has to guess, so it tries the shapes a novel site's
     * title takes, in order of confidence, and falls back to the document's own
     * title. A guess is better than nothing: the workbench shows the title in
     * the file name, and an empty one is called "untitled.epub".
     */
    override extractTitleImpl(dom: Document): Element | string | null {
        const saved = this.#savedSelectors(dom);
        if (saved && saved.titleCss !== "") {
            const element = querySafely(dom, saved.titleCss);
            if (element) return element;
        }

        for (const selector of TITLE_SELECTORS) {
            const element = dom.querySelector(selector);
            const text = element?.textContent?.trim();
            if (text) return text;
        }

        const meta = dom.querySelector('meta[property="og:title"], meta[name="title"]');
        const content = meta?.getAttribute("content")?.trim();
        if (content) return content;

        return dom.title?.trim() ?? null;
    }

    /** Remove the elements the user does not want. */
    override removeUnwantedElementsFromContentElement(element: Element): void {
        const saved = this.#savedSelectors(element.ownerDocument);
        if (saved && saved.removeCss !== "") {
            for (const node of queryAllSafely(element, saved.removeCss)) node.remove();
        }
        super.removeUnwantedElementsFromContentElement(element);
    }

    /**
     * The selectors saved for the page's host name.
     *
     * The lookup is keyed by the host of the document being read, not by the
     * host of the first document that happened to arrive. A site may serve
     * its chapters from another host than its story page — a mirror, a
     * subdomain, a CDN — and the selectors the user saved belong to the
     * story, so the story's host is the fallback.
     *
     * The result is cached per host, because the same parser instance
     * handles every chapter of a book and the answer cannot change while
     * the download runs.
     */
    #savedSelectors(dom: Document): ReturnType<typeof siteSelectors.peek> {
        const hosts = [hostNameOf(dom.baseURI)];
        const storyHost = this.storyUrl ? hostNameOf(this.storyUrl) : "";
        if (storyHost !== "" && !hosts.includes(storyHost)) hosts.push(storyHost);

        for (const host of hosts) {
            if (host === "") continue;
            const cached = this.#saved.get(host);
            if (cached !== undefined) return cached;
            const found = siteSelectors.peek(host);
            this.#saved.set(host, found);
            if (found) return found;
        }
        return null;
    }
}

/** The host name a document's base URI belongs to. */
function hostNameOf(baseUri: string): string {
    try {
        return normaliseHostName(new URL(baseUri).hostname);
    } catch {
        return "";
    }
}

/** Query for the first element that matches, ignoring a bad selector. */
function querySafely(dom: Document, selector: string): Element | null {
    try {
        return dom.querySelector(selector);
    } catch {
        return null;
    }
}

/** Query for every element that matches, ignoring a bad selector. */
function queryAllSafely(element: Element, selector: string): Element[] {
    try {
        return Array.from(element.querySelectorAll(selector));
    } catch {
        return [];
    }
}
