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
    /**
     * The name the book will be saved as.
     *
     * It is derived from the title and the user's filename template until the
     * user edits it, at which point it is whatever they typed.
     */
    fileName: string;
    /**
     * Whether the user has edited the file name.
     *
     * While this is false the name follows the title, so renaming the book
     * renames the file. Once the user has typed a name of their own it is
     * left alone.
     */
    fileNameEdited: boolean;
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
    /**
     * The origin the extension needs access to, if any.
     *
     * The extension has no host permissions of its own: it asks for one site at
     * a time, when the user opens a story there. While this is set, the
     * workbench cannot read the story, and it says so instead of failing with
     * a network error the user cannot act on.
     */
    accessOrigin: string | undefined;
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
    /** How the job ended, once it has. */
    outcome?: "success" | "failed" | "cancelled";
    /** The line under the label: where the book went, or what went wrong. */
    detail?: string;
}

/**
 * A chapter's state, as the download reports it.
 */
export interface ReportedChapterState {
    /** The chapter's index **within the job**. */
    index: number;
    /** The state the chapter is in. */
    state: ChapterState;
}

/**
 * The chapters a download has finished.
 */
export interface ReportedFinished {
    /**
     * The index of the last chapter that has finished.
     *
     * The chapters are fetched in order, so everything below this index has
     * finished too.
     */
    upTo: number;
    /** The indices, within the job, of the chapters that failed. */
    failed: number[];
}

/**
 * Work out which chapters changed state.
 *
 * The download reports the chapters it has finished as a watermark and the
 * failures within that range. The workbench's list is the whole list, and the
 * job's list is only the chapters the user selected, so the job's indices are
 * mapped back through the selection.
 *
 * This is a pure function so that the mapping can be tested on its own: it is
 * the part that decides whether a row shows a spinner or a tick, and a row
 * that never stops spinning is a list that looks broken.
 *
 * @param finished The chapters the job has finished.
 * @param jobChapterIndexes The workbench's index for each of the job's
 *   chapters.
 * @returns The workbench's chapter indices and their new states.
 */
export function finishedChapterStates(
    finished: ReportedFinished,
    jobChapterIndexes: number[],
): { index: number; state: ChapterState }[] {
    const failed = new Set(finished.failed);
    const changes: { index: number; state: ChapterState }[] = [];

    for (let jobIndex = 0; jobIndex <= finished.upTo; jobIndex += 1) {
        const index = jobChapterIndexes[jobIndex];
        if (index === undefined) continue;
        changes.push({ index, state: failed.has(jobIndex) ? "failed" : "loaded" });
    }

    return changes;
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

    /** Record the origin the extension needs access to. */
    setAccessOrigin(origin: string | undefined): void {
        this.update((state) => {
            state.accessOrigin = origin;
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
     * A locked chapter starts unticked, but the user can tick it by hand: a
     * reader who bought it can download it. The bulk actions leave locked
     * chapters alone, so "Select all" never sweeps in a paywalled page.
     */
    toggleChapter(index: number): void {
        this.update((state) => {
            const chapter = state.chapters[index];
            if (!chapter) return;
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
 * A range of chapters, as the user typed it.
 *
 * The numbers are one-based, because that is how the chapters are numbered in
 * the list.
 */
export interface ChapterRange {
    /** The first chapter of the range, one-based. */
    from: number;
    /** The last chapter of the range, one-based. */
    to: number;
}

/**
 * Parse the two numbers of the range dialog.
 *
 * The result is `null` when the range cannot be used: the numbers are not
 * numbers, they are below one, or they reach past the end of the list.
 *
 * The order the two numbers are given in does not matter: a range typed
 * backwards is the range the user meant.
 *
 * @param fromText The first field's value.
 * @param toText The second field's value.
 * @param total How many chapters the list holds.
 * @returns The range, or `null` when it is not usable.
 */
export function parseChapterRange(
    fromText: string,
    toText: string,
    total: number,
): ChapterRange | null {
    if (total <= 0) return null;

    const from = Number.parseInt(fromText, 10);
    const to = Number.parseInt(toText, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    if (from < 1 || to < 1 || from > total || to > total) return null;

    return { from: Math.min(from, to), to: Math.max(from, to) };
}

/**
 * The story options, as the workbench's switches show them.
 *
 * The switches and the settings do not use the same words, which is why this
 * mapping lives in one place: the switch says "include the author notes" and
 * the setting says "remove the author notes", so the two are opposites.
 */
export interface StoryOptionSwitches {
    /** Whether the "include the author notes" switch is on. */
    includeAuthorNotes: boolean;
    /** Whether the "include the contents page" switch is on. */
    includeTocPage: boolean;
}

/**
 * Read the story options out of the settings, for the switches to show.
 *
 * @param story The story group's settings.
 * @returns The switches' states.
 */
export function storyOptionSwitches(story: {
    removeAuthorNotes: boolean;
    includeTocPage: boolean;
}): StoryOptionSwitches {
    return {
        includeAuthorNotes: !story.removeAuthorNotes,
        includeTocPage: story.includeTocPage,
    };
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
