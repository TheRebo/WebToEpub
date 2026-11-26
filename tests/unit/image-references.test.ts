/**
 * Image references inside a chapter.
 *
 * A book that points at the site's own servers is a book that is not really a
 * book: the pictures only work while the reader is online and on the same
 * network as the site, and the reader fetches them from a server that has
 * nothing to do with the book. It is also a privacy leak — the reader's copy
 * of the book reports back to the site every time a chapter is opened.
 *
 * These tests pin down the rule: an image reference either points at a file
 * that is in the book, or it is not there at all.
 */
import { describe, expect, it } from "vitest";
import { rewriteImageElements, type PackagedImage } from "../../src/core/util/image-references";
import { chapterImageHref, packEpub, type ImageData } from "../../src/core/epub/packer";

/** A packaged image, as the rewriter sees it. */
function packaged(url: string): PackagedImage {
    return { url, mediaType: "image/png" };
}

/** The reference a packaged image is reached by. */
const hrefFor = (image: PackagedImage): string => chapterImageHref(image.url, image.mediaType);

/** Parse an HTML fragment into a document. */
function parse(html: string): Document {
    return new DOMParser().parseFromString(html, "text/html");
}

/** The markup of a document's body. */
function body(document: Document): string {
    return document.body.innerHTML;
}

/** An image with some bytes in it. */
function image(url: string, mediaType = "image/png"): ImageData {
    return { data: new Uint8Array([1, 2, 3, 4]), mediaType, url };
}

describe("rewriteImageElements", () => {
    it("points an image at the copy that is in the book", () => {
        const document = parse('<p><img src="https://example.com/a.png"></p>');
        const changed = rewriteImageElements(
            document,
            new Map([["https://example.com/a.png", packaged("https://example.com/a.png")]]),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(true);
        expect(body(document)).toContain("../images/");
        expect(body(document)).not.toContain("https://example.com/a.png");
    });

    it("removes an image that is not in the book", () => {
        const document = parse('<p><img src="https://example.com/a.png"></p>');
        const changed = rewriteImageElements(
            document,
            new Map(),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(true);
        expect(body(document)).not.toContain("<img");
        expect(body(document)).not.toContain("https://example.com");
    });

    it("keeps an image that carries its own bytes", () => {
        // A `data:` URL reaches out to nothing, so it is already safe where it
        // stands, and removing it would throw away a picture the reader can
        // show.
        const document = parse('<p><img src="data:image/png;base64,AAAA"></p>');
        const changed = rewriteImageElements(
            document,
            new Map(),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(false);
        expect(body(document)).toContain("data:image/png");
    });

    it("leaves a reference that already points at the book alone", () => {
        const document = parse('<p><img src="../images/img-a-1234abcd.png"></p>');
        const changed = rewriteImageElements(
            document,
            new Map(),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(false);
        expect(body(document)).toContain("../images/img-a-1234abcd.png");
    });

    it("points the src at the book when only the srcset was packaged", () => {
        // A reader is free to ignore `srcset`, so the `src` has to be right
        // too.
        const document = parse(
            '<p><img src="https://example.com/small.png" srcset="https://example.com/big.png 2x"></p>',
        );
        const changed = rewriteImageElements(
            document,
            new Map([["https://example.com/big.png", packaged("https://example.com/big.png")]]),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(true);
        expect(body(document)).not.toContain("https://example.com/small.png");
        expect(body(document)).not.toContain("https://example.com/big.png");
    });

    it("drops a srcset that holds nothing from the book", () => {
        const document = parse('<p><img srcset="https://example.com/a.png 2x"></p>');
        const changed = rewriteImageElements(
            document,
            new Map(),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(true);
        expect(body(document)).not.toContain("srcset");
    });

    it("removes a picture that is left empty", () => {
        const document = parse(
            '<picture><source srcset="https://example.com/a.webp"><img src="https://example.com/a.png"></picture>',
        );
        const changed = rewriteImageElements(
            document,
            new Map(),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(true);
        expect(body(document)).not.toContain("<picture");
        expect(body(document)).not.toContain("<source");
        expect(body(document)).not.toContain("<img");
    });

    it("says nothing changed when there is nothing to change", () => {
        const document = parse("<p>Just words.</p>");
        const changed = rewriteImageElements(
            document,
            new Map(),
            "https://example.com/c/1",
            hrefFor,
        );

        expect(changed).toBe(false);
    });
});

describe("the packer's image references", () => {
    it("does not leave a chapter pointing at the site's own servers", () => {
        // The download manager rewrites the references it knows about, but the
        // packer cannot rely on that: a chapter whose images were never
        // packaged still has to end up without a live reference.
        const result = packEpub(
            [
                {
                    sourceUrl: "https://example.com/c/1",
                    title: "One",
                    contentHtml: '<p>Hello.</p><img src="https://example.com/a.png">',
                },
            ],
            { title: "A Story" },
        );

        const chapter = result.files.find((file) => file.path.includes("chapter-0001"));
        expect(chapter?.content as string).not.toContain("https://example.com");
    });

    it("points a packaged image at the file that is in the book", () => {
        const images = new Map([["https://example.com/a.png", image("https://example.com/a.png")]]);
        const result = packEpub(
            [
                {
                    sourceUrl: "https://example.com/c/1",
                    title: "One",
                    contentHtml: '<p>Hello.</p><img src="https://example.com/a.png">',
                    images,
                },
            ],
            { title: "A Story" },
        );

        const chapter = result.files.find((file) => file.path.includes("chapter-0001"));
        expect(chapter?.content as string).toContain("../images/");
        expect(chapter?.content as string).not.toContain("https://example.com/a.png");
    });
});
