/**
 * The EPUB's compliance with the specification.
 *
 * The book the extension produces is the product. A book that opens in one
 * reader and is rejected by another is not a book, so the rules that the
 * official validator enforces are enforced here too: the ones that are cheap
 * to check, and the ones whose violation silently breaks a reader.
 *
 * The rules were confirmed against the reference validator (EPUBCheck 5.1.0),
 * which reported eight errors and one warning for the EPUB 2 book and two
 * errors for the EPUB 3 book before these tests existed. The output of that
 * validator is now clean for both versions.
 *
 * See ADR-0031.
 */
import { describe, expect, it } from "vitest";
import { packEpub, type ChapterToPack } from "../../src/core/epub/packer";
import { parseOpfVersion } from "../../src/core/epub/document";

/** A chapter with a little content. */
function chapter(title: string, body = "<p>Hello.</p>"): ChapterToPack {
    return { sourceUrl: `https://example.com/${title}`, title, contentHtml: body };
}

/** The package document of a packed book. */
function packageXml(chapters: ChapterToPack[], version: 2 | 3 = 3): string {
    const result = packEpub(chapters, { title: "A Story", author: "An Author", version });
    const opf = result.files.find((file) => file.path === "OEBPS/content.opf");
    return opf?.content as string;
}

/** A chapter's XHTML file. */
function chapterXhtml(chapters: ChapterToPack[], version: 2 | 3 = 3): string {
    const result = packEpub(chapters, { title: "A Story", version });
    const file = result.files.find((entry) => entry.path.endsWith("chapter-0001.xhtml"));
    return file?.content as string;
}

describe("the EPUB's package document", () => {
    it("writes the version the way the specification writes it", () => {
        // The specification writes "3.0" and "2.0", not "3" and "2". A
        // validator reads a bare number as an unsupported version and rejects
        // the whole book.
        expect(packageXml([chapter("One")], 3)).toContain('version="3.0"');
        expect(packageXml([chapter("One")], 2)).toContain('version="2.0"');
    });

    it("reads a version written either way", () => {
        expect(parseOpfVersion("3.0")).toBe(3);
        expect(parseOpfVersion("3")).toBe(3);
        expect(parseOpfVersion("2.0")).toBe(2);
        expect(parseOpfVersion("2")).toBe(2);
        expect(parseOpfVersion(null)).toBe(3);
    });

    it("gives the creator its role the way each version wants it", () => {
        // EPUB 2 uses the `opf:role` attribute. EPUB 3's schema does not
        // allow the attribute at all, and wants the role as a refinement.
        const epub2 = packageXml([chapter("One")], 2);
        expect(epub2).toContain('opf:role="aut"');

        const epub3 = packageXml([chapter("One")], 3);
        expect(epub3).not.toContain("opf:role");
        expect(epub3).toContain('property="role"');
        expect(epub3).toContain('refines="#creator-1"');
    });

    it("records the modification date exactly once in an EPUB 3 book", () => {
        const xml = packageXml([chapter("One")], 3);
        const matches = xml.match(/dcterms:modified/g) ?? [];
        expect(matches).toHaveLength(1);
    });

    it("does not record a modification date in an EPUB 2 book", () => {
        // The element is an EPUB 3 addition; EPUB 2 has no equivalent.
        expect(packageXml([chapter("One")], 2)).not.toContain("dcterms:modified");
    });

    it("names the NCX in the spine", () => {
        // EPUB 3 deprecated the attribute, but the specification still
        // requires it whenever the book carries an NCX.
        const xml = packageXml([chapter("One")], 3);
        expect(xml).toMatch(/<spine toc="[^"]+">/);
    });

    it("does not put the language on the package element in an EPUB 2 book", () => {
        // EPUB 2's package element has no `xml:lang` attribute; the language
        // is carried by `dc:language` alone.
        expect(packageXml([chapter("One")], 2)).not.toContain("xml:lang");
        expect(packageXml([chapter("One")], 3)).toContain("xml:lang");
    });

    it("does not put the properties attribute on an EPUB 2 manifest item", () => {
        // EPUB 2's schema has no `properties` attribute, and its presence
        // makes the package document invalid.
        const xml = packageXml([chapter("One")], 2);
        expect(xml).not.toContain("properties=");
    });
});

describe("the EPUB's content documents", () => {
    it("writes XHTML 5 for an EPUB 3 book", () => {
        const xhtml = chapterXhtml([chapter("One")], 3);
        expect(xhtml).toContain("<!DOCTYPE html>");
        expect(xhtml).toContain('<meta charset="utf-8"/>');
    });

    it("writes XHTML 1.1 for an EPUB 2 book", () => {
        // XHTML 1.1 has neither the HTML5 doctype nor the `charset` attribute.
        const xhtml = chapterXhtml([chapter("One")], 2);
        expect(xhtml).toContain(
            '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
        );
        expect(xhtml).not.toContain('<meta charset="utf-8"/>');
        expect(xhtml).toContain('http-equiv="Content-Type"');
    });

    it("keeps the reading order of the navigation document the same as the spine", () => {
        // The navigation document has to list its links in reading order. The
        // information page is first in the table of contents, so it has to be
        // first in the spine too.
        const result = packEpub([chapter("One"), chapter("Two")], {
            title: "A Story",
            includeInfoPage: true,
        });

        const tocOrder = result.document.toc.map((point) => point.src);
        const spineOrder = result.document.package.spine.map((item) => {
            const manifestItem = result.document.package.manifest.find(
                (entry) => entry.id === item.idRef,
            );
            return manifestItem?.href ?? "";
        });

        expect(tocOrder).toEqual(spineOrder);
        expect(tocOrder[0]).toBe("text/info.xhtml");
    });
});
