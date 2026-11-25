/**
 * Tests for the workbench's state.
 *
 * The store holds the chapter list — thousands of entries — and every change
 * to it re-renders the list. Two things have to be right: the selection
 * rules, and the per-chapter states the download reports.
 */
import { describe, expect, it } from "vitest";
import {
    WorkbenchStore,
    compilePattern,
    matchingIndices,
    type Chapter,
    type FilterState,
    type WorkbenchState,
} from "../../../src/ui/pages/workbench/state";

/** A state with nothing in it. */
function emptyState(): WorkbenchState {
    return {
        story: {
            title: "",
            author: "",
            language: "en",
            coverUrl: "",
            description: "",
            sourceUrl: "",
            parserName: "",
        },
        chapters: [],
        loadingChapters: false,
        filter: { query: "", useRegex: false, include: [], exclude: [] },
        dirty: false,
        usedDefaultParser: false,
        progress: undefined,
        error: undefined,
    };
}

/** A chapter of the fake list. */
function chapter(title: string, includeable = true): Chapter {
    return {
        sourceUrl: `https://example.com/${title}`,
        title,
        selected: false,
        isIncludeable: includeable,
        state: "idle",
    };
}

/** A filter that matches nothing in particular. */
function filter(overrides: Partial<FilterState> = {}): FilterState {
    return { query: "", useRegex: false, include: [], exclude: [], ...overrides };
}

describe("the workbench store's selection", () => {
    it("toggles a chapter", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One"), chapter("Two")]);

        store.toggleChapter(0);
        expect(store.state.chapters[0]?.selected).toBe(true);
        expect(store.selectedCount).toBe(1);
    });

    it("never selects a chapter that cannot be included", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One", false)]);

        store.toggleChapter(0);
        expect(store.state.chapters[0]?.selected).toBe(false);
    });

    it("selects and deselects everything that can be included", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One"), chapter("Two", false), chapter("Three")]);

        store.setAllSelected(true);
        expect(store.selectedCount).toBe(2);

        store.invertSelection();
        expect(store.selectedCount).toBe(0);
    });

    it("sets a range, whatever order it is given in", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One"), chapter("Two"), chapter("Three")]);

        store.setRange(2, 0, true);
        expect(store.state.chapters.map((entry) => entry.selected)).toEqual([true, true, true]);
    });

    it("does not select past the end of the list", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One")]);

        store.setRange(0, 99, true);
        expect(store.selectedCount).toBe(1);
    });
});

describe("the workbench store's chapter states", () => {
    it("sets a chapter's state", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One")]);

        store.setChapterState(0, "loaded");
        expect(store.state.chapters[0]?.state).toBe("loaded");
    });

    it("sets a chapter's size", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One")]);

        store.setChapterState(0, "loaded", 2048);
        expect(store.state.chapters[0]?.size).toBe(2048);
    });

    it("ignores a chapter that is not there", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One")]);

        expect(() => store.setChapterState(99, "loaded")).not.toThrow();
        expect(store.state.chapters[0]?.state).toBe("idle");
    });

    it("tells the listeners about the change", () => {
        const store = new WorkbenchStore(emptyState());
        store.setChapters([chapter("One")]);

        let notified = 0;
        store.subscribe(() => {
            notified += 1;
        });
        store.setChapterState(0, "fetching");
        expect(notified).toBe(1);
    });
});

describe("matchingIndices", () => {
    const chapters = [chapter("Prologue"), chapter("Chapter One"), chapter("Chapter Two")];

    it("returns every index when nothing is filtered", () => {
        expect(matchingIndices(chapters, filter())).toEqual([0, 1, 2]);
    });

    it("matches a substring, ignoring the case", () => {
        expect(matchingIndices(chapters, filter({ query: "chapter" }))).toEqual([1, 2]);
    });

    it("matches a regular expression when the user asked for one", () => {
        expect(
            matchingIndices(chapters, filter({ query: "^Chapter (One|Two)$", useRegex: true })),
        ).toEqual([1, 2]);
    });

    it("returns nothing for a broken regular expression, rather than throwing", () => {
        expect(matchingIndices(chapters, filter({ query: "[", useRegex: true }))).toEqual([]);
    });

    it("keeps the chapters that have an included term", () => {
        expect(matchingIndices(chapters, filter({ include: ["two"] }))).toEqual([2]);
    });

    it("drops the chapters that have an excluded term", () => {
        expect(matchingIndices(chapters, filter({ exclude: ["chapter"] }))).toEqual([0]);
    });
});

describe("compilePattern", () => {
    it("compiles an ordinary pattern", () => {
        expect(compilePattern("one")).toBeInstanceOf(RegExp);
    });

    it("returns null for a broken pattern", () => {
        expect(compilePattern("[")).toBeNull();
    });
});
