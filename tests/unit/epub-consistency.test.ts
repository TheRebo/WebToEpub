/**
 * The EPUB's internal consistency.
 *
 * The packer builds a book out of several documents that have to agree with
 * each other: the manifest lists the files, the spine refers to the
 * manifest, the navigation document refers to the chapters, and the chapters
 * refer to the images. A book where any of those disagree opens in some
 * readers and is silently broken in others — a missing image, a chapter that
 * is not in the reading order, a stylesheet that is not there.
 *
 * These tests build a book and then check that every reference resolves.
 */
import { describe, expect, it } from "vitest";
import { packEpub, type ChapterToPack } from "../../src/core/epub/packer";
import {
    CONTAINER_PATH,
    CSS_PATH,
    MIMETYPE_PATH,
    NCX_PATH,
    OPF_PATH,
} from "../../src/core/epub/document";

/** A chapter with a little content. */
function chapter(title: string, body = "<p>Hello.</p>"): ChapterToPack {
    return { sourceUrl: `https://example.com/${title}`, title, contentHtml: body };
}

/** A chapter that refers to an image. */
function chapterWithImage(title: string, imageUrl: string): ChapterToPack {
    return {
        sourceUrl: `https://example.com/${title}`,
        title,
        contentHtml: `<p>Look.</p><img src="${imageUrl}" alt="A picture"/>`,
        images: new Map([
            [
                imageUrl,
                {
                    data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
                    mediaType: "image/png",
                    url: imageUrl,
                },
            ],
        ]),
    };
}

/**
 * The path a reference resolves to.
 *
 * A reference inside a container is relative to the file that holds it, so
 * `../styles.css` inside `OEBPS/text/chapter-0001.xhtml` means
 * `OEBPS/styles.css`.
 *
 * @param fromPath The path of the file that holds the reference.
 * @param reference The reference itself.
 * @returns The path the reference points at.
 */
function resolve(fromPath: string, reference: string): string {
    const base = fromPath.split("/").slice(0, -1);
    for (const part of reference.split("/")) {
        if (part === "..") base.pop();
        else if (part !== "." && part !== "") base.push(part);
    }
    return base.join("/");
}

/** Parse an XML document, failing loudly if it is not well formed. */
function parseXml(xml: string): Document {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    const error = dom.querySelector("parsererror");
    if (error) throw new Error(`Not well-formed XML: ${error.textContent}`);
    return dom;
}

describe("the packed book's internal consistency", () => {
    const chapters = [
        chapter("One", "<p>The first chapter.</p>"),
        chapter("Two", "<p>The second chapter.</p>"),
        chapterWithImage("Three", "https://example.com/pictures/cover.png"),
    ];

    const packed = packEpub(chapters, {
        title: "A Story",
        author: "An Author",
        language: "en",
        includeInfoPage: true,
    });

    /** The paths of every file in the book. */
    const paths = new Set(packed.files.map((file) => file.path));

    /** The contents of the book's files, by path. */
    const contents = new Map(
        packed.files.map((file) => [
            file.path,
            typeof file.content === "string"
                ? file.content
                : new TextDecoder().decode(file.content),
        ]),
    );

    it("carries the files the format requires", () => {
        expect(paths.has(MIMETYPE_PATH)).toBe(true);
        expect(paths.has(CONTAINER_PATH)).toBe(true);
        expect(paths.has(OPF_PATH)).toBe(true);
        expect(paths.has(NCX_PATH)).toBe(true);
        expect(paths.has(CSS_PATH)).toBe(true);
    });

    it("points the container document at the package document", () => {
        const container = parseXml(contents.get(CONTAINER_PATH) ?? "");
        const rootfile = container.getElementsByTagName("rootfile").item(0);
        expect(rootfile?.getAttribute("full-path")).toBe(OPF_PATH);
    });

    it("lists only files that are in the book", () => {
        const opf = parseXml(contents.get(OPF_PATH) ?? "");
        const items = Array.from(opf.getElementsByTagName("item"));
        expect(items.length).toBeGreaterThan(0);

        for (const item of items) {
            const href = item.getAttribute("href") ?? "";
            // A manifest href is relative to the package document's directory,
            // which is the container's root.
            expect(paths.has(`OEBPS/${href}`), `missing file for ${href}`).toBe(true);
        }
    });

    it("puts every file in the book in the manifest", () => {
        const opf = parseXml(contents.get(OPF_PATH) ?? "");
        const listed = new Set(
            Array.from(opf.getElementsByTagName("item")).map(
                (item) => `OEBPS/${item.getAttribute("href") ?? ""}`,
            ),
        );
        // The stylesheet, the chapters, the navigation document and the images
        // all have to be listed, or a reader cannot find them.
        for (const path of paths) {
            if (path === OPF_PATH || path === CONTAINER_PATH || path === MIMETYPE_PATH) continue;
            if (path === NCX_PATH) continue;
            expect(listed.has(path), `not in the manifest: ${path}`).toBe(true);
        }
    });

    it("refers only to manifest items that exist", () => {
        const opf = parseXml(contents.get(OPF_PATH) ?? "");
        const ids = new Set(
            Array.from(opf.getElementsByTagName("item")).map((item) => item.getAttribute("id")),
        );
        const itemrefs = Array.from(opf.getElementsByTagName("itemref"));
        expect(itemrefs.length).toBeGreaterThan(0);
        for (const itemref of itemrefs) {
            const idref = itemref.getAttribute("idref") ?? "";
            expect(ids.has(idref), `the spine refers to an unknown item: ${idref}`).toBe(true);
        }
    });

    it("puts every chapter in the reading order", () => {
        const opf = parseXml(contents.get(OPF_PATH) ?? "");
        const itemrefs = Array.from(opf.getElementsByTagName("itemref"));
        // Three chapters and the information page.
        expect(itemrefs.length).toBe(chapters.length + 1);
    });

    it("links the stylesheet from a file that can reach it", () => {
        for (const path of paths) {
            if (!path.endsWith(".xhtml")) continue;
            const html = contents.get(path) ?? "";
            const dom = parseXml(html);
            const link = dom.getElementsByTagName("link").item(0);
            const href = link?.getAttribute("href");
            if (!href) continue;
            expect(paths.has(resolve(path, href)), `${path} links at a missing ${href}`).toBe(true);
        }
    });

    it("points every image reference at a packaged image", () => {
        for (const path of paths) {
            if (!path.endsWith(".xhtml")) continue;
            const dom = parseXml(contents.get(path) ?? "");
            for (const image of Array.from(dom.getElementsByTagName("img"))) {
                const src = image.getAttribute("src") ?? "";
                expect(paths.has(resolve(path, src)), `${path} points at a missing ${src}`).toBe(
                    true,
                );
            }
        }
    });

    it("points the navigation document at files that exist", () => {
        const navPath = "OEBPS/nav.xhtml";
        const dom = parseXml(contents.get(navPath) ?? "");
        const links = Array.from(dom.getElementsByTagName("a"));
        expect(links.length).toBeGreaterThan(0);
        for (const link of links) {
            const href = link.getAttribute("href") ?? "";
            expect(
                paths.has(resolve(navPath, href)),
                `the navigation points at a missing ${href}`,
            ).toBe(true);
        }
    });

    it("points the NCX at files that exist", () => {
        const ncxPath = "OEBPS/toc.ncx";
        const dom = parseXml(contents.get(ncxPath) ?? "");
        const contentsElements = Array.from(dom.getElementsByTagName("content"));
        expect(contentsElements.length).toBeGreaterThan(0);
        for (const content of contentsElements) {
            const src = content.getAttribute("src") ?? "";
            expect(paths.has(resolve(ncxPath, src)), `the NCX points at a missing ${src}`).toBe(
                true,
            );
        }
    });

    it("gives every item in the manifest a unique id", () => {
        const opf = parseXml(contents.get(OPF_PATH) ?? "");
        const ids = Array.from(opf.getElementsByTagName("item")).map((item) =>
            item.getAttribute("id"),
        );
        expect(new Set(ids).size).toBe(ids.length);
    });
});
