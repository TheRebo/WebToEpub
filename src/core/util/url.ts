/**
 * URL helpers.
 *
 * Small, pure functions about addresses: what a host is called, and what a
 * typed address means. They live apart from the pages that use them, so they
 * can be tested without a browser and so there is one answer to "is this a web
 * address?" rather than one per page.
 */

/**
 * Turn what the user typed into a usable web address.
 *
 * The user types an address by hand, so it may be missing its scheme, or have
 * spaces around it, or be nothing at all. Anything that is not a web address
 * is rejected here rather than being turned into a confusing network error
 * later on.
 *
 * @param raw What the user typed.
 * @returns The address, or `undefined` when it is not one.
 */
export function normaliseStoryUrl(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
        if (!url.hostname) return undefined;
        return url.href;
    } catch {
        return undefined;
    }
}

/**
 * The host name of a URL, without a leading `www.`.
 *
 * @param url The URL.
 * @returns The host name, or an empty string when the URL cannot be read.
 */
export function hostNameOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

/**
 * A URL with its query string and fragment removed.
 *
 * A URL's query string often carries a session token, a signature, or an
 * identifier for the account that is signed in. None of that helps anybody
 * read a message, and all of it is a secret that has no business being
 * written into an error, a log, or an exported book.
 *
 * The path is kept: it is what tells the reader which page or chapter the
 * URL was about.
 *
 * @param url The URL.
 * @returns The safe URL, or `undefined` when the URL cannot be read.
 */
export function redactUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const parsed = new URL(url);
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString();
    } catch {
        // A URL that will not parse is not worth showing, and passing it
        // through unchanged risks leaking whatever it holds.
        return undefined;
    }
}
