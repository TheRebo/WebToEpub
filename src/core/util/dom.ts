/**
 * DOM helpers.
 *
 * These replace the baseline's `Util.js`, which was a grab-bag of ambient
 * functions with no types, no error handling, and several known defects.
 * Everything here is explicit about what it mutates.
 *
 * The baseline's `util.sanitize` used DOMPurify; the equivalent here is in
 * `core/util/sanitize.ts`, because sanitisation is a security boundary and
 * deserves to be findable.
 */

/** A chapter link, as the parsers produce it. */
export interface ChapterLink {
    /** The absolute URL of the chapter. */
    sourceUrl: string;
    /** The human-readable title. */
    title: string;
    /**
     * Whether the chapter should be included by default.
     *
     * `false` marks a paywalled, VIP, or otherwise locked chapter: it appears
     * in the UI unchecked, so a run does not fail on it, but a user who has
     * unlocked it can still select it by hand.
     */
    isIncludeable?: boolean;
}

/** Remove every element in a list from its parent. */
export function removeElements(nodes: ArrayLike<Element> | null | undefined): void {
    if (!nodes) return;
    for (const node of Array.from(nodes)) {
        node.remove();
    }
}

/** Remove every descendant of `element` matching `selector`. */
export function removeChildElementsMatchingSelector(element: Element, selector: string): void {
    if (!element) return;
    removeElements(element.querySelectorAll(selector));
}

/** Strip HTML comments from a node and its descendants. */
export function removeComments(node: Node): void {
    const comments: Node[] = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT);
    while (walker.nextNode()) comments.push(walker.currentNode as Node);
    for (const comment of comments) comment.parentNode?.removeChild(comment);
}

/** Remove empty `<div>` elements, repeatedly, until none remain. */
export function removeEmptyDivElements(element: Element): void {
    let changed = true;
    while (changed) {
        changed = false;
        for (const div of Array.from(element.querySelectorAll("div"))) {
            if (div.textContent?.trim() || div.children.length > 0) continue;
            div.remove();
            changed = true;
        }
    }
}

/** Remove leading whitespace text nodes from an element. */
export function removeLeadingWhiteSpace(element: Element): void {
    const first = element.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE && first.textContent?.trim() === "") {
        first.remove();
    }
}

/** Remove trailing whitespace text nodes from an element. */
export function removeTrailingWhiteSpace(element: Element): void {
    const last = element.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE && last.textContent?.trim() === "") {
        last.remove();
    }
}

/** Move every child of `source` into `target`. */
export function moveChildElements(source: Element, target: Element): void {
    while (source.firstChild) target.appendChild(source.firstChild);
}

/**
 * Remove the standard WordPress sharing and metadata cruft.
 *
 * The baseline's version missed several selectors that WordPress themes
 * commonly emit, so share buttons survived into the EPUB.
 */
export function removeUnwantedWordpressElements(element: Element): void {
    const selectors = [
        ".sharedaddy",
        ".sd-sharing-enabled",
        ".shareaholic-canvas",
        ".sharebutton",
        ".social-sharing",
        ".share-buttons",
        ".wp-block-share",
        ".yarpp-related",
        ".jp-relatedposts",
        ".post-meta",
        ".post-views",
        ".entry-meta",
        ".entry-footer",
        ".wp-caption-text",
        ".comments",
        ".comment-respond",
        ".navigation",
        ".post-navigation",
        ".breadcrumbs",
        ".author-bio",
        ".author-info",
        ".sidebar",
        ".related-posts",
    ];
    removeChildElementsMatchingSelector(element, selectors.join(", "));
}

/** Remove social-sharing links from an element. */
export function removeShareLinkElements(element: Element): void {
    removeChildElementsMatchingSelector(
        element,
        [
            "a[href*='facebook.com/sharer']",
            "a[href*='twitter.com/intent']",
            "a[href*='pinterest.com/pin']",
            "a[href*='linkedin.com/share']",
            "a[href*='reddit.com/submit']",
            "a[href*='telegram.me/share']",
            "a[href*='whatsapp.com/share']",
            "a[href*='vk.com/share']",
            "a[href*='weibo.com']",
            ".share-button",
            ".sharing",
        ].join(", "),
    );
}

/**
 * Find the first image source within a container.
 *
 * Returns `null` when there is no image, so the caller can distinguish
 * "no cover" from "cover with an unknown URL".
 */
export function getFirstImgSrc(dom: Document, containerSelector: string): string | null {
    const container = dom.querySelector(containerSelector);
    const img = container?.querySelector("img");
    const src = img?.getAttribute("src") ?? img?.getAttribute("data-src");
    return src || null;
}

/**
 * Convert a `<pre>` block into `<p>` elements.
 *
 * Some sites render a chapter's paragraphs inside a `<pre>` for
 * whitespace preservation. Keeping the `<pre>` produces a monospaced block
 * in the EPUB that does not reflow, so the paragraphs are split out.
 */
export function convertPreTagToPTags(dom: Document, preElement: Element, delimiter = "\n"): void {
    const text = preElement.textContent ?? "";
    const lines = text.split(delimiter);
    const fragment = dom.createDocumentFragment();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const p = dom.createElement("p");
        p.textContent = trimmed;
        fragment.appendChild(p);
    }
    if (fragment.childNodes.length > 0) {
        preElement.replaceWith(fragment);
    } else {
        preElement.remove();
    }
}

/**
 * Convert the hyperlinks inside an element into a chapter list.
 *
 * This is the parser contract's most-used helper. Unlike the baseline's
 * version, it filters out links that are not usable as chapters (empty text,
 * or a `javascript:` target) instead of passing them downstream.
 */
export function hyperlinksToChapterList(element: Element): ChapterLink[] {
    if (!element) return [];
    const chapters: ChapterLink[] = [];
    for (const anchor of Array.from(element.querySelectorAll("a"))) {
        const chapter = hyperLinkToChapter(anchor);
        if (chapter) chapters.push(chapter);
    }
    return chapters;
}

/** Convert a single anchor into a chapter, or `null` if it is not usable. */
export function hyperLinkToChapter(anchor: Element): ChapterLink | null {
    const href = anchor.getAttribute("href");
    if (!href) return null;
    const trimmed = href.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) return null;
    if (/^(javascript|mailto|tel):/i.test(trimmed)) return null;

    const title = (anchor.textContent ?? "").trim();
    return { sourceUrl: trimmed, title };
}

/**
 * Resolve a possibly-relative URL against a base.
 *
 * Returns `null` for a URL that cannot be resolved, so a parser never hands
 * a broken URL to the fetcher.
 */
export function resolveUrl(url: string, base: string): string | null {
    try {
        return new URL(url, base).href;
    } catch {
        return null;
    }
}

/**
 * Extract the text of an element, with whitespace normalised.
 */
export function elementText(element: Element | null | undefined): string {
    if (!element) return "";
    return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}
