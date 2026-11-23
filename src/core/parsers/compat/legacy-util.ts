/**
 * The legacy `util` shim.
 *
 * The 437 site parsers that are the product's core asset are legacy
 * JavaScript. They call a single ambient global — `util` — with around
 * ninety helper functions, most of which are untyped and several of which
 * are surprising.
 *
 * This module is that global, reimplemented in TypeScript. It is a
 * *compatibility* layer, not a redesign: where the legacy behaviour is odd,
 * the odd behaviour is preserved and explained, because a parser that
 * depends on it is a parser that must keep working.
 *
 * Where the rewrite already has a better implementation of the same idea
 * (`core/util/dom.ts`, `core/util/sanitize.ts`), that implementation is
 * reused. Where the two genuinely disagree — `normalizeUrlForCompare`,
 * `safeForFileName`, `isNullOrEmpty`, `getFirstImgSrc` — the **legacy**
 * semantics win, because the parsers were written against them.
 *
 * The legacy source is `plugin/js/Util.js` on the `legacy` branch.
 */

"use strict";

import {
    convertPreTagToPTags,
    moveChildElements,
    removeChildElementsMatchingSelector,
    removeComments,
    removeElements,
    removeEmptyDivElements,
    removeLeadingWhiteSpace,
    removeShareLinkElements as removeModernShareLinkElements,
    removeTrailingWhiteSpace,
    removeUnwantedWordpressElements as removeModernUnwantedWordpressElements,
} from "../../util/dom";
import { sanitizeHtml } from "../../util/sanitize";
import type { ParserUtilities } from "../parser";

/**
 * A chapter as the legacy `util` produced it.
 *
 * The legacy shape carries a `newArc` key — an "arc" is a grouping the
 * table of contents used to carry (a volume, a book, an arc of a serial),
 * and the legacy `Parser` used it to insert arc headings into the EPUB.
 * The rewrite has no concept of arcs, but the key must still be present,
 * because legacy parsers read `chapter.newArc` directly.
 */
interface LegacyChapter {
    /** The absolute URL of the chapter. */
    sourceUrl: string;
    /** The chapter's title. */
    title: string;
    /** The arc this chapter starts, or `null` when there is none. */
    newArc: unknown;
    /** Whether the chapter is included by default. */
    isIncludeable?: boolean;
}

/**
 * The legacy `util` object.
 *
 * It extends the modern `ParserUtilities` contract, so it can be handed to
 * a parser unchanged, and adds the rest of the legacy surface.
 */
interface LegacyUtil extends ParserUtilities {
    /** The XHTML namespace. */
    XMLNS: string;
    /** The tags the legacy code treats as inline. */
    INLINE_ELEMENTS: string[];
    /** The tags the legacy code treats as block-level. */
    BLOCK_ELEMENTS: string[];
    /** The heading tags, h1 through h6. */
    HEADER_TAGS: string[];

    /* The chapter-list helpers carry the legacy shape, not the modern one. */
    hyperlinksToChapterList(
        element: Element,
        isChapterPredicate?: (link: Element) => boolean,
        getChapterArc?: (link: Element) => unknown,
    ): LegacyChapter[];
    hyperLinkToChapter(anchor: Element, newArc?: unknown): LegacyChapter;

    /* Legacy-only members. */
    sleep(ms: number): Promise<void>;
    getSleepController(): AbortController;
    resetSleepController(): void;
    randomInteger(min: number, max: number): number;
    isFirefox(): boolean;
    extensionVersion(): string;
    createEmptyXhtmlDoc(): Document;
    createEmptyHtmlDoc(): Document;
    populateHead(doc: Document, head: Element): void;
    createSvgImageElement(
        href: string,
        width: number,
        height: number,
        origin: string,
        includeImageSourceUrl: boolean,
    ): Element;
    clearIfDataUri(content: string): string;
    resolveRelativeUrl(baseUrl: string, relativeUrl: string): string;
    log(arg?: unknown): void;
    extractHostName(url: string): string;
    extractFilename(hyperlink: URL): string;
    extractFilenameFromUrl(url: string): string | undefined;
    getParamFromUrl(url: string, paramName: string): string | null;
    setBaseTag(url: string, dom: Document): void;
    decodeCloudflareProtectedEmails(content: Element): void;
    replaceCloudflareProtectedLink(link: Element): void;
    decodeEmail(encodedString: string): string;
    removeHTMLUnknownElement(nodes: Node): void;
    removeScriptableElements(element: Element): void;
    removeMicrosoftWordCrapElements(element: Element): void;
    flattenNode(node: Node): void;
    removeEventHandlers(contentElement: Element): void;
    removeHeightAndWidthStyleFromParents(element: Element): void;
    removeHeightAndWidthStyle(element: Element): void;
    prepForConvertToXhtml(element: Element): void;
    replaceCenterTags(element: Element): void;
    replaceUnderscoreTags(element: Element): void;
    replaceSTags(element: Element): void;
    convertElement(element: Element, replacement: Element): void;
    copyAttributes(from: Element, to: Element): void;
    fixDelayLoadedImages(element: Element, delayAttrib: string): void;
    fixBlockTagsNestedInInlineTags(contentElement: Element): void;
    isBlockElementInside(inlineElement: Element): boolean;
    moveElementsOutsideTag(inlineElement: Element): void;
    isNodeInTag(tags: string[], node: Node): boolean;
    isInlineElement(node: Node): boolean;
    isBlockElement(node: Node): boolean;
    makeRelative(href: string): string;
    makeStorageFileName(
        subdirectory: string,
        index: number,
        title: string,
        extension: string,
    ): string;
    extractHashFromUri(uri: string): string | null;
    makeHyperlinksRelative(baseUri: string, content: Element): void;
    resolveLazyLoadedImages(content: Element, imgCss: string, attrName?: string): void;
    isLocalHyperlink(baseUri: string, link: Element): boolean;
    findPrimaryStyleSettings(element: Element, styleProperties: string[]): (string | undefined)[];
    removeStyleValue(element: Element, styleName: string, value?: string): void;
    setStyleToDefault(element: Element): void;
    removeUnusedHeadingLevels(contentElement: Element): void;
    wrapRawTextNode(node: Node): Node;
    removeTrailingSlash(url: string): string;
    removeAnchor(url: string): string;
    stripLeadingWww(hostName: string): string;
    createComment(doc: Document, content: string): Comment;
    addXmlDeclarationToStart(dom: Document): void;
    addXhtmlDocTypeToStart(dom: Document): void;
    iterateElements(root: Node, filter: (node: Node) => number, whatToShow?: number): Node[];
    getElement(
        dom: Document | Element,
        tagName: string,
        filter?: (element: Element) => boolean,
    ): Element | null;
    getElements(
        dom: Document | Element,
        tagName: string,
        filter?: (element: Element) => boolean,
    ): Element[];
    moveIfParent(element: Element, parentTag: string): Element;
    styleSheetFileName(): string;
    isStringWhiteSpace(s: string): boolean;
    isElementWhiteSpace(element: Node): boolean;
    isHeaderTag(node: Node): boolean;
    isUrl(string: string): boolean;
    isTextAreaField(element: Element): boolean;
    isTextInputField(element: Element): boolean;
    isXhtmlInvalid(xhtmlAsString: string, mimeType?: string): string | null;
    dctermsToTable(dom: Document): HTMLElement;
    parseHtmlAndInsertIntoContent(htmlText: string, content: Element, insertNodes?: boolean): void;
    extractUrlFromBackgroundImage(element: Element | null): string | null;
    extractSubstring(s: string, prefix: string | RegExp, suffix: string): string;
    findIndexOfClosingQuote(s: string, startIndex: number): number;
    findIndexOfClosingBracket(s: string, startIndex: number): number;
    locateAndExtractJson(s: string, prefix: string): unknown | null;
    createChapterTab(url: string): Promise<number>;
    syncLoadSampleDoc(fileName: string, url: string): Document;
    xmlToString(dom: Document): string;
    zeroPad(num: number): string;
    sanitize(dirty: string | Node): Document;
    sanitizeNode(dirty: Node): Node | null;
    removeAttributes(element: Element | null, attributeNames: string | string[] | null): void;
    removeEmptyAttributes(content: Element): void;
    removeSpansWithNoAttributes(content: Element): void;
    replaceSemanticInlineStylesWithTags(element: Element, removeLeftoverStyles?: boolean): void;
    wrapInnerContentInTag(element: Element, tagName: string): void;
    getDefaultExtensionByMime(mimeType: string): string | undefined;
    detectMimeType(b64: string): string | undefined;
}

/** The XHTML namespace used by the EPUB writer. */
const XMLNS = "http://www.w3.org/1999/xhtml";

/**
 * The tags the legacy code treats as inline.
 *
 * `<u>` and `<s>` are in this list even though they are not really inline
 * elements: the legacy code wanted them to survive the "block tag inside an
 * inline tag" repair as a single run of text.
 */
const INLINE_ELEMENTS = [
    "b",
    "big",
    "i",
    "small",
    "tt",
    "abbr",
    "acronym",
    "cite",
    "code",
    "dfn",
    "em",
    "kbd",
    "strong",
    "samp",
    "time",
    "var",
    "a",
    "bdo",
    "br",
    "img",
    "map",
    "object",
    "q",
    "script",
    "span",
    "sub",
    "sup",
    "button",
    "input",
    "label",
    "select",
    "textarea",
    "u",
    "s",
];

/** The tags the legacy code treats as block-level. */
const BLOCK_ELEMENTS = [
    "address",
    "article",
    "aside",
    "blockquote",
    "canvas",
    "dd",
    "div",
    "dl",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hgroup",
    "hr",
    "li",
    "main",
    "nav",
    "noscript",
    "ol",
    "output",
    "p",
    "pre",
    "section",
    "table",
    "tfoot",
    "ul",
    "video",
];

/** The heading tags, h1 through h6. */
const HEADER_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"];

/** The file extensions used for each MIME type. */
const MIME_TYPE_EXTENSIONS: Record<string, string[]> = {
    "image/jpeg": ["jpg", "jpeg", "jpe"],
    "image/png": ["png"],
    "image/gif": ["gif"],
    "image/webp": ["webp"],
    "image/bmp": ["bmp", "dib"],
    "image/tiff": ["tif", "tiff"],
    "image/svg+xml": ["svg"],
    "image/x-icon": ["ico"],
    "image/vnd.microsoft.icon": ["ico"],
    "image/heif": ["heif"],
    "image/heic": ["heic"],
    "image/x-xbitmap": ["xbm"],
    "image/x-portable-bitmap": ["pbm"],
    "image/x-portable-graymap": ["pgm"],
    "image/x-portable-pixmap": ["ppm"],
    "image/x-portable-anymap": ["pnm"],
    "image/x-cmu-raster": ["ras"],
    "image/x-tga": ["tga"],
    "image/jxr": ["jxr"],
    "image/ktx": ["ktx"],
    "image/apng": ["apng"],
    "image/avif": ["avif"],
};

/** The leading bytes that identify each image MIME type. */
const MIME_TYPE_SIGNATURES: Record<string, string[]> = {
    "/9j/": ["image/jpeg"],
    "iVBORw0KGgo=": ["image/png", "image/apng"],
    R0lGODdh: ["image/gif"],
    R0lGODlh: ["image/gif"],
    UklGRg: ["image/webp"],
    "Qk0=": ["image/bmp"],
    "SUkqAA==": ["image/tiff"],
    "TU0AKg==": ["image/tiff"],
    "PD94bWw=": ["image/svg+xml"],
    "AAABAA==": ["image/x-icon", "image/vnd.microsoft.icon"],
    ZnR5cGhlaWZj: ["image/heif"],
    "ZnR5cG1pZjE=": ["image/heif"],
    ZnR5cGhlaWNj: ["image/heic"],
    SUm8: ["image/jxr"],
    "q0tUWCAxMb0NCgo=": ["image/ktx"],
    "AAACAA==": ["image/x-tga"],
    "ZnR5cGF2aWY=": ["image/avif"],
    UDAx: ["image/x-portable-bitmap"],
    UDAy: ["image/x-portable-graymap"],
    UDAz: ["image/x-portable-pixmap"],
    UDA0: ["image/x-portable-anymap"],
    "WaZqlQ==": ["image/x-cmu-raster"],
};

/**
 * The abort controller the throttling `sleep` shares.
 *
 * Replacing it (`resetSleepController`) cancels every pending sleep, which
 * is how the legacy download manager woke a stalled run up.
 */
let sleepController = new AbortController();

/**
 * The text of an element, with a fallback for environments without
 * `innerText`.
 *
 * `innerText` is not implemented by every DOM (notably `happy-dom`, which
 * the test-suite runs under), and the legacy code used it in several
 * places. Where the legacy code used `innerText`, this helper is used
 * instead, so behaviour degrades to "all the text" instead of crashing.
 */
function textOf(node: Element | null | undefined): string {
    if (!node) return "";
    const innerText = (node as { innerText?: string }).innerText;
    if (typeof innerText === "string") return innerText;
    return node.textContent ?? "";
}

/**
 * The document a node belongs to.
 *
 * `ownerDocument` is typed as nullable, but a node that is in the tree
 * always has one; the global `document` is the fallback.
 */
function ownerDocumentOf(node: Node): Document {
    return node.ownerDocument ?? document;
}

/**
 * The inline style of an element.
 *
 * `style` only exists on `HTMLElement` and `SVGElement`, but the legacy
 * code applied it to whatever it was given.
 */
function styleOf(element: Element | null | undefined): CSSStyleDeclaration | undefined {
    if (!element) return undefined;
    return (element as unknown as { style?: CSSStyleDeclaration }).style;
}

/**
 * The value of a style property, addressed by its JavaScript name.
 *
 * The legacy code used `style["fontSize"]`; the CSSOM also exposes
 * `style["font-size"]`, but the two spellings are not interchangeable, so
 * the camelCase spelling the legacy code used is the one that is read.
 */
function styleValue(style: CSSStyleDeclaration | undefined, property: string): string {
    if (!style) return "";
    const value = (style as unknown as Record<string, unknown>)[property];
    return typeof value === "string" ? value : "";
}

/**
 * The CSS name of a camelCase style property.
 *
 * `fontSize` becomes `font-size`, which is what `removeProperty` wants.
 */
function cssPropertyName(property: string): string {
    return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/**
 * Sleep for a while, unless the sleep is cancelled.
 *
 * The sleep is aborted by the shared `sleepController`, which is how a
 * stalled download is woken up.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        // The timer is held in an object, because the abort handler can run
        // before the timer is created.
        const handle: { timer?: ReturnType<typeof setTimeout> } = {};
        function finished(): void {
            if (handle.timer !== undefined) clearTimeout(handle.timer);
            sleepController.signal.removeEventListener("abort", finished);
            resolve();
        }
        // Catch delayed requests that are aborted before the timer fires.
        if (sleepController.signal.aborted) {
            return finished();
        }
        handle.timer = setTimeout(finished, ms);
        sleepController.signal.addEventListener("abort", finished);
    });
}

/**
 * Replace the sleep controller, cancelling every pending sleep.
 */
function resetSleepController(): void {
    sleepController = new AbortController();
}

/**
 * A random integer in the inclusive range `[min, max]`.
 */
function randomInteger(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Whether the extension is running under Firefox.
 *
 * Brave reports itself as Chrome, and old Chrome has no `browser` global,
 * so both are reported as "not Firefox".
 */
function isFirefox(): boolean {
    const nav = typeof navigator === "undefined" ? undefined : navigator;
    const brave = (nav as (Navigator & { brave?: { isBrave?: boolean } }) | undefined)?.brave;
    if (brave?.isBrave) return false;

    const browserApi = (globalThis as { browser?: { runtime?: { PlatformNaclArch?: unknown } } })
        .browser;
    if (browserApi === undefined) return false;

    // The legacy code read `browser.runtime.PlatformNaclArch` unguarded,
    // which threw when `browser` existed but had no `runtime`.
    const runtime = browserApi.runtime;
    if (runtime === undefined) return false;
    return runtime.PlatformNaclArch === undefined;
}

/**
 * The extension's version, or `"unknown"` outside the extension.
 */
function extensionVersion(): string {
    if (typeof chrome === "undefined" || typeof chrome.runtime === "undefined") {
        return "unknown";
    }
    try {
        return chrome.runtime.getManifest().version;
    } catch {
        return "unknown";
    }
}

/**
 * Create an empty XHTML document, with the EPUB stylesheet linked in.
 */
function createEmptyXhtmlDoc(): Document {
    const doc = document.implementation.createDocument(XMLNS, "", null);
    addXhtmlDocTypeToStart(doc);
    const htmlNode = doc.createElementNS(XMLNS, "html");
    doc.appendChild(htmlNode);
    const head = doc.createElementNS(XMLNS, "head");
    htmlNode.appendChild(head);
    head.appendChild(doc.createElementNS(XMLNS, "title"));
    populateHead(doc, head);
    const body = doc.createElementNS(XMLNS, "body");
    htmlNode.appendChild(body);
    return doc;
}

/**
 * Add the EPUB stylesheet link to a document's head.
 */
function populateHead(doc: Document, head: Element): void {
    const style = doc.createElementNS(XMLNS, "link");
    head.appendChild(style);
    style.setAttribute("href", makeRelative(styleSheetFileName()));
    style.setAttribute("type", "text/css");
    style.setAttribute("rel", "stylesheet");
}

/**
 * Create an empty HTML document, with the EPUB stylesheet linked in.
 */
function createEmptyHtmlDoc(): Document {
    const doc = document.implementation.createHTMLDocument("") as HTMLDocument;
    const head = doc.head ?? doc.querySelector("head");
    if (head) populateHead(doc, head);
    return doc;
}

/**
 * Wrap an image in an SVG, so that the EPUB viewer scales it.
 *
 * The image's origin URL is kept as a comment (or a `<desc>` element) so
 * that the credit survives into the EPUB.
 */
function createSvgImageElement(
    href: string,
    width: number,
    height: number,
    origin: string,
    includeImageSourceUrl: boolean,
): Element {
    const svgNs = "http://www.w3.org/2000/svg";
    const xlinkNs = "http://www.w3.org/1999/xlink";
    const doc = createEmptyXhtmlDoc();
    const body = doc.getElementsByTagName("body")[0];
    const div = doc.createElementNS(XMLNS, "div");
    div.setAttribute("class", "svg_outer svg_inner");
    body?.appendChild(div);
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", xlinkNs);
    div.appendChild(svg);
    svg.setAttributeNS(null, "height", "99%");
    svg.setAttributeNS(null, "width", "100%");
    svg.setAttributeNS(null, "version", "1.1");
    svg.setAttributeNS(null, "preserveAspectRatio", "xMidYMid meet");
    svg.setAttributeNS(null, "viewBox", `0 0 ${width} ${height}`);
    const newImage = doc.createElementNS(svgNs, "image");
    svg.appendChild(newImage);
    newImage.setAttributeNS(xlinkNs, "xlink:href", makeRelative(href));
    newImage.setAttributeNS(null, "width", String(width));
    newImage.setAttributeNS(null, "height", String(height));
    const clearOrigin = clearIfDataUri(origin);
    if (includeImageSourceUrl) {
        const desc = doc.createElementNS(svgNs, "desc");
        svg.appendChild(desc);
        desc.appendChild(document.createTextNode(clearOrigin));
    } else {
        svg.appendChild(createComment(doc, clearOrigin));
    }
    return div;
}

/**
 * Blank out a `data:` URI.
 *
 * A base64 image is megabytes of text, and the legacy code kept the origin
 * of an image as a comment, which would have bloated the EPUB.
 */
function clearIfDataUri(content: string): string {
    return content && content.startsWith("data:") ? "" : content;
}

/**
 * Make a path relative to the EPUB's `Text` directory.
 *
 * The legacy code assumed the link was inside `OEBPS/Text` and the target
 * was inside `OEBPS/Images`, so it simply replaced the first five
 * characters.
 */
function makeRelative(href: string): string {
    return `..${href.substring(5)}`;
}

/**
 * Resolve a possibly-relative URL against a base URL.
 */
function resolveRelativeUrl(baseUrl: string, relativeUrl: string): string {
    return new URL(relativeUrl, baseUrl).href;
}

/**
 * The host name of a URL.
 */
function extractHostName(url: string): string {
    return new URL(url).hostname;
}

/**
 * The last path segment of a URL.
 */
function extractFilename(hyperlink: URL): string {
    const filename = hyperlink.pathname
        .split("/")
        .filter((part) => part !== "")
        .pop();
    return filename ?? "";
}

/**
 * The last path segment of a URL, given as a string.
 */
function extractFilenameFromUrl(url: string): string | undefined {
    return new URL(url).pathname
        .split("/")
        .filter((part) => part !== "")
        .pop();
}

/**
 * A query-string parameter of a URL.
 */
function getParamFromUrl(url: string, paramName: string): string | null {
    return new URL(url).searchParams.get(paramName);
}

/**
 * Set (or add) the `<base>` tag of a document.
 *
 * Without a base tag, relative links in a fetched page resolve against the
 * extension's own URL rather than the page's.
 */
function setBaseTag(url: string, dom: Document): void {
    if (dom == null) return;
    const tags = Array.from(dom.getElementsByTagName("base"));
    if (tags.length > 0) {
        tags[0]?.setAttribute("href", url);
    } else {
        const baseTag = dom.createElement("base");
        baseTag.setAttribute("href", url);
        const head = dom.getElementsByTagName("head")[0];
        head?.appendChild(baseTag);
    }
}

/**
 * Replace Cloudflare's obfuscated email addresses with the real ones.
 *
 * Cloudflare encodes an email address into a `data-cfemail` attribute (or
 * a hash) using a simple XOR cipher.
 */
function decodeCloudflareProtectedEmails(content: Element): void {
    for (const link of [...content.querySelectorAll(".__cf_email__")]) {
        replaceCloudflareProtectedLink(link);
    }
    const links = [...content.querySelectorAll("a")].filter(
        (link) => link.href != null && link.href.includes("/cdn-cgi/l/email-protection"),
    );
    for (const link of links) {
        replaceCloudflareProtectedLink(link);
    }
}

/**
 * Replace one Cloudflare-obfuscated email link with the decoded address.
 */
function replaceCloudflareProtectedLink(link: Element): void {
    const attribute = link.getAttribute("data-cfemail");
    let cyptedEmail: string | null = attribute;
    if (cyptedEmail == null) {
        const hash = (link as HTMLAnchorElement).hash;
        cyptedEmail = hash;
        if (!isNullOrEmpty(cyptedEmail)) {
            cyptedEmail = cyptedEmail.substring(1);
        }
    }
    if (cyptedEmail != null) {
        const decryptedEmail = decodeEmail(cyptedEmail);
        const textNode = ownerDocumentOf(link).createTextNode(decryptedEmail);
        link.parentNode?.insertBefore(textNode, link);
        link.remove();
    }
}

/**
 * Decode Cloudflare's XOR-encoded email address.
 */
function decodeEmail(encodedString: string): string {
    const extractHex = (index: number): number =>
        parseInt(encodedString.slice(index, index + 2), 16);
    const key = extractHex(0);
    let email = "";
    for (let index = 2; index < encodedString.length; index += 2) {
        email += String.fromCharCode(extractHex(index) ^ key);
    }
    return email;
}

/**
 * Remove elements the HTML parser did not recognise.
 *
 * These are elements from the 1990s (`<marquee>`, `<blink>`, …) that some
 * novel sites still serve, and that EPUB readers render as nothing.
 *
 * The legacy code used `instanceof HTMLUnknownElement` unguarded, which
 * threw in DOM implementations that do not define the class (notably
 * `happy-dom`, which the test-suite runs under). The check is guarded
 * here; in a browser the behaviour is unchanged.
 */
function removeHTMLUnknownElement(nodes: Node): void {
    const children = nodes.childNodes;
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child) continue;
        if (typeof HTMLUnknownElement !== "undefined" && child instanceof HTMLUnknownElement) {
            child.remove();
        } else {
            removeHTMLUnknownElement(child);
        }
    }
}

/**
 * Remove scripts, iframes and click handlers.
 */
function removeScriptableElements(element: Element): void {
    removeChildElementsMatchingSelector(element, "script, iframe");
    removeEventHandlers(element);
}

/**
 * Flatten the `<o:p>` elements that Word leaves in exported HTML.
 */
function removeMicrosoftWordCrapElements(element: Element): void {
    for (const node of getElements(element, "O:P")) {
        flattenNode(node);
    }
}

/**
 * Replace a node with its children.
 */
function flattenNode(node: Node): void {
    const parent = node.parentNode;
    while (node.hasChildNodes() && parent) {
        parent.insertBefore(node.childNodes[0] as ChildNode, node);
    }
    node.parentNode?.removeChild(node);
}

/**
 * Remove the `onclick` handler from an element and its descendants.
 *
 * The legacy code only removed `onclick`, not every event handler, even
 * though its own comment said it should.
 */
function removeEventHandlers(contentElement: Element): void {
    const walker = ownerDocumentOf(contentElement).createTreeWalker(
        contentElement,
        NodeFilter.SHOW_ELEMENT,
    );
    let element: Element | null = contentElement;
    while (element != null) {
        element.removeAttribute("onclick");
        element = walker.nextNode() as Element | null;
    }
}

/**
 * Remove width and height from an element's ancestors, up to the body.
 */
function removeHeightAndWidthStyleFromParents(element: Element): void {
    let parent = element.parentElement;
    while (parent != null && parent.tagName.toLowerCase() !== "body") {
        removeHeightAndWidthStyle(parent);
        parent = parent.parentElement;
    }
}

/**
 * Remove the width and height from an element, in the style and as
 * attributes.
 *
 * The legacy code assigned `null` to `style.width` / `style.height`, which
 * the CSSOM turns into an empty value (the properties are declared
 * `[LegacyNullToEmptyString]`). `removeProperty` is used here because
 * some DOM implementations do not implement the null-clearing.
 */
function removeHeightAndWidthStyle(element: Element): void {
    const style = styleOf(element);
    if (style) {
        if (style.width !== "" || style.height !== "") {
            style.removeProperty("width");
            style.removeProperty("height");
            if (style.length === 0) {
                // Avoid a style="" attribute in the element.
                element.removeAttribute("style");
            }
        }
    }
    element.removeAttribute("width");
    element.removeAttribute("height");
}

/**
 * Remove the WordPress cruft the legacy code knew about.
 *
 * The modern implementation in `core/util/dom.ts` removes a larger set of
 * selectors; both are applied, so nothing the legacy code removed
 * survives, and the extra selectors the rewrite added are removed too.
 */
function removeUnwantedWordpressElements(element: Element): void {
    const legacySelectors =
        "div.sharedaddy, div.wpcnt, ul.post-categories, div.mistape_caption, " +
        "div.wpulike, div.wp-next-post-navi, .ezoic-adpicker-ad, .ezoic-ad, " +
        "ins.adsbygoogle";
    removeChildElementsMatchingSelector(element, legacySelectors);
    removeModernUnwantedWordpressElements(element);
}

/**
 * Remove the sharing links from a page.
 *
 * As with the WordPress cruft, both the legacy selector (`div.sharepost`)
 * and the modern selector list are applied.
 */
function removeShareLinkElements(contentElement: Element): void {
    removeChildElementsMatchingSelector(contentElement, "div.sharepost");
    removeModernShareLinkElements(contentElement);
}

/**
 * Prepare an element for conversion to XHTML.
 *
 * `<center>`, `<u>` and `<s>` are not valid XHTML, so they are replaced
 * with styled paragraphs and spans.
 */
function prepForConvertToXhtml(element: Element): void {
    replaceCenterTags(element);
    replaceUnderscoreTags(element);
    replaceSTags(element);
}

/**
 * Replace `<center>` elements with a centred paragraph.
 */
function replaceCenterTags(element: Element): void {
    for (const center of element.querySelectorAll("center")) {
        const replacement = ownerDocumentOf(center).createElement("p");
        replacement.setAttribute("style", "text-align: center;");
        convertElement(center, replacement);
    }
}

/**
 * Replace `<u>` elements with an underlined span.
 */
function replaceUnderscoreTags(element: Element): void {
    for (const underscore of element.querySelectorAll("u")) {
        const replacement = ownerDocumentOf(underscore).createElement("span");
        replacement.setAttribute("style", "text-decoration: underline;");
        convertElement(underscore, replacement);
    }
}

/**
 * Replace `<s>` elements with a struck-through span.
 */
function replaceSTags(element: Element): void {
    for (const struck of element.querySelectorAll("s")) {
        const replacement = ownerDocumentOf(struck).createElement("span");
        replacement.setAttribute("style", "text-decoration: line-through;");
        convertElement(struck, replacement);
    }
}

/**
 * Replace an element with another, keeping the content and the attributes.
 */
function convertElement(element: Element, replacement: Element): void {
    const parent = element.parentElement;
    parent?.insertBefore(replacement, element);
    moveChildElements(element, replacement);
    copyAttributes(element, replacement);
    element.remove();
}

/**
 * Copy an element's attributes onto another element.
 *
 * Attributes that cannot be set (an invalid name, for instance) are
 * discarded rather than throwing.
 */
function copyAttributes(from: Element, to: Element): void {
    for (let i = 0; i < from.attributes.length; ++i) {
        const attr = from.attributes[i];
        if (!attr) continue;
        try {
            to.setAttribute(attr.localName, attr.value);
        } catch {
            // Probably an invalid attribute name. Discard it.
        }
    }
}

/**
 * Point an image's `src` at the URL it will be loaded from once visible.
 *
 * Some sites put the real URL in a data attribute and leave `src` empty
 * until the image scrolls into view.
 */
function fixDelayLoadedImages(element: Element, delayAttrib: string): void {
    for (const image of element.querySelectorAll("img")) {
        const url = image.getAttribute(delayAttrib);
        if (!isNullOrEmpty(url)) {
            image.src = url as string;
        }
    }
}

/**
 * Move block-level elements out of the inline elements that contain them.
 *
 * A `<p>` inside a `<span>` is invalid XHTML and confuses EPUB readers.
 */
function fixBlockTagsNestedInInlineTags(contentElement: Element): void {
    const garbage: Element[] = [];
    const walker = ownerDocumentOf(contentElement).createTreeWalker(
        contentElement,
        NodeFilter.SHOW_ELEMENT,
    );
    let element: Element | null = contentElement;
    while (element != null) {
        if (isInlineElement(element) && isBlockElementInside(element)) {
            moveElementsOutsideTag(element);
            garbage.push(element);
        }
        element = walker.nextNode() as Element | null;
    }

    for (const leftover of garbage) {
        leftover.remove();
    }
}

/**
 * Whether an element contains a block-level element.
 */
function isBlockElementInside(inlineElement: Element): boolean {
    const walker = ownerDocumentOf(inlineElement).createTreeWalker(
        inlineElement,
        NodeFilter.SHOW_ELEMENT,
    );
    let element: Element | null = null;
    while ((element = walker.nextNode() as Element | null)) {
        if (isBlockElement(element)) {
            return true;
        }
    }

    // If here, no block element found.
    return false;
}

/**
 * Move an inline element's children out of it.
 */
function moveElementsOutsideTag(inlineElement: Element): void {
    const parent = inlineElement.parentNode;
    while (inlineElement.hasChildNodes() && parent) {
        const node = inlineElement.childNodes[0] as ChildNode;
        parent.insertBefore(node, inlineElement);

        // Handle the case of <inline><inline><block></block></inline></inline>.
        if (node.nodeType === Node.ELEMENT_NODE) {
            fixBlockTagsNestedInInlineTags(node as Element);
        }
    }
}

/**
 * Whether a node is one of the given tags.
 */
function isNodeInTag(tags: string[], node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }
    const tagName = (node as Element).tagName.toLowerCase();
    return tags.some((tag) => tag === tagName);
}

/**
 * Whether a node is an inline element.
 */
function isInlineElement(node: Node): boolean {
    return isNodeInTag(INLINE_ELEMENTS, node);
}

/**
 * Whether a node is a block-level element.
 */
function isBlockElement(node: Node): boolean {
    return isNodeInTag(BLOCK_ELEMENTS, node);
}

/**
 * The URL of the first image in a container.
 *
 * Unlike the modern helper in `core/util/dom.ts`, this returns the
 * *resolved* URL (`img.src`) rather than the raw attribute, and it accepts
 * a selector that matches the image itself. The legacy parsers rely on
 * getting an absolute URL, because the value is handed straight to the
 * downloader.
 */
function getFirstImgSrc(dom: Document, selector: string): string | null {
    let element = dom.querySelector(selector);
    if (element && element.tagName !== "IMG") {
        element = element.querySelector("img");
    }
    return (element as HTMLImageElement | null)?.src ?? null;
}

/**
 * The fragment of a URI, without the `#`.
 */
function extractHashFromUri(uri: string): string | null {
    const index = uri.indexOf("#");
    return index === -1 ? null : uri.substring(index + 1);
}

/**
 * Point lazily-loaded images at their real source.
 */
function resolveLazyLoadedImages(content: Element, imgCss: string, attrName = "data-src"): void {
    for (const image of content.querySelectorAll(imgCss)) {
        const dataSrc = image.getAttribute(attrName);
        if (dataSrc !== null) {
            (image as HTMLImageElement).src = dataSrc.trim();
        }
    }
}

/**
 * Turn links that point into the current page into in-page anchors.
 */
function makeHyperlinksRelative(baseUri: string, content: Element): void {
    for (const link of getElements(content, "a", (element) => isLocalHyperlink(baseUri, element))) {
        link.setAttribute("href", `#${extractHashFromUri((link as HTMLAnchorElement).href)}`);
    }
}

/**
 * Whether a link points into the current page.
 */
function isLocalHyperlink(baseUri: string, link: Element): boolean {
    const href = (link as HTMLAnchorElement).href;
    return href.startsWith(baseUri) && href.indexOf("#") !== -1;
}

/**
 * The most-used style value of each of the given style properties.
 *
 * The "primary" style is the one applied to the most characters in the
 * content; it is used to detect (and then remove) a site's custom font
 * colour or size.
 */
function findPrimaryStyleSettings(
    element: Element,
    styleProperties: string[],
): (string | undefined)[] {
    const characterCountForElement = (target: Element): number => {
        let count = 0;
        let child = target.firstChild;
        while (child) {
            if (child.nodeType === Node.TEXT_NODE) {
                count += child.nodeValue?.length ?? 0;
            }
            child = child.nextSibling;
        }
        return count;
    };

    const findMaxCount = (map: Map<string | undefined, number>): string | undefined => {
        let maxPair: [string | undefined, number] = [undefined, 0];
        for (const pair of map) {
            if (maxPair[1] <= pair[1]) {
                maxPair = pair;
            }
        }
        return maxPair[0];
    };

    const mergeStyles = (
        parentStyle: string | undefined,
        currentStyle: CSSStyleDeclaration | undefined,
        styleProperty: string,
    ): string | undefined => {
        if (currentStyle === null || currentStyle === undefined) {
            return parentStyle;
        }
        const current = styleValue(currentStyle, styleProperty);
        return current !== "" ? current : parentStyle;
    };

    const updateStat = (
        map: Map<string | undefined, number>,
        key: string | undefined,
        count: number,
    ): void => {
        const total = map.get(key);
        map.set(key, (total === undefined ? 0 : total) + count);
    };

    const walk = (
        target: Element,
        stats: Map<string | undefined, number>[],
        parentStyle: (string | undefined)[],
        properties: string[],
    ): void => {
        const mergedStyle: (string | undefined)[] = [];
        const count = characterCountForElement(target);
        const targetStyle = styleOf(target);
        for (let i = 0; i < properties.length; ++i) {
            const merged = mergeStyles(parentStyle[i], targetStyle, properties[i] as string);
            const stat = stats[i];
            if (stat) updateStat(stat, merged, count);
            mergedStyle.push(merged);
        }
        for (let i = 0; i < target.childElementCount; ++i) {
            const child = target.children[i];
            if (child) walk(child, stats, mergedStyle, properties);
        }
    };

    const stats = styleProperties.map(() => new Map<string | undefined, number>());
    const initialStyle = styleProperties.map(() => undefined as string | undefined);

    walk(element, stats, initialStyle, styleProperties);
    return stats.map(findMaxCount);
}

/**
 * Remove a specific inline style value from an element and its
 * descendants.
 *
 * As with `removeHeightAndWidthStyle`, the property is removed rather than
 * assigned `null`, so that the behaviour does not depend on the DOM
 * implementing the CSSOM's null-clearing.
 */
function removeStyleValue(element: Element, styleName: string, value?: string): void {
    if (value === undefined) {
        return;
    }
    const walker = ownerDocumentOf(element).createTreeWalker(element, NodeFilter.SHOW_ELEMENT);
    do {
        const node = walker.currentNode as Element;
        const style = styleOf(node);
        if (style && styleValue(style, styleName) === value) {
            style.removeProperty(cssPropertyName(styleName));
            if (style.length === 0) {
                node.removeAttribute("style");
            }
        }
    } while (walker.nextNode());
}

/**
 * Reset a page's custom font colour and size to the default.
 */
function setStyleToDefault(element: Element): void {
    const styleProperties = ["color", "fontSize"];
    const primary = findPrimaryStyleSettings(element, styleProperties);
    for (let i = 0; i < styleProperties.length; ++i) {
        removeStyleValue(element, styleProperties[i] as string, primary[i]);
    }
}

/**
 * Renumber headings so that the top level used is h1.
 *
 * A chapter that starts at `<h3>` gets its headings moved up, so that the
 * EPUB's table of contents is not empty at the top.
 */
function removeUnusedHeadingLevels(contentElement: Element): void {
    const usedHeadings = HEADER_TAGS.map((tag) => [...contentElement.querySelectorAll(tag)]).filter(
        (headings) => headings.length > 0,
    );
    for (let i = 0; i < usedHeadings.length; ++i) {
        for (const element of usedHeadings[i] as Element[]) {
            const replacement = ownerDocumentOf(element).createElement(HEADER_TAGS[i] as string);
            convertElement(element, replacement);
        }
    }
}

/**
 * Wrap a raw text node in a paragraph.
 *
 * Text that is not inside a block element is not valid XHTML.
 */
function wrapRawTextNode(node: Node): Node {
    if (node.nodeType === Node.TEXT_NODE && !isStringWhiteSpace(node.nodeValue ?? "")) {
        const wrapper = ownerDocumentOf(node).createElement("p");
        wrapper.appendChild(ownerDocumentOf(node).createTextNode(node.nodeValue ?? ""));
        return wrapper;
    }
    return node;
}

/**
 * Whether a string is null, empty, or only whitespace.
 *
 * This differs from the modern `isNullOrEmpty`, which only treats `null`,
 * `undefined` and `""` as empty. The legacy parsers rely on a
 * whitespace-only string counting as empty, so the legacy rule is kept.
 */
function isNullOrEmpty(s: string | null | undefined): boolean {
    return s == null || isStringWhiteSpace(s);
}

/**
 * Turn the links in an element into a chapter list.
 *
 * The legacy behaviour, kept exactly:
 *
 *  - links with no text, or no `href`, are skipped;
 *  - links are de-duplicated by their normalised URL;
 *  - the optional predicate can exclude a link, but the link is still
 *    remembered for de-duplication;
 *  - the optional arc getter supplies an arc name, and the arc is only
 *    attached to a chapter when the arc changes.
 */
function hyperlinksToChapterList(
    contentElement: Element | null,
    isChapterPredicate?: (link: Element) => boolean,
    getChapterArc?: (link: Element) => unknown,
): LegacyChapter[] {
    if (contentElement == null) {
        return [];
    }

    const linkSet = new Set<string>();
    const includeLink = (link: Element): boolean => {
        const href = (link as HTMLAnchorElement).href;
        // Ignore links with no name or no link.
        if (isNullOrEmpty(textOf(link)) || isNullOrEmpty(href)) {
            return false;
        }

        // Ignore duplicate links.
        const comparable = normalizeUrlForCompare(href);
        if (linkSet.has(comparable)) {
            return false;
        }

        linkSet.add(comparable);
        return isChapterPredicate ? isChapterPredicate(link) : true;
    };

    // Only set newArc when the arc changes.
    let currentArc: unknown = null;
    const newArcValueForChapter = (link: Element): unknown => {
        if (getChapterArc) {
            const arc = getChapterArc(link);
            if (arc === currentArc) {
                return null;
            }
            currentArc = arc;
            return currentArc;
        }

        return currentArc;
    };

    return getElements(contentElement, "a", includeLink).map((link) =>
        hyperLinkToChapter(link, newArcValueForChapter(link)),
    );
}

/**
 * Remove a trailing slash from a URL.
 */
function removeTrailingSlash(url: string): string {
    return url.endsWith("/") ? url.substring(0, url.length - 1) : url;
}

/**
 * Remove the fragment from a URL.
 */
function removeAnchor(url: string): string {
    const index = url.indexOf("#");
    return 0 <= index ? url.substring(0, index) : url;
}

/**
 * Remove a leading `www.` from a host name.
 *
 * This lived on the legacy `ParserFactory`, not on `util`, but the parsers
 * call it through `util`, so it lives here too.
 */
function stripLeadingWww(hostName: string): string {
    return hostName.startsWith("www.") ? hostName.substring(4) : hostName;
}

/**
 * Normalise a URL so two references to the same page compare equal.
 *
 * The legacy version only removed the protocol, the trailing slash and the
 * fragment — it did *not* remove tracking parameters or lower-case the
 * host, as the modern version in `core/util/primitives.ts` does. The
 * legacy behaviour is used here, because the legacy parsers use this
 * function to detect duplicate chapters, and the stricter modern version
 * would merge chapters the legacy code keeps apart.
 */
function normalizeUrlForCompare(url: string): string {
    const noTrailingSlash = removeTrailingSlash(removeAnchor(url));

    const protocolSeparator = "://";
    const protocolIndex = noTrailingSlash.indexOf(protocolSeparator);
    return protocolIndex < 0
        ? noTrailingSlash
        : noTrailingSlash.substring(protocolIndex + protocolSeparator.length);
}

/**
 * Turn a link into a chapter.
 *
 * The legacy shape, including the `newArc` key, which is `null` when no
 * arc was supplied.
 */
function hyperLinkToChapter(link: Element, newArc?: unknown): LegacyChapter {
    return {
        sourceUrl: (link as HTMLAnchorElement).href,
        title: textOf(link).trim(),
        newArc: newArc === undefined ? null : newArc,
    };
}

/**
 * Create an XML comment.
 *
 * Comments may not contain a double hyphen, so it is escaped. A `data:`
 * URI is dropped, because a base64 image in a comment would bloat the
 * EPUB.
 */
function createComment(doc: Document, content: string): Comment {
    const cleared = clearIfDataUri(content);
    // Comments are not allowed to contain a double hyphen.
    const escaped = cleared.replace(/--/g, "%2D%2D");
    return doc.createComment(`  ${escaped}  `);
}

/**
 * Add an XML declaration to the start of a document.
 *
 * JavaScript has no API for this, so a processing instruction is used
 * instead.
 */
function addXmlDeclarationToStart(dom: Document): void {
    const declaration = dom.createProcessingInstruction("xml", 'version="1.0" encoding="utf-8"');
    dom.insertBefore(declaration, dom.childNodes[0] as ChildNode);
}

/**
 * Add an XHTML doctype to the start of a document.
 */
function addXhtmlDocTypeToStart(dom: Document): void {
    const docType = dom.implementation.createDocumentType(
        "html",
        "-//W3C//DTD XHTML 1.1//EN",
        "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd",
    );
    dom.insertBefore(docType, dom.children[0] as ChildNode);
}

/**
 * Whether a string contains only whitespace.
 */
function isStringWhiteSpace(s: string): boolean {
    return !/\S/.test(s);
}

/**
 * Whether an element is effectively empty.
 *
 * An element that holds an image is not empty, however little text it has.
 */
function isElementWhiteSpace(element: Node): boolean {
    switch (element.nodeType) {
        case Node.TEXT_NODE:
            return isStringWhiteSpace(element.textContent ?? "");
        case Node.COMMENT_NODE:
            return true;
    }
    const tag = element as Element;
    if (tag.tagName === "IMG" || tag.tagName === "image") {
        return false;
    }
    if (tag.querySelector("img, image") !== null) {
        return false;
    }
    return isStringWhiteSpace(textOf(tag));
}

/**
 * Whether a node is a heading.
 */
function isHeaderTag(node: Node): boolean {
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return false;
    }
    const tag = (node as Element).tagName.toLowerCase();
    return HEADER_TAGS.some((headerTag) => tag === headerTag);
}

/**
 * Whether a string is an HTTP or HTTPS URL.
 */
function isUrl(string: string): boolean {
    try {
        const url = new URL(string);
        return url.protocol.startsWith("http:") || url.protocol.startsWith("https:");
    } catch {
        return false;
    }
}

/**
 * Serialise a document to an XML string, with an XML declaration.
 */
function xmlToString(dom: Document): string {
    addXmlDeclarationToStart(dom);
    return new XMLSerializer().serializeToString(dom);
}

/**
 * Pad a number to four digits, with leading zeroes.
 *
 * The legacy implementation truncated rather than padded when the number
 * was longer than four digits; that behaviour is kept.
 */
function zeroPad(num: number): string {
    let padded = `000${num}`;
    padded = padded.substring(padded.length - 4, padded.length);
    return padded;
}

/**
 * Every element under a root that passes a filter.
 *
 * The default filter shows elements only.
 */
function iterateElements(
    root: Node,
    filter: (node: Node) => number,
    whatToShow: number = NodeFilter.SHOW_ELEMENT,
): Node[] {
    const iterator = document.createNodeIterator(root, whatToShow, {
        acceptNode: filter,
    });
    const elements: Node[] = [];
    let node: Node | null = null;
    while ((node = iterator.nextNode()) != null) {
        elements.push(node);
    }
    return elements;
}

/**
 * Every element with a given tag name, optionally filtered.
 */
function getElements(
    dom: Document | Element,
    tagName: string,
    filter?: (element: Element) => boolean,
): Element[] {
    const array = Array.from(dom.getElementsByTagName(tagName));
    return filter === undefined || typeof filter !== "function" ? array : array.filter(filter);
}

/**
 * The first element with a given tag name, optionally filtered.
 */
function getElement(
    dom: Document | Element,
    tagName: string,
    filter?: (element: Element) => boolean,
): Element | null {
    const elements = getElements(dom, tagName, filter);
    return elements.length === 0 ? null : (elements[0] as Element);
}

/**
 * Return an element's parent, when the parent is a given tag and is small.
 *
 * Used when removing the "previous chapter" / "next chapter" links: the
 * link's parent is removed as well, but only when it is small enough that
 * it cannot hold the chapter's text.
 */
function moveIfParent(element: Element, parentTag: string): Element {
    const parent = element.parentNode as Element | null;
    if (
        parent &&
        parent.tagName?.toLowerCase() === parentTag &&
        (parent.textContent?.length ?? 0) < 200
    ) {
        return parent;
    }
    return element;
}

/**
 * Turn a title into a file name.
 *
 * The legacy version keeps only letters, digits, hyphens and underscores,
 * turns spaces into underscores, and — unlike the modern version in
 * `core/util/primitives.ts` — truncates in the *middle*, so that two long
 * titles that share a prefix stay different. The default length is 20,
 * not 120.
 */
function safeForFileName(title: string, maxLength = 20): string {
    if (title) {
        // Allow only a-z regardless of case and numbers, as well as hyphens
        // and underscores; replace spaces and no-break spaces with
        // underscores.
        const cleaned = title.replace(/[ \u00a0]/gi, "_").replace(/([^a-z0-9_-]+)/gi, "");
        // There is technically a 255-character limit in Windows for file
        // paths, so files are allowed 20 characters and are split when they
        // go over. The middle is truncated so that the file name is always
        // different.
        const ellipsis = "...";
        const splitLength = Math.floor((maxLength - ellipsis.length) / 2);
        return cleaned.length > maxLength
            ? cleaned.slice(0, splitLength) + ellipsis + cleaned.slice(cleaned.length - splitLength)
            : cleaned;
    }
    return "";
}

/**
 * The file name of a chapter inside the EPUB.
 */
function makeStorageFileName(
    subdirectory: string,
    index: number,
    title: string,
    extension: string,
): string {
    let name: string;
    if (title) {
        const safeLengthForNameInZip = 200;
        name = `_${safeForFileName(title, safeLengthForNameInZip)}.`;
    } else {
        // We don't want issues, so just set it to "." to prepare for the
        // extension.
        name = ".";
    }
    return `${subdirectory}${zeroPad(index)}${name}${extension}`;
}

/**
 * Whether an element is a textarea.
 */
function isTextAreaField(element: Element): boolean {
    return element.tagName === "TEXTAREA";
}

/**
 * Whether an element is a text or URL input.
 */
function isTextInputField(element: Element): boolean {
    if (element.tagName !== "INPUT") return false;
    const type = (element as HTMLInputElement).type;
    return type === "text" || type === "url";
}

/**
 * The parser's complaint about an XHTML string, or `null` when it is valid.
 */
function isXhtmlInvalid(xhtmlAsString: string, mimeType = "application/xml"): string | null {
    const doc = new DOMParser().parseFromString(xhtmlAsString, mimeType as DOMParserSupportedType);
    const parserError = doc.querySelector("parsererror");
    return parserError === null ? null : parserError.textContent;
}

/**
 * Build a table of the `dcterms.*` metadata of a document.
 */
function dctermsToTable(dom: Document): HTMLElement {
    const table = dom.createElement("table");
    const body = dom.createElement("tbody");
    table.appendChild(body);
    for (const term of dom.querySelectorAll("meta[name*='dcterms.']")) {
        const row = dom.createElement("tr");
        body.appendChild(row);
        let cell = dom.createElement("td");
        row.appendChild(cell);
        cell.textContent = (term.getAttribute("name") ?? "").replace("dcterms.", "");
        cell = dom.createElement("td");
        row.appendChild(cell);
        cell.textContent = term.getAttribute("content") ?? "";
    }
    return table;
}

/**
 * Sanitise an HTML string and put the result into an element.
 *
 * The legacy `sanitize` returned a *document*; this keeps that shape.
 */
function parseHtmlAndInsertIntoContent(
    htmlText: string,
    content: Element,
    insertNodes = false,
): void {
    const parsed = sanitize(htmlText);
    while (content.firstChild) {
        content.removeChild(content.firstChild);
    }
    const body = parsed.querySelector("body");
    if (!body) return;
    if (insertNodes) {
        for (const node of [...body.childNodes]) {
            content.appendChild(node);
        }
    } else {
        for (const child of [...body.children]) {
            content.appendChild(child);
        }
    }
}

/**
 * A no-op logging hook, so that logging can be disabled in one place.
 */
function log(_arg?: unknown): void {
    // ToDo: uncomment this for debug logging
    // console.log(arg);
}

/**
 * Load a sample document from disk, synchronously.
 *
 * This is only used by the legacy unit tests.
 */
function syncLoadSampleDoc(fileName: string, url: string): Document {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", fileName, false);
    xhr.send(null);
    const dom = new DOMParser().parseFromString(xhr.responseText, "text/html");
    setBaseTag(url, dom);
    return dom;
}

/**
 * The path of the EPUB's stylesheet, inside the archive.
 */
function styleSheetFileName(): string {
    return "OEBPS/Styles/stylesheet.css";
}

/**
 * The URL of an element's background image.
 */
function extractUrlFromBackgroundImage(element: Element | null): string | null {
    const background = styleOf(element as Element)?.backgroundImage;
    return background?.substring(5, background.length - 2) ?? null;
}

/**
 * The text between a prefix and a suffix.
 *
 * The prefix may be a regular expression, in which case the match is used
 * as the prefix. Throws when the prefix or the suffix is not found.
 */
function extractSubstring(s: string, prefix: string | RegExp, suffix: string): string {
    let actualPrefix = prefix;
    if (typeof actualPrefix !== "string") {
        const match = s.match(actualPrefix);
        if (match === null) {
            throw new Error("prefix not found");
        }
        actualPrefix = match[0];
    }

    let i = s.indexOf(actualPrefix);
    if (i < 0) {
        throw new Error("prefix not found");
    }
    s = s.substring(i + actualPrefix.length);
    i = s.indexOf(suffix);
    if (i < 0) {
        throw new Error("suffix not found");
    }
    return s.substring(0, i);
}

/**
 * The index of the quote that closes the one at `startIndex`.
 */
function findIndexOfClosingQuote(s: string, startIndex: number): number {
    let index = startIndex + 1;
    while (index < s.length && s.charAt(index) !== '"') {
        index += s.charAt(index) === "\\" ? 2 : 1;
    }
    return index;
}

/**
 * The index of the bracket that closes the one at `startIndex`.
 *
 * Returns `-1` when the brackets are unbalanced.
 */
function findIndexOfClosingBracket(s: string, startIndex: number): number {
    let index = startIndex + 1;
    let depth = 1;
    let c = s.charAt(index);
    while (0 < depth && index < s.length) {
        if (c === "]" || c === "}") {
            --depth;
            if (depth === 0) {
                return index;
            }
        } else if (c === "[" || c === "{") {
            ++depth;
        } else if (c === '"') {
            index = findIndexOfClosingQuote(s, index);
        }
        ++index;
        c = s.charAt(index);
    }
    // Unbalanced brackets.
    return -1;
}

/**
 * Find and parse a JSON value embedded in a string.
 *
 * The prefix locates the JSON; the JSON itself starts at the first `[` or
 * `{` after the prefix.
 */
function locateAndExtractJson(s: string, prefix: string): unknown | null {
    const findOpeningBracket = (text: string, index: number): number => {
        while (index < text.length) {
            const ch = text.charAt(index);
            if (ch === "[" || ch === "{") {
                return index;
            }
            ++index;
        }
        return -1;
    };

    let index = s.indexOf(prefix);
    if (0 <= index) {
        index = findOpeningBracket(s, index + prefix.length);
        if (0 <= index) {
            const end = findIndexOfClosingBracket(s, index);
            if (index < end) {
                const jsonString = s.substring(index, end + 1);
                return JSON.parse(jsonString);
            }
        }
    }
    return null;
}

/**
 * Open a chapter in a background tab, and resolve with the tab's id.
 */
function createChapterTab(url: string): Promise<number> {
    return new Promise((resolve) => {
        chrome.tabs.create({ url, active: false }, (tab) => {
            resolve(tab?.id ?? -1);
        });
    });
}

/**
 * Remove one or more attributes from an element.
 */
function removeAttributes(element: Element | null, attributeNames: string | string[] | null): void {
    if (!element || attributeNames == null) return;

    // Handle a single attribute name as a string.
    if (typeof attributeNames === "string") {
        element.removeAttribute(attributeNames);
        return;
    }

    // Handle an array of attribute names.
    if (Array.isArray(attributeNames)) {
        for (const name of attributeNames) {
            if (typeof name === "string") {
                element.removeAttribute(name);
            }
        }
    }
}

/**
 * Remove attributes that have an empty value.
 */
function removeEmptyAttributes(content: Element): void {
    const elements = content.querySelectorAll("*");

    for (const element of elements) {
        const attributes = element.attributes;
        const attributesToRemove: string[] = [];

        for (let i = 0; i < attributes.length; i++) {
            const attribute = attributes[i];
            if (attribute && attribute.value.trim() === "") {
                attributesToRemove.push(attribute.name);
            }
        }

        for (let i = attributesToRemove.length - 1; i >= 0; i--) {
            const name = attributesToRemove[i];
            if (name !== undefined) element.removeAttribute(name);
        }
    }
}

/**
 * Remove spans that have no attributes, within a paragraph or a div.
 *
 * Such a span has no purpose and only adds noise to the EPUB.
 */
function removeSpansWithNoAttributes(content: Element): void {
    const spans = content.querySelectorAll("p span, div span");

    for (const span of spans) {
        if (span.attributes.length === 0) {
            const parent = span.parentNode;
            while (span.firstChild && parent) {
                parent.insertBefore(span.firstChild, span);
            }
            parent?.removeChild(span);
        }
    }
}

/**
 * Replace semantic inline styles with the matching HTML tags.
 *
 * `font-style: italic` becomes `<i>`, `font-weight: bold` becomes `<b>`,
 * and so on.
 */
function replaceSemanticInlineStylesWithTags(element: Element, removeLeftoverStyles = false): void {
    if (element.hasAttribute("style")) {
        let styleText = element.getAttribute("style") ?? "";

        // A map of style patterns to their semantic HTML equivalents.
        const styleToTag: { regex: RegExp; tag: string }[] = [
            { regex: /font-style\s*:\s*(italic|oblique)\s*;?/g, tag: "i" },
            { regex: /font-weight\s*:\s*(bold|[7-9]\d\d)\s*;?/g, tag: "b" },
            { regex: /text-decoration\s*:\s*underline\s*;?/g, tag: "u" },
            { regex: /text-decoration\s*:\s*line-through\s*;?/g, tag: "s" },
        ];

        // Apply the semantic tags and remove the corresponding styles.
        for (const style of styleToTag) {
            style.regex.lastIndex = 0;
            if (style.regex.test(styleText)) {
                // `test()` advances `lastIndex`, so reset it.
                style.regex.lastIndex = 0;
                wrapInnerContentInTag(element, style.tag);
                styleText = styleText.replace(style.regex, "");
            }
        }

        // Remove non-semantic font-weight.
        styleText = styleText.replace(/font-weight\s*:\s*(normal|[1-4]\d\d)\s*;?/g, "");
        styleText = styleText.trim();

        if (
            styleText &&
            (!removeLeftoverStyles ||
                /italic|bold|font-weight|underline|line-through/.test(styleText))
        ) {
            element.setAttribute("style", styleText);
        } else {
            // Remove all the remaining styles, except text-align: center.
            const textAlign = styleOf(element)?.getPropertyValue("text-align");
            if (textAlign === "center") {
                element.setAttribute("style", "text-align: center;");
            } else {
                element.removeAttribute("style");
            }
        }
    }
}

/**
 * Wrap an element's content in a tag.
 */
function wrapInnerContentInTag(element: Element, tagName: string): void {
    const wrapper = ownerDocumentOf(element).createElement(tagName);
    moveChildElements(element, wrapper);
    element.appendChild(wrapper);
}

/**
 * The usual file extension for a MIME type.
 */
function getDefaultExtensionByMime(mimeType: string): string | undefined {
    const extensions = MIME_TYPE_EXTENSIONS[mimeType];
    if (extensions) return extensions[0];
    return undefined;
}

/**
 * The MIME type of a base64-encoded file, detected from its first bytes.
 */
function detectMimeType(b64: string): string | undefined {
    const b64b = atob(b64);
    for (const signature in MIME_TYPE_SIGNATURES) {
        const types = MIME_TYPE_SIGNATURES[signature];
        if (!types) continue;
        if (b64b.indexOf(atob(signature)) === 0 || b64.indexOf(signature) === 0) {
            return types[0];
        }
    }
    return undefined;
}

/**
 * Sanitise a string or a node, and return the result as a document.
 *
 * The legacy `sanitize` returned a document rather than a string, and the
 * legacy parsers rely on that (`util.sanitize(html).querySelector("body")`).
 * The sanitisation itself is delegated to `core/util/sanitize.ts`, which
 * is the project's single sanitisation boundary.
 */
function sanitize(dirty: string | Node): Document {
    const savedBaseURI = typeof dirty === "string" ? undefined : dirty.baseURI;
    const source = typeof dirty === "string" ? dirty : nodeToHtml(dirty);
    const clean = sanitizeHtml(source);
    const html = new DOMParser().parseFromString(clean, "text/html");
    if (savedBaseURI) {
        setBaseTag(savedBaseURI, html);
    }
    return html;
}

/**
 * The HTML of a node, for handing to the sanitiser.
 */
function nodeToHtml(node: Node): string {
    if (node.nodeType === Node.ELEMENT_NODE) {
        return (node as Element).outerHTML;
    }
    if (node.nodeType === Node.DOCUMENT_NODE) {
        return (node as Document).documentElement?.outerHTML ?? "";
    }
    return node.textContent ?? "";
}

/**
 * Sanitise a node in place.
 *
 * A text node is only cloned: the sanitiser would otherwise delete it when
 * it was whitespace.
 */
function sanitizeNode(dirty: Node): Node | null {
    return dirty?.nodeType === Node.TEXT_NODE
        ? dirty.cloneNode(true)
        : (sanitize(dirty).body?.firstChild ?? null);
}

/**
 * The legacy `util` object.
 *
 * The 437 legacy parsers call `util.<name>(…)`; this is that object.
 */
export const util: LegacyUtil = {
    XMLNS,
    INLINE_ELEMENTS,
    BLOCK_ELEMENTS,
    HEADER_TAGS,

    /* The chapter-list helpers: legacy shape, legacy de-duplication. */
    hyperlinksToChapterList,
    hyperLinkToChapter,

    /*
     * Reused from `core/util/dom.ts`.
     *
     * These are the same idea, and mostly the same code, with three
     * differences worth knowing about:
     *
     *  - `convertPreTagToPTags` reads `textContent` instead of `innerText`
     *    (so it works in `happy-dom`), drops blank lines, and replaces the
     *    `<pre>` with the paragraphs instead of emptying it and leaving the
     *    `<pre>` in place;
     *  - `removeEmptyDivElements` removes a `<div>` that has neither text
     *    nor children, where the legacy version removed a `<div>` whose
     *    rendered text was blank;
     *  - `removeLeadingWhiteSpace` / `removeTrailingWhiteSpace` remove a
     *    single whitespace text node, where the legacy version removed
     *    every trailing whitespace node (and comment nodes).
     *
     * `removeUnwantedWordpressElements` and `removeShareLinkElements` are
     * the union of the legacy selectors and the modern ones, so nothing the
     * legacy code removed survives.
     */
    removeChildElementsMatchingSelector,
    removeElements,
    removeComments,
    removeEmptyDivElements,
    removeLeadingWhiteSpace,
    removeTrailingWhiteSpace,
    moveChildElements,
    convertPreTagToPTags,
    removeUnwantedWordpressElements,
    removeShareLinkElements,

    /* Legacy behaviour that differs from the modern helpers. */
    getFirstImgSrc,
    normalizeUrlForCompare,
    safeForFileName,
    isNullOrEmpty,
    sanitize,

    /* Everything else, ported from the legacy `Util.js`. */
    sleep,
    getSleepController: () => sleepController,
    resetSleepController,
    randomInteger,
    isFirefox,
    extensionVersion,
    createEmptyXhtmlDoc,
    createEmptyHtmlDoc,
    populateHead,
    createSvgImageElement,
    clearIfDataUri,
    resolveRelativeUrl,
    log,
    extractHostName,
    extractFilename,
    extractFilenameFromUrl,
    getParamFromUrl,
    setBaseTag,
    decodeCloudflareProtectedEmails,
    replaceCloudflareProtectedLink,
    decodeEmail,
    removeHTMLUnknownElement,
    removeScriptableElements,
    removeMicrosoftWordCrapElements,
    flattenNode,
    removeEventHandlers,
    removeHeightAndWidthStyleFromParents,
    removeHeightAndWidthStyle,
    prepForConvertToXhtml,
    replaceCenterTags,
    replaceUnderscoreTags,
    replaceSTags,
    convertElement,
    copyAttributes,
    fixDelayLoadedImages,
    fixBlockTagsNestedInInlineTags,
    isBlockElementInside,
    moveElementsOutsideTag,
    isNodeInTag,
    isInlineElement,
    isBlockElement,
    makeRelative,
    makeStorageFileName,
    extractHashFromUri,
    makeHyperlinksRelative,
    resolveLazyLoadedImages,
    isLocalHyperlink,
    findPrimaryStyleSettings,
    removeStyleValue,
    setStyleToDefault,
    removeUnusedHeadingLevels,
    wrapRawTextNode,
    removeTrailingSlash,
    removeAnchor,
    stripLeadingWww,
    createComment,
    addXmlDeclarationToStart,
    addXhtmlDocTypeToStart,
    iterateElements,
    getElement,
    getElements,
    moveIfParent,
    styleSheetFileName,
    isStringWhiteSpace,
    isElementWhiteSpace,
    isHeaderTag,
    isUrl,
    isTextAreaField,
    isTextInputField,
    isXhtmlInvalid,
    dctermsToTable,
    parseHtmlAndInsertIntoContent,
    extractUrlFromBackgroundImage,
    extractSubstring,
    findIndexOfClosingQuote,
    findIndexOfClosingBracket,
    locateAndExtractJson,
    createChapterTab,
    syncLoadSampleDoc,
    xmlToString,
    zeroPad,
    sanitizeNode,
    removeAttributes,
    removeEmptyAttributes,
    removeSpansWithNoAttributes,
    replaceSemanticInlineStylesWithTags,
    wrapInnerContentInTag,
    getDefaultExtensionByMime,
    detectMimeType,
};
