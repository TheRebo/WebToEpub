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
        util: { safeForFileName: (title: string) => title },
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
            util: { safeForFileName: (title: string) => title },
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
