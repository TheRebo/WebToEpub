/**
 * Tests for the library entry a download produces.
 *
 * The entry is the user's record of a book: how many chapters it has, and
 * which ones. It used to report the number of chapters that were *asked for*,
 * so a book whose third chapter had failed to download claimed three chapters
 * when it had two.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DownloadManager,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import type { LibraryEntry } from "../../src/core/storage/library-store";
import type { Parser } from "../../src/core/parsers/parser";

/** The chapters of the fake book. */
const CHAPTERS = [
    { sourceUrl: "https://example.com/1", title: "One" },
    { sourceUrl: "https://example.com/2", title: "Two" },
    { sourceUrl: "https://example.com/3", title: "Three" },
];

/**
 * A parser that reads every chapter except the one that is named.
 *
 * @param unreadable The chapter that cannot be read.
 * @returns The parser.
 */
function parser(unreadable?: string): Parser {
    return {
        getRateLimit: () => 0,
        fetchChapter: async (url: string) => {
            if (unreadable && url === unreadable) return null;
            const html = "<html><body><p>Prose.</p></body></html>";
            return new DOMParser().parseFromString(html, "text/html");
        },
        extractAuthor: () => "An Author",
        extractTitleImpl: () => "The Story",
        extractLanguage: () => "en",
        extractSubject: () => null,
        extractDescription: () => null,
        extractPublisher: () => null,
        extractDatePublished: () => null,
        extractChapterContent: () => {
            const element = document.createElement("div");
            element.textContent = "Prose.";
            return element;
        },
        findCoverImageUrl: () => null,
    } as unknown as Parser;
}

/**
 * Build a manager that records what it saves in the library.
 */
function harness(): {
    manager: DownloadManager;
    entries: LibraryEntry[];
} {
    const entries: LibraryEntry[] = [];

    const dependencies: DownloadManagerDependencies = {
        fetchHtml: async (url) => {
            const html =
                url === "https://example.com/story"
                    ? "<html><body><h1>The Story</h1></body></html>"
                    : "<html><body><p>Prose.</p></body></html>";
            return { dom: new DOMParser().parseFromString(html, "text/html"), url };
        },
        fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
        saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
        parserFor: () => parser(),
        throttle: async () => undefined,
        behaviour: async () => ({
            ...DEFAULT_BEHAVIOUR,
            skipFailedChapters: false,
            retryOnEmptyPage: false,
        }),
        saveToLibrary: async (entry) => {
            entries.push(entry);
        },
    };

    const manager = new DownloadManager(dependencies);
    return { manager, entries };
}

/** Wait until the manager reaches a terminal phase. */
async function settle(manager: DownloadManager, jobId: string): Promise<JobProgress> {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        const progress = manager.progress(jobId);
        if (progress && ["complete", "failed", "cancelled"].includes(progress.phase)) {
            return progress;
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("The job never finished.");
}

describe("the library entry a download produces", () => {
    it("counts the chapters that are in the book", async () => {
        const { manager, entries } = harness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        await settle(manager, jobId);
        expect(entries[0]?.chapterCount).toBe(3);
    });

    it("lists the chapters that are in the book", async () => {
        const { manager, entries } = harness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        await settle(manager, jobId);
        expect(entries[0]?.chapterUrls).toEqual([
            "https://example.com/1",
            "https://example.com/2",
            "https://example.com/3",
        ]);
    });

    it("does not count a chapter that failed and was skipped", async () => {
        // The second chapter cannot be read, so it is skipped rather than
        // packed.
        const entries: LibraryEntry[] = [];
        const manager = new DownloadManager({
            fetchHtml: async (url) => {
                const html =
                    url === "https://example.com/story"
                        ? "<html><body><h1>The Story</h1></body></html>"
                        : "<html><body><p>Prose.</p></body></html>";
                return { dom: new DOMParser().parseFromString(html, "text/html"), url };
            },
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
            parserFor: () => parser("https://example.com/2"),
            throttle: async () => undefined,
            behaviour: async () => ({
                ...DEFAULT_BEHAVIOUR,
                skipFailedChapters: true,
                retryOnEmptyPage: false,
            }),
            saveToLibrary: async (entry) => {
                entries.push(entry);
            },
        });

        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        // Two chapters made it into the book, so the library says two.
        expect(entries[0]?.chapterCount).toBe(2);
        expect(entries[0]?.chapterUrls).toEqual(["https://example.com/1", "https://example.com/3"]);
    });

    it("is still recorded when the job was cancelled after the book was written", async () => {
        // The save is the last thing a download does, and the browser cannot
        // call it back. So a job that is cancelled in that moment has already
        // produced its book — and the library must still know about it, or the
        // book is on the disk but nowhere in the user's list.
        const entries: LibraryEntry[] = [];
        let jobId = "";
        const dependencies: DownloadManagerDependencies = {
            fetchHtml: async (url) => {
                const html =
                    url === "https://example.com/story"
                        ? "<html><body><h1>The Story</h1></body></html>"
                        : "<html><body><p>Prose.</p></body></html>";
                return { dom: new DOMParser().parseFromString(html, "text/html"), url };
            },
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => {
                // The user presses cancel just as the book is being written.
                manager.cancel(jobId);
                return { fileName, fileSize: 1 };
            },
            parserFor: () => parser(),
            throttle: async () => undefined,
            behaviour: async () => ({
                ...DEFAULT_BEHAVIOUR,
                retryOnEmptyPage: false,
            }),
            saveToLibrary: async (entry) => {
                entries.push(entry);
            },
        };
        const manager = new DownloadManager(dependencies);

        jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        const progress = await settle(manager, jobId);

        // The user asked for it to stop, so it is reported as cancelled...
        expect(progress.phase).toBe("cancelled");
        // ...but the book is on the disk, so the library knows about it.
        expect(entries.length).toBe(1);
        expect(entries[0]?.chapterCount).toBe(3);
    });
});
