/**
 * Tests for the library's bookkeeping.
 *
 * Two things went wrong here:
 *
 * - A story that was downloaded twice appeared twice in the library, so the
 *   user had to delete the duplicate by hand. The library is a list of books,
 *   not a list of downloads.
 * - The chapter count was the number of chapters that were *asked for*, not
 *   the number that are in the book. A chapter that failed and was skipped is
 *   not in the book, and a library that says it is tells the user the wrong
 *   thing about their own book.
 */
import { describe, expect, it } from "vitest";
import { mergeLibraryEntry, type LibraryEntry } from "../../src/core/storage/library-store";

/** An entry for the fake story. */
function entry(overrides: Partial<LibraryEntry> = {}): LibraryEntry {
    return {
        id: "new-id",
        title: "The Story",
        author: "An Author",
        sourceUrl: "https://example.com/story",
        chapterCount: 3,
        size: 100,
        addedAt: 1_000,
        updatedAt: 2_000,
        chapterUrls: ["https://example.com/1", "https://example.com/2"],
        ...overrides,
    };
}

describe("merging a library entry", () => {
    it("keeps the new entry when the story is new", () => {
        const fresh = entry();
        expect(mergeLibraryEntry(null, fresh)).toBe(fresh);
    });

    it("keeps the entry's ID, so the book keeps its place", () => {
        const existing = entry({ id: "old-id", addedAt: 100 });
        const merged = mergeLibraryEntry(existing, entry({ id: "new-id" }));
        expect(merged.id).toBe("old-id");
    });

    it("keeps the date the book was first added", () => {
        const existing = entry({ addedAt: 100 });
        const merged = mergeLibraryEntry(existing, entry({ addedAt: 5_000 }));
        expect(merged.addedAt).toBe(100);
    });

    it("takes the new title, author and chapters", () => {
        const existing = entry({ title: "Old Title", author: "Old Author", chapterCount: 1 });
        const merged = mergeLibraryEntry(
            existing,
            entry({ title: "New Title", author: "New Author", chapterCount: 4 }),
        );
        expect(merged.title).toBe("New Title");
        expect(merged.author).toBe("New Author");
        expect(merged.chapterCount).toBe(4);
        expect(merged.chapterUrls).toEqual(["https://example.com/1", "https://example.com/2"]);
    });
});
