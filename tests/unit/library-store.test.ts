/**
 * The library store.
 *
 * The library is where the user's books live, and it had no tests at all: the
 * test environment has no IndexedDB, so the store could not be exercised.
 * These tests use a small stand-in that behaves the way the browser does —
 * in particular, that a read-write transaction runs to completion before the
 * next one starts.
 *
 * The bug these tests are really about: `save()` used to read the entry for a
 * story and then write the merged entry, in two separate transactions. Two
 * saves that arrived at the same time both read "nothing there", and both
 * wrote their own entry — so a story downloaded twice appeared in the library
 * twice, which is the one thing the method promises never to happen.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createFakeIndexedDb } from "../support/fake-indexeddb";
import {
    LibraryStore,
    mergeLibraryEntry,
    type LibraryEntry,
} from "../../src/core/storage/library-store";

/** An entry, with the fields a real one has. */
function makeEntry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
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
        ...overrides,
    };
}

describe("the library store", () => {
    let store: LibraryStore;

    beforeEach(() => {
        store = new LibraryStore(createFakeIndexedDb());
    });

    it("saves an entry and reads it back", async () => {
        await store.put(makeEntry());

        const entry = await store.get("entry-1");
        expect(entry?.title).toBe("A Story");
    });

    it("lists every entry, most recently updated first", async () => {
        await store.put(makeEntry({ id: "a", updatedAt: 100 }));
        await store.put(makeEntry({ id: "b", updatedAt: 300 }));
        await store.put(makeEntry({ id: "c", updatedAt: 200 }));

        const entries = await store.list();
        expect(entries.map((entry) => entry.id)).toEqual(["b", "c", "a"]);
    });

    it("finds an entry by its source URL", async () => {
        await store.put(makeEntry({ id: "a", sourceUrl: "https://one.example/story" }));
        await store.put(makeEntry({ id: "b", sourceUrl: "https://two.example/story" }));

        const found = await store.findBySourceUrl("https://two.example/story");
        expect(found?.id).toBe("b");
    });

    it("removes an entry", async () => {
        await store.put(makeEntry());

        await store.delete("entry-1");

        expect(await store.get("entry-1")).toBeNull();
    });

    it("removes every entry", async () => {
        await store.put(makeEntry({ id: "a" }));
        await store.put(makeEntry({ id: "b" }));

        await store.clear();

        expect(await store.list()).toEqual([]);
    });

    it("keeps one entry for a story that is saved twice", async () => {
        await store.save(makeEntry({ id: "first", title: "First" }));
        await store.save(makeEntry({ id: "second", title: "Second" }));

        const entries = await store.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]?.title).toBe("Second");
    });

    it("keeps the entry's ID and its first-added date when a story is saved again", async () => {
        await store.save(makeEntry({ id: "first", addedAt: 1000 }));

        await store.save(makeEntry({ id: "second", addedAt: 5000, updatedAt: 5000 }));

        const entries = await store.list();
        expect(entries[0]?.id).toBe("first");
        expect(entries[0]?.addedAt).toBe(1000);
    });

    it("keeps one entry for a story that is saved twice at the same time", async () => {
        // The read and the write must be in one transaction, or both saves
        // read "nothing there" and both write their own entry — and the
        // story appears in the library twice.
        await Promise.all([
            store.save(makeEntry({ id: "first", title: "First" })),
            store.save(makeEntry({ id: "second", title: "Second" })),
            store.save(makeEntry({ id: "third", title: "Third" })),
        ]);

        const entries = await store.list();
        expect(entries).toHaveLength(1);
        expect(entries[0]?.title).toBe("Third");
    });
});

describe("mergeLibraryEntry", () => {
    it("keeps the entry that is already there", () => {
        const existing = makeEntry({ id: "first", addedAt: 1000 });
        const merged = mergeLibraryEntry(existing, makeEntry({ id: "second", addedAt: 5000 }));

        expect(merged.id).toBe("first");
        expect(merged.addedAt).toBe(1000);
    });

    it("takes the new title, author and chapters", () => {
        const existing = makeEntry({ title: "Old", author: "Old Author", chapterCount: 3 });
        const merged = mergeLibraryEntry(
            existing,
            makeEntry({ title: "New", author: "New Author", chapterCount: 9 }),
        );

        expect(merged.title).toBe("New");
        expect(merged.author).toBe("New Author");
        expect(merged.chapterCount).toBe(9);
    });

    it("takes the entry whole when there is none there yet", () => {
        const entry = makeEntry();
        expect(mergeLibraryEntry(null, entry)).toBe(entry);
    });
});
