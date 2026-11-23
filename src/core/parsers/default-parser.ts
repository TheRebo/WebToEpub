/**
 * The default parser.
 *
 * The fallback used when no site-specific parser matches. It is deliberately
 * conservative: it looks for the common shapes a novel site's table of
 * contents and chapter body take, and it does nothing clever.
 *
 * The baseline's default parser was a 200-line heuristic that produced
 * garbage on sites that were not novel sites at all. This one is small, and
 * the failure mode is obvious — the user sees no chapters and reaches for the
 * selector builder, which is a better outcome than a wrong chapter list.
 */
import { Parser } from "./parser";
import type { ChapterLink } from "../util/dom";
import { hyperlinksToChapterList } from "../util/dom";

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

/** The default parser. */
export class DefaultParser extends Parser {
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
        for (const selector of CONTENT_SELECTORS) {
            const element = dom.querySelector(selector);
            if (element && (element.textContent?.trim().length ?? 0) > 200) return element;
        }
        return dom.querySelector("body");
    }
}
