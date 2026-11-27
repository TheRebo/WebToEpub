/**
 * Tests for the chapters that never arrived.
 *
 * A chapter page can be served successfully and still carry no prose: the
 * site answers with a shell whose content is filled in by a script, or a
 * session has not settled, or a paywall returns a blank page.
 *
 * Such a chapter used to be packed into the book as though it were a real
 * one. The reader found a blank page where the story should be, and the
 * progress said every chapter had loaded.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DownloadManager,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import { readEpub } from "../support/epub-reader";
import type { Parser } from "../../src/core/parsers/parser";

/**
 * Build a manager whose chapters are all empty.
 *
 * @param body The body a chapter page returns.
 * @param skipFailedChapters Whether a failed chapter is kept as a placeholder.
 * @returns The manager, and the bytes it saved.
 */
function harness(
    body: string,
    skipFailedChapters: boolean,
): { manager: DownloadManager; bytes: () => Uint8Array } {
    let saved: Uint8Array = new Uint8Array();

    const fetchHtml = async (url: string) => {
        const html =
            url === "https://example.com/story"
                ? "<html><body><h1>The Story</h1></body></html>"
                : body;
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
        // The default parser's own shape: it falls back to the body when it
        // finds nothing better, so an empty page gives an empty element
        // rather than `null`.
        extractChapterContent: (dom: Document) => dom.querySelector("body"),
        findCoverImageUrl: () => null,
    } as unknown as Parser;

    const dependencies: DownloadManagerDependencies = {
        fetchHtml,
        fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
        saveFile: async (_fileName, bytes) => {
            saved = bytes;
            return { fileName: "story.epub", fileSize: bytes.length };
        },
        parserFor: () => parser,
        throttle: async () => undefined,
        behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, skipFailedChapters }),
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

describe("a chapter that carries no prose", () => {
    it("is counted as a failure rather than a success", async () => {
        const { manager } = harness("<html><body></body></html>", true);

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);
        const progress = await settle(manager, jobId);

        expect(progress.phase, progress.error?.message).toBe("complete");
        expect(progress.finished?.failed).toEqual([0]);
        expect(progress.chaptersDone).toBe(1);
    });

    it("is left out of the book when failed chapters are skipped", async () => {
        const { manager, bytes } = harness("<html><body></body></html>", true);

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);
        await settle(manager, jobId);

        const epub = await readEpub(bytes());
        const chapters = [...epub.files.keys()].filter((path) =>
            path.startsWith("OEBPS/text/chapter-"),
        );
        expect(chapters).toHaveLength(0);
    });

    it("is kept as a placeholder when failed chapters are kept", async () => {
        const { manager, bytes } = harness("<html><body></body></html>", false);

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);
        await settle(manager, jobId);

        const epub = await readEpub(bytes());
        const chapters = [...epub.files.keys()].filter((path) =>
            path.startsWith("OEBPS/text/chapter-"),
        );
        expect(chapters).toHaveLength(1);

        const text = textOf(epub.files.get(chapters[0]!)!);
        expect(text).toContain("could not be read");
    });

    it("is still a chapter when it is only an illustration", async () => {
        // A chapter with no words but with a picture is a real chapter. The
        // reader shows the picture, and there is nothing wrong with it.
        const { manager } = harness(
            "<html><body><img src='https://example.com/1.png'></body></html>",
            true,
        );

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);
        const progress = await settle(manager, jobId);

        expect(progress.phase, progress.error?.message).toBe("complete");
        expect(progress.finished?.failed ?? []).toEqual([]);
    });
});
