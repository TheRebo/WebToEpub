/**
 * Tests for the "store an image once" setting.
 *
 * A book often shows the same picture more than once — a banner at the top of
 * every chapter, a divider between volumes. The setting says such a picture is
 * stored once. It has to mean that the *book* holds one copy of the file, and
 * not merely that the download manager remembers one copy of the bytes.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DownloadManager,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import { readEpub } from "../../src/core/epub/reader";
import type { Parser } from "../../src/core/parsers/parser";

/**
 * Build a manager whose chapters each show a different URL serving the very
 * same picture.
 */
function harness(): { manager: DownloadManager; bytes: () => Uint8Array } {
    let saved: Uint8Array = new Uint8Array();

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
            const image = document.createElement("img");
            // Two different URLs, one picture.
            image.src = `https://example.com/banner-${chapter.sourceUrl.slice(-1)}.png`;
            element.appendChild(image);
            return element;
        },
        findCoverImageUrl: () => null,
    } as unknown as Parser;

    const dependencies: DownloadManagerDependencies = {
        fetchHtml,
        fetchBytes: async () => ({
            // Every URL serves the same bytes.
            data: new TextEncoder().encode("the very same picture"),
            mediaType: "image/png",
        }),
        saveFile: async (_fileName, bytes) => {
            saved = bytes;
            return { fileName: "story.epub", fileSize: bytes.length };
        },
        parserFor: () => parser,
        throttle: async () => undefined,
        behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, skipFailedChapters: true }),
    };

    return { manager: new DownloadManager(dependencies), bytes: () => saved };
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

/** The text of a file in the container. */
function textOf(file: { content: string | Uint8Array }): string {
    return typeof file.content === "string" ? file.content : new TextDecoder().decode(file.content);
}

describe("an image that appears twice", () => {
    it("is stored once, and both chapters point at the one copy", async () => {
        const { manager, bytes } = harness();

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
            { sourceUrl: "https://example.com/2", title: "Two" },
        ]);
        const progress = await settle(manager, jobId);
        expect(progress.phase, progress.error?.message).toBe("complete");

        const epub = await readEpub(bytes());
        const images = [...epub.files.keys()].filter((path) => path.startsWith("OEBPS/images/"));
        const chapters = [...epub.files.keys()]
            .filter((path) => path.startsWith("OEBPS/text/chapter-"))
            .sort();

        // One picture is in the book, not one per chapter.
        expect(images).toHaveLength(1);

        // Both chapters show it, and both point at the copy that is there.
        const references = chapters.map((path) => {
            const html = textOf(epub.files.get(path)!);
            return /src="([^"]+)"/.exec(html)?.[1] ?? "";
        });
        expect(references[0]).not.toBe("");
        expect(references[0]).toBe(references[1]);
        expect(references[0]).toContain(images[0]!.replace(/^OEBPS\/images\//, "../images/"));
    });
});
