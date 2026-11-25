/**
 * Image references in a chapter's markup.
 *
 * A chapter can point at an image in three ways: an `<img>`'s `src`, an
 * `<img>`'s `srcset`, and a `<source>`'s `srcset`. All of them are rewritten
 * to point at the copy that goes into the book, so that a chapter does not
 * reach out to the site's own servers once it is on a device that cannot.
 *
 * The parsing is done on the parsed document rather than on the text, so an
 * attribute value that merely *contains* a URL is left alone.
 */

/** One candidate from a `srcset` attribute. */
export interface SrcsetCandidate {
    /** The candidate's URL. */
    url: string;
    /** The candidate's descriptor, e.g. `2x` or `640w`. */
    descriptor: string;
}

/**
 * Parse a `srcset` attribute into its candidates.
 *
 * The format is a comma-separated list of `url descriptor` pairs. The
 * descriptor is optional, and a URL may itself contain a comma, so the
 * parsing follows the HTML specification's rule: split on whitespace first,
 * then treat the first token as the URL only when it is not itself a
 * descriptor.
 *
 * @param srcset The attribute's value.
 * @returns The candidates, in the order they appear.
 */
export function parseSrcset(srcset: string | null): SrcsetCandidate[] {
    if (!srcset) return [];
    const candidates: SrcsetCandidate[] = [];

    for (const part of srcset.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const space = trimmed.indexOf(" ");
        if (space === -1) {
            candidates.push({ url: trimmed, descriptor: "" });
            continue;
        }
        candidates.push({
            url: trimmed.slice(0, space),
            descriptor: trimmed.slice(space + 1).trim(),
        });
    }
    return candidates;
}

/**
 * Resolve a possibly relative URL against a base.
 *
 * Only HTTP and HTTPS are ever fetched. A `javascript:` or `data:` URL in an
 * image's `src` is a script injection attempt, so it is refused here rather
 * than further down, where it would be harder to see.
 *
 * @param value The URL to resolve.
 * @param baseUrl The URL to resolve it against.
 * @returns The absolute URL, or `undefined` when it cannot be resolved or is
 *   not a URL the extension will fetch.
 */
export function resolveUrl(value: string, baseUrl: string): string | undefined {
    try {
        const resolved = new URL(value, baseUrl);
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
        return resolved.href;
    } catch {
        return undefined;
    }
}

/**
 * Whether a reference already points at a packaged image.
 *
 * A packaged image lives in the container's images directory, and a chapter
 * refers to it by a relative path. Rewriting such a reference again would
 * point it at the site instead.
 *
 * @param value The reference.
 * @returns Whether it is already a packaged image.
 */
export function isPackagedReference(value: string): boolean {
    return value.startsWith("../images/") || value.startsWith("images/");
}
