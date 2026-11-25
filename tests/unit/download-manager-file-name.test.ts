/**
 * The name a book is saved as.
 *
 * The filename template in the options page, and the name the user types into
 * the workbench, both have to reach the file the book is saved as. Neither
 * used to: the template was stored, validated and shown, and then never read
 * by anything, and the workbench's field was overwritten on the next render.
 */
import { describe, expect, it } from "vitest";
import { DownloadManager, type DownloadManagerDependencies } from "../../src/core/download-manager";

/** A chapter of the fake book. */
const CHAPTERS = [{ sourceUrl: "https://example.com/1", title: "One" }];

/** The harness's state. */
interface Harness {
    manager: DownloadManager;
    /** The names the files were saved under. */
    saved: string[];
}

/**
 * Build a manager whose fetch always succeeds.
 *
 * @param options The filename template the manager reads.
 * @returns The manager and what it saved.
 */
function harness(options: { template?: string } = {}): Harness {
    const saved: string[] = [];

    const dependencies: DownloadManagerDependencies = {
        fetchHtml: async (url) => ({
            dom: new DOMParser().parseFromString(
                "<html><body><h1>The Story</h1><p>Prose.</p></body></html>",
                "text/html",
            ),
            url,
        }),
        fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
        saveFile: async (fileName) => {
            saved.push(fileName);
            return { fileName, fileSize: 1 };
        },
        parserFor: () => null,
        throttle: async () => undefined,
        filenameTemplate: async () => options.template ?? "{title}",
    };

    return { manager: new DownloadManager(dependencies), saved };
}

/** Wait until the manager reaches a terminal phase. */
async function settle(manager: DownloadManager, jobId: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const progress = manager.progress(jobId);
        if (progress && ["complete", "failed", "cancelled"].includes(progress.phase)) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("The job never finished.");
}

describe("the name a book is saved as", () => {
    it("uses the title when there is no template", async () => {
        const { manager, saved } = harness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        expect(saved).toEqual(["The Story.epub"]);
    });

    it("uses the filename template from the options page", async () => {
        const { manager, saved } = harness({ template: "{title} by {author}" });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        // The book has no author, so the joiner is taken away with it.
        expect(saved).toEqual(["The Story.epub"]);
    });

    it("uses the name the user typed", async () => {
        const { manager, saved } = harness({ template: "{title}" });
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS, {
            fileName: "My Own Name",
        });
        await settle(manager, jobId);

        expect(saved).toEqual(["My Own Name.epub"]);
    });

    it("does not give the file two extensions", async () => {
        const { manager, saved } = harness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS, {
            fileName: "My Own Name.epub",
        });
        await settle(manager, jobId);

        expect(saved).toEqual(["My Own Name.epub"]);
    });

    it("makes the name safe", async () => {
        const { manager, saved } = harness();
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS, {
            fileName: "a/b:c",
        });
        await settle(manager, jobId);

        expect(saved).toEqual(["a-b-c.epub"]);
    });

    it("falls back to the title when the template cannot be read", async () => {
        const saved: string[] = [];
        const dependencies: DownloadManagerDependencies = {
            fetchHtml: async (url) => ({
                dom: new DOMParser().parseFromString(
                    "<html><body><p>Prose.</p></body></html>",
                    "text/html",
                ),
                url,
            }),
            fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
            saveFile: async (fileName) => {
                saved.push(fileName);
                return { fileName, fileSize: 1 };
            },
            parserFor: () => null,
            throttle: async () => undefined,
            filenameTemplate: async () => {
                throw new Error("the disk is full");
            },
        };
        const manager = new DownloadManager(dependencies);
        const jobId = manager.start("https://example.com/story", "The Story", CHAPTERS);
        await settle(manager, jobId);

        expect(saved).toEqual(["The Story.epub"]);
    });
});
