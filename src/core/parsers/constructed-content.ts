/**
 * The static helpers the baseline exposed on `Parser`.
 *
 * Parsers that build chapters from JSON or from raw text use these. They are
 * kept here, with the same names and the same behaviour, so those parsers
 * keep working.
 *
 * See ADR-0002.
 */

/** The class name used for constructed content. */
export const WEB_TO_EPUB_CLASS_NAME = "webToEpubContent";

/** A constructed document, and the element holding its content. */
export interface ConstructedDocument {
    /** The synthetic document. */
    dom: Document;
    /** The element holding the constructed content. */
    content: Element;
}

/**
 * Create a synthetic HTML document for content that is built rather than
 * scraped.
 *
 * @param baseUrl The URL the content came from, used as the document's base
 *   so relative links in the content resolve.
 */
export function makeEmptyDocForContent(baseUrl?: string | null): ConstructedDocument {
    const dom = document.implementation.createHTMLDocument("");
    if (baseUrl) {
        const base = dom.createElement("base");
        base.href = baseUrl;
        dom.head.appendChild(base);
    }
    const content = dom.createElement("div");
    content.className = WEB_TO_EPUB_CLASS_NAME;
    dom.body.appendChild(content);
    return { dom, content };
}

/** Find the content element in a constructed document. */
export function findConstructedContent(dom: Document): Element | null {
    return dom.querySelector(`div.${WEB_TO_EPUB_CLASS_NAME}`);
}

/**
 * Add raw text to a constructed document, one `<p>` per line.
 *
 * @param newDoc The constructed document.
 * @param contentText The text to add.
 */
export function addTextToChapterContent(newDoc: ConstructedDocument, contentText: string): void {
    const lines = contentText.replace(/\r/g, "\n").split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length === 0) continue;
        const paragraph = newDoc.dom.createElement("p");
        paragraph.textContent = trimmed;
        newDoc.content.appendChild(paragraph);
    }
}

/**
 * Add sanitised HTML to a constructed document.
 *
 * @param newDoc The constructed document.
 * @param html The HTML to add. It is sanitised before insertion.
 * @param sanitize The sanitiser to use.
 */
export function addHtmlToChapterContent(
    newDoc: ConstructedDocument,
    html: string,
    sanitize: (html: string) => string,
): void {
    const parsed = new DOMParser().parseFromString(sanitize(html), "text/html");
    for (const node of Array.from(parsed.body.childNodes)) {
        newDoc.content.appendChild(newDoc.dom.importNode(node, true));
    }
}
