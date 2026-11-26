/**
 * Tests for cancelling a download.
 *
 * Cancelling used to stop the *fetching*, but not the *saving*: the abort was
 * checked inside the chapter loop and inside the image loop, and nowhere else.
 * A job cancelled while its images were downloading went on to build the EPUB,
 * write it to the disk and record it in the library — while the user was told
 * it had been cancelled.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DownloadManager,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import type { Parser } from "../../src/core/parsers/parser";

/** A parser whose chapters contain one image each. */
function parserWithImage(): Parser {
    return {
        getRateLimit: () => 0,
        fetchChapter: async (_url: string) => {
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
            const image = document.createElement("img");
            image.src = "https://example.com/picture.png";
            element.appendChild(image);
            return element;
        },
        findCoverImageUrl: () => null,
    } as unknown as Parser;
}

/**
 * Build a manager whose image download can be held open.
 */
function harness(): {
    manager: DownloadManager;
    saved: string[];
    releaseImage: () => void;
} {
    return harnessWithThrottle();
}

/**
 * Build a manager, with the throttle under the test's control.
 *
 * @param overrides The dependencies to change.
 * @returns The manager, the saved file names, and the image gate's release.
 */
function harnessWithThrottle(overrides: Partial<DownloadManagerDependencies> = {}): {
    manager: DownloadManager;
    saved: string[];
    releaseImage: () => void;
} {
    const saved: string[] = [];
    let release = (): void => {
        // Nothing to release yet.
    };
    const imageGate = new Promise<void>((resolve) => {
        release = resolve;
    });

    const dependencies: DownloadManagerDependencies = {
        fetchHtml: async (url) => {
            const html =
                url === "https://example.com/story"
                    ? "<html><body><h1>The Story</h1></body></html>"
                    : "<html><body><p>Prose.</p></body></html>";
            return { dom: new DOMParser().parseFromString(html, "text/html"), url };
        },
        fetchBytes: async () => {
            // The image download waits until the test lets it finish.
            await imageGate;
            return { data: new TextEncoder().encode("picture"), mediaType: "image/png" };
        },
        saveFile: async (fileName) => {
            saved.push(fileName);
            return { fileName, fileSize: 1 };
        },
        parserFor: () => parserWithImage(),
        throttle: async () => undefined,
        behaviour: async () => ({ ...DEFAULT_BEHAVIOUR, skipFailedChapters: true }),
        ...overrides,
    };

    return { manager: new DownloadManager(dependencies), saved, releaseImage: () => release() };
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

describe("cancelling a download", () => {
    it("does not write the book to the disk", async () => {
        const { manager, saved, releaseImage } = harness();

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);

        // Wait until the job has reached the image phase, then cancel it while
        // the image is still being fetched.
        for (let attempt = 0; attempt < 500; attempt += 1) {
            const progress = manager.progress(jobId);
            if (progress?.phase === "downloading-images") break;
            await new Promise((resolve) => setTimeout(resolve, 1));
        }

        expect(manager.cancel(jobId)).toBe(true);
        releaseImage();

        const progress = await settle(manager, jobId);
        expect(progress.phase).toBe("cancelled");

        // The job is given a moment to finish whatever it was doing. The
        // cancellation is reported at once, so a check made immediately would
        // pass even if the job went on to build and save the book.
        await new Promise((resolve) => setTimeout(resolve, 50));

        expect(saved).toEqual([]);
    });

    it("is reported as cancelled, and not as failed, when cancelled between chapters", async () => {
        // The pause between two chapters is part of the download, and the
        // cancel can land in it. The abort error must not escape the job and
        // turn "the user stopped it" into "it went wrong".
        let throttleEntered = (): void => {
            // Nothing to wait for yet.
        };
        const throttleStarted = new Promise<void>((resolve) => {
            throttleEntered = resolve;
        });

        const { manager, saved } = harnessWithThrottle({
            throttle: async (_ms, signal) => {
                // The pause is where the cancel lands: the signal is already
                // aborted when the wait is asked for.
                throttleEntered();
                if (signal.aborted) {
                    const error = new Error("The operation was aborted.");
                    error.name = "AbortError";
                    throw error;
                }
                await new Promise((resolve) => setTimeout(resolve, 1));
                if (signal.aborted) {
                    const error = new Error("The operation was aborted.");
                    error.name = "AbortError";
                    throw error;
                }
            },
        });

        const jobId = manager.start("https://example.com/story", "The Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
            { sourceUrl: "https://example.com/2", title: "Two" },
        ]);

        // Wait until the job is waiting between the two chapters, then cancel.
        await throttleStarted;
        expect(manager.cancel(jobId)).toBe(true);

        const progress = await settle(manager, jobId);
        await new Promise((resolve) => setTimeout(resolve, 50));

        // The job settles on "cancelled" the moment the user presses the
        // button, and the work that was in flight unwinds afterwards. The
        // state the user is left looking at is the *last* one, so the
        // assertion is made after the unwind has had its turn.
        expect(manager.progress(jobId)?.phase).toBe("cancelled");
        expect(manager.progress(jobId)?.error).toBeUndefined();
        expect(saved).toEqual([]);
        expect(progress.phase).toBe("cancelled");
    });
});
