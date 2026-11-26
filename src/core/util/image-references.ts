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
 * descriptor is optional, and a URL may itself contain a comma, so the parsing
 * follows the HTML specification's rule: the value is split on whitespace
 * first, and the commas are read afterwards. A token that ends with a comma
 * closes the candidate it belongs to.
 *
 * @param srcset The attribute's value.
 * @returns The candidates, in the order they appear.
 */
export function parseSrcset(srcset: string | null): SrcsetCandidate[] {
    if (!srcset) return [];
    const candidates: SrcsetCandidate[] = [];

    // The tokens are worked through as a queue, because a descriptor and the
    // next candidate's URL can share a token when the author left out the
    // space after the comma: `a.png 1x,b.png 2x`.
    const queue = srcset.split(/[\t\n\f\r ]+/).filter((token) => token.length > 0);

    while (queue.length > 0) {
        const url = queue.shift() as string;

        // A URL that ends with a comma closes the candidate: it has no
        // descriptor of its own.
        if (url.endsWith(",")) {
            const trimmed = url.replace(/,+$/, "");
            if (trimmed) candidates.push({ url: trimmed, descriptor: "" });
            continue;
        }

        const next = queue[0];
        if (next === undefined) {
            candidates.push({ url, descriptor: "" });
            continue;
        }

        if (next.includes(",")) {
            // The descriptor and the next candidate share a token.
            const comma = next.indexOf(",");
            const descriptor = next.slice(0, comma);
            const remainder = next.slice(comma + 1);
            queue.shift();
            if (remainder) queue.unshift(remainder);
            candidates.push({ url, descriptor });
            continue;
        }

        if (next.endsWith(",")) {
            queue.shift();
            candidates.push({ url, descriptor: next.replace(/,+$/, "") });
            continue;
        }

        queue.shift();
        candidates.push({ url, descriptor: next });
    }

    return candidates;
}

/**
 * Pick the candidate to use from a `srcset`.
 *
 * A `srcset` lists the same picture at several sizes. Only one of them can go
 * into the book: a book that carries every size of every picture is several
 * times larger than it needs to be.
 *
 * @param candidates The candidates, in the order they appear.
 * @param preferHighestResolution Whether the largest candidate is preferred.
 *   When it is not, the first candidate is used, which is the one a browser
 *   falls back to.
 * @returns The candidate to use, or `undefined` when there are none.
 */
export function pickSrcsetCandidate(
    candidates: readonly SrcsetCandidate[],
    preferHighestResolution: boolean,
): SrcsetCandidate | undefined {
    const first = candidates[0];
    if (first === undefined) return undefined;
    if (!preferHighestResolution) return first;
    return pickLargest(candidates);
}

/**
 * The largest of a set of candidates.
 *
 * A `srcset` uses one kind of descriptor throughout: either widths (`640w`) or
 * densities (`2x`). The two are compared separately, because a width and a
 * density are not comparable numbers. A set with no usable descriptor falls
 * back to the last candidate, which is the rule browsers use.
 */
function pickLargest(candidates: readonly SrcsetCandidate[]): SrcsetCandidate {
    const widths = candidates.map((candidate) => parseWidth(candidate.descriptor));
    if (widths.every((width) => width !== undefined)) {
        return largestOf(candidates, widths as number[]);
    }

    const densities = candidates.map((candidate) => parseDensity(candidate.descriptor));
    if (densities.every((density) => density !== undefined)) {
        return largestOf(candidates, densities as number[]);
    }

    const last = candidates[candidates.length - 1];
    return last ?? (candidates[0] as SrcsetCandidate);
}

/**
 * The candidate with the largest of a set of numbers.
 *
 * The first of equally large numbers wins, so the result does not depend on
 * the order the candidates happened to be written in.
 */
function largestOf(candidates: readonly SrcsetCandidate[], values: number[]): SrcsetCandidate {
    let best = 0;
    for (let index = 1; index < values.length; index += 1) {
        if ((values[index] as number) > (values[best] as number)) best = index;
    }
    return candidates[best] as SrcsetCandidate;
}

/** The width a `w` descriptor describes, if it is one. */
function parseWidth(descriptor: string): number | undefined {
    const match = /^(\d+(?:\.\d+)?)w$/.exec(descriptor.trim());
    if (!match) return undefined;
    return Number(match[1]);
}

/** The density an `x` descriptor describes, if it is one. */
function parseDensity(descriptor: string): number | undefined {
    const match = /^(\d+(?:\.\d+)?)x$/.exec(descriptor.trim());
    if (!match) return undefined;
    return Number(match[1]);
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

/**
 * The information the rewriter needs about a packaged image.
 */
export interface PackagedImage {
    /** The image's original URL. */
    url: string;
    /** The image's media type. */
    mediaType: string;
}

/**
 * Rewrite a document's image references to point at the packaged images.
 *
 * Both the download manager and the packer need this, and they need it to
 * agree: a reference the manager rewrote must not be rewritten again, and one
 * the manager left alone must not be changed by the packer. The logic lives
 * here so that there is only one copy of it.
 *
 * A reference that is not in the book is removed rather than left pointing at
 * the site's own servers. A reader that cannot reach the site shows a broken
 * picture, and one that can tries to load the image from the network every
 * time the chapter is opened.
 *
 * An image that is *self-contained* — a `data:` URL — is left alone: it carries
 * its own bytes, so it reaches out to nothing, and it is already valid where
 * it stands.
 *
 * @param document The document to rewrite, in place.
 * @param images The packaged images, keyed by their original URL.
 * @param baseUrl The chapter's URL, used to resolve relative references.
 * @param hrefFor The reference a packaged image is reached by.
 * @returns Whether anything was changed.
 */
export function rewriteImageElements(
    document: Document,
    images: Map<string, PackagedImage>,
    baseUrl: string,
    hrefFor: (image: PackagedImage) => string,
): boolean {
    let changed = false;

    /** The packaged image a reference points at, if it points at one. */
    const packaged = (value: string): PackagedImage | undefined => {
        const absolute = resolveUrl(value, baseUrl);
        return absolute ? images.get(absolute) : undefined;
    };

    const format = (url: string, descriptor: string): string =>
        descriptor ? `${url} ${descriptor}` : url;

    for (const image of document.querySelectorAll("img")) {
        const src = image.getAttribute("src");
        // A reference that already points at a packaged image is left exactly
        // as it is: rewriting it again would point it at the site instead.
        const srcImage = src && !isPackagedReference(src) ? packaged(src) : undefined;

        const srcset = image.getAttribute("srcset");
        const candidates = srcset === null ? [] : parseSrcset(srcset);
        const kept: string[] = [];
        let firstKept: PackagedImage | undefined;

        for (const candidate of candidates) {
            // A reference that already points at a packaged image is left
            // exactly as it is.
            if (isPackagedReference(candidate.url)) {
                kept.push(format(candidate.url, candidate.descriptor));
                continue;
            }
            const found = packaged(candidate.url);
            if (!found) continue;
            firstKept = firstKept ?? found;
            kept.push(format(hrefFor(found), candidate.descriptor));
        }

        if (srcset !== null) {
            if (kept.length === 0) {
                // Nothing in this `srcset` is in the book, so the attribute is
                // dropped: leaving it would point the reader at the site.
                image.removeAttribute("srcset");
                changed = true;
            } else {
                const rewritten = kept.join(", ");
                if (rewritten !== srcset) {
                    image.setAttribute("srcset", rewritten);
                    changed = true;
                }
            }
        }

        if (srcImage) {
            const href = hrefFor(srcImage);
            if (image.getAttribute("src") !== href) {
                image.setAttribute("src", href);
                changed = true;
            }
        } else if (firstKept) {
            // An image whose `src` was not packaged but whose `srcset` was
            // needs its `src` pointed at the packaged file, because a reader
            // is free to ignore `srcset`.
            const href = hrefFor(firstKept);
            if (image.getAttribute("src") !== href) {
                image.setAttribute("src", href);
                changed = true;
            }
        } else if (src !== null && !isPackagedReference(src) && isFetchable(src, baseUrl)) {
            // Nothing about this image is in the book. The element is removed
            // rather than left pointing at the site's own servers: a reader
            // that can reach the site would fetch the picture from the network
            // every time the chapter is opened, and one that cannot shows a
            // broken picture.
            removeImageElement(image);
            changed = true;
        }
    }

    for (const source of document.querySelectorAll("source")) {
        const srcset = source.getAttribute("srcset");
        if (srcset === null) continue;

        const candidates = parseSrcset(srcset);
        const kept: string[] = [];
        for (const candidate of candidates) {
            if (isPackagedReference(candidate.url)) {
                kept.push(format(candidate.url, candidate.descriptor));
                continue;
            }
            const found = packaged(candidate.url);
            if (!found) continue;
            kept.push(format(hrefFor(found), candidate.descriptor));
        }

        if (kept.length === 0) {
            // A `<source>` with nothing to offer is removed. A `<picture>`
            // whose sources are all gone still works: the `<img>` inside it is
            // what a reader falls back to.
            source.remove();
            changed = true;
            continue;
        }
        const rewritten = kept.join(", ");
        if (rewritten !== srcset) {
            source.setAttribute("srcset", rewritten);
            changed = true;
        }
    }

    return changed;
}

/**
 * Whether a reference is one the extension would fetch.
 *
 * A `data:` URL carries its own bytes and reaches out to nothing, so it is
 * left alone: it is already self-contained, and removing it would throw away
 * a picture that the reader can show.
 *
 * @param value The reference.
 * @param baseUrl The chapter's URL, used to resolve relative references.
 * @returns Whether the reference points at something on the network.
 */
function isFetchable(value: string, baseUrl: string): boolean {
    return resolveUrl(value, baseUrl) !== undefined;
}

/**
 * Remove an image element, and the `<picture>` around it if it is left empty.
 *
 * A `<picture>` exists to offer an image to a reader that can use it; with
 * its image gone it is just an empty box.
 *
 * @param element The image to remove.
 */
function removeImageElement(element: Element): void {
    const picture = element.closest("picture");
    element.remove();
    if (picture && !picture.querySelector("img")) picture.remove();
}
