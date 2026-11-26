import { describe, expect, it } from "vitest";
import {
    buildPlaceholderChapter,
    buildPlaceholderImage,
    extensionFor,
    packEpub,
    stylesheetHref,
    type ChapterToPack,
} from "../../src/core/epub/packer";
import { buildContainerXml, buildXhtml, makeItemId } from "../../src/core/epub/writer";
import { rewriteImageReferences } from "../../src/core/download-manager";
import {
    CONTAINER_PATH,
    MIMETYPE_CONTENT,
    MIMETYPE_PATH,
    NCX_PATH,
    OPF_PATH,
    NAV_PATH,
    CSS_PATH,
} from "../../src/core/epub/document";

/** A chapter with a little content. */
function chapter(title: string, body = "<p>Hello.</p>"): ChapterToPack {
    return { sourceUrl: `https://example.com/${title}`, title, contentHtml: body };
}

/** Parse an XML document, failing loudly if it is not well formed. */
function parseXml(xml: string): Document {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    const error = dom.querySelector("parsererror");
    if (error) throw new Error(`Not well-formed XML: ${error.textContent}`);
    return dom;
}

/**
 * Find an element by its qualified name.
 *
 * CSS selectors cannot address a namespace prefix, so the Dublin Core
 * elements have to be found by name.
 */
function byName(dom: Document, name: string): Element | null {
    return dom.getElementsByTagName(name).item(0);
}

describe("packEpub", () => {
    it("produces a container, a package, a nav document and an NCX", () => {
        const result = packEpub([chapter("One"), chapter("Two")], { title: "A Story" });
        const paths = result.files.map((file) => file.path);
        expect(paths).toContain(CONTAINER_PATH);
        expect(paths).toContain(OPF_PATH);
        expect(paths).toContain(NAV_PATH);
        expect(paths).toContain(NCX_PATH);
    });

    it("writes the OCF mimetype file first", () => {
        const result = packEpub([chapter("One")], { title: "A Story" });
        expect(result.files[0]?.path).toBe(MIMETYPE_PATH);
        expect(result.files[0]?.content).toBe(MIMETYPE_CONTENT);
    });

    it("writes well-formed XML for every document it generates", () => {
        const result = packEpub([chapter("One")], { title: "A Story", author: "An Author" });
        for (const file of result.files) {
            const content = file.content;
            if (typeof content !== "string") continue;
            if (
                !file.path.endsWith(".xml") &&
                !file.path.endsWith(".opf") &&
                !file.path.endsWith(".ncx")
            ) {
                continue;
            }
            expect(() => parseXml(content)).not.toThrow();
        }
    });

    it("lists every chapter in the spine and the table of contents", () => {
        const result = packEpub([chapter("One"), chapter("Two"), chapter("Three")], {
            title: "A Story",
        });
        expect(result.document.package.spine).toHaveLength(3);
        expect(result.document.toc.map((point) => point.label)).toEqual(["One", "Two", "Three"]);
    });

    it("writes the metadata into the package document", () => {
        const result = packEpub([chapter("One")], {
            title: "A Story",
            author: "An Author",
            language: "fr",
            publisher: "A Publisher",
            description: "A description.",
            subjects: ["Fantasy"],
            date: "2024-01-01",
        });
        const opf = result.files.find((file) => file.path === OPF_PATH);
        const xml = parseXml(opf?.content as string);
        expect(byName(xml, "dc:title")?.textContent).toBe("A Story");
        expect(byName(xml, "dc:creator")?.textContent).toBe("An Author");
        expect(byName(xml, "dc:language")?.textContent).toBe("fr");
        expect(byName(xml, "dc:publisher")?.textContent).toBe("A Publisher");
        expect(byName(xml, "dc:subject")?.textContent).toBe("Fantasy");
    });

    it("adds the cover as a manifest item with the cover property", () => {
        const result = packEpub([chapter("One")], {
            title: "A Story",
            cover: { data: new Uint8Array([1, 2, 3]), mediaType: "image/png", url: "cover.png" },
        });
        const item = result.document.package.manifest.find((entry) =>
            entry.properties?.includes("cover-image"),
        );
        expect(item).toBeDefined();
        expect(result.document.package.metadata.coverId).toBe(item?.id);
    });

    it("does not add a cover when there is none", () => {
        const result = packEpub([chapter("One")], { title: "A Story" });
        expect(
            result.document.package.manifest.some((entry) =>
                entry.properties?.includes("cover-image"),
            ),
        ).toBe(false);
    });

    it("does not repeat a title the content already carries", () => {
        const withTitle = packEpub([chapter("One", "<h1>One</h1><p>Hello.</p>")], {
            title: "A Story",
        });
        const body = withTitle.files.find((file) => file.path.includes("chapter-0001"));
        expect((body?.content as string).match(/<h1>/g)).toHaveLength(1);
    });

    it("adds the title when the content does not carry one", () => {
        const withoutTitle = packEpub([chapter("One")], { title: "A Story" });
        const body = withoutTitle.files.find((file) => file.path.includes("chapter-0001"));
        expect((body?.content as string).match(/<h1>/g)).toHaveLength(1);
    });

    it("escapes a title that contains markup", () => {
        const result = packEpub([chapter("<script>alert(1)</script>")], { title: "A Story" });
        const body = result.files.find((file) => file.path.includes("chapter-0001"));
        expect(body?.content as string).not.toContain("<script>");
        expect(body?.content as string).toContain("&lt;script&gt;");
    });

    it("produces an EPUB 2 package when asked", () => {
        const result = packEpub([chapter("One")], { title: "A Story", version: 2 });
        expect(result.document.version).toBe(2);
        expect(result.files.map((file) => file.path)).not.toContain(NAV_PATH);
        // The NCX is written for both versions.
        expect(result.files.map((file) => file.path)).toContain(NCX_PATH);
    });

    it("gives every manifest item a unique ID", () => {
        const result = packEpub([chapter("One"), chapter("Two")], { title: "A Story" });
        const ids = result.document.package.manifest.map((item) => item.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe("buildPlaceholderChapter", () => {
    it("says what happened and where the chapter was", () => {
        const placeholder = buildPlaceholderChapter(
            "https://example.com/c/1",
            "The site refused the request.",
        );
        expect(placeholder.isPlaceholder).toBe(true);
        expect(placeholder.contentHtml).toContain("The site refused the request.");
        expect(placeholder.contentHtml).toContain("https://example.com/c/1");
    });

    it("escapes the reason", () => {
        const placeholder = buildPlaceholderChapter("https://example.com/c/1", "<b>bad</b>");
        expect(placeholder.contentHtml).not.toContain("<b>bad</b>");
    });

    it("keeps the chapter's secrets out of the book", () => {
        // A book's query string can carry a session token, and a book is a
        // file the user passes to other people.
        const placeholder = buildPlaceholderChapter(
            "https://example.com/c/1?token=secret&session=abc",
            "The site refused the request.",
        );
        expect(placeholder.contentHtml).not.toContain("secret");
        expect(placeholder.contentHtml).not.toContain("session");
        expect(placeholder.contentHtml).toContain("https://example.com/c/1");
    });
});

describe("buildPlaceholderImage", () => {
    it("is a real PNG with bytes, not an empty file", () => {
        const image = buildPlaceholderImage();
        expect(image.data.length).toBeGreaterThan(0);
        expect(image.mediaType).toBe("image/png");
        // The PNG signature.
        expect([...image.data.subarray(0, 8)]).toEqual([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]);
    });

    it("is not an SVG, because a reader may not be able to show one", () => {
        // The extension has a setting that says SVG images are not wanted.
        // A placeholder that was itself an SVG would defeat it.
        const image = buildPlaceholderImage();
        expect(image.mediaType).not.toBe("image/svg+xml");
    });

    it("is the same mark every time, so a book carries one copy of it", () => {
        expect(buildPlaceholderImage().url).toBe(buildPlaceholderImage().url);
    });
});

describe("extensionFor", () => {
    it("maps a media type to a file extension", () => {
        expect(extensionFor("image/png")).toBe("png");
        expect(extensionFor("image/jpeg")).toBe("jpg");
        expect(extensionFor("image/svg+xml")).toBe("svg");
        expect(extensionFor("application/octet-stream")).toBe("bin");
    });
});

describe("the XML writers", () => {
    it("writes a container that points at the package document", () => {
        const xml = parseXml(buildContainerXml());
        expect(xml.querySelector("rootfile")?.getAttribute("full-path")).toBe(OPF_PATH);
    });

    it("writes a package document that parses", () => {
        const result = packEpub([chapter("One")], { title: "A Story & <More>" });
        const opf = result.files.find((file) => file.path === OPF_PATH);
        const xml = parseXml(opf?.content as string);
        expect(byName(xml, "dc:title")?.textContent).toBe("A Story & <More>");
    });

    it("writes an NCX with a navigation point per chapter", () => {
        const result = packEpub([chapter("One"), chapter("Two")], { title: "A Story" });
        const ncx = result.files.find((file) => file.path === NCX_PATH);
        const xml = parseXml(ncx?.content as string);
        expect(xml.querySelectorAll("navPoint")).toHaveLength(2);
    });

    it("writes an XHTML document that parses", () => {
        const xhtml = buildXhtml("A Story", "<p>Hello.</p>", "en");
        const xml = parseXml(xhtml);
        expect(xml.querySelector("title")?.textContent).toBe("A Story");
    });

    it("gives each manifest item a unique, readable ID", () => {
        expect(makeItemId(0, "OEBPS/text/chapter-0001.xhtml")).toBe("item-0-chapter0001");
        expect(makeItemId(1, "OEBPS/styles.css")).toBe("item-1-styles");
    });
});

describe("collectFiles", () => {
    it("includes every file the document holds, exactly once", () => {
        const result = packEpub([chapter("One")], { title: "A Story" });
        const paths = result.files.map((file) => file.path);
        expect(new Set(paths).size).toBe(paths.length);
    });
});

describe("the stylesheet reference", () => {
    /**
     * Resolve a relative reference against the path of the file that holds it.
     *
     * This is what a reader does when it follows the link, so it is what the
     * test uses to check that the link points at a file that is really there.
     */
    function resolve(fromFile: string, reference: string): string {
        const parts = fromFile.split("/").slice(0, -1);
        for (const part of reference.split("/")) {
            if (part === "" || part === ".") continue;
            if (part === "..") parts.pop();
            else parts.push(part);
        }
        return parts.join("/");
    }

    it("links the stylesheet from a file in a subdirectory", () => {
        expect(stylesheetHref("OEBPS/text/chapter-0001.xhtml")).toBe("../styles.css");
        expect(stylesheetHref("OEBPS/text/info.xhtml")).toBe("../styles.css");
    });

    it("links the stylesheet from a file in the same directory", () => {
        expect(stylesheetHref("OEBPS/nav.xhtml")).toBe("styles.css");
    });

    it("puts the stylesheet where the reference points", () => {
        const result = packEpub([chapter("One")], { title: "A Story" });
        expect(result.files.map((file) => file.path)).toContain(CSS_PATH);
    });

    it("points every chapter's stylesheet link at a file that is in the book", () => {
        const result = packEpub([chapter("One"), chapter("Two")], {
            title: "A Story",
            includeInfoPage: true,
        });
        const paths = result.files.map((file) => file.path);

        const linking = result.files.filter(
            (file) => file.path.endsWith(".xhtml") && typeof file.content === "string",
        );
        expect(linking.length).toBeGreaterThan(0);

        for (const file of linking) {
            const html = file.content as string;
            const match = /<link[^>]+href="([^"]+)"/.exec(html);
            if (!match?.[1]) continue;
            const target = resolve(file.path, match[1]);
            expect(paths).toContain(target);
        }
    });

    it("points every chapter's image link at a file that is in the book", () => {
        const imageUrl = "https://example.com/img/a.png";
        const image = {
            data: new Uint8Array([1, 2, 3]),
            mediaType: "image/png",
            url: imageUrl,
        };

        // The download manager rewrites the references once the image has been
        // downloaded; the packer packages what it is given.
        const rewritten = rewriteImageReferences(
            `<p>Hello.</p><img src="${imageUrl}">`,
            new Map([[imageUrl, image]]),
            "https://example.com/c/1",
        );

        const result = packEpub(
            [
                {
                    sourceUrl: "https://example.com/c/1",
                    title: "One",
                    contentHtml: rewritten,
                    images: new Map([[imageUrl, image]]),
                },
            ],
            { title: "A Story" },
        );
        const paths = result.files.map((file) => file.path);

        const chapter = result.files.find((file) => file.path.includes("chapter-0001"));
        const html = chapter?.content as string;
        const match = /<img[^>]+src="([^"]+)"/.exec(html);
        expect(match?.[1]).toBeDefined();
        const target = resolve("OEBPS/text/chapter-0001.xhtml", match?.[1] ?? "");
        expect(paths).toContain(target);
    });
});
