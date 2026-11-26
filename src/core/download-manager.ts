/**
 * The download manager.
 *
 * Owns every network request the extension makes. The workbench and the popup
 * never fetch a chapter themselves; they ask the worker, and the worker
 * reports progress back.
 *
 * The design decisions that matter:
 *
 *  - **One job at a time.** Concurrent fetching gets users rate-limited, and
 *    the baseline's `maxSimultanousFetchSize` was a constant nobody enforced.
 *  - **Cancellation is real.** Every job has an `AbortController`, so
 *    cancelling stops the in-flight request rather than shortening a sleep.
 *  - **Progress is durable.** A job's state lives in a map that survives the
 *    worker being suspended, so a page reload does not lose the run.
 *
 * See ADR-0005.
 */
import type { ChapterToPack, ImageData } from "./epub/packer";
import {
    buildPlaceholderChapter,
    buildPlaceholderImage,
    chapterImageHref,
    packEpub,
} from "./epub/packer";
import type { EpubFile } from "./epub/document";
import { SVG_MEDIA_TYPE } from "./epub/document";
import { buildEpubArchive } from "./epub/archiver";
import { sanitizeHtml } from "./util/sanitize";
import {
    parseSrcset,
    pickSrcsetCandidate,
    resolveUrl,
    rewriteImageElements,
} from "./util/image-references";
import { buildFileName, DEFAULT_FILENAME_TEMPLATE } from "./util/file-name";
import { normaliseUrlForCompare } from "./util/dom";
import { diagnostic } from "./util/diagnostics";
import type { Parser } from "./parsers/parser";
import { isAbortError, toUserFacingError, type UserFacingError } from "./util/errors";
import type { LibraryEntry } from "./storage/library-store";

/** A chapter being downloaded. */
interface DownloadChapter {
    /** The chapter's URL. */
    sourceUrl: string;
    /** The chapter's title. */
    title: string;
    /**
     * The chapter's own state.
     *
     * The chapter list in the workbench shows a state per row, and the only
     * thing that can fill it in truthfully is the job itself. The state is
     * kept on the chapter rather than on the job, because a job's chapters
     * are its own.
     */
    state?: ChapterFetchState;
}

/**
 * The state of one chapter within a job.
 *
 * These are the states the chapter list already knows how to draw, so the
 * workbench does not have to translate them.
 */
export type ChapterFetchState = "queued" | "fetching" | "loaded" | "failed";

/** A running job. */
interface Job {
    /** The job's ID. */
    id: string;
    /** The story's URL. */
    sourceUrl: string;
    /** The story's title. */
    title: string;
    /**
     * The file name the user asked for.
     *
     * It is `undefined` when the user did not name the file, in which case
     * the filename template from the options page is used instead.
     */
    requestedFileName: string | undefined;
    /** The chapters to fetch. */
    chapters: DownloadChapter[];
    /** The phase. */
    phase: JobPhase;
    /** How many chapters are done. */
    done: number;
    /** How many chapters failed. */
    failed: number;
    /** The error, if the job failed. */
    error: UserFacingError | undefined;
    /**
     * The index of the chapter the job is on, and its state.
     *
     * The workbench's chapter list shows a state per row, and this is where
     * that state comes from. It is `undefined` while the job is between
     * chapters — during the image phase, the EPUB build and the save — because
     * at that point no single chapter is the one in flight.
     */
    current: { index: number; state: ChapterFetchState } | undefined;
    /**
     * The chapters that have finished, and the state they finished in.
     *
     * The workbench's chapter list shows a state per row, and a finished
     * chapter keeps its final state for the rest of the download. The
     * chapters are finished in order, so the report says how far the job has
     * got and which of the chapters in that range failed. That keeps the
     * report small: a book with thousands of chapters does not send its whole
     * list every half second.
     */
    states: Map<number, ChapterFetchState>;
    /** The controller that cancels the job. */
    controller: AbortController;
    /** The finished job's file name. */
    fileName: string | undefined;
    /** The finished job's size, in bytes. */
    fileSize: number | undefined;
    /**
     * Whether the job's terminal phase has already been reported.
     *
     * The cleanup hook runs exactly once per job, however many times the
     * progress is reported.
     */
    finished: boolean;
}

/** The phases of a job. */
export type JobPhase =
    | "preparing"
    | "fetching-chapters"
    | "downloading-images"
    | "building-epub"
    | "saving"
    | "complete"
    | "failed"
    | "cancelled";

/** The behaviour settings the download pipeline honours. */
export interface DownloadBehaviour {
    /** Whether a chapter that fails to fetch is skipped rather than kept. */
    skipFailedChapters: boolean;
    /** Whether an empty page is fetched again before giving up. */
    retryOnEmptyPage: boolean;
    /** The minimum delay between requests, in milliseconds. */
    minimumDelay: number;
    /** The maximum number of chapters in one EPUB. */
    maxChapters: number;
    /** The extra delay between chapters, in milliseconds. */
    delayPerChapter: number;
}

/**
 * The behaviour settings, when nothing else is known.
 *
 * These match the defaults in the settings store, so a download behaves the
 * same way whether or not the settings have been read yet.
 */
export const DEFAULT_BEHAVIOUR: DownloadBehaviour = {
    skipFailedChapters: false,
    retryOnEmptyPage: true,
    minimumDelay: 500,
    maxChapters: 5000,
    delayPerChapter: 0,
};

/**
 * The metadata the packer needs, plus the settings that shape it.
 */
export interface BookMetadata {
    /** The title. */
    title: string;
    /** The author. */
    author?: string;
    /** The language. */
    language?: string;
    /** The publisher. */
    publisher?: string;
    /** The description. */
    description?: string;
    /** The subjects. */
    subjects?: string[];
    /** The publication date. */
    date?: string;
    /** The cover image. */
    cover?: ImageData;
    /** The EPUB version. */
    version: 2 | 3;
    /** Whether the book carries an information page. */
    includeInfoPage: boolean;
}

/**
 * Build the EPUB's metadata from the story's page.
 *
 * The parser knows the site, so it knows the author, the language and where
 * the cover is. The baseline wrote all of this into the EPUB; the rewrite
 * keeps the same fields but fills them in from the rewrite's own extraction
 * methods.
 *
 * The language is the one thing the parser does not have the last word on: a
 * site that does not declare a language leaves the book without one, and a
 * reader that has to guess reads it badly. The user's default language is
 * used instead.
 *
 * @param title The book's title.
 * @param sourceUrl The story's URL, used to resolve the cover's URL.
 * @param storyDom The story's page.
 * @param parser The parser for the story.
 * @param images The images that were downloaded, keyed by their URL.
 * @param book The book settings.
 * @returns The metadata.
 */
export function buildBookMetadata(
    title: string,
    sourceUrl: string,
    storyDom: Document | null,
    parser: Parser | null,
    images: Map<string, ImageData>,
    book: DownloadBook,
): BookMetadata {
    const metadata: BookMetadata = {
        title: title || "Untitled",
        version: book.version,
        includeInfoPage: book.addInfoPage,
        language: book.defaultLanguage,
    };

    if (!parser || !storyDom) return metadata;

    const author = parser.extractAuthor(storyDom);
    if (author) metadata.author = author;

    const language = parser.extractLanguage(storyDom);
    if (language) metadata.language = language;

    const publisher = parser.extractPublisher(storyDom);
    if (publisher) metadata.publisher = publisher;

    const description = parser.extractDescription(storyDom);
    if (description) metadata.description = description;

    const subject = parser.extractSubject(storyDom);
    if (subject) metadata.subjects = [subject];

    const date = parser.extractDatePublished(storyDom);
    if (date) metadata.date = date;

    // The cover is one of the images the chapters referenced, if the parser
    // named one that was downloaded.
    const coverUrl = parser.findCoverImageUrl(storyDom);
    if (coverUrl) {
        const absolute = resolveUrl(coverUrl, sourceUrl);
        const cover = absolute ? images.get(absolute) : undefined;
        if (cover) metadata.cover = cover;
    }

    return metadata;
}

/**
 * The URLs of a chapter's neighbours.
 *
 * A chapter page usually carries a link to the chapter before it and to the
 * chapter after it. Those links are noise in a book, and the parser is told
 * which URLs they point at so that it can remove them.
 *
 * The comparison is done on the normalised URL, so that a link to
 * `https://example.com/chapter-2` matches a chapter list that says
 * `https://example.com/chapter-2/`.
 *
 * @param chapters The chapters of the book, in order.
 * @param index The chapter's own index.
 * @returns The neighbours' URLs, normalised.
 */
export function neighbourUrls(chapters: DownloadChapter[], index: number): Set<string> {
    const neighbours = new Set<string>();
    const previous = chapters[index - 1];
    const next = chapters[index + 1];
    if (previous) neighbours.add(normaliseUrlForCompare(previous.sourceUrl));
    if (next) neighbours.add(normaliseUrlForCompare(next.sourceUrl));
    return neighbours;
}

/**
 * The image settings the download pipeline honours.
 */
export interface DownloadImages {
    /** Whether the images are left out of the book entirely. */
    skipImages: boolean;
    /** Whether an image that appears more than once is stored once. */
    removeDuplicates: boolean;
    /** Whether the highest-resolution version of an image is preferred. */
    preferHighestResolution: boolean;
    /** Whether an SVG image may be included. */
    useSvg: boolean;
}

/**
 * The image settings, when nothing else is known.
 *
 * These match the defaults in the settings store, so a download behaves the
 * same way whether or not the settings have been read yet.
 */
export const DEFAULT_IMAGES: DownloadImages = {
    skipImages: false,
    removeDuplicates: true,
    preferHighestResolution: true,
    useSvg: true,
};

/**
 * The book settings the download pipeline honours.
 *
 * These decide what the book itself looks like: which version of the format
 * it is written in, whether it carries an information page, and what language
 * it is in when the site does not say.
 */
export interface DownloadBook {
    /** The EPUB version to write. */
    version: 2 | 3;
    /** Whether the book carries an information page. */
    addInfoPage: boolean;
    /** The language to use when the site does not declare one. */
    defaultLanguage: string;
}

/**
 * The book settings, when nothing else is known.
 *
 * These match the defaults in the settings store, so a download behaves the
 * same way whether or not the settings have been read yet.
 */
export const DEFAULT_BOOK: DownloadBook = {
    version: 3,
    addInfoPage: false,
    defaultLanguage: "en",
};

/** The dependencies the manager needs. */
export interface DownloadManagerDependencies {
    /** Fetch a page and parse it as HTML. */
    fetchHtml(
        url: string,
        options: { signal?: AbortSignal },
    ): Promise<{ dom: Document; url: string }>;
    /** Fetch a resource's bytes. */
    fetchBytes(
        url: string,
        options: { signal?: AbortSignal },
    ): Promise<{ data: Uint8Array; mediaType: string }>;
    /** Save a file, returning its name and size. */
    saveFile(fileName: string, bytes: Uint8Array): Promise<{ fileName: string; fileSize: number }>;
    /** The parser for a URL. */
    parserFor(url: string, dom: Document): Parser | null;
    /** Wait between requests, honouring the abort signal. */
    throttle(ms: number, signal: AbortSignal): Promise<void>;
    /**
     * The behaviour settings to apply to a job.
     *
     * Read at the moment the job starts, so a change in the options applies
     * to the next download and not to one already running.
     */
    behaviour?(): DownloadBehaviour | Promise<DownloadBehaviour>;
    /**
     * The image settings to apply to a job.
     *
     * Read at the moment the job starts, so a change in the options applies
     * to the next download and not to one already running.
     */
    images?(): DownloadImages | Promise<DownloadImages>;
    /**
     * The filename template to apply to a job.
     *
     * Read at the moment the job starts, for the same reason as the other
     * settings.
     */
    filenameTemplate?(): string | Promise<string>;
    /**
     * The book settings to apply to a job.
     *
     * Read at the moment the job starts, for the same reason as the other
     * settings.
     */
    book?(): DownloadBook | Promise<DownloadBook>;
    /**
     * Prepare for a job, before the parser is built.
     *
     * The worker uses this to refresh the user's preferences, so the parser
     * a job runs with sees the settings the user has right now rather than
     * the ones that were current when the worker started.
     */
    prepare?(): void | Promise<void>;
    /** Report progress. */
    onProgress?(job: JobProgress): void;
    /**
     * Called when a job reaches a terminal phase — complete, failed or
     * cancelled.
     *
     * This is where the extension cleans up after itself: the copied
     * partitioned cookies are removed, so a long session cannot accumulate
     * copies of the user's session cookies.
     */
    onFinished?(job: JobProgress): void;
    /**
     * Record a finished book in the library.
     *
     * The library is the extension's archive: the books the user has already
     * made, so they can be found again and updated when the serial continues.
     * Without this the library is always empty, because nothing else writes
     * to it.
     */
    saveToLibrary?(entry: LibraryEntry): Promise<void>;
}

/** The progress of a job, as reported to the UI. */
export interface JobProgress {
    /** The job's ID. */
    jobId: string;
    /** The phase. */
    phase: JobPhase;
    /** How many chapters are done. */
    chaptersDone: number;
    /** How many chapters there are in total. */
    chaptersTotal: number;
    /** The percentage, from 0 to 100. */
    percent: number;
    /** The message, as the key the UI translates. */
    message: string;
    /**
     * The chapter the job is on, and its state.
     *
     * The workbench's chapter list draws a state per row. This is where the
     * row's state comes from — without it every row would sit at "idle" for
     * the whole download, which is a list that looks broken rather than
     * busy.
     */
    current?: { index: number; state: ChapterFetchState };
    /**
     * The chapters that have finished, and the state they finished in.
     *
     * The workbench's chapter list draws a state per row. A chapter that has
     * finished keeps its final state — "loaded" or "failed" — for the rest of
     * the download, so the list reads as a record of what has happened rather
     * than a spinner that never stops.
     *
     * The chapters are finished in order, so the report says how far the job
     * has got and which of the chapters in that range failed. That keeps the
     * report small: a book with thousands of chapters does not send its whole
     * list every half second.
     */
    finished?: { upTo: number; failed: number[] };
    /** The file name, once the job is complete. */
    fileName?: string;
    /** The file size, in bytes. */
    fileSize?: number;
    /** The error, if the job failed. */
    error?: UserFacingError;
}

/** The phases a job can end in. */
const TERMINAL_PHASES = new Set<JobPhase>(["complete", "failed", "cancelled"]);

/**
 * The message key for each phase.
 *
 * The keys are translated in the UI, not here: the background worker has no
 * locale, and a message that crossed the bus in English could not be
 * translated by the page that received it.
 *
 * See ADR-0010.
 */
const PHASE_MESSAGE_KEYS: Record<JobPhase, string> = {
    preparing: "phasePreparing",
    "fetching-chapters": "phaseFetchingChapters",
    "downloading-images": "phaseDownloadingImages",
    "building-epub": "phaseBuildingEpub",
    saving: "phaseSaving",
    complete: "phaseComplete",
    failed: "phaseFailed",
    cancelled: "phaseCancelled",
};

/**
 * The number of finished jobs the manager keeps.
 *
 * A finished job is kept for a while so that a page which is still showing its
 * progress can read the last state of the job it started. Without a limit the
 * manager would keep every job it ever ran, along with a row per chapter, for
 * the life of the browser session.
 */
const FINISHED_JOB_HISTORY = 20;

/**
 * The download manager.
 */
export class DownloadManager {
    #dependencies: DownloadManagerDependencies;
    #jobs = new Map<string, Job>();

    constructor(dependencies: DownloadManagerDependencies) {
        this.#dependencies = dependencies;
    }

    /** The running job, if there is one. */
    get activeJob(): Job | undefined {
        for (const job of this.#jobs.values()) {
            if (job.phase !== "complete" && job.phase !== "failed" && job.phase !== "cancelled") {
                return job;
            }
        }
        return undefined;
    }

    /** Every job. */
    list(): JobProgress[] {
        return [...this.#jobs.values()].map((job) => this.#toProgress(job));
    }

    /**
     * Forget the jobs that finished long ago.
     *
     * Only finished jobs are dropped, and the most recent ones are kept, so a
     * page that is still polling a job that has just finished can still read
     * its final state.
     */
    #pruneFinishedJobs(): void {
        const finished = [...this.#jobs.values()].filter((job) => TERMINAL_PHASES.has(job.phase));
        const excess = finished.length - FINISHED_JOB_HISTORY;
        if (excess <= 0) return;
        // The map preserves insertion order, so the oldest jobs come first.
        for (const job of finished.slice(0, excess)) {
            this.#jobs.delete(job.id);
        }
    }

    /** A job's progress. */
    progress(jobId: string): JobProgress | undefined {
        const job = this.#jobs.get(jobId);
        return job ? this.#toProgress(job) : undefined;
    }

    /**
     * Start a download.
     *
     * The job runs in the background; the caller gets the job's ID back
     * immediately and polls for progress.
     *
     * @param sourceUrl The story's page.
     * @param title The story's title.
     * @param chapters The chapters to fetch.
     * @param options The file name the user asked for, if any.
     * @returns The job's ID.
     */
    start(
        sourceUrl: string,
        title: string,
        chapters: DownloadChapter[],
        options: { fileName?: string } = {},
    ): string {
        const id = crypto.randomUUID();
        const job: Job = {
            id,
            sourceUrl,
            title,
            requestedFileName: options.fileName,
            // A chapter the caller did not give a state for is waiting.
            chapters: chapters.map((chapter) => ({ ...chapter, state: chapter.state ?? "queued" })),
            phase: "preparing",
            done: 0,
            failed: 0,
            error: undefined,
            current: undefined,
            states: new Map(),
            controller: new AbortController(),
            fileName: undefined,
            fileSize: undefined,
            finished: false,
        };
        this.#jobs.set(id, job);

        void this.#run(job).catch((error) => {
            // A cancellation is not a failure. The user asked for the job to
            // stop, and the abort error that carries that request must not be
            // allowed to turn "cancelled" into "failed" — the user pressed the
            // button and would then be told the download went wrong.
            if (job.controller.signal.aborted || isAbortError(error)) {
                job.phase = "cancelled";
                job.error = undefined;
                this.#report(job);
                this.#pruneFinishedJobs();
                return;
            }
            job.phase = "failed";
            job.error = toUserFacingError(error);
            this.#report(job);
            this.#pruneFinishedJobs();
        });

        return id;
    }

    /** Cancel a job. */
    cancel(jobId: string): boolean {
        const job = this.#jobs.get(jobId);
        if (!job) return false;
        if (job.phase === "complete" || job.phase === "failed") return false;
        job.controller.abort();
        job.phase = "cancelled";
        this.#report(job);
        return true;
    }

    /** Run a job. */
    async #run(job: Job): Promise<void> {
        const { fetchBytes, saveFile, parserFor, throttle } = this.#dependencies;
        const signal = job.controller.signal;

        // The behaviour settings are read once, when the job starts, so a
        // change in the options applies to the next download rather than to
        // one that is already running.
        const behaviour = await this.#readBehaviour();
        // The image settings are read at the same moment, for the same reason.
        const imageSettings = await this.#readImageSettings();
        // So are the book settings.
        const bookSettings = await this.#readBookSettings();
        // The worker refreshes the user's preferences here, so the parser
        // built below sees the settings the user has right now.
        await this.#dependencies.prepare?.();

        job.phase = "fetching-chapters";
        this.#report(job);
        diagnostic("Fetching chapters", job.id, job.chapters.length, "chapters");

        // The parser is chosen from the story's page, so the same rules the
        // workbench used to build the chapter list apply to the content.
        // A failure here is fatal: without the story's page there is no
        // parser, no cover and no metadata, and every chapter would become a
        // placeholder. Failing loudly is better than saving a book that
        // looks complete but is empty.
        let storyDom: Document;
        try {
            storyDom = await this.#fetchStoryDom(job.sourceUrl, signal);
        } catch (error) {
            if (signal.aborted) {
                job.phase = "cancelled";
                this.#report(job);
                return;
            }
            job.phase = "failed";
            job.error = toUserFacingError(error);
            this.#report(job);
            return;
        }
        const parser = parserFor(job.sourceUrl, storyDom);

        // The parser owns the politeness budget. Some sites need seconds
        // between requests, and the baseline's parsers said so. The user's
        // own minimum is a floor, not a ceiling: a site that asks for a
        // longer pause always gets it.
        const parserDelay = parser ? Math.max(parser.getRateLimit(), 0) : 0;
        const delay = Math.max(parserDelay, behaviour.minimumDelay) + behaviour.delayPerChapter;

        // The chapter limit is the user's safety net. A book with tens of
        // thousands of chapters would take days and fill the disk, so the
        // job is refused with an error the user can act on rather than
        // starting and grinding to a halt.
        if (job.chapters.length > behaviour.maxChapters) {
            job.phase = "failed";
            job.error = tooManyChaptersError(job.chapters.length, behaviour.maxChapters);
            this.#report(job);
            return;
        }

        const packed: ChapterToPack[] = [];
        const images = new Map<string, ImageData>();
        /**
         * The images each chapter references, keyed by the chapter's URL.
         *
         * The rewrite of the chapter's markup happens after the images have
         * been downloaded, because the packaged file name depends on the
         * media type, which is only known then.
         */
        const chapterImages = new Map<string, Map<string, ImageData>>();
        /**
         * The address each chapter's page was finally served from.
         *
         * A site may redirect a chapter from one address to another, and a
         * relative image URL on the page belongs to the address the page was
         * *served* from. The chapter's own URL is not that address, so the
         * one the page actually had is kept.
         */
        const chapterBases = new Map<string, string>();

        for (const [chapterIndex, chapter] of job.chapters.entries()) {
            if (signal.aborted) {
                job.phase = "cancelled";
                this.#report(job);
                return;
            }

            // The chapter is in flight now. The workbench draws this state on
            // the chapter's row, so the user can see which chapter the job is
            // on rather than only a number counting up.
            chapter.state = "fetching";
            job.current = { index: chapterIndex, state: "fetching" };
            this.#report(job);

            try {
                const dom = await this.#fetchChapterWithRetry(
                    parser,
                    chapter.sourceUrl,
                    signal,
                    behaviour,
                );
                if (dom === null) {
                    // A chapter that could not be read is either skipped or
                    // kept as a placeholder, depending on the user's
                    // preference. Skipping keeps the book's contents honest:
                    // a placeholder chapter reads as if the prose were
                    // missing, rather than saying what went wrong.
                    if (!behaviour.skipFailedChapters) {
                        packed.push(
                            buildPlaceholderChapter(
                                chapter.sourceUrl,
                                "The chapter could not be read.",
                            ),
                        );
                    }
                    job.failed += 1;
                    chapter.state = "failed";
                } else {
                    // The parser decides what the content is and how it is
                    // cleaned up. The pipeline does not second-guess it.
                    //
                    // The chapter's neighbours are handed over with it, so
                    // that a parser can remove the links to the previous and
                    // the next chapter — the setting that asks for it would
                    // otherwise have nothing to compare the links against.
                    const content = parser
                        ? parser.extractChapterContent(dom, {
                              sourceUrl: chapter.sourceUrl,
                              title: chapter.title,
                              nextPrevChapters: neighbourUrls(job.chapters, chapterIndex),
                          })
                        : null;

                    if (content === null) {
                        if (!behaviour.skipFailedChapters) {
                            packed.push(
                                buildPlaceholderChapter(
                                    chapter.sourceUrl,
                                    "The chapter could not be read.",
                                ),
                            );
                        }
                        job.failed += 1;
                        chapter.state = "failed";
                    } else {
                        // Collect the images the chapter references. The
                        // markup is not rewritten yet: the packaged file name
                        // depends on the media type, which is only known once
                        // the image has been downloaded.
                        //
                        // When the user has asked for the images to be left
                        // out, the references are removed from the markup
                        // instead: a book with no pictures but with `<img>`
                        // tags still pointing at the site's servers shows a
                        // broken image in the reader, and worse, tries to
                        // reach the site every time the page is opened.
                        // The base is the page's own address, not the address
                        // that was asked for. A site that redirects a chapter
                        // from `/chapter/1` to `/story/chapter-1` moves the
                        // page's relative image URLs with it, and resolving
                        // them against the address that was asked for would
                        // point every one of them at the wrong place.
                        const base = dom.baseURI || chapter.sourceUrl;
                        const referenced = imageSettings.skipImages
                            ? new Set<string>()
                            : collectImageUrls(content, base, {
                                  preferHighestResolution: imageSettings.preferHighestResolution,
                              });
                        const chapterImageMap = new Map<string, ImageData>();
                        for (const url of referenced) {
                            if (!images.has(url)) {
                                images.set(url, {
                                    data: new Uint8Array(),
                                    mediaType: "",
                                    url,
                                });
                            }
                            chapterImageMap.set(url, images.get(url)!);
                        }
                        // The images are keyed by the chapter's URL, not by its
                        // position in a list. A chapter that failed is skipped,
                        // so the packed list and the requested list do not
                        // share their positions, and a positional key would
                        // hand a chapter the wrong images.
                        chapterImages.set(chapter.sourceUrl, chapterImageMap);
                        chapterBases.set(chapter.sourceUrl, base);

                        if (imageSettings.skipImages) removeImageReferences(content);

                        const html = sanitizeContent(content);
                        chapter.state = "loaded";
                        packed.push({
                            sourceUrl: chapter.sourceUrl,
                            title: chapter.title,
                            contentHtml: html,
                        });
                    }
                }
            } catch (error) {
                if (signal.aborted) {
                    job.phase = "cancelled";
                    this.#report(job);
                    return;
                }
                if (!behaviour.skipFailedChapters) {
                    // The reason is written into the book, so it has to be a
                    // sentence for the reader — and it must not carry the
                    // address the chapter was fetched from. A site's query
                    // string can hold a session token, and a book is a file
                    // people pass around.
                    packed.push(
                        buildPlaceholderChapter(
                            chapter.sourceUrl,
                            toUserFacingError(error, { url: chapter.sourceUrl }).message,
                        ),
                    );
                }
                job.failed += 1;
                chapter.state = "failed";
            }

            job.done += 1;
            // Every path through the loop above leaves the chapter in a final
            // state — "loaded" or "failed".
            job.current = { index: chapterIndex, state: chapter.state };
            // The chapter has finished, so its row keeps this state for the
            // rest of the download.
            job.states.set(chapterIndex, chapter.state);
            this.#report(job);

            // The throttle is the site's politeness budget. It is honoured
            // after every request, and it aborts immediately when cancelled.
            await throttle(delay, signal);
        }

        // --- Images ---
        job.phase = "downloading-images";
        // No single chapter is in flight any more.
        job.current = undefined;
        this.#report(job);
        diagnostic("Downloading images", job.id, images.size, "images");

        // The cover is usually *not* in any chapter, so it is added to the
        // set of images to fetch here. Without this, a book whose cover
        // lives only on the story page would be built without one.
        const coverUrl = parser && storyDom ? parser.findCoverImageUrl(storyDom) : null;
        if (coverUrl) {
            const absolute = resolveUrl(coverUrl, job.sourceUrl);
            if (absolute && !images.has(absolute)) {
                images.set(absolute, {
                    data: new Uint8Array(),
                    mediaType: "",
                    url: absolute,
                });
            }
        }

        const downloaded = new Map<string, ImageData>();
        for (const url of images.keys()) {
            if (signal.aborted) {
                job.phase = "cancelled";
                this.#report(job);
                return;
            }
            try {
                const result = await fetchBytes(url, { signal });
                downloaded.set(url, {
                    data: result.data,
                    mediaType: result.mediaType,
                    url,
                });
            } catch {
                // A failed image becomes a visible placeholder rather than a
                // zero-byte file, which would corrupt the EPUB.
                downloaded.set(url, buildPlaceholderImage());
            }
            await throttle(100, signal);
        }

        // --- Apply the image settings ---
        //
        // The settings are applied here, after the bytes have arrived, because
        // that is the only point at which the media type is known. An SVG can
        // only be recognised once the server has said what it is.
        //
        // An image the user does not want is replaced by a placeholder rather
        // than dropped: a dropped image leaves a reference in the markup that
        // points at a file that is not in the book, and the reader shows a
        // broken picture.
        if (!imageSettings.useSvg) {
            for (const [url, image] of downloaded) {
                if (image.mediaType === SVG_MEDIA_TYPE) {
                    downloaded.set(url, buildPlaceholderImage());
                }
            }
        }

        if (imageSettings.removeDuplicates) {
            deduplicateImages(downloaded);
        }

        // --- Rewrite the chapters' image references ---
        //
        // The chapters' markup still points at the site's own servers, which
        // are not in the EPUB. Now that the images have been downloaded, each
        // reference is rewritten to the packaged file's path, and each
        // chapter is given the images it owns.
        for (const chapter of packed) {
            const owned = chapterImages.get(chapter.sourceUrl);
            if (!owned || owned.size === 0) continue;

            const resolved = new Map<string, ImageData>();
            for (const url of owned.keys()) {
                const fetched = downloaded.get(url);
                if (!fetched) continue;
                resolved.set(url, fetched);
            }
            if (resolved.size === 0) continue;

            chapter.images = resolved;
            chapter.contentHtml = rewriteImageReferences(
                chapter.contentHtml,
                resolved,
                chapterBases.get(chapter.sourceUrl) ?? chapter.sourceUrl,
            );
        }

        // --- Build ---
        //
        // A job that was cancelled while the images were downloading must not
        // go on to write a book. The abort is checked here because the image
        // loop is the last place the signal is looked at: without this check a
        // cancelled download would still build the EPUB, still save it, and
        // still report itself as complete — while the user was told it had been
        // cancelled.
        if (signal.aborted) {
            job.phase = "cancelled";
            this.#report(job);
            return;
        }

        job.phase = "building-epub";
        this.#report(job);
        diagnostic("Building the EPUB", job.id, packed.length, "chapters");

        const metadata = this.#buildMetadata(job, storyDom, parser, downloaded, bookSettings);
        const result = packEpub(packed, metadata);

        // --- Save ---
        job.phase = "saving";
        this.#report(job);

        const bytes = await this.#zip(result.files);
        const fileName = await this.#fileNameFor(job, metadata);

        // The check is repeated here, because zipping a large book takes a
        // moment and the user may have pressed cancel in the meantime.
        if (signal.aborted) {
            job.phase = "cancelled";
            this.#report(job);
            return;
        }

        const saved = await saveFile(fileName, bytes);

        job.fileName = saved.fileName;
        job.fileSize = saved.fileSize;
        diagnostic("Saved the book", job.id, fileName, saved.fileSize, "bytes");

        // The book is recorded in the library once it has been saved, so the
        // library shows what the user has actually made. A failure here does
        // not fail the download: the file is already on the disk, and losing
        // the download over a bookkeeping error would be worse than a missing
        // library entry.
        //
        // The count is the number of chapters that are *in the book*, not the
        // number that were asked for: a chapter that failed and was skipped
        // is not in the book, and a library that claims otherwise tells the
        // user the wrong thing about their own book.
        await this.#saveToLibrary(job, metadata, packed);

        // The cancel is checked again after the save, because the browser's
        // download cannot be called back: once the file has been written, the
        // job has produced its book. The job is reported as cancelled rather
        // than complete, because the user asked for it to stop — but the
        // library entry is kept, so the book the user now has on their disk
        // can still be found.
        if (signal.aborted) {
            job.phase = "cancelled";
            this.#report(job);
            return;
        }

        job.phase = "complete";
        this.#report(job);
        this.#pruneFinishedJobs();
    }

    /**
     * The name the book is saved as.
     *
     * The name the user typed in the workbench wins. When there is none, the
     * filename template from the options page is filled in — which is why the
     * template is applied *here* and not when the job starts: the author's
     * name is only known once the story's page has been parsed.
     */
    async #fileNameFor(job: Job, metadata: { title: string; author?: string }): Promise<string> {
        let template = DEFAULT_FILENAME_TEMPLATE;
        try {
            template = (await this.#dependencies.filenameTemplate?.()) || template;
        } catch {
            // A template that cannot be read is not a reason to fail the
            // download: the default name is used instead.
        }

        return buildFileName(
            template,
            {
                title: metadata.title || job.title,
                author: metadata.author,
            },
            job.requestedFileName,
        );
    }

    /**
     * Record a finished book in the library.
     *
     * The library is the extension's archive. Without this step it would
     * always be empty, because the download manager is the only thing that
     * ever produces a book.
     */
    async #saveToLibrary(
        job: Job,
        metadata: {
            title: string;
            author?: string;
            cover?: ImageData;
        },
        packed: ChapterToPack[],
    ): Promise<void> {
        const saveToLibrary = this.#dependencies.saveToLibrary;
        if (!saveToLibrary) return;

        const now = Date.now();
        const entry: LibraryEntry = {
            id: job.id,
            title: metadata.title || job.title || "Untitled",
            author: metadata.author,
            sourceUrl: job.sourceUrl,
            // The chapters that are in the book, which is not the same as the
            // chapters that were asked for: a chapter that failed and was
            // skipped is not in the book.
            chapterCount: packed.length,
            size: job.fileSize ?? 0,
            addedAt: now,
            updatedAt: now,
            // The cover's bytes, so the library's grid can show the book
            // without fetching it again.
            cover: metadata.cover?.data,
            coverMediaType: metadata.cover?.mediaType,
            // The chapter URLs, so a later run can tell which chapters are new.
            chapterUrls: packed.map((chapter) => chapter.sourceUrl),
        };

        try {
            await saveToLibrary(entry);
        } catch {
            // The book was saved; the library entry was not. The user has
            // the file, which is what matters.
        }
    }

    /**
     * Build the EPUB's metadata from the story's page.
     *
     * @param job The job.
     * @param storyDom The story's page.
     * @param parser The parser for the story.
     * @param images The images that were downloaded, keyed by their URL.
     * @param book The book settings.
     * @returns The metadata.
     */
    #buildMetadata(
        job: Job,
        storyDom: Document | null,
        parser: Parser | null,
        images: Map<string, ImageData>,
        book: DownloadBook,
    ): BookMetadata {
        return buildBookMetadata(job.title, job.sourceUrl, storyDom, parser, images, book);
    }

    /**
     * Fetch a chapter's DOM.
     *
     * The parser fetches the chapter when there is one, because a parser may
     * need a content script, an API, or its own error handling. Without a
     * parser the pipeline falls back to a plain fetch.
     */
    async #fetchChapter(
        parser: Parser | null,
        url: string,
        signal: AbortSignal,
    ): Promise<Document | null> {
        if (!parser) {
            const result = await this.#dependencies.fetchHtml(url, { signal });
            return result.dom;
        }
        // The parser carries the abort signal, so that a cancelled run stops
        // the request rather than waiting for it.
        parser.signal = signal;
        return parser.fetchChapter(url);
    }

    /**
     * Fetch a chapter, fetching it again when it comes back empty.
     *
     * An empty page is usually a temporary fault: a session that had not
     * settled, a cache that had not warmed up, a site that answers the
     * first request with a shell. Fetching it a second time often works.
     *
     * The retry is only made when the user has asked for it. A chapter that
     * genuinely has no content is not going to grow a second paragraph.
     */
    async #fetchChapterWithRetry(
        parser: Parser | null,
        url: string,
        signal: AbortSignal,
        behaviour: DownloadBehaviour,
    ): Promise<Document | null> {
        const first = await this.#fetchChapter(parser, url, signal);
        if (first === null) return null;
        if (!behaviour.retryOnEmptyPage) return first;
        if (!isEmptyDocument(first)) return first;

        // The same pause the chapters get is honoured before the retry, so
        // the site is not asked twice in the same instant.
        await this.#dependencies.throttle(
            Math.max(behaviour.minimumDelay, 0) + behaviour.delayPerChapter,
            signal,
        );
        const second = await this.#fetchChapter(parser, url, signal);
        return second ?? first;
    }

    /**
     * The behaviour settings for a job.
     *
     * A store that cannot be read is not a reason to fail the download: the
     * defaults are used instead.
     */
    async #readBehaviour(): Promise<DownloadBehaviour> {
        const read = this.#dependencies.behaviour;
        if (!read) return { ...DEFAULT_BEHAVIOUR };
        try {
            const value = await read();
            return {
                skipFailedChapters: value.skipFailedChapters,
                retryOnEmptyPage: value.retryOnEmptyPage,
                minimumDelay: Math.max(value.minimumDelay, 0),
                maxChapters: Math.max(value.maxChapters, 1),
                delayPerChapter: Math.max(value.delayPerChapter, 0),
            };
        } catch {
            return { ...DEFAULT_BEHAVIOUR };
        }
    }

    /**
     * The image settings for a job.
     *
     * A store that cannot be read is not a reason to fail the download: the
     * defaults are used instead.
     */
    async #readImageSettings(): Promise<DownloadImages> {
        const read = this.#dependencies.images;
        if (!read) return { ...DEFAULT_IMAGES };
        try {
            const value = await read();
            return {
                skipImages: value.skipImages,
                removeDuplicates: value.removeDuplicates,
                preferHighestResolution: value.preferHighestResolution,
                useSvg: value.useSvg,
            };
        } catch {
            return { ...DEFAULT_IMAGES };
        }
    }

    /**
     * The book settings for a job.
     *
     * A store that cannot be read is not a reason to fail the download: the
     * defaults are used instead.
     */
    async #readBookSettings(): Promise<DownloadBook> {
        const read = this.#dependencies.book;
        if (!read) return { ...DEFAULT_BOOK };
        try {
            const value = await read();
            return {
                version: value.version === 2 ? 2 : 3,
                addInfoPage: value.addInfoPage,
                defaultLanguage: value.defaultLanguage,
            };
        } catch {
            return { ...DEFAULT_BOOK };
        }
    }

    /**
     * Fetch the story's page.
     *
     * A failure here is fatal and the error is re-thrown, so the job can
     * report it instead of quietly building a book of placeholders.
     */
    async #fetchStoryDom(url: string, signal: AbortSignal): Promise<Document> {
        const result = await this.#dependencies.fetchHtml(url, { signal });
        return result.dom;
    }

    /** Zip the EPUB's files. */
    async #zip(files: EpubFile[]): Promise<Uint8Array> {
        return buildEpubArchive(files);
    }

    /** Convert a job to its progress form. */
    #toProgress(job: Job): JobProgress {
        const total = job.chapters.length;
        const percent = total > 0 ? Math.round((job.done / total) * 100) : 0;
        const progress: JobProgress = {
            jobId: job.id,
            phase: job.phase,
            chaptersDone: job.done,
            chaptersTotal: total,
            percent,
            message: PHASE_MESSAGE_KEYS[job.phase],
        };
        if (job.current) progress.current = { ...job.current };
        if (job.states.size > 0) {
            // The chapters are finished in order, so the highest finished index
            // is the watermark. The chapters below it that failed are named;
            // the rest were loaded.
            const indices = [...job.states.keys()];
            const upTo = Math.max(...indices);
            const failed = indices.filter((index) => job.states.get(index) === "failed");
            progress.finished = { upTo, failed };
        }
        if (job.fileName) progress.fileName = job.fileName;
        if (job.fileSize !== undefined) progress.fileSize = job.fileSize;
        if (job.error) progress.error = job.error;
        return progress;
    }

    /** Report the job's progress. */
    #report(job: Job): void {
        const progress = this.#toProgress(job);
        this.#dependencies.onProgress?.(progress);

        // A job that has reached a terminal phase is finished for good. The
        // `onFinished` hook runs exactly once per job, so the cleanup it
        // performs — removing the copied partitioned cookies — happens once
        // too.
        if (TERMINAL_PHASES.has(job.phase) && !job.finished) {
            job.finished = true;
            this.#dependencies.onFinished?.(progress);
        }
    }
}

/**
 * Collect the images a chapter's content references.
 *
 * Three attributes carry an image reference: an `<img>`'s `src`, an
 * `<img>`'s `srcset` (a comma-separated list of candidates with widths), and
 * a `<source>`'s `srcset` inside a `<picture>`. All three are looked at,
 * because a chapter that uses `<picture>` would otherwise lose its images.
 *
 * Only *one* candidate of a `srcset` is collected. A `srcset` lists the same
 * picture at several sizes, and a book that carries every size of every
 * picture is several times larger than it needs to be — for nothing, because
 * a reader only ever shows one of them.
 *
 * @param content The chapter's content element.
 * @param baseUrl The chapter's URL, used to resolve relative references.
 * @param options Which candidate of a `srcset` to prefer.
 * @returns The absolute URLs of the images.
 */
export function collectImageUrls(
    content: Element,
    baseUrl: string,
    options: CollectImageOptions = {},
): Set<string> {
    const preferHighest = options.preferHighestResolution === true;
    const urls = new Set<string>();

    const add = (value: string | null): void => {
        if (!value) return;
        const absolute = resolveUrl(value, baseUrl);
        if (absolute) urls.add(absolute);
    };

    for (const image of content.querySelectorAll("img")) {
        const src = image.getAttribute("src");
        const candidates = parseSrcset(image.getAttribute("srcset"));

        if (preferHighest && candidates.length > 0) {
            const best = pickSrcsetCandidate(candidates, true);
            if (best) add(best.url);
            continue;
        }

        if (src) {
            add(src);
            continue;
        }

        if (candidates.length > 0) {
            const first = pickSrcsetCandidate(candidates, false);
            if (first) add(first.url);
            continue;
        }

        // An image with no reference of its own may still be described by the
        // `<source>` elements of the `<picture>` around it.
        const picture = image.closest("picture");
        const source = picture?.querySelector("source[srcset]");
        if (!source) continue;
        const sourceCandidates = parseSrcset(source.getAttribute("srcset"));
        const chosen = pickSrcsetCandidate(sourceCandidates, preferHighest);
        if (chosen) add(chosen.url);
    }

    return urls;
}

/** Which candidate of a `srcset` the collector should keep. */
export interface CollectImageOptions {
    /**
     * Whether the largest candidate of a `srcset` is preferred over the one
     * the site chose as its default.
     */
    preferHighestResolution?: boolean;
}

/**
 * Remove every image reference from a chapter's content.
 *
 * Used when the user has asked for the images to be left out of the book. The
 * `<img>` elements are removed rather than emptied, because an `<img>` with no
 * `src` still occupies a line in the reader's layout, and the alternative —
 * a reference to a file that is not in the book — shows a broken picture.
 *
 * A `<picture>` is removed whole, because its `<source>` children only make
 * sense alongside the `<img>` that follows them.
 *
 * @param content The chapter's content element.
 */
export function removeImageReferences(content: Element): void {
    for (const picture of content.querySelectorAll("picture")) {
        picture.remove();
    }
    for (const image of content.querySelectorAll("img")) {
        image.remove();
    }
}

/**
 * Store an image that appears more than once only once.
 *
 * A chapter that repeats the same picture — a banner, a divider, an
 * advertisement — would otherwise put a copy of it into the book every time.
 * The images are identified by their bytes, so two different URLs that serve
 * the same picture are stored once.
 *
 * The first URL to carry a given image keeps the image; the others are
 * pointed at it, so the chapters that referenced them still show the picture.
 *
 * @param downloaded The downloaded images, keyed by their URL. The map is
 *   updated in place.
 */
export function deduplicateImages(downloaded: Map<string, ImageData>): void {
    // The bytes are hashed rather than compared directly: comparing every
    // image with every other image is quadratic, and a book with two hundred
    // images would do forty thousand comparisons of megabytes.
    const byHash = new Map<string, string>();
    const replacements = new Map<string, ImageData>();

    for (const [url, image] of downloaded) {
        // A placeholder stands in for an image that failed, and two
        // placeholders are not the same picture.
        if (image.data.length === 0) continue;

        const hash = hashBytes(image.data);
        const existing = byHash.get(hash);
        if (existing === undefined) {
            byHash.set(hash, url);
            continue;
        }
        // The image is a duplicate of one already stored. The duplicate is
        // pointed at the original, so the reference in the markup resolves to
        // the file that is actually in the book.
        const original = downloaded.get(existing);
        if (original) replacements.set(url, original);
    }

    for (const [url, replacement] of replacements) {
        downloaded.set(url, replacement);
    }
}

/**
 * A hash of a run of bytes.
 *
 * FNV-1a: cheap, and good enough to spot two copies of the same picture. It
 * is not a cryptographic hash and is not used as one.
 *
 * @param data The bytes.
 * @returns The hash, as a hexadecimal string.
 */
function hashBytes(data: Uint8Array): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < data.length; index += 1) {
        hash ^= data[index] as number;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/**
 * Rewrite a chapter's image references to point at the packaged images.
 *
 * The chapter's markup is HTML, and it is parsed rather than pattern-matched,
 * so an attribute value that merely *contains* a URL is left alone.
 *
 * @param html The chapter's HTML.
 * @param images The images the chapter owns, keyed by their original URL.
 * @param baseUrl The chapter's URL, used to resolve relative references.
 * @returns The HTML with the references rewritten.
 */
export function rewriteImageReferences(
    html: string,
    images: Map<string, ImageData>,
    baseUrl: string,
): string {
    const document = new DOMParser().parseFromString(html, "text/html");
    const changed = rewriteImageElements(document, images, baseUrl, (image) =>
        chapterImageHref(image.url, image.mediaType),
    );

    if (!changed) return html;
    return document.body.innerHTML;
}

/**
 * Sanitise a chapter's content.
 *
 * The content comes from an untrusted page, so it is sanitised at the
 * boundary. The allow-list lives in `util/sanitize.ts`.
 *
 * DOMPurify needs a DOM. Firefox runs an MV3 `background.scripts` entry as an
 * event page, which has a full DOM — so `DOMParser` and `DOMPurify` both work
 * here. See ADR-0005.
 */
function sanitizeContent(content: Element): string {
    return sanitizeHtml(content.innerHTML);
}

/**
 * Whether a document has no prose in it.
 *
 * A page that came back with no text at all is usually a shell: the site
 * served a page whose content is filled in by a script the extension did not
 * run, or a session that had not settled yet.
 */
function isEmptyDocument(dom: Document): boolean {
    const body = dom.body;
    if (!body) return true;
    const text = body.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return text.length === 0;
}

/**
 * The error raised when a book has more chapters than the user allows.
 *
 * The user is told how many chapters there are and how many they allowed, so
 * the fix is obvious: raise the limit in the options, or select fewer
 * chapters.
 */
function tooManyChaptersError(count: number, limit: number): UserFacingError {
    return {
        message: `This book has ${count} chapters, which is more than the ${limit} you allowed. Raise the limit in the options, or select fewer chapters.`,
        code: "TOO_MANY_CHAPTERS",
        actions: [{ id: "raise-limit", label: "Raise the limit" }],
    };
}
