/**
 * The workbench's state.
 *
 * A small, framework-free store. The workbench is a single page with one
 * owner, so a full state library would be ceremony. What matters is that the
 * state is a plain value, that every mutation goes through a method, and that
 * the view is told to re-render afterwards.
 *
 * The chapter list is the only part large enough to need care: it holds
 * thousands of entries, and every selection change must be cheap.
 */

/** A chapter, as the workbench knows it. */
export interface Chapter {
    /** The chapter's URL. */
    sourceUrl: string;
    /** The chapter's title. */
    title: string;
    /** Whether the chapter is selected. */
    selected: boolean;
    /** Whether the chapter can be fetched at all. */
    isIncludeable: boolean;
    /** The fetch state. */
    state: ChapterState;
    /** The fetched content's size, in bytes. */
    size?: number;
}

/** A chapter's fetch state. */
export type ChapterState = "idle" | "queued" | "fetching" | "loaded" | "downloaded" | "failed";

/** The story's metadata. */
export interface StoryMeta {
    /** The title. */
    title: string;
    /** The author. */
    author: string;
    /** The language, as an ISO 639 code. */
    language: string;
    /** The cover image's URL. */
    coverUrl: string;
    /** The description. */
    description: string;
    /** The URL the metadata came from. */
    sourceUrl: string;
    /** The parser that found it. */
    parserName: string;
}

/** The filter's state. */
export interface FilterState {
    /** The search text. */
    query: string;
    /** Whether the query is a regular expression. */
    useRegex: boolean;
    /** The include terms. */
    include: string[];
    /** The exclude terms. */
    exclude: string[];
}

/** The workbench's state. */
export interface WorkbenchState {
    /** The story's metadata. */
    story: StoryMeta;
    /** The chapters. */
    chapters: Chapter[];
    /** Whether the chapter list is still loading. */
    loadingChapters: boolean;
    /** The filter. */
    filter: FilterState;
    /** Whether the metadata has unsaved edits. */
    dirty: boolean;
    /**
     * Whether the fallback parser was used.
     *
     * When it was, the workbench offers the site-selector panel: the user can
     * teach the extension where this site's chapters are, once, instead of
     * accepting a guess on every visit.
     */
    usedDefaultParser: boolean;
    /** The progress of the running download. */
    progress: DownloadProgressState | undefined;
    /** The error, if anything failed. */
    error: string | undefined;
}

/** The progress of a download. */
export interface DownloadProgressState {
    /** The phase. */
    phase: string;
    /** How many chapters are done. */
    done: number;
    /** How many chapters there are in total. */
    total: number;
    /** The percentage, from 0 to 100. */
    percent: number;
    /** The message. */
    message: string;
    /** Whether the job finished successfully. */
    succeeded: boolean;
}

/** The store. */
export class WorkbenchStore {
    #state: WorkbenchState;
    #listeners = new Set<(state: WorkbenchState) => void>();

    constructor(initial: WorkbenchState) {
        this.#state = initial;
    }

    /** The current state. */
    get state(): WorkbenchState {
        return this.#state;
    }

    /** Subscribe to state changes. */
    subscribe(listener: (state: WorkbenchState) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    /** Apply a mutation and notify the listeners. */
    update(mutate: (state: WorkbenchState) => void): void {
        mutate(this.#state);
        for (const listener of this.#listeners) listener(this.#state);
    }

    /** Replace the story's metadata. */
    setStory(story: Partial<StoryMeta>): void {
        this.update((state) => {
            state.story = { ...state.story, ...story };
        });
    }

    /** Replace the chapter list. */
    setChapters(chapters: Chapter[]): void {
        this.update((state) => {
            state.chapters = chapters;
            state.loadingChapters = false;
        });
    }

    /** Set whether the chapter list is loading. */
    setLoading(loading: boolean): void {
        this.update((state) => {
            state.loadingChapters = loading;
        });
    }

    /** Mark the metadata as edited. */
    markDirty(dirty: boolean): void {
        this.update((state) => {
            state.dirty = dirty;
        });
    }

    /** Record whether the fallback parser was used. */
    setUsedDefaultParser(used: boolean): void {
        this.update((state) => {
            state.usedDefaultParser = used;
        });
    }

    /** Set the filter. */
    setFilter(filter: Partial<FilterState>): void {
        this.update((state) => {
            state.filter = { ...state.filter, ...filter };
        });
    }

    /** Set the download's progress. */
    setProgress(progress: DownloadProgressState | undefined): void {
        this.update((state) => {
            state.progress = progress;
        });
    }

    /** Set the error. */
    setError(error: string | undefined): void {
        this.update((state) => {
            state.error = error;
        });
    }

    /**
     * Toggle a chapter's selection.
     *
     * A chapter that cannot be included is never selectable — the user can
     * still tick it in the baseline, but the download then fails on it.
     */
    toggleChapter(index: number): void {
        this.update((state) => {
            const chapter = state.chapters[index];
            if (!chapter || !chapter.isIncludeable) return;
            chapter.selected = !chapter.selected;
        });
    }

    /** Set every chapter's selection. */
    setAllSelected(selected: boolean): void {
        this.update((state) => {
            for (const chapter of state.chapters) {
                if (chapter.isIncludeable) chapter.selected = selected;
            }
        });
    }

    /** Invert every chapter's selection. */
    invertSelection(): void {
        this.update((state) => {
            for (const chapter of state.chapters) {
                if (chapter.isIncludeable) chapter.selected = !chapter.selected;
            }
        });
    }

    /** Set a range of chapters' selection. */
    setRange(from: number, to: number, selected: boolean): void {
        this.update((state) => {
            const start = Math.max(0, Math.min(from, to));
            const end = Math.min(state.chapters.length - 1, Math.max(from, to));
            for (let index = start; index <= end; index += 1) {
                const chapter = state.chapters[index];
                if (chapter && chapter.isIncludeable) chapter.selected = selected;
            }
        });
    }

    /** Set a chapter's fetch state. */
    setChapterState(index: number, chapterState: ChapterState, size?: number): void {
        this.update((state) => {
            const chapter = state.chapters[index];
            if (!chapter) return;
            chapter.state = chapterState;
            if (size !== undefined) chapter.size = size;
        });
    }

    /** The number of selected chapters. */
    get selectedCount(): number {
        return this.#state.chapters.filter((chapter) => chapter.selected).length;
    }

    /** The chapters that match the filter. */
    get visibleChapters(): number[] {
        return matchingIndices(this.#state.chapters, this.#state.filter);
    }
}

/**
 * The chapters that match a filter.
 *
 * The match is a plain substring test by default. The baseline built a
 * `RegExp` from raw user input, which could throw on a stray `[` and had no
 * keyboard path to a regex.
 */
export function matchingIndices(chapters: Chapter[], filter: FilterState): number[] {
    const query = filter.query.trim();
    if (!query && filter.include.length === 0 && filter.exclude.length === 0) {
        return chapters.map((_, index) => index);
    }

    let tester: ((title: string) => boolean) | undefined;

    if (query) {
        if (filter.useRegex) {
            const pattern = compilePattern(query);
            if (!pattern) return [];
            tester = (title) => pattern.test(title);
        } else {
            const needle = query.toLowerCase();
            tester = (title) => title.toLowerCase().includes(needle);
        }
    }

    const includes = filter.include.map((term) => term.toLowerCase()).filter(Boolean);
    const excludes = filter.exclude.map((term) => term.toLowerCase()).filter(Boolean);

    const result: number[] = [];
    for (let index = 0; index < chapters.length; index += 1) {
        const title = (chapters[index] as Chapter).title;
        const lower = title.toLowerCase();

        if (tester && !tester(title)) continue;
        if (includes.length > 0 && !includes.some((term) => lower.includes(term))) continue;
        if (excludes.length > 0 && excludes.some((term) => lower.includes(term))) continue;

        result.push(index);
    }
    return result;
}

/**
 * Compile a regular expression safely.
 *
 * Returns `null` when the pattern is invalid, so the UI can show the error
 * inline rather than throwing.
 */
export function compilePattern(pattern: string): RegExp | null {
    try {
        return new RegExp(pattern, "i");
    } catch {
        return null;
    }
}
