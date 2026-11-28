/**
 * The image pipeline.
 *
 * A chapter's images used to be downloaded and then thrown away: the
 * download manager collected them, fetched them, and never told the packer
 * about them. The result was an EPUB whose chapters pointed at the site's
 * own servers — which are not in the EPUB — so every picture in every book
 * was broken.
 *
 * These tests cover the three things that have to agree for a picture to
 * work: the image is downloaded, the chapter's markup points at the
 * packaged file, and the packaged file is in the container with a manifest
 * entry.
 */
import { describe, expect, it } from "vitest";
import {
    chapterImageHref,
    imageFileName,
    imagePath,
    packEpub,
    type ChapterToPack,
    type ImageData,
} from "../../src/core/epub/packer";
import { collectImageUrls, rewriteImageReferences } from "../../src/core/download-manager";
import { parseSrcset, pickSrcsetCandidate } from "../../src/core/util/image-references";
import { OPF_PATH } from "../../src/core/epub/document";

/** An image with some bytes in it. */
function image(url: string, mediaType = "image/png"): ImageData {
    return { data: new Uint8Array([1, 2, 3, 4]), mediaType, url };
}

/** Parse an XML document, failing loudly if it is not well formed. */
function parseXml(xml: string): Document {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    const error = dom.querySelector("parsererror");
    if (error) throw new Error(`Not well-formed XML: ${error.textContent}`);
    return dom;
}

/** Parse an HTML fragment into an element. */
function fragment(html: string): Element {
    const dom = new DOMParser().parseFromString(html, "text/html");
    return dom.body;
}

describe("the packaged image's identity", () => {
    it("gives the same image the same file name every time", () => {
        const url = "https://example.com/images/cover.png";
        expect(imageFileName(url, "image/png")).toBe(imageFileName(url, "image/png"));
    });

    it("keeps two images with the same base name apart", () => {
        const first = imageFileName("https://a.example.com/cover.png", "image/png");
        const second = imageFileName("https://b.example.com/cover.png", "image/png");
        expect(first).not.toBe(second);
    });

    it("keeps a chapter image away from the cover", () => {
        expect(imageFileName("https://example.com/cover.png", "image/png")).not.toContain(
            /^cover\./,
        );
    });

    it("puts the image in the images directory", () => {
        expect(imagePath("https://example.com/a.png", "image/png")).toBe(
            "OEBPS/images/" + imageFileName("https://example.com/a.png", "image/png"),
        );
    });

    it("uses the extension that matches the media type", () => {
        expect(imageFileName("https://example.com/a", "image/jpeg")).toMatch(/\.jpg$/);
        expect(imageFileName("https://example.com/a", "image/svg+xml")).toMatch(/\.svg$/);
    });

    it("gives a name to an image whose URL has no useful file name", () => {
        expect(imageFileName("https://example.com/", "image/png")).toContain("img-");
    });
});

describe("the reference a chapter uses", () => {
    it("points one directory up, because chapters live in OEBPS/text", () => {
        const href = chapterImageHref("https://example.com/a.png", "image/png");
        expect(href.startsWith("../images/")).toBe(true);
    });

    it("matches the name the packer writes", () => {
        const url = "https://example.com/a.png";
        expect(chapterImageHref(url, "image/png")).toBe(
            "../images/" + imageFileName(url, "image/png"),
        );
    });
});

describe("collectImageUrls", () => {
    it("finds an image's src", () => {
        const content = fragment('<p><img src="https://example.com/a.png"></p>');
        expect(collectImageUrls(content, "https://example.com/c/1")).toEqual(
            new Set(["https://example.com/a.png"]),
        );
    });

    it("resolves a relative src against the chapter's URL", () => {
        const content = fragment('<p><img src="../images/a.png"></p>');
        expect(collectImageUrls(content, "https://example.com/c/1")).toEqual(
            new Set(["https://example.com/images/a.png"]),
        );
    });

    it("keeps only one candidate of a srcset", () => {
        // A `srcset` lists the same picture at several sizes. Keeping them
        // all would put every size of every picture into the book.
        const content = fragment(
            '<p><img srcset="https://example.com/a.png 1x, https://example.com/b.png 2x"></p>',
        );
        expect(collectImageUrls(content, "https://example.com/c/1")).toEqual(
            new Set(["https://example.com/a.png"]),
        );
    });

    it("keeps the largest candidate of a srcset when the user asks for it", () => {
        const content = fragment(
            '<p><img srcset="https://example.com/a.png 1x, https://example.com/b.png 2x"></p>',
        );
        expect(
            collectImageUrls(content, "https://example.com/c/1", {
                preferHighestResolution: true,
            }),
        ).toEqual(new Set(["https://example.com/b.png"]));
    });

    it("keeps the widest candidate of a srcset when the user asks for it", () => {
        const content = fragment(
            '<p><img srcset="https://example.com/a.png 320w, https://example.com/b.png 1280w"></p>',
        );
        expect(
            collectImageUrls(content, "https://example.com/c/1", {
                preferHighestResolution: true,
            }),
        ).toEqual(new Set(["https://example.com/b.png"]));
    });

    it("prefers the srcset over the src when the user asks for the largest", () => {
        const content = fragment(
            '<p><img src="https://example.com/a.png" srcset="https://example.com/b.png 2x"></p>',
        );
        expect(
            collectImageUrls(content, "https://example.com/c/1", {
                preferHighestResolution: true,
            }),
        ).toEqual(new Set(["https://example.com/b.png"]));
    });

    it("uses the src when the user does not ask for the largest", () => {
        const content = fragment(
            '<p><img src="https://example.com/a.png" srcset="https://example.com/b.png 2x"></p>',
        );
        expect(collectImageUrls(content, "https://example.com/c/1")).toEqual(
            new Set(["https://example.com/a.png"]),
        );
    });

    it("takes one image from a picture", () => {
        // The `<source>` and the `<img>` are the same picture in two formats.
        // Only one of them goes into the book.
        const content = fragment(
            '<picture><source srcset="https://example.com/a.webp"><img src="https://example.com/a.png"></picture>',
        );
        expect(collectImageUrls(content, "https://example.com/c/1")).toEqual(
            new Set(["https://example.com/a.png"]),
        );
    });

    it("falls back to a picture's source when the image has no reference", () => {
        const content = fragment(
            '<picture><source srcset="https://example.com/a.webp"><img alt="a"></picture>',
        );
        expect(collectImageUrls(content, "https://example.com/c/1")).toEqual(
            new Set(["https://example.com/a.webp"]),
        );
    });

    it("ignores a javascript: URL", () => {
        const content = fragment('<p><img src="javascript:alert(1)"></p>');
        expect(collectImageUrls(content, "https://example.com/c/1").size).toBe(0);
    });

    it("ignores a data: URL", () => {
        const content = fragment('<p><img src="data:image/png;base64,AAAA"></p>');
        expect(collectImageUrls(content, "https://example.com/c/1").size).toBe(0);
    });
});

describe("parseSrcset", () => {
    it("reads a candidate and its descriptor", () => {
        expect(parseSrcset("https://example.com/a.png 2x")).toEqual([
            { url: "https://example.com/a.png", descriptor: "2x" },
        ]);
    });

    it("reads a candidate with no descriptor", () => {
        expect(parseSrcset("https://example.com/a.png")).toEqual([
            { url: "https://example.com/a.png", descriptor: "" },
        ]);
    });

    it("reads several candidates", () => {
        expect(parseSrcset("a.png 1x, b.png 2x")).toHaveLength(2);
    });

    it("returns nothing for an absent attribute", () => {
        expect(parseSrcset(null)).toEqual([]);
    });

    it("keeps a comma that is part of a URL", () => {
        expect(parseSrcset("https://example.com/a,b.png 2x")).toEqual([
            { url: "https://example.com/a,b.png", descriptor: "2x" },
        ]);
    });

    it("reads a candidate that follows a comma without a space", () => {
        expect(parseSrcset("a.png 1x,b.png 2x")).toEqual([
            { url: "a.png", descriptor: "1x" },
            { url: "b.png", descriptor: "2x" },
        ]);
    });
});

describe("pickSrcsetCandidate", () => {
    it("returns nothing when there are no candidates", () => {
        expect(pickSrcsetCandidate([], true)).toBeUndefined();
    });

    it("takes the first candidate when the user does not ask for the largest", () => {
        const candidates = parseSrcset("a.png 1x, b.png 2x");
        expect(pickSrcsetCandidate(candidates, false)?.url).toBe("a.png");
    });

    it("takes the largest density when the user asks for it", () => {
        const candidates = parseSrcset("a.png 1x, b.png 2x");
        expect(pickSrcsetCandidate(candidates, true)?.url).toBe("b.png");
    });

    it("takes the widest candidate when the user asks for it", () => {
        const candidates = parseSrcset("a.png 320w, b.png 1280w");
        expect(pickSrcsetCandidate(candidates, true)?.url).toBe("b.png");
    });

    it("takes the last candidate when the descriptors cannot be compared", () => {
        const candidates = parseSrcset("a.png, b.png");
        expect(pickSrcsetCandidate(candidates, true)?.url).toBe("b.png");
    });
});

describe("rewriteImageReferences", () => {
    it("points an image at the packaged file", () => {
        const url = "https://example.com/a.png";
        const images = new Map([[url, image(url)]]);
        const html = rewriteImageReferences(
            '<p><img src="https://example.com/a.png"></p>',
            images,
            "https://example.com/c/1",
        );
        expect(html).toContain("../images/");
        expect(html).not.toContain("https://example.com/a.png");
    });

    it("resolves a relative reference before rewriting it", () => {
        const url = "https://example.com/images/a.png";
        const images = new Map([[url, image(url)]]);
        const html = rewriteImageReferences(
            '<p><img src="../images/a.png"></p>',
            images,
            "https://example.com/c/1",
        );
        expect(html).toContain("../images/");
    });

    it("rewrites every candidate in a srcset", () => {
        const first = "https://example.com/a.png";
        const second = "https://example.com/b.png";
        const images = new Map([
            [first, image(first)],
            [second, image(second)],
        ]);
        const html = rewriteImageReferences(
            '<p><img srcset="https://example.com/a.png 1x, https://example.com/b.png 2x"></p>',
            images,
            "https://example.com/c/1",
        );
        expect(html).toContain("1x");
        expect(html).toContain("2x");
        expect(html).not.toContain("https://example.com/a.png");
    });

    it("drops a srcset candidate that is not in the book", () => {
        // A candidate left pointing at the site would be fetched from the
        // network every time the chapter is opened.
        const first = "https://example.com/a.png";
        const images = new Map([[first, image(first)]]);
        const html = rewriteImageReferences(
            '<p><img srcset="https://example.com/a.png 1x, https://example.com/b.png 2x"></p>',
            images,
            "https://example.com/c/1",
        );
        expect(html).toContain("1x");
        expect(html).not.toContain("2x");
        expect(html).not.toContain("https://example.com/b.png");
    });

    it("drops a srcset that has nothing in the book", () => {
        const html = rewriteImageReferences(
            '<p><img srcset="https://example.com/b.png 2x"></p>',
            new Map(),
            "https://example.com/c/1",
        );
        expect(html).not.toContain("srcset");
        expect(html).not.toContain("https://example.com/b.png");
    });

    it("points the src at the packaged file when only the srcset was packaged", () => {
        const second = "https://example.com/b.png";
        const images = new Map([[second, image(second)]]);
        const html = rewriteImageReferences(
            '<p><img src="https://example.com/a.png" srcset="https://example.com/b.png 2x"></p>',
            images,
            "https://example.com/c/1",
        );
        expect(html).toContain(`src="../images/`);
        expect(html).not.toContain("https://example.com/a.png");
    });

    it("removes a source that has nothing in the book", () => {
        const html = rewriteImageReferences(
            '<picture><source srcset="https://example.com/b.webp"><img src="https://example.com/a.png"></picture>',
            new Map(),
            "https://example.com/c/1",
        );
        expect(html).not.toContain("source");
        expect(html).not.toContain("https://example.com/b.webp");
    });

    it("removes an image it does not have", () => {
        // Leaving it would point the reader at the site's own servers, which
        // are not in the book.
        const html = rewriteImageReferences(
            '<p><img src="https://example.com/other.png"></p>',
            new Map(),
            "https://example.com/c/1",
        );
        expect(html).not.toContain("<img");
        expect(html).not.toContain("https://example.com/other.png");
    });

    it("does not touch text that merely mentions a URL", () => {
        const url = "https://example.com/a.png";
        const images = new Map([[url, image(url)]]);
        const html = rewriteImageReferences(
            `<p>See ${url} for details.</p>`,
            images,
            "https://example.com/c/1",
        );
        expect(html).toContain(url);
    });
});

describe("packEpub", () => {
    it("writes a chapter's image into the container", () => {
        const url = "https://example.com/a.png";
        const withImage: ChapterToPack = {
            sourceUrl: "https://example.com/c/1",
            title: "One",
            contentHtml: '<p><img src="../images/a.png"></p>',
            images: new Map([[url, image(url)]]),
        };
        const result = packEpub([withImage], { title: "A Story" });
        const paths = result.files.map((file) => file.path);
        expect(paths).toContain(imagePath(url, "image/png"));
    });

    it("gives the image a manifest entry, so a reader can find it", () => {
        const url = "https://example.com/a.png";
        const withImage: ChapterToPack = {
            sourceUrl: "https://example.com/c/1",
            title: "One",
            contentHtml: '<p><img src="../images/a.png"></p>',
            images: new Map([[url, image(url)]]),
        };
        const result = packEpub([withImage], { title: "A Story" });
        const opf = result.files.find((file) => file.path === OPF_PATH);
        const xml = parseXml(opf?.content as string);
        const items = [...xml.querySelectorAll("item")];
        const imageItem = items.find((item) => item.getAttribute("href")?.startsWith("images/"));
        expect(imageItem).toBeDefined();
        expect(imageItem?.getAttribute("media-type")).toBe("image/png");
    });

    it("writes an image that two chapters share only once", () => {
        const url = "https://example.com/a.png";
        const shared = new Map([[url, image(url)]]);
        const result = packEpub(
            [
                {
                    sourceUrl: "https://example.com/c/1",
                    title: "One",
                    contentHtml: "",
                    images: shared,
                },
                {
                    sourceUrl: "https://example.com/c/2",
                    title: "Two",
                    contentHtml: "",
                    images: shared,
                },
            ],
            { title: "A Story" },
        );
        const imagePaths = result.files
            .map((file) => file.path)
            .filter((path) => path.startsWith("OEBPS/images/"));
        expect(imagePaths).toHaveLength(1);
    });

    it("does not write an image with no bytes", () => {
        // A zero-byte file corrupts the EPUB for any reader that validates
        // the archive.
        const url = "https://example.com/a.png";
        const result = packEpub(
            [
                {
                    sourceUrl: "https://example.com/c/1",
                    title: "One",
                    contentHtml: "",
                    images: new Map([
                        [url, { data: new Uint8Array(), mediaType: "image/png", url }],
                    ]),
                },
            ],
            { title: "A Story" },
        );
        expect(result.files.map((file) => file.path)).not.toContain(imagePath(url, "image/png"));
    });

    it("keeps a chapter image away from the cover", () => {
        const url = "https://example.com/a.png";
        const result = packEpub(
            [
                {
                    sourceUrl: "https://example.com/c/1",
                    title: "One",
                    contentHtml: "",
                    images: new Map([[url, image(url)]]),
                },
            ],
            {
                title: "A Story",
                cover: { data: new Uint8Array([1]), mediaType: "image/png", url: "cover.png" },
            },
        );
        const paths = result.files.map((file) => file.path);
        expect(paths).toContain("OEBPS/images/cover.png");
        expect(paths).toContain(imagePath(url, "image/png"));
    });
});
