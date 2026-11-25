/**
 * Tests for the images a chapter ends up with.
 *
 * The download manager rewrites each chapter's image references once the
 * images have been downloaded, because the packaged file name depends on the
 * media type, which is only known then.
 *
 * The rewrite used to look the images up by the chapter's position in the
 * *packed* list, while they were recorded by the chapter's position in the
 * *requested* list. The two lists are not the same when a chapter is skipped,
 * so the images were attributed to the wrong chapters.
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

/** A parser that gives every chapter its own image. */
function parserWithDistinctImages(
    fetchHtml: (url: string) => Promise<{ dom: Document; url: string }>,
): Parser {
    return {
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
            // The second chapter cannot be read, so it is skipped.
            if (chapter.sourceUrl.endsWith("/2")) return null;
            const element = document.createElement("div");
            const image = document.createElement("img");
            // The image's name is the chapter's own name, so a wrong
            // attribution is visible in the packaged markup.
            image.src = `https://example.com/img-${chapter.sourceUrl.slice(-1)}.png`;
            element.appendChild(image);
            return element;
        },
        findCoverImageUrl: () => null,
    } as unknown as Parser;
}

/**
 * Build a manager whose second chapter always fails.
 *
 * The saved bytes are kept so the packaged chapters can be inspected.
 */
function harness(options: { skipFailedChapters?: boolean } = {}): {
    manager: DownloadManager;
    bytes: () => Uint8Array;
} {
    let saved: Uint8Array = new Uint8Array();

    const fetchHtml = async (url: string) => {
        const html =
            url === "https://example.com/story"
                ? "<html><body><h1>The Story</h1></body></html>"
                : url === "https://example.com/2"
                  ? "<html><body></body></html>"
                  : "<html><body><p>Prose.</p></body></html>";
        return { dom: new DOMParser().parseFromString(html, "text/html"), url };
    };

    const dependencies: DownloadManagerDependencies = {
        fetchHtml,
        fetchBytes: async (url) => ({
            data: new TextEncoder().encode(url),
            mediaType: "image/png",
        }),
        saveFile: async (_fileName, bytes) => {
            saved = bytes;
            return { fileName: "story.epub", fileSize: bytes.length };
        },
        parserFor: () => parserWithDistinctImages(fetchHtml),
        throttle: async () => undefined,
        behaviour: async () => ({
            ...DEFAULT_BEHAVIOUR,
            skipFailedChapters: options.skipFailedChapters ?? true,
        }),
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

describe("the download manager's chapter images", () => {
    it("gives each chapter its own images when an earlier chapter is skipped", async () => {
        const { manager, bytes } = harness();

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
            { sourceUrl: "https://example.com/2", title: "Two" },
            { sourceUrl: "https://example.com/3", title: "Three" },
        ]);
        const progress = await settle(manager, jobId);
        expect(progress.phase, progress.error?.message).toBe("complete");

        const epub = await readEpub(bytes());
        const chapters = [...epub.files.keys()]
            .filter((path) => path.startsWith("OEBPS/text/chapter-"))
            .sort();

        // Chapter 2 is skipped, so the book holds chapters 1 and 3.
        expect(chapters).toHaveLength(2);

        const first = textOf(epub.files.get(chapters[0]!)!);
        const second = textOf(epub.files.get(chapters[1]!)!);

        // Each chapter points at its own image. The packaged reference points
        // into the container's image directory, not at the site's own server.
        expect(first).toContain("../images/");
        expect(second).toContain("../images/");

        const firstReference = /src="([^"]+)"/.exec(first)?.[1] ?? "";
        const secondReference = /src="([^"]+)"/.exec(second)?.[1] ?? "";
        expect(firstReference).not.toBe("");
        expect(secondReference).not.toBe("");
        expect(firstReference).not.toBe(secondReference);
    });

    it("gives each chapter its own images when a failed chapter is kept", async () => {
        const { manager, bytes } = harness({ skipFailedChapters: false });

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
            { sourceUrl: "https://example.com/2", title: "Two" },
            { sourceUrl: "https://example.com/3", title: "Three" },
        ]);
        const progress = await settle(manager, jobId);
        expect(progress.phase, progress.error?.message).toBe("complete");

        const epub = await readEpub(bytes());
        const chapters = [...epub.files.keys()]
            .filter((path) => path.startsWith("OEBPS/text/chapter-"))
            .sort();

        // The failed chapter is kept as a placeholder, so all three are there.
        expect(chapters).toHaveLength(3);

        const first = textOf(epub.files.get(chapters[0]!)!);
        const third = textOf(epub.files.get(chapters[2]!)!);

        // The third chapter must point at its own image, not the first's.
        const firstReference = /src="([^"]+)"/.exec(first)?.[1] ?? "";
        const thirdReference = /src="([^"]+)"/.exec(third)?.[1] ?? "";
        expect(firstReference).toContain("../images/");
        expect(thirdReference).toContain("../images/");
        expect(firstReference).not.toBe(thirdReference);
    });
});
