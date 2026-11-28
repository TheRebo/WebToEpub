/**
 * The workbench's story loading.
 *
 * The bug under test: loading a story takes two round trips to the worker, and
 * the user does not wait for them. They can type a second address while the
 * first one is still being read — and the first load then finishes *after* the
 * second one and overwrites it. The story on screen is the one the user moved
 * away from, and the chapter list belongs to a different book.
 *
 * These tests drive the real controller through the real message bus, with
 * only the worker's answers faked, so the race is the one that happens in
 * practice.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-button";
import "../../../src/ui/components/k-checkbox";
import "../../../src/ui/components/k-dialog";
import "../../../src/ui/components/k-empty";
import "../../../src/ui/components/k-field";
import "../../../src/ui/components/k-list";
import "../../../src/ui/components/k-panel";
import "../../../src/ui/components/k-progress";
import "../../../src/ui/components/k-skeleton";
import "../../../src/ui/components/k-switch";
import "../../../src/ui/components/k-toast";

import { setNamespace } from "../../../src/core/browser-api";
import { WorkbenchController } from "../../../src/ui/pages/workbench/index";

/** A message the controller sent to the worker. */
interface Envelope {
    type: string;
    payload: Record<string, unknown>;
    id: string;
}

/** The answers the fake worker gives. */
interface FakeWorker {
    /** The calls that were made, in order. */
    calls: Envelope[];
    /** Answer a request. */
    on(
        type: string,
        answer: (payload: Record<string, unknown>) => Promise<unknown> | unknown,
    ): void;
}

/**
 * A fake worker.
 *
 * Each request type gets its own answer, and the answer may take as long as
 * it likes — which is how the race is arranged.
 */
function fakeWorker(): FakeWorker {
    const answers = new Map<
        string,
        (payload: Record<string, unknown>) => Promise<unknown> | unknown
    >();
    const calls: Envelope[] = [];
    const stored: Record<string, unknown> = {};

    setNamespace({
        runtime: {
            async sendMessage(message: unknown) {
                const envelope = message as Envelope;
                calls.push(envelope);
                const answer = answers.get(envelope.type);
                if (!answer) throw new Error(`No answer for ${envelope.type}`);
                const result = await answer(envelope.payload);
                return { id: envelope.id, result };
            },
        },
        permissions: {
            async contains() {
                return true;
            },
        },
        tabs: {
            async query() {
                // No web page is open, so the workbench has nothing to guess.
                return [];
            },
        },
        storage: {
            local: {
                async get(keys: string | string[] | null) {
                    const list =
                        keys === null ? Object.keys(stored) : Array.isArray(keys) ? keys : [keys];
                    const result: Record<string, unknown> = {};
                    for (const key of list) {
                        if (key in stored) result[key] = stored[key];
                    }
                    return result;
                },
                async set(items: Record<string, unknown>) {
                    Object.assign(stored, items);
                },
                async remove(keys: string | string[]) {
                    for (const key of Array.isArray(keys) ? keys : [keys]) {
                        delete stored[key];
                    }
                },
            },
        },
    } as unknown as Parameters<typeof setNamespace>[0]);

    return {
        calls,
        on(type, answer) {
            answers.set(type, answer);
        },
    };
}

/** Let the pending promises settle. */
async function settle(): Promise<void> {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The analysis answer for a URL. */
function analysis(title: string) {
    return {
        supported: true,
        title,
        author: "An Author",
        language: "en",
        coverUrl: "",
        description: "",
        parserName: "FakeParser",
        usedDefaultParser: false,
    };
}

/** The chapter list answer for a URL. */
function chapterList(title: string) {
    return {
        chapters: [{ sourceUrl: `https://example.com/${title}/1`, title: "Chapter 1" }],
    };
}

/** Press the button that loads the story at the address in the field. */
function pressLoad(controller: WorkbenchController): void {
    controller.elements.urlLoadButton.dispatchEvent(
        new CustomEvent("k-click", { bubbles: true, composed: true }),
    );
}

describe("the workbench's story loading", () => {
    let controller: WorkbenchController | undefined;

    beforeEach(() => {
        document.body.replaceChildren();
    });

    afterEach(() => {
        controller?.dispose();
        controller = undefined;
        setNamespace(undefined);
    });

    it("shows the story at the address in the field", async () => {
        const worker = fakeWorker();
        worker.on("page:analyze", (payload) => analysis(String(payload["url"])));
        worker.on("chapters:list", (payload) => chapterList(String(payload["url"])));

        controller = new WorkbenchController(document.body);
        await controller.start();

        controller.elements.urlField.value = "https://example.com/first";
        pressLoad(controller);
        await settle();

        expect(controller.state.story.title).toBe("https://example.com/first");
        expect(controller.state.story.author).toBe("An Author");
        expect(controller.state.chapters).toHaveLength(1);
    });

    it("keeps the newest story when an older load finishes last", async () => {
        const worker = fakeWorker();

        // The first story is slow: its analysis takes a while, so the second
        // load overtakes it.
        let releaseFirst: (() => void) | undefined;
        const firstHeld = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });

        worker.on("page:analyze", async (payload) => {
            const url = String(payload["url"]);
            if (url.includes("first")) {
                await firstHeld;
                return analysis("First story");
            }
            return analysis("Second story");
        });
        worker.on("chapters:list", (payload) => chapterList(String(payload["url"])));

        controller = new WorkbenchController(document.body);
        await controller.start();

        // The user asks for the first story, and then, before it has arrived,
        // for the second one.
        controller.elements.urlField.value = "https://example.com/first";
        pressLoad(controller);
        await settle();

        controller.elements.urlField.value = "https://example.com/second";
        pressLoad(controller);
        await settle();

        // The second story is on screen.
        expect(controller.state.story.title).toBe("Second story");

        // Now the first load finishes. Its answer is about a story the user
        // has moved away from, and it must not be applied.
        releaseFirst?.();
        await settle();
        await settle();

        expect(controller.state.story.title).toBe("Second story");
        expect(controller.state.chapters).toHaveLength(1);
        expect(controller.state.chapters[0]?.sourceUrl).toContain("second");
    });

    it("does not show the chapter list of a story the user has moved away from", async () => {
        const worker = fakeWorker();

        // The first story's *chapter list* is the slow part this time.
        let releaseFirst: (() => void) | undefined;
        const firstHeld = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });

        worker.on("page:analyze", (payload) => analysis(String(payload["url"])));
        worker.on("chapters:list", async (payload) => {
            const url = String(payload["url"]);
            if (url.includes("first")) {
                await firstHeld;
                return chapterList("first");
            }
            return chapterList("second");
        });

        controller = new WorkbenchController(document.body);
        await controller.start();

        controller.elements.urlField.value = "https://example.com/first";
        pressLoad(controller);
        await settle();

        controller.elements.urlField.value = "https://example.com/second";
        pressLoad(controller);
        await settle();

        expect(controller.state.chapters[0]?.sourceUrl).toContain("second");

        releaseFirst?.();
        await settle();
        await settle();

        expect(controller.state.chapters).toHaveLength(1);
        expect(controller.state.chapters[0]?.sourceUrl).toContain("second");
    });
});
