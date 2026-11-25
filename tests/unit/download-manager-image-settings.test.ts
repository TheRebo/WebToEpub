/**
 * Tests for the image settings the download pipeline honours.
 *
 * The settings were stored, validated and shown in the options page, and then
 * quietly did nothing: the pipeline read the behaviour settings and ignored
 * the image ones. Turning the images off had no effect, and neither did
 * turning the duplicates off or the SVGs off.
 *
 * These tests pin the enforcement down.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DEFAULT_IMAGES,
    DownloadManager,
    deduplicateImages,
    removeImageReferences,
    type DownloadImages,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import { readEpub } from "../../src/core/epub/reader";
import type { Parser } from "../../src/core/parsers/parser";

/** The text of a file in the container. */
function textOf(file: { content: string | Uint8Array }): string {
    return typeof file.content === "string" ? file.content : new TextDecoder().decode(file.content);
}

/** The harness a test drives. */
interface Harness {
    manager: DownloadManager;
    bytes: () => Uint8Array;
    fetched: () => string[];
}

/**
 * A harness whose chapters each carry one image.
 *
 * The images are named after the chapter, and two of them share their bytes,
 * so the deduplication can be seen.
 */
function harness(options: {
    images?: Partial<DownloadImages>;
    imageBytes?: (url: string) => Uint8Array;
    mediaType?: string;
}): Harness {
    let saved: Uint8Array = new Uint8Array();
    const fetchedUrls: string[] = [];

    const fetchHtml = async (url: string) => {
        const html =
            url === "https://example.com/story"
                ? "<html><body><h1>The Story</h1></body></html>"
                : "<html><body><p>Prose.</p></body></html>";
        return { dom: new DOMParser().parseFromString(html, "text/html"), url };
    };

    const parser = {
        getRateLimit: () => 0,
        fetchChapter: (url: string) => fetchHtml(url).then((result) => result.dom),
        extractAuthor: () => "An Author",
        extractTitleImpl: () => "The Story",
        extractLanguage: () => "en",
        extractSubject: () => null,
        extractDescription: () => null,
        extractPublisher: () => null,
        extractDatePublished: () => null,
        extractChapterContent: (_dom: Document, chapter: { sourceUrl: string }) => {
            const element = document.createElement("div");
            const paragraph = document.createElement("p");
            paragraph.textContent = "Prose.";
            element.appendChild(paragraph);
            const image = document.createElement("img");
            image.src = `https://example.com/img-${chapter.sourceUrl.slice(-1)}.png`;
            element.appendChild(image);
            return element;
        },
        findCoverImageUrl: () => null,
    } as unknown as Parser;

    const dependencies: DownloadManagerDependencies = {
        fetchHtml,
        fetchBytes: async (url) => {
            fetchedUrls.push(url);
            return {
                data: options.imageBytes ? options.imageBytes(url) : new TextEncoder().encode(url),
                mediaType: options.mediaType ?? "image/png",
            };
        },
        saveFile: async (_fileName, bytes) => {
            saved = bytes;
            return { fileName: "story.epub", fileSize: bytes.length };
        },
        parserFor: () => parser,
        throttle: async () => undefined,
        behaviour: async () => ({ ...DEFAULT_BEHAVIOUR }),
        images: async () => ({ ...DEFAULT_IMAGES, ...options.images }),
    };

    return {
        manager: new DownloadManager(dependencies),
        bytes: () => saved,
        fetched: () => fetchedUrls,
    };
}

/** Wait until the manager reaches a terminal phase. */
async function settle(manager: DownloadManager, jobId: string): Promise<JobProgress> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const progress = manager.progress(jobId);
        if (progress && ["complete", "failed", "cancelled"].includes(progress.phase)) {
            return progress;
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("The job never finished.");
}

/** Run a job with the given chapters. */
async function run(
    h: Harness,
    chapters: Array<{ sourceUrl: string; title: string }>,
): Promise<JobProgress> {
    const jobId = h.manager.start("https://example.com/story", "The Story", chapters);
    return settle(h.manager, jobId);
}

describe("the image settings", () => {
    it("leave the images out of the book when the user asks for that", async () => {
        const h = harness({ images: { skipImages: true } });
        const progress = await run(h, [{ sourceUrl: "https://example.com/1", title: "One" }]);
        expect(progress.phase, progress.error?.message).toBe("complete");

        // No image was fetched at all.
        expect(h.fetched()).toHaveLength(0);

        const epub = await readEpub(h.bytes());
        const chapter = [...epub.files.keys()].find((path) =>
            path.startsWith("OEBPS/text/chapter-"),
        );
        const text = textOf(epub.files.get(chapter!)!);
        // The reference is gone, rather than left pointing at the site.
        expect(text).not.toContain("<img");
        expect(text).not.toContain("example.com/img-1.png");
    });

    it("keep the images when the user has not asked for them to be left out", async () => {
        const h = harness({ images: { skipImages: false } });
        await run(h, [{ sourceUrl: "https://example.com/1", title: "One" }]);

        expect(h.fetched()).toHaveLength(1);

        const epub = await readEpub(h.bytes());
        const chapter = [...epub.files.keys()].find((path) =>
            path.startsWith("OEBPS/text/chapter-"),
        );
        const text = textOf(epub.files.get(chapter!)!);
        expect(text).toContain("../images/");
    });

    it("replace an SVG with a placeholder when the user does not want SVGs", async () => {
        const h = harness({ images: { useSvg: false }, mediaType: "image/svg+xml" });
        await run(h, [{ sourceUrl: "https://example.com/1", title: "One" }]);

        const epub = await readEpub(h.bytes());
        const images = [...epub.files.keys()].filter((path) => path.startsWith("OEBPS/images/"));
        expect(images).toHaveLength(1);
        // The packaged file is the extension's own placeholder, not the SVG the
        // site served. The placeholder names the source so the user can tell
        // which picture is missing, so the URL is expected in the text — what
        // must not be there is the site's own SVG.
        expect(images[0]).toMatch(/\.svg$/);
        const text = textOf(epub.files.get(images[0]!)!);
        expect(text).toContain("<svg");
        expect(text).toContain("Image unavailable");
        expect(text).not.toContain('http://www.w3.org/2000/svg" base');
    });

    it("keep an SVG when the user wants SVGs", async () => {
        const h = harness({ images: { useSvg: true }, mediaType: "image/svg+xml" });
        await run(h, [{ sourceUrl: "https://example.com/1", title: "One" }]);

        const epub = await readEpub(h.bytes());
        const images = [...epub.files.keys()].filter((path) => path.startsWith("OEBPS/images/"));
        expect(images).toHaveLength(1);
        const text = textOf(epub.files.get(images[0]!)!);
        expect(text).toContain("example.com/img-1.png");
    });
});

describe("removeImageReferences", () => {
    it("removes the images from the content", () => {
        const element = document.createElement("div");
        element.innerHTML =
            '<p>Prose.</p><img src="https://example.com/a.png"><picture><source srcset="b.png"><img src="c.png"></picture>';
        removeImageReferences(element);
        expect(element.querySelectorAll("img")).toHaveLength(0);
        expect(element.querySelectorAll("picture")).toHaveLength(0);
        // The prose is left alone.
        expect(element.textContent).toContain("Prose.");
    });
});

describe("deduplicateImages", () => {
    it("points two copies of the same picture at one file", () => {
        const bytes = new TextEncoder().encode("the same picture");
        const images = new Map([
            [
                "https://example.com/a.png",
                { data: bytes, mediaType: "image/png", url: "https://example.com/a.png" },
            ],
            [
                "https://example.com/b.png",
                { data: bytes.slice(), mediaType: "image/png", url: "https://example.com/b.png" },
            ],
            [
                "https://example.com/c.png",
                {
                    data: new TextEncoder().encode("another picture"),
                    mediaType: "image/png",
                    url: "https://example.com/c.png",
                },
            ],
        ]);
        deduplicateImages(images);
        // The duplicate now holds the same bytes as the original.
        expect(images.get("https://example.com/b.png")?.data).toEqual(bytes);
        // The different picture is untouched.
        expect(new TextDecoder().decode(images.get("https://example.com/c.png")!.data)).toBe(
            "another picture",
        );
    });

    it("leaves a failed image alone", () => {
        const images = new Map([
            [
                "https://example.com/a.png",
                { data: new Uint8Array(), mediaType: "", url: "https://example.com/a.png" },
            ],
            [
                "https://example.com/b.png",
                { data: new Uint8Array(), mediaType: "", url: "https://example.com/b.png" },
            ],
        ]);
        deduplicateImages(images);
        expect(images.get("https://example.com/b.png")?.url).toBe("https://example.com/b.png");
    });
});
