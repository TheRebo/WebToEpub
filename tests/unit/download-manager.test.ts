/**
 * Tests for the download manager's behaviour settings.
 *
 * The options page exposes a set of behaviour settings — how long to wait
 * between chapters, how many chapters a book may have, whether a chapter
 * that fails is kept or skipped. Those settings were editable but never
 * enforced, so the user's choices did nothing at all.
 *
 * These tests pin down the behaviour that the settings now control.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DownloadManager,
    type DownloadBehaviour,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import type { Parser } from "../../src/core/parsers/parser";
import type { LibraryEntry } from "../../src/core/storage/library-store";

/** A chapter of the fake book. */
const CHAPTERS = [
    { sourceUrl: "https://example.com/1", title: "One" },
    { sourceUrl: "https://example.com/2", title: "Two" },
];

/** The delays the manager asked for. */
interface Harness {
    manager: DownloadManager;
    /** The delays the manager waited for. */
    delays: number[];
    /** The URLs that were fetched. */
    fetched: string[];
    /** The last progress reported. */
    progress: () => JobProgress | undefined;
    /** The saved files. */
    saved: string[];
}

/**
 * Build a manager whose fetch always succeeds with the given body.
 */
function harness(
    options: {
        behaviour?: Partial<DownloadBehaviour>;
        /** The body a chapter page returns. */
        body?: string;
        /** The body the story's page returns. */
        storyBody?: string;
    } = {},
): Harness {
    const delays: number[] = [];
    const fetched: string[] = [];
    const saved: string[] = [];
    const reports: JobProgress[] = [];

    const body = options.body ?? "<html><body><p>Prose.</p></body></html>";
    const storyBody = options.storyBody ?? "<html><body><h1>The Story</h1></body></html>";

    const dependencies: DownloadManagerDependencies = {
        fetchHtml: async (url) => {
            fetched.push(url);
            const html = url === "https://example.com/story" ? storyBody : body;
            return { dom: new DOMParser().parseFromString(html, "text/html"), url };
        },
        fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
        saveFile: async (fileName) => {
            saved.push(fileName);
            return { fileName, fileSize: 1 };
        },
        parserFor: () => null,
        throttle: async (ms) => {
            delays.push(ms);
        },
        behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, ...options.behaviour }),
        onProgress: (progress) => reports.push(progress),
    };

    const manager = new DownloadManager(dependencies);
    return {
        manager,
        delays,
        fetched,
        saved,
        progress: () => reports[reports.length - 1],
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

describe("the download manager's behaviour settings", () => {
    it("refuses a book with more chapters than the user allows", async () => {
        const { manager } = harness({ behaviour: { maxChapters: 1 } });
        const jobId = manager.start("https://example.com/story", "The Story", [
            ...CHAPTERS,
            { sourceUrl: "https://example.com/3", title: "Three" },
        ]);

        const progress = await settle(manager, jobId);
        expect(progress.phase).toBe("failed");
        expect(progress.error?.code).toBe("TOO_MANY_CHAPTERS");
    });

    it("allows a book with exactly as many chapters as the user allows", async () => {
        const { manager } = harness({ behaviour: { maxChapters: 2 } });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        const progress = await settle(manager, jobId);
        expect(progress.phase).toBe("complete");
    });

    it("waits at least the minimum delay the user asked for", async () => {
        const { manager, delays } = harness({ behaviour: { minimumDelay: 2500 } });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        await settle(manager, jobId);
        // The first delay is between the two chapters. The last one is after
        // the final chapter, before the images.
        expect(delays[0]).toBe(2500);
    });

    it("adds the extra delay the user asked for", async () => {
        const { manager, delays } = harness({
            behaviour: { minimumDelay: 1000, delayPerChapter: 400 },
        });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        await settle(manager, jobId);
        expect(delays[0]).toBe(1400);
    });

    it("keeps a chapter that failed when the user asked to skip them", async () => {
        const { manager, saved } = harness({
            behaviour: { skipFailedChapters: false },
            body: "",
        });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        const progress = await settle(manager, jobId);
        // The chapter could not be read, but the book was still saved, with a
        // placeholder in place of the chapter.
        expect(progress.phase).toBe("complete");
        expect(saved.length).toBe(1);
    });

    it("skips a chapter that failed when the user asked to skip them", async () => {
        const { manager, saved } = harness({
            behaviour: { skipFailedChapters: true },
            body: "",
        });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        const progress = await settle(manager, jobId);
        expect(progress.phase).toBe("complete");
        expect(saved.length).toBe(1);
    });

    it("fetches an empty chapter again when the user asked for a retry", async () => {
        const { manager, fetched } = harness({
            behaviour: { retryOnEmptyPage: true, minimumDelay: 0 },
            body: "",
        });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        await settle(manager, jobId);
        // The story's page, then each chapter twice.
        expect(fetched.filter((url) => url !== "https://example.com/story").length).toBe(4);
    });

    it("does not fetch an empty chapter again when the user did not ask for a retry", async () => {
        const { manager, fetched } = harness({
            behaviour: { retryOnEmptyPage: false },
            body: "",
        });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        await settle(manager, jobId);
        expect(fetched.filter((url) => url !== "https://example.com/story").length).toBe(2);
    });

    it("sends the message key, so the page can translate it", async () => {
        const { manager } = harness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);

        const progress = await settle(manager, jobId);
        // The key, not an English sentence: the background worker has no
        // locale.
        expect(progress.message).toBe("phaseComplete");
    });

    it("does not let a broken settings store stop the download", async () => {
        const delays: number[] = [];
        const manager = new DownloadManager({
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>x</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
            parserFor: () => null,
            throttle: async (ms) => {
                delays.push(ms);
            },
            behaviour: async () => {
                throw new Error("the store is broken");
            },
        });

        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        const progress = await settle(manager, jobId);
        expect(progress.phase).toBe("complete");
        expect(delays[0]).toBe(DEFAULT_BEHAVIOUR.minimumDelay);
    });
});

describe("the download manager's library record", () => {
    it("records the finished book in the library", async () => {
        const saved: LibraryEntry[] = [];
        const manager = new DownloadManager({
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 4096 }),
            parserFor: () => null,
            throttle: async () => undefined,
            saveToLibrary: async (entry) => {
                saved.push(entry);
            },
        });

        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        // Without this the library is always empty, because the download
        // manager is the only thing that ever produces a book.
        expect(saved).toHaveLength(1);
        expect(saved[0]?.title).toBe("The Story");
        expect(saved[0]?.sourceUrl).toBe("https://example.com/story");
        expect(saved[0]?.chapterCount).toBe(2);
        expect(saved[0]?.size).toBe(4096);
        expect(saved[0]?.chapterUrls).toEqual(["https://example.com/1", "https://example.com/2"]);
    });

    it("does not fail the download when the library write fails", async () => {
        const manager = new DownloadManager({
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
            parserFor: () => null,
            throttle: async () => undefined,
            saveToLibrary: async () => {
                throw new Error("the disk is full");
            },
        });

        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        const progress = await settle(manager, jobId);

        // The file is already saved; losing the download over a bookkeeping
        // error would be worse than a missing library entry.
        expect(progress.phase).toBe("complete");
    });
});

describe("the download manager's per-chapter progress", () => {
    /**
     * A manager whose chapters all load.
     */
    function progressHarness(): {
        manager: DownloadManager;
        reports: JobProgress[];
    } {
        const reports: JobProgress[] = [];
        const parser = {
            getRateLimit: () => 0,
            fetchChapter: async (url: string) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            extractChapterContent: () => {
                const dom = new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                );
                return dom.body;
            },
        } as unknown as Parser;
        const manager = new DownloadManager({
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
            parserFor: () => parser,
            throttle: async () => undefined,
            behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, retryOnEmptyPage: false }),
            onProgress: (progress) => reports.push(progress),
        });
        return { manager, reports };
    }

    it("reports which chapter the job is on", async () => {
        const { manager, reports } = progressHarness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        // The workbench's chapter list draws a state per row. Without this,
        // every row would sit at "idle" for the whole download.
        const states = reports
            .map((report) => report.current)
            .filter((current): current is NonNullable<typeof current> => current !== undefined);
        expect(states.length).toBeGreaterThan(0);
        expect(states.some((current) => current.state === "fetching")).toBe(true);
        expect(states.some((current) => current.state === "loaded")).toBe(true);
    });

    it("reports the chapter's index, so the right row is drawn", async () => {
        const { manager, reports } = progressHarness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        const indexes = new Set(
            reports
                .map((report) => report.current?.index)
                .filter((index): index is number => index !== undefined),
        );
        expect(indexes.has(0)).toBe(true);
        expect(indexes.has(1)).toBe(true);
    });

    it("reports no current chapter once the chapters are done", async () => {
        const { manager } = progressHarness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        const progress = await settle(manager, jobId);

        // During the image phase and the EPUB build no single chapter is in
        // flight, and the workbench must not keep pointing at one.
        expect(progress.current).toBeUndefined();
    });

    it("marks a chapter that could not be read as failed", async () => {
        const reports: JobProgress[] = [];
        const manager = new DownloadManager({
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
            parserFor: () => null,
            throttle: async () => undefined,
            behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, retryOnEmptyPage: false }),
            onProgress: (progress) => reports.push(progress),
        });

        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        expect(
            reports.some(
                (report) => report.current?.index === 1 && report.current?.state === "failed",
            ),
        ).toBe(true);
    });

    it("reports the chapters that have finished, so their rows keep their state", async () => {
        const { manager } = progressHarness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        const progress = await settle(manager, jobId);

        // Without this the finished rows keep spinning for the rest of the
        // download, which reads as a list that has got stuck.
        expect(progress.finished).toBeDefined();
        expect(progress.finished?.upTo).toBe(1);
        expect(progress.finished?.failed).toEqual([]);
    });

    it("names the chapters that failed among the finished ones", async () => {
        const parser = {
            getRateLimit: () => 0,
            fetchChapter: async (url: string) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            // The second chapter cannot be read.
            extractChapterContent: (_dom: Document, chapter: { sourceUrl: string }) => {
                if (chapter.sourceUrl.endsWith("/2")) return null;
                const dom = new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                );
                return dom.body;
            },
        } as unknown as Parser;

        const manager = new DownloadManager({
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
            parserFor: () => parser,
            throttle: async () => undefined,
            behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, retryOnEmptyPage: false }),
        });

        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        const progress = await settle(manager, jobId);

        // The second chapter's content could not be read, so it failed; the
        // first one loaded. The report says which is which.
        expect(progress.finished?.upTo).toBe(1);
        expect(progress.finished?.failed).toEqual([1]);
    });
});
