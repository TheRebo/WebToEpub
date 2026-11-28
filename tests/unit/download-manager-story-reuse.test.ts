/**
 * The download reads the story the user saw: the page and the parser the
 * chapter list came from, and a parser of their own for chapters on another
 * host.
 */
import { describe, expect, it } from "vitest";
import {
    DEFAULT_BEHAVIOUR,
    DownloadManager,
    type DownloadManagerDependencies,
    type JobProgress,
} from "../../src/core/download-manager";
import type { Parser } from "../../src/core/parsers/parser";

function fakeParser(name: string, used: string[]): Parser {
    return {
        getRateLimit: () => 0,
        fetchChapter: async (url: string) => {
            used.push(`${name}:${url}`);
            return new DOMParser().parseFromString("<p>Prose.</p>", "text/html");
        },
        extractChapterContent: (dom: Document) => dom.body,
        extractTitleImpl: () => "Story",
        extractAuthor: () => "",
        extractLanguage: () => "en",
        extractDescription: () => "",
        extractSubject: () => "",
        findCoverImageUrl: () => null,
    } as unknown as Parser;
}

async function settle(manager: DownloadManager, id: string): Promise<JobProgress> {
    for (let attempt = 0; attempt < 300; attempt += 1) {
        const progress = manager.progress(id);
        if (progress && ["complete", "failed", "cancelled"].includes(progress.phase))
            return progress;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error("The job never finished.");
}

function dependencies(
    overrides: Partial<DownloadManagerDependencies>,
    fetched: string[],
): DownloadManagerDependencies {
    return {
        fetchHtml: async (url) => {
            fetched.push(url);
            return { dom: new DOMParser().parseFromString("<p>x</p>", "text/html"), url };
        },
        fetchBytes: async () => ({ data: new Uint8Array(), mediaType: "image/png" }),
        saveFile: async (fileName) => ({ fileName, fileSize: 1 }),
        parserFor: () => null,
        throttle: async () => {},
        ...overrides,
    };
}

describe("a download of a listed story", () => {
    it("reuses the listed page and parser instead of fetching the story again", async () => {
        const used: string[] = [];
        const fetched: string[] = [];
        const listed = fakeParser("listed", used);
        const manager = new DownloadManager(
            dependencies(
                {
                    storyFor: () => ({
                        dom: document.implementation.createHTMLDocument(),
                        parser: listed,
                    }),
                    parserFor: () => fakeParser("fresh", used),
                },
                fetched,
            ),
        );
        const id = manager.start("https://example.com/story", "Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);
        await settle(manager, id);
        expect(fetched).not.toContain("https://example.com/story");
        expect(used).toEqual(["listed:https://example.com/1"]);
    });

    it("fetches a chapter on another host with that host's parser", async () => {
        const used: string[] = [];
        const manager = new DownloadManager(
            dependencies(
                {
                    parserFor: () => fakeParser("story", used),
                    parserForHost: () => fakeParser("other", used),
                },
                [],
            ),
        );
        const id = manager.start("https://example.com/story", "Story", [
            { sourceUrl: "https://www.example.com/1", title: "One" },
            { sourceUrl: "https://chapters.example.org/2", title: "Two" },
        ]);
        await settle(manager, id);
        expect(used).toEqual([
            "story:https://www.example.com/1",
            "other:https://chapters.example.org/2",
        ]);
    });
});

describe("one download at a time", () => {
    it("joins the running job for the same story and refuses another story", () => {
        let release: () => void = () => {};
        const manager = new DownloadManager(
            dependencies(
                {
                    behaviour: () =>
                        new Promise((resolve) => {
                            release = () => resolve({ ...DEFAULT_BEHAVIOUR });
                        }),
                },
                [],
            ),
        );
        const chapters = [{ sourceUrl: "https://example.com/1", title: "One" }];
        const first = manager.start("https://example.com/story", "Story", chapters);
        expect(manager.start("https://example.com/story", "Story", chapters)).toBe(first);
        expect(() => manager.start("https://other.example/story", "Other", chapters)).toThrow(
            /Another book/,
        );
        release();
    });

    it("stays cancelled when it is cancelled while it is still preparing", async () => {
        let release: () => void = () => {};
        const phases: string[] = [];
        const manager = new DownloadManager(
            dependencies(
                {
                    behaviour: () =>
                        new Promise((resolve) => {
                            release = () => resolve({ ...DEFAULT_BEHAVIOUR });
                        }),
                    onProgress: (progress) => phases.push(progress.phase),
                },
                [],
            ),
        );
        const id = manager.start("https://example.com/story", "Story", [
            { sourceUrl: "https://example.com/1", title: "One" },
        ]);
        manager.cancel(id);
        release();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(phases).toEqual(["cancelled"]);
        expect(manager.progress(id)?.phase).toBe("cancelled");
    });
});
