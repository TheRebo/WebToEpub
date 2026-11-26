/**
 * Reading a book back, and writing it again.
 *
 * The extension does not only make books — it can read one. A book that is
 * read and written again has to come out the same, and a book that is read
 * must not be *misread* in a way that quietly loses the reader's place.
 *
 * The bugs under test:
 *
 *  - the navigation document's landmarks were read as the table of contents,
 *    because the first `<nav>` was taken rather than the one marked
 *    `epub:type="toc"`;
 *  - a nested chapter was read twice, once as a chapter of its part and once
 *    as a chapter of the book;
 *  - the modification date was written but never read back, so a book that was
 *    read and written again carried an empty date;
 *  - the NCX's identifiers collided once the book had more than a hundred
 *    chapters.
 */
import { describe, expect, it } from "vitest";
import { readEpubFromFiles } from "../../src/core/epub/reader";
import { buildNcxXml, buildPackageXml } from "../../src/core/epub/writer";
import type { EpubDocument, EpubFile, NavigationPoint } from "../../src/core/epub/document";

/** A file in a fake container. */
function file(path: string, content: string): EpubFile {
    return { path, content, mediaType: "application/octet-stream" };
}

/** The files of a minimal EPUB 3 container. */
function containerFiles(options: { nav?: string; opf?: string }): Map<string, EpubFile> {
    const files = new Map<string, EpubFile>();
    files.set(
        "META-INF/container.xml",
        file(
            "META-INF/container.xml",
            `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
        ),
    );
    files.set(
        "OEBPS/content.opf",
        file(
            "OEBPS/content.opf",
            options.opf ??
                `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:1234</dc:identifier>
    <dc:title>A Story</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2024-01-02T03:04:05Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    <itemref idref="nav"/>
  </spine>
</package>`,
        ),
    );
    files.set(
        "OEBPS/nav.xhtml",
        file(
            "OEBPS/nav.xhtml",
            options.nav ??
                `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter-0001.xhtml">One</a></li>
      </ol>
    </nav>
  </body>
</html>`,
        ),
    );
    return files;
}

describe("the navigation document", () => {
    it("reads the table of contents, not the landmarks", () => {
        // A navigation document usually carries more than one `<nav>`. The
        // landmarks list is a handful of links to the book's own structure,
        // and reading it as the chapter list would give the reader a
        // contents page with three entries.
        const files = containerFiles({
            nav: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="landmarks">
      <ol>
        <li><a href="chapter-0001.xhtml">Start reading</a></li>
      </ol>
    </nav>
    <nav epub:type="toc">
      <ol>
        <li><a href="chapter-0001.xhtml">One</a></li>
        <li><a href="chapter-0002.xhtml">Two</a></li>
      </ol>
    </nav>
  </body>
</html>`,
        });

        const { document } = readEpubFromFiles(files);
        expect(document.toc).toHaveLength(2);
        expect(document.toc.map((point) => point.label)).toEqual(["One", "Two"]);
    });

    it("reads a navigation document that has no type", () => {
        // The specification says the `toc` type is the default, so a `<nav>`
        // with no type is the table of contents.
        const files = containerFiles({
            nav: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <nav>
      <ol>
        <li><a href="chapter-0001.xhtml">One</a></li>
      </ol>
    </nav>
  </body>
</html>`,
        });

        const { document } = readEpubFromFiles(files);
        expect(document.toc.map((point) => point.label)).toEqual(["One"]);
    });

    it("reads a nested chapter once, not twice", () => {
        // A chapter that belongs to a part is listed under that part. It is
        // also a descendant of the outer list, so a reader that collects
        // every `<li>` it can find puts it in the table of contents twice.
        const files = containerFiles({
            nav: `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body>
    <nav epub:type="toc">
      <ol>
        <li>
          <a href="part-0001.xhtml">Part One</a>
          <ol>
            <li><a href="chapter-0001.xhtml">One</a></li>
            <li><a href="chapter-0002.xhtml">Two</a></li>
          </ol>
        </li>
        <li><a href="part-0002.xhtml">Part Two</a></li>
      </ol>
    </nav>
  </body>
</html>`,
        });

        const { document } = readEpubFromFiles(files);
        expect(document.toc).toHaveLength(2);
        expect(document.toc[0]?.label).toBe("Part One");
        expect(document.toc[0]?.children.map((point) => point.label)).toEqual(["One", "Two"]);
        expect(document.toc[1]?.label).toBe("Part Two");

        // The chapters are not in the top-level list as well.
        const labels = document.toc.map((point) => point.label);
        expect(labels).not.toContain("One");
    });
});

describe("the modification date", () => {
    it("is read back", () => {
        const { document } = readEpubFromFiles(containerFiles({}));
        expect(document.package.metadata.modified).toBe("2024-01-02T03:04:05Z");
    });

    it("is written again, and is never empty", () => {
        // A book read from somewhere that did not carry the date must still
        // have one when it is written: EPUB 3 requires the element, and an
        // empty element is not a valid date.
        const { document } = readEpubFromFiles(containerFiles({}));
        document.package.metadata.modified = undefined;

        const xml = buildPackageXml(document);
        const match = /<meta property="dcterms:modified">([^<]*)<\/meta>/.exec(xml);
        expect(match).not.toBeNull();
        expect(match?.[1]).not.toBe("");
        expect(match?.[1]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
});

describe("the NCX", () => {
    /** A document with a table of contents of the given shape. */
    function documentWithToc(toc: NavigationPoint[]): EpubDocument {
        return {
            version: 2,
            package: {
                uniqueIdentifier: "id",
                version: 2,
                metadata: {
                    title: "A Story",
                    creators: ["An Author"],
                    language: "en",
                    subjects: [],
                    identifier: "urn:uuid:1234",
                },
                manifest: [],
                spine: [],
            },
            files: new Map(),
            toc,
        };
    }

    it("gives every navigation point its own identifier", () => {
        // The identifiers used to be computed as `id * 100 + index + 1` for a
        // child, which collided as soon as the book had more than a hundred
        // chapters.
        const toc: NavigationPoint[] = Array.from({ length: 150 }, (_, index) => ({
            label: `Chapter ${index + 1}`,
            src: `chapter-${index + 1}.xhtml`,
            children: [],
        }));
        toc[0] = {
            ...toc[0]!,
            children: [{ label: "A sub-chapter", src: "sub.xhtml", children: [] }],
        };

        const xml = buildNcxXml(documentWithToc(toc));
        const ids = Array.from(xml.matchAll(/<navPoint id="([^"]+)"/g)).map((match) => match[1]);
        expect(ids).toHaveLength(151);
        expect(new Set(ids).size).toBe(151);
    });

    it("gives every navigation point its own play order", () => {
        // The play order is the order the reader meets the content in, so it
        // has to be different for every point — including the ones nested
        // inside a part.
        const toc: NavigationPoint[] = Array.from({ length: 120 }, (_, index) => ({
            label: `Chapter ${index + 1}`,
            src: `chapter-${index + 1}.xhtml`,
            children:
                index === 0 ? [{ label: "A sub-chapter", src: "sub.xhtml", children: [] }] : [],
        }));

        const xml = buildNcxXml(documentWithToc(toc));
        const orders = Array.from(xml.matchAll(/playOrder="([^"]+)"/g)).map((match) => match[1]);
        expect(orders).toHaveLength(121);
        expect(new Set(orders).size).toBe(121);
    });

    it("numbers the points in the order the reader meets them", () => {
        const xml = buildNcxXml(
            documentWithToc([
                {
                    label: "Part One",
                    src: "part.xhtml",
                    children: [{ label: "One", src: "one.xhtml", children: [] }],
                },
                { label: "Part Two", src: "part2.xhtml", children: [] },
            ]),
        );
        const orders = Array.from(xml.matchAll(/playOrder="([^"]+)"/g)).map((match) => match[1]);
        expect(orders).toEqual(["1", "2", "3"]);
    });
});
