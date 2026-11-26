/**
 * Reading the page the user is looking at.
 *
 * A novel site is not always the HTML the server sent. A great many of them
 * build their table of contents in the browser, and the markup that arrives
 * over the wire is an empty shell with a script tag in it. Fetching that
 * shell tells the extension nothing: there is no chapter list in it, so no
 * parser can find one, and the user is told the site is not supported while
 * looking at a perfectly good table of contents.
 *
 * So the extension reads the page the way the user sees it: it asks the
 * browser to run a small function in the tab, and the function hands back the
 * page's DOM as it is *now* — after the site's own scripts have filled it in.
 *
 * This is only ever a bonus. A page that is not open in a tab, a tab the
 * extension may not touch, and a browser that refuses the injection all end
 * the same way: the caller falls back to fetching the page itself. See
 * ADR-0033.
 */
import { getNamespace } from "./browser-api";
import { parseHtml } from "./net/fetch-client";

/**
 * The parts of an address that identify the page.
 *
 * The fragment is left out on purpose: it changes which part of the page is
 * showing, not which page it is, and the DOM is the same either way.
 */
function pageKey(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
        return undefined;
    }
}

/**
 * Find the tab that is showing a page.
 *
 * The tab's address is only visible to the extension when the extension is
 * allowed to read that site — which it is, either because the user granted
 * access to it or because the user invoked the extension from that tab. So
 * the answer is empty whenever the extension could not have read the page
 * anyway, and the caller falls back to fetching it.
 *
 * @param url The page's address.
 * @returns The tab's ID, or `undefined` when no tab is showing that page.
 */
export async function findTabForUrl(url: string): Promise<number | undefined> {
    const wanted = pageKey(url);
    if (!wanted) return undefined;

    const api = getNamespace();
    if (!api) return undefined;

    let tabs: Array<{ id?: number; url?: string; lastAccessed?: number }>;
    try {
        tabs = await api.tabs.query({});
    } catch {
        return undefined;
    }

    // The most recently used tab wins when several are showing the same
    // page: it is the one the user is looking at.
    let best: { id?: number; lastAccessed?: number } | undefined;
    for (const tab of tabs) {
        if (tab.id === undefined || !tab.url) continue;
        if (pageKey(tab.url) !== wanted) continue;
        if (!best || (tab.lastAccessed ?? 0) > (best.lastAccessed ?? 0)) {
            best = tab;
        }
    }
    return best?.id;
}

/**
 * Read a tab's DOM, as the user sees it.
 *
 * The function that runs in the page returns the page's markup and nothing
 * else. It runs in the page's own world, so it sees the DOM the site's
 * scripts have built — not the HTML the server sent.
 *
 * @param tabId The tab to read.
 * @returns The page's markup, or `undefined` when it could not be read.
 */
export async function readLivePageHtml(tabId: number): Promise<string | undefined> {
    const api = getNamespace();
    if (!api?.scripting) return undefined;
    try {
        const results = await api.scripting.executeScript({
            target: { tabId },
            func: () => document.documentElement?.outerHTML ?? "",
        });
        // The browser wraps the function's return value in an injection result.
        const html = results?.[0]?.result;
        return typeof html === "string" && html.length > 0 ? html : undefined;
    } catch {
        // The tab may have closed, may be a page the extension may not touch,
        // or may be on a special page the browser will not inject into. None
        // of those are failures: the caller fetches the page instead.
        return undefined;
    }
}

/**
 * Read the DOM of the tab showing a page.
 *
 * The document is given a base URL, so that a chapter link written as
 * `/chapter/7` resolves against the page it was found on — exactly as it
 * would have in the page itself. Without it, every relative link would point
 * at the extension's own pages.
 *
 * @param url The page's address.
 * @returns The page's DOM, or `undefined` when it could not be read.
 */
export async function readLivePageDom(url: string): Promise<Document | undefined> {
    const tabId = await findTabForUrl(url);
    if (tabId === undefined) return undefined;

    const html = await readLivePageHtml(tabId);
    if (!html) return undefined;

    try {
        return parseHtml(html, url);
    } catch {
        return undefined;
    }
}
