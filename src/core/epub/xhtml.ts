/**
 * Turning HTML into XHTML.
 *
 * A chapter's content arrives as HTML, but it is written into the book as
 * XHTML — which is XML. The difference matters: XML has no void elements, so
 * `<br>` and `<hr>` and `<img>` have to be closed, and an attribute's value
 * has to be quoted and escaped. HTML's serialiser does none of that, so a
 * chapter with a line break would produce a file that is not well-formed
 * XML, and a reader that checks would refuse the whole book.
 *
 * The serialiser here works on the parsed document rather than on the text,
 * so it cannot be fooled by the content's shape.
 */

import { stripIllegalXmlCharacters } from "../util/xml-characters";

/** The elements that never have content. */
const VOID_ELEMENTS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
]);

/**
 * Serialise a document fragment as XML.
 *
 * The result is well-formed XML: void elements are closed, attributes are
 * quoted, and the characters that XML reserves are escaped.
 *
 * @param fragment The content to serialise. It may be a fragment or the
 *   body of a parsed document.
 * @returns The content, as XML.
 */
export function serializeAsXml(fragment: DocumentFragment | HTMLElement): string {
    let output = "";

    for (const node of Array.from(fragment.childNodes)) {
        output += serializeNode(node);
    }

    return output;
}

/**
 * Serialise one node, and everything under it.
 *
 * @param node The node to serialise.
 * @returns The node, as XML.
 */
function serializeNode(node: Node): string {
    // A comment carries no content a reader needs, and its text can hold
    // anything at all.
    if (node.nodeType === 8) return "";

    // Processing instructions and doctypes have no place in a chapter's body.
    if (node.nodeType !== 1 && node.nodeType !== 3 && node.nodeType !== 4) return "";

    if (node.nodeType === 3) return escapeText(node.nodeValue ?? "");
    // A CDATA section carries its payload verbatim, so a `]]>` inside it would
    // close the section early and leave the rest of the file unparsed. The
    // HTML parser never produces one, but the serialiser is a public helper
    // and a caller could hand it anything.
    if (node.nodeType === 4) return `<![CDATA[${splitCdata(node.nodeValue ?? "")}]]>`;

    const element = node as Element;
    const tag = element.tagName.toLowerCase();

    let output = `<${tag}`;

    for (const attribute of Array.from(element.attributes)) {
        // The namespace declarations are written by the document's own root
        // element; copying them here would repeat them.
        if (attribute.name === "xmlns" || attribute.name.startsWith("xmlns:")) continue;
        output += ` ${attribute.name}="${escapeAttribute(attribute.value)}"`;
    }

    if (VOID_ELEMENTS.has(tag)) {
        return `${output} />`;
    }

    output += ">";

    for (const child of Array.from(element.childNodes)) {
        output += serializeNode(child);
    }

    return `${output}</${tag}>`;
}

/**
 * Escape text for XML content.
 *
 * The characters XML does not allow are removed rather than escaped — XML 1.0
 * permits the tab, the line feed and the carriage return, and everything from
 * U+0020 upwards, and nothing else below U+0020 can appear in a document at
 * all, not even as a character reference. A chapter that carries one is a file
 * that is not well-formed XML, and a reader that checks refuses the whole book
 * rather than the one chapter.
 *
 * A site can put one of these into its own markup, so the extension cannot
 * assume they are not there.
 *
 * @param text The text to escape.
 * @returns The escaped text.
 */
function escapeText(text: string): string {
    return stripIllegalXmlCharacters(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/**
 * Escape a value for an XML attribute.
 *
 * @param value The value to escape.
 * @returns The escaped value.
 */
function escapeAttribute(value: string): string {
    return escapeText(value).replace(/"/g, "&quot;").replace(/\r?\n/g, "&#10;");
}

/**
 * Make a payload safe to put inside a CDATA section.
 *
 * A CDATA section ends at the first `]]>`. Splitting the payload there and
 * writing `]]]]><![CDATA[>` in its place keeps the text the same while
 * making sure the section does not end early.
 *
 * @param text The payload.
 * @returns The payload, made safe.
 */
function splitCdata(text: string): string {
    return stripIllegalXmlCharacters(text).replace(/]]>/g, "]]]]><![CDATA[>");
}
