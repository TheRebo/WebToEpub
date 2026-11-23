/**
 * The content script.
 *
 * Its only job is to read the page the user is looking at and hand the
 * result to the popup. It never fetches anything, never touches the
 * network, and never modifies the page.
 *
 * The baseline's content script injected a whole UI into the page and
 * ran the parser there. That meant the popup shipped every parser, and the
 * page was mutated on every navigation whether the user wanted it or not.
 *
 * Here the content script is a *reader*: it reports the page's title, its
 * URL, and a small summary of the links it can see. The popup uses the
 * summary to decide, in a few milliseconds, whether it should offer to open
 * the workbench — without fetching the page at all.
 *
 * See ADR-0005.
 */

/** What the content script reports about a page. */
export interface PageSummary {
    /** The page's URL. */
    url: string;
    /** The page's title. */
    title: string;
    /** The number of links the page has. */
    linkCount: number;
    /**
     * The URLs of the page's links that look like chapters.
     *
     * A "chapter-like" link is one whose text starts with a number, or whose
     * URL contains a chapter-ish path segment. This is a heuristic used only
     * to answer "does this look like a story page?", so a false positive costs
     * the user one click on "Try anyway".
     */
    chapterLinks: string[];
    /** Whether the page looks like a table of contents. */
    looksLikeToc: boolean;
}

/** The path segments that suggest a link points at a chapter. */
const CHAPTER_HINTS = ["chapter", "chp", "chap", "c-", "episode", "story", "novel"];

/**
 * Whether a link looks like a chapter link.
 */
function looksLikeChapter(anchor: HTMLAnchorElement): boolean {
    const text = (anchor.textContent ?? "").trim();
    if (/^\s*(?:chapter|chap|chp|episode|part|prologue|epilogue)\b/i.test(text)) return true;
    if (/^\s*\d{1,4}\s*[.::\-—]?\s*\S/.test(text)) return true;

    const path = anchor.pathname.toLowerCase();
    if (CHAPTER_HINTS.some((hint) => path.includes(`/${hint}`))) return true;
    return /\/\d{1,5}(?:\/|$)/.test(path);
}

/**
 * Summarise the current page.
 *
 * The work is bounded on purpose: at most a few hundred links are examined,
 * so a page with ten thousand links does not lock up the browser.
 */
export function summarizePage(doc: Document = document): PageSummary {
    const anchors = Array.from(doc.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const limit = Math.min(anchors.length, 600);

    const chapterLinks: string[] = [];
    for (let index = 0; index < limit; index += 1) {
        const anchor = anchors[index];
        if (!anchor) continue;
        if (!looksLikeChapter(anchor)) continue;
        const href = anchor.href;
        if (!href || href.startsWith("javascript:")) continue;
        if (chapterLinks.length < 200) chapterLinks.push(href);
    }

    return {
        url: doc.location?.href ?? "",
        title: doc.title ?? "",
        linkCount: anchors.length,
        chapterLinks,
        // A table of contents has many chapter-like links relative to its
        // total link count. The ratio matters more than the absolute number:
        // a single-chapter page with twelve links is not a table of contents.
        looksLikeToc: chapterLinks.length >= 5 && chapterLinks.length * 2 >= anchors.length,
    };
}

/**
 * Send the summary to the extension.
 *
 * The content script answers a request rather than pushing, so the popup
 * gets a fresh summary for the page it was opened on, with no stale data.
 */
function respondToSummaryRequest(
    message: unknown,
    sender: unknown,
    sendResponse: (response?: unknown) => void,
): boolean {
    void sender;
    if (!message || typeof message !== "object") return false;
    const type = (message as { type?: unknown }).type;
    if (type !== "kintsugi:page-summary") return false;

    try {
        sendResponse({ ok: true, summary: summarizePage() });
    } catch (error) {
        sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : "Could not read the page.",
        });
    }
    return true;
}

/** Install the listener. */
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener(respondToSummaryRequest);
} else if (typeof browser !== "undefined" && browser.runtime?.onMessage) {
    browser.runtime.onMessage.addListener(respondToSummaryRequest);
}
