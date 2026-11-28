/**
 * Tests for the library store's handling of a blocked database.
 *
 * A database is blocked when another tab holds a connection to it and the
 * schema needs to change. The browser's own behaviour is that the open
 * *waits* — it succeeds as soon as the other connection lets go. It is not an
 * error.
 *
 * The store used to reject the open the moment it was blocked. That turned a
 * wait into a hard failure, and it abandoned a request that would have
 * succeeded — and whose database handle would then be open for ever.
 */
import { describe, expect, it } from "vitest";
import { LibraryStore, openLibraryDatabase } from "../../src/core/storage/library-store";
import { createFakeIndexedDb } from "../support/fake-indexeddb";
import type { LibraryEntry } from "../../src/core/storage/library-store";

/** An entry, with the fields a real one has. */
function makeEntry(): LibraryEntry {
    return {
        id: "entry-1",
        title: "A Story",
        author: "An Author",
        sourceUrl: "https://example.com/story",
        chapterCount: 10,
        size: 1024,
        addedAt: 1000,
        updatedAt: 1000,
        chapterUrls: ["https://example.com/story/1"],
    };
}

/**
 * A factory whose open can be blocked, and then released.
 *
 * The browser fires `blocked` when another connection is holding the
 * database, and fires `success` when that connection lets go. The fake does
 * the same, so that the wait can be observed.
 */
function blockingFactory(): {
    factory: IDBFactory;
    release: () => void;
    closed: () => number;
} {
    let release: () => void = () => undefined;
    let closedCount = 0;

    const factory = {
        open() {
            const request: Record<string, unknown> = {
                onsuccess: null,
                onerror: null,
                onupgradeneeded: null,
                onblocked: null,
                result: null,
                error: null,
            };

            const db = {
                close() {
                    closedCount += 1;
                },
                objectStoreNames: { contains: () => false },
                createObjectStore: () => ({
                    createIndex: () => undefined,
                }),
                transaction() {
                    const request = {
                        onsuccess: null as ((event: unknown) => void) | null,
                        onerror: null as ((event: unknown) => void) | null,
                        result: [] as unknown[],
                    };
                    const store = {
                        getAll: () => {
                            // The request succeeds before the transaction
                            // completes, as it does in the browser.
                            queueMicrotask(() => {
                                request.onsuccess?.({ target: request });
                                transaction.oncomplete?.({ target: transaction });
                            });
                            return request;
                        },
                    };
                    const transaction = {
                        objectStore: () => store,
                        oncomplete: null as ((event: unknown) => void) | null,
                        onabort: null,
                        onerror: null,
                        error: null,
                    };
                    return transaction;
                },
            };

            // The open is blocked until the release is called.
            release = () => {
                request.result = db;
                (request.onsuccess as ((event: unknown) => void) | null)?.({ target: request });
            };

            queueMicrotask(() => {
                (request.onblocked as ((event: unknown) => void) | null)?.({ target: request });
            });

            return request;
        },
    } as unknown as IDBFactory;

    return { factory, release: () => release(), closed: () => closedCount };
}

describe("a blocked library database", () => {
    it("waits for the other tab to let go rather than failing", async () => {
        const { factory, release } = blockingFactory();

        let settled = false;
        const opening = openLibraryDatabase(factory).then((db) => {
            settled = true;
            return db;
        });

        // Give the blocked event a turn to arrive.
        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(settled).toBe(false);

        release();
        const db = await opening;
        expect(db).not.toBeNull();
    });

    it("says that it is waiting", async () => {
        const { factory, release } = blockingFactory();
        let blocked = 0;

        const opening = openLibraryDatabase(factory, () => {
            blocked += 1;
        });

        await new Promise((resolve) => setTimeout(resolve, 5));
        expect(blocked).toBe(1);

        release();
        await opening;
    });

    it("closes the database it was given, once it is open", async () => {
        const { factory, release, closed } = blockingFactory();

        const store = new LibraryStore(factory);
        // The store starts opening the database here.
        const listing = store.list();

        store.close();

        await new Promise((resolve) => setTimeout(resolve, 5));
        release();

        await listing;
        // The close waited for the open, rather than being lost to it.
        expect(closed()).toBe(1);
    });

    it("does not raise an unhandled rejection when the open fails", async () => {
        // The close happens *while* the open is still in flight. The close
        // waits for the open, so it holds the open's promise — and if that
        // promise fails, the close must not turn the failure into an
        // unhandled rejection, which would show up in the worker as an error
        // the user did nothing to cause.
        const failures: unknown[] = [];
        const onUnhandled = (event: PromiseRejectionEvent): void => {
            failures.push(event.reason);
            event.preventDefault();
        };
        process.on("unhandledRejection", onUnhandled);

        const failing = {
            open() {
                const request: Record<string, unknown> = {
                    onsuccess: null,
                    onerror: null,
                    onupgradeneeded: null,
                    onblocked: null,
                    result: null,
                    error: new Error("the disk is full"),
                };
                queueMicrotask(() => {
                    (request.onerror as ((event: unknown) => void) | null)?.({ target: request });
                });
                return request;
            },
        } as unknown as IDBFactory;

        try {
            const store = new LibraryStore(failing);
            const listing = store.list();
            // The close happens while the open is still pending.
            store.close();

            await expect(listing).rejects.toThrow("the disk is full");
            await new Promise((resolve) => setTimeout(resolve, 20));

            expect(failures).toEqual([]);
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });

    it("still works when nothing blocks it", async () => {
        const store = new LibraryStore(createFakeIndexedDb());
        await store.put(makeEntry());

        const entry = await store.get("entry-1");
        expect(entry?.title).toBe("A Story");

        store.close();
    });
});
