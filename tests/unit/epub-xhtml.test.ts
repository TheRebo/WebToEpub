/**
 * Turning a chapter's HTML into XHTML.
 *
 * A chapter is written into the book as XHTML, which is XML. HTML's
 * serialiser leaves the elements that have no content unclosed, so a chapter
 * with a line break, a horizontal rule or an image produced a file that was
 * not well-formed XML — and a reader that checks would refuse the whole
 * book, not just the chapter.
 *
 * These tests check the property that matters: the chapter parses as XML.
 */
import { describe, expect, it } from "vitest";
import { serializeAsXml } from "../../src/core/epub/xhtml";
import { packEpub } from "../../src/core/epub/packer";
import { sanitizeHtml } from "../../src/core/util/sanitize";

/** Parse a string as XML, failing loudly if it is not well formed. */
function parseXml(xml: string): Document {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    const error = dom.querySelector("parsererror");
    if (error) throw new Error(`Not well-formed XML: ${error.textContent}`);
    return dom;
}

/** The body of a packed chapter. */
function chapterBody(contentHtml: string): string {
    const packed = packEpub([{ sourceUrl: "https://example.com/one", title: "One", contentHtml }], {
        title: "A Story",
    });
    const file = packed.files.find((entry) => entry.path.endsWith("chapter-0001.xhtml"));
    return typeof file?.content === "string" ? file.content : "";
}

/**
 * Build a CDATA node.
 *
 * The HTML parser does not make one and the DOM in the tests does not have
 * `createCDATASection`, so the node is described by hand.
 */
function makeCdataNode(text: string): Node {
    return {
        nodeType: 4,
        nodeValue: text,
        childNodes: [],
    } as unknown as Node;
}

/** Build a fragment holding the given nodes. */
function makeFragment(children: Node[]): DocumentFragment {
    return { childNodes: children } as unknown as DocumentFragment;
}

describe("serializeAsXml", () => {
    it("closes the elements that have no content", () => {
        const document = new DOMParser().parseFromString(
            "<p>Hello</p><br><hr><img src='a.png' alt='x'>",
            "text/html",
        );
        const xml = serializeAsXml(document.body);

        expect(xml).toContain("<br />");
        expect(xml).toContain("<hr />");
        expect(xml).toContain('<img src="a.png" alt="x" />');
        expect(xml).not.toMatch(/<br>/);
        expect(xml).not.toMatch(/<hr>/);
    });

    it("escapes the characters XML reserves", () => {
        const document = new DOMParser().parseFromString(
            '<p>Tom &amp; Jerry said "<b>no</b>"</p>',
            "text/html",
        );
        const xml = serializeAsXml(document.body);

        expect(xml).toContain("&amp;");
        expect(xml).not.toContain("& ");
        parseXml(`<root>${xml}</root>`);
    });

    it("escapes an attribute's value", () => {
        const document = new DOMParser().parseFromString(
            `<a href="https://example.com/?a=1&amp;b=2">link</a>`,
            "text/html",
        );
        const xml = serializeAsXml(document.body);

        expect(xml).toContain("&amp;");
        parseXml(`<root>${xml}</root>`);
    });

    it("drops the comments", () => {
        const document = new DOMParser().parseFromString(
            "<p>Hello</p><!-- a note -->",
            "text/html",
        );
        expect(serializeAsXml(document.body)).not.toContain("a note");
    });

    it("keeps a CDATA section from ending early", () => {
        // The HTML parser never makes a CDATA section, so one is built by hand
        // here. A payload holding `]]>` would otherwise close the section and
        // leave the rest of the chapter outside it.
        const section = makeCdataNode("payload ]]> break");
        const xml = serializeAsXml(makeFragment([section]));

        // The canonical way to put `]]>` inside a CDATA section: close it,
        // open a second one, and carry the `>` over.
        expect(xml).toBe("<![CDATA[payload ]]]]><![CDATA[> break]]>");
        expect(xml.match(/<!\[CDATA\[/g)).toHaveLength(2);
        expect(xml.match(/\]\]>/g)).toHaveLength(2);
    });

    it("keeps the text of a CDATA section", () => {
        const section = makeCdataNode("just text");
        const xml = serializeAsXml(makeFragment([section]));

        expect(xml).toBe("<![CDATA[just text]]>");
    });
});

describe("a packed chapter", () => {
    it("is well-formed XML when the content has a line break", () => {
        const body = chapterBody("<p>Hello</p><br><p>Again</p>");
        expect(() => parseXml(body)).not.toThrow();
    });

    it("is well-formed XML when the content has an image", () => {
        const body = chapterBody(
            sanitizeHtml('<p>Look.</p><img src="https://example.com/a.png" alt="x">'),
        );
        expect(() => parseXml(body)).not.toThrow();
    });

    it("is well-formed XML when the content has a horizontal rule", () => {
        const body = chapterBody("<p>Before</p><hr><p>After</p>");
        expect(() => parseXml(body)).not.toThrow();
    });

    it("is well-formed XML when the content has an ampersand", () => {
        const body = chapterBody("<p>Tom &amp; Jerry</p>");
        expect(() => parseXml(body)).not.toThrow();
    });

    it("is well-formed XML when the content has a control character", () => {
        // XML does not allow most control characters at all — not even the
        // ones HTML is happy with. A chapter that carries one produces a file
        // that is not well-formed XML, and a reader that checks refuses the
        // whole book.
        const body = chapterBody("<p>Before\u000BAfter</p>");
        expect(() => parseXml(body)).not.toThrow();
        expect(body).not.toContain("\u000B");
    });

    it("is well-formed XML when a control character is in an attribute", () => {
        const body = chapterBody('<p><a href="https://example.com/?a=\u000Bb">link</a></p>');
        expect(() => parseXml(body)).not.toThrow();
        expect(body).not.toContain("\u000B");
    });

    it("keeps the characters XML does allow", () => {
        // The tab, the line feed and the carriage return are legal in XML, and
        // a chapter that uses them for indentation must keep them.
        const body = chapterBody("<p>One\ttwo</p>");
        expect(body).toContain("\t");
    });

    it("is well-formed XML when the author has an ampersand", () => {
        const packed = packEpub(
            [{ sourceUrl: "https://example.com/one", title: "One", contentHtml: "<p>Hello</p>" }],
            { title: "A Story", author: "A & B" },
        );
        const file = packed.files.find((entry) => entry.path.endsWith("chapter-0001.xhtml"));
        const body = typeof file?.content === "string" ? file.content : "";
        expect(() => parseXml(body)).not.toThrow();
        expect(body).toContain("A &amp; B");
    });

    it("keeps the chapter's text", () => {
        const body = chapterBody("<p>The first chapter.</p>");
        expect(body).toContain("The first chapter.");
    });

    it("rewrites an image's srcset to the packaged copy", () => {
        const imageUrl = "https://example.com/a.png";
        const packed = packEpub(
            [
                {
                    sourceUrl: "https://example.com/one",
                    title: "One",
                    contentHtml: `<img srcset="${imageUrl} 2x" alt="x">`,
                    images: new Map([
                        [
                            imageUrl,
                            {
                                data: new Uint8Array([1, 2, 3]),
                                mediaType: "image/png",
                                url: imageUrl,
                            },
                        ],
                    ]),
                },
            ],
            { title: "A Story" },
        );
        const file = packed.files.find((entry) => entry.path.endsWith("chapter-0001.xhtml"));
        const body = typeof file?.content === "string" ? file.content : "";

        expect(body).not.toContain("https://example.com/a.png");
        expect(body).toContain("../images/");
        expect(body).toContain("2x");
    });

    it("removes an image that was not downloaded", () => {
        const body = chapterBody('<img src="https://example.com/other.png" alt="x">');
        // The image is not in the book. Leaving the reference would point the
        // reader at the site's own servers — which are not in the book, and
        // which the reader's copy of the book has no business calling.
        expect(body).not.toContain("https://example.com/other.png");
        expect(body).not.toContain("<img");
    });
});
