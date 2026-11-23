/**
 * The heuristic scanner.
 *
 * When no parser matches a site, Kintsugi guesses where the story is. The
 * scanner looks at the page's structure and answers three questions:
 *
 *  - Is this page a table of contents, or a chapter?
 *  - Which element holds the chapter's body?
 *  - Which element holds the chapter's title?
 *
 * The baseline had this logic in `HeuristicScanner`, mixed in with the popup
 * UI and with the `HttpClient` call that fetched the page. The rewrite keeps
 * the scoring — it was the most useful part of the baseline's fallback — and
 * takes the DOM as an argument, so the scanner is pure and testable.
 *
 * See ADR-0011.
 */

/** What the scanner found. */
export type ScanStatus = "success" | "toc_detected" | "failed";

/** The result of a scan. */
export interface ScanResult {
    /** What happened. */
    status: ScanStatus;
    /** The selector that holds the chapter's body. */
    contentCss: string;
    /** The selector that holds the chapter's title. */
    titleCss: string;
    /** The error, when the scan failed. */
    error?: string;
}

/** A candidate element, with its score. */
interface Candidate {
    /** The element. */
    node: Element;
    /** How likely it is to be the chapter's body. */
    score: number;
}

/**
 * The patterns that mark an element as *not* the chapter's body.
 *
 * The baseline's list, extended with the Japanese and Chinese words for
 * "comment" and "recommendation", which the baseline already had but which
 * are easy to lose when the list is rewritten.
 */
const BAD_PATTERNS =
    /comment|footer|sidebar|menu|nav|ad|promo|widget|评论区|推荐|留言|コメント|댓글/i;

/** The patterns that mark an element as *likely* to be the chapter's body. */
const GOOD_PATTERNS = /content|chapter|article|text|body|正文|内容|本編|本文/i;

/** The patterns that mark an element as a likely chapter title. */
const TITLE_PATTERNS = /title|heading|chapter-title|h1|h2|标题|タイトル|제목/i;

/** The elements that never hold the chapter's body. */
const IGNORED_TAGS = new Set(["script", "style", "nav", "header", "footer"]);

/**
 * Scan a document.
 *
 * @param dom The document to scan.
 * @returns What the scanner found.
 */
export function scanDocument(dom: Document): ScanResult {
    if (!dom.body) {
        return { status: "failed", contentCss: "", titleCss: "", error: "The page has no body." };
    }

    if (isTableOfContents(dom)) {
        return { status: "toc_detected", contentCss: "", titleCss: "" };
    }

    const contentNode = findContentNode(dom);
    const titleNode = findTitleNode(dom);

    return {
        status: "success",
        contentCss: contentNode ? generateSelector(contentNode) : "body",
        titleCss: titleNode ? generateSelector(titleNode) : "",
    };
}

/**
 * Whether the page looks like a table of contents.
 *
 * The baseline's rule: more than 40 % of the page's text lives inside a link.
 * A chapter page is mostly prose; a table of contents is mostly a list of
 * titles, and every title is a link.
 */
export function isTableOfContents(dom: Document): boolean {
    if (!dom.body) return false;

    const walker = dom.createTreeWalker(dom.body, NodeFilter.SHOW_TEXT);
    let totalTextLength = 0;
    let linkTextLength = 0;
    let node = walker.nextNode();

    while (node) {
        const text = (node.textContent ?? "").trim();
        if (text.length > 0) {
            totalTextLength += text.length;
            const parent = node.parentElement;
            if (parent && parent.closest("a")) linkTextLength += text.length;
        }
        node = walker.nextNode();
    }

    return totalTextLength > 0 && linkTextLength / totalTextLength > 0.4;
}

/**
 * The element most likely to hold the chapter's body.
 *
 * The scoring is the baseline's: an element with several paragraphs is a
 * candidate, its score is weighted by the number of paragraphs and line
 * breaks, and elements whose class or id suggests navigation or advertising
 * are excluded. A name that suggests content earns a bonus.
 *
 * When two candidates score within 20 % of each other, the deeper one wins:
 * a wrapper that holds the content and the content itself are usually a
 * matched pair, and the tighter one is the better answer.
 */
export function findContentNode(dom: Document): Element | null {
    if (!dom.body) return null;

    const candidates: Candidate[] = [];
    const walker = dom.createTreeWalker(dom.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode() as Element | null;

    while (node) {
        const current: Element = node;
        const tag = current.tagName.toLowerCase();
        if (!IGNORED_TAGS.has(tag)) {
            const paragraphCount = current.getElementsByTagName("p").length;
            const breakCount = current.getElementsByTagName("br").length;

            if (paragraphCount > 2 || breakCount > 4) {
                const attributes = `${current.className ?? ""} ${current.id ?? ""}`;
                if (!BAD_PATTERNS.test(attributes)) {
                    let score = paragraphCount * 2 + breakCount;
                    if (GOOD_PATTERNS.test(attributes)) score += 50;
                    candidates.push({ node: current, score });
                }
            }
        }
        node = walker.nextNode() as Element | null;
    }

    const first = candidates[0];
    if (first === undefined) return null;
    candidates.sort((a, b) => b.score - a.score);

    let best: Candidate = candidates[0] ?? first;
    for (let index = 1; index < candidates.length; index++) {
        const challenger = candidates[index];
        if (challenger === undefined) continue;
        if (challenger.score < best.score * 0.8) break;
        if (best.node.contains(challenger.node)) best = challenger;
    }
    return best.node;
}

/**
 * The element most likely to hold the chapter's title.
 *
 * An `<h1>` is always the answer if the page has one. Otherwise the first
 * element whose class or id reads like a title wins.
 */
export function findTitleNode(dom: Document): Element | null {
    const heading = dom.querySelector("h1");
    if (heading) return heading;

    const candidates = dom.querySelectorAll("h2, h3, div, span, strong, p");
    for (const node of candidates) {
        const text = (node.textContent ?? "").trim();
        if (text.length === 0 || text.length > 100) continue;
        const attributes = `${node.className ?? ""} ${node.id ?? ""}`;
        if (TITLE_PATTERNS.test(attributes)) return node;
    }
    return null;
}

/**
 * A CSS selector that picks out an element.
 *
 * An id becomes `#id`; otherwise the element's classes become `.a.b`; and
 * failing that, the tag name. The result is validated before it is returned,
 * because a selector that throws would take the chapter down with it.
 */
export function generateSelector(node: Element): string {
    let selector = "";

    if (node.id) {
        selector = `#${escapeIdentifier(node.id)}`;
    } else {
        const className = node.className;
        if (typeof className === "string" && className.trim() !== "") {
            const classes = className
                .trim()
                .split(/\s+/)
                .filter((value) => value !== "")
                .map((value) => `.${escapeIdentifier(value)}`);
            if (classes.length > 0) selector = classes.join("");
        }
    }

    if (selector === undefined) selector = node.tagName.toLowerCase();

    try {
        document.createDocumentFragment().querySelector(selector);
        return selector;
    } catch {
        return node.tagName.toLowerCase();
    }
}

/** Escape a string for use in a CSS selector. */
function escapeIdentifier(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}
