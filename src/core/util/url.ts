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
