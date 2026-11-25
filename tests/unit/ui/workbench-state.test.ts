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
    finishedChapterStates,
    matchingIndices,
    parseChapterRange,
    storyOptionSwitches,
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
            fileName: "untitled.epub",
            fileNameEdited: false,
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

describe("the range the user types", () => {
    it("reads the two numbers", () => {
        expect(parseChapterRange("2", "5", 10)).toEqual({ from: 2, to: 5 });
    });

    it("accepts the numbers in either order", () => {
        expect(parseChapterRange("5", "2", 10)).toEqual({ from: 2, to: 5 });
    });

    it("rejects a range that reaches past the end of the list", () => {
        expect(parseChapterRange("1", "11", 10)).toBeNull();
    });

    it("rejects a number below one", () => {
        expect(parseChapterRange("0", "5", 10)).toBeNull();
    });

    it("rejects something that is not a number", () => {
        expect(parseChapterRange("", "5", 10)).toBeNull();
        expect(parseChapterRange("a", "b", 10)).toBeNull();
    });

    it("rejects a range when there are no chapters", () => {
        expect(parseChapterRange("1", "1", 0)).toBeNull();
    });
});

describe("the story options the workbench shows", () => {
    it("turns the author-notes switch on when the notes are kept", () => {
        expect(storyOptionSwitches({ removeAuthorNotes: false, includeTocPage: false })).toEqual({
            includeAuthorNotes: true,
            includeTocPage: false,
        });
    });

    it("turns the author-notes switch off when the notes are removed", () => {
        // The switch says "include the author notes" and the setting says
        // "remove the author notes", so the two are opposites. Getting this
        // wrong shows the user the opposite of what will happen.
        expect(storyOptionSwitches({ removeAuthorNotes: true, includeTocPage: false })).toEqual({
            includeAuthorNotes: false,
            includeTocPage: false,
        });
    });

    it("shows the contents page as the setting has it", () => {
        expect(storyOptionSwitches({ removeAuthorNotes: false, includeTocPage: true })).toEqual({
            includeAuthorNotes: true,
            includeTocPage: true,
        });
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

describe("finishedChapterStates", () => {
    it("marks every finished chapter as loaded", () => {
        const changes = finishedChapterStates({ upTo: 2, failed: [] }, [0, 1, 2]);

        expect(changes).toEqual([
            { index: 0, state: "loaded" },
            { index: 1, state: "loaded" },
            { index: 2, state: "loaded" },
        ]);
    });

    it("marks the chapters that failed as failed", () => {
        const changes = finishedChapterStates({ upTo: 2, failed: [1] }, [0, 1, 2]);

        expect(changes.map((change) => change.state)).toEqual(["loaded", "failed", "loaded"]);
    });

    it("maps the job's indices back to the workbench's list", () => {
        // The user selected chapters 2, 5 and 6 of the whole list, so the
        // job's indices are 0, 1 and 2.
        const changes = finishedChapterStates({ upTo: 1, failed: [] }, [2, 5, 6]);

        expect(changes).toEqual([
            { index: 2, state: "loaded" },
            { index: 5, state: "loaded" },
        ]);
    });

    it("ignores a chapter the job does not have", () => {
        const changes = finishedChapterStates({ upTo: 5, failed: [] }, [0, 1]);

        expect(changes).toEqual([
            { index: 0, state: "loaded" },
            { index: 1, state: "loaded" },
        ]);
    });

    it("marks nothing when no chapter has finished", () => {
        expect(finishedChapterStates({ upTo: -1, failed: [] }, [0, 1])).toEqual([]);
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
