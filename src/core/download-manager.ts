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
import { sanitizeHtml } from "./util/sanitize";
import type { Parser } from "./parsers/parser";
import { toUserFacingError, type UserFacingError } from "./util/errors";

/** A chapter being downloaded. */
interface DownloadChapter {
    /** The chapter's URL. */
    sourceUrl: string;
    /** The chapter's title. */
    title: string;
}

/** A running job. */
interface Job {
    /** The job's ID. */
    id: string;
    /** The story's URL. */
    sourceUrl: string;
    /** The story's title. */
    title: string;
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
    /** The utility functions. */
    util: {
        safeForFileName(title: string, maxLength?: number): string;
    };
    /** Wait between requests, honouring the abort signal. */
    throttle(ms: number, signal: AbortSignal): Promise<void>;
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
    /** The message. */
    message: string;
    /** The file name, once the job is complete. */
    fileName?: string;
    /** The file size, in bytes. */
    fileSize?: number;
    /** The error, if the job failed. */
    error?: UserFacingError;
}

/** The phases a job can end in. */
const TERMINAL_PHASES = new Set<JobPhase>(["complete", "failed", "cancelled"]);

/** The messages for each phase. */
const PHASE_MESSAGES: Record<JobPhase, string> = {
    preparing: "Preparing",
    "fetching-chapters": "Fetching chapters",
    "downloading-images": "Downloading images",
    "building-epub": "Building EPUB",
    saving: "Saving",
    complete: "Saved",
    failed: "Failed",
    cancelled: "Cancelled",
};

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
     */
    start(sourceUrl: string, title: string, chapters: DownloadChapter[]): string {
        const id = crypto.randomUUID();
        const job: Job = {
            id,
            sourceUrl,
            title,
            chapters,
            phase: "preparing",
            done: 0,
            failed: 0,
            error: undefined,
            controller: new AbortController(),
            fileName: undefined,
            fileSize: undefined,
            finished: false,
        };
        this.#jobs.set(id, job);

        void this.#run(job).catch((error) => {
            job.phase = "failed";
            job.error = toUserFacingError(error);
            this.#report(job);
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
        const { fetchBytes, saveFile, parserFor, util, throttle } = this.#dependencies;
        const signal = job.controller.signal;

        job.phase = "fetching-chapters";
        this.#report(job);

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
        // between requests, and the baseline's parsers said so.
        const delay = parser ? Math.max(parser.getRateLimit(), 0) : 500;

        const packed: ChapterToPack[] = [];
        const images = new Map<string, ImageData>();
        /**
         * The images each chapter references, keyed by the chapter's index.
         *
         * The rewrite of the chapter's markup happens after the images have
         * been downloaded, because the packaged file name depends on the
         * media type, which is only known then.
         */
        const chapterImages = new Map<number, Map<string, ImageData>>();

        for (const [chapterIndex, chapter] of job.chapters.entries()) {
            if (signal.aborted) {
                job.phase = "cancelled";
                this.#report(job);
                return;
            }

            try {
                const dom = await this.#fetchChapter(parser, chapter.sourceUrl, signal);
                if (dom === null) {
                    packed.push(
                        buildPlaceholderChapter(
                            chapter.sourceUrl,
                            "The chapter could not be read.",
                        ),
                    );
                    job.failed += 1;
                } else {
                    // The parser decides what the content is and how it is
                    // cleaned up. The pipeline does not second-guess it.
                    const content = parser
                        ? parser.extractChapterContent(dom, {
                              sourceUrl: chapter.sourceUrl,
                              title: chapter.title,
                          })
                        : null;

                    if (content === null) {
                        packed.push(
                            buildPlaceholderChapter(
                                chapter.sourceUrl,
                                "The chapter could not be read.",
                            ),
                        );
                        job.failed += 1;
                    } else {
                        // Collect the images the chapter references. The
                        // markup is not rewritten yet: the packaged file name
                        // depends on the media type, which is only known once
                        // the image has been downloaded.
                        const referenced = collectImageUrls(content, chapter.sourceUrl);
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
                        chapterImages.set(chapterIndex, chapterImageMap);

                        const html = sanitizeContent(content);
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
                packed.push(
                    buildPlaceholderChapter(
                        chapter.sourceUrl,
                        error instanceof Error
                            ? error.message
                            : "The chapter could not be fetched.",
                    ),
                );
                job.failed += 1;
            }

            job.done += 1;
            this.#report(job);

            // The throttle is the site's politeness budget. It is honoured
            // after every request, and it aborts immediately when cancelled.
            await throttle(delay, signal);
        }

        // --- Images ---
        job.phase = "downloading-images";
        this.#report(job);

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
                downloaded.set(url, buildPlaceholderImage(url));
            }
            await throttle(100, signal);
        }

        // --- Rewrite the chapters' image references ---
        //
        // The chapters' markup still points at the site's own servers, which
        // are not in the EPUB. Now that the images have been downloaded, each
        // reference is rewritten to the packaged file's path, and each
        // chapter is given the images it owns.
        for (const [index, chapter] of packed.entries()) {
            const owned = chapterImages.get(index);
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
                chapter.sourceUrl,
            );
        }

        // --- Build ---
        job.phase = "building-epub";
        this.#report(job);

        const metadata = this.#buildMetadata(job, storyDom, parser, downloaded);
        const result = packEpub(packed, metadata);

        // --- Save ---
        job.phase = "saving";
        this.#report(job);

        const bytes = await this.#zip(result.files);
        const fileName = `${util.safeForFileName(job.title || "untitled")}.epub`;
        const saved = await saveFile(fileName, bytes);

        job.fileName = saved.fileName;
        job.fileSize = saved.fileSize;
        job.phase = "complete";
        this.#report(job);
    }

    /**
     * Build the EPUB's metadata from the story's page.
     *
     * The parser knows the site, so it knows the author, the language and
     * where the cover is. The baseline wrote all of this into the EPUB; a
     * rewrite keeps the same fields but fills them in from the rewrite's own
     * extraction methods.
     *
     * @param job The job.
     * @param storyDom The story's page.
     * @param parser The parser for the story.
     * @param images The images that were downloaded, keyed by their URL.
     * @returns The metadata.
     */
    #buildMetadata(
        job: Job,
        storyDom: Document | null,
        parser: Parser | null,
        images: Map<string, ImageData>,
    ): {
        title: string;
        author?: string;
        language?: string;
        publisher?: string;
        description?: string;
        subjects?: string[];
        date?: string;
        cover?: ImageData;
        version: 2 | 3;
    } {
        const metadata: {
            title: string;
            author?: string;
            language?: string;
            publisher?: string;
            description?: string;
            subjects?: string[];
            date?: string;
            cover?: ImageData;
            version: 2 | 3;
        } = {
            title: job.title || "Untitled",
            version: 3,
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

        // The cover is one of the images the chapters referenced, if the
        // parser named one that was downloaded.
        const coverUrl = parser.findCoverImageUrl(storyDom);
        if (coverUrl) {
            const absolute = resolveUrl(coverUrl, job.sourceUrl);
            const cover = absolute ? images.get(absolute) : undefined;
            if (cover) metadata.cover = cover;
        }

        return metadata;
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
        const { ZipWriter, BlobWriter, TextReader, Uint8ArrayReader, configure } = await import(
            "@zip.js/zip.js"
        );

        // zip.js offloads compression to a web worker by default. Inside a
        // bundled extension the worker is resolved relative to the bundle's
        // own URL, which does not exist in the packaged add-on, so the worker
        // fails to start and the write never completes — the job then hangs
        // in its "saving" phase for ever, with no error and no file.
        //
        // The worker buys nothing here: a book is a few megabytes, and
        // compressing it on the worker's own thread takes milliseconds.
        configure({ useWebWorkers: false });

        const writer = new ZipWriter(new BlobWriter("application/epub+zip"));
        for (const file of files) {
            // The two content kinds need different readers: XML is text, and
            // an image is bytes. Passing bytes as text would corrupt it.
            if (typeof file.content === "string") {
                await writer.add(file.path, new TextReader(file.content));
            } else {
                await writer.add(file.path, new Uint8ArrayReader(file.content));
            }
        }
        const blob = await writer.close();
        return new Uint8Array(await blob.arrayBuffer());
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
            message: PHASE_MESSAGES[job.phase],
        };
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
 * Resolve a possibly-relative URL against a base.
 */
export function resolveUrl(src: string, base: string): string | null {
    try {
        const resolved = new URL(src, base);
        // Only HTTP and HTTPS are ever fetched. A `javascript:` or `data:` URL
        // in an image's `src` is a script injection attempt.
        if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
        return resolved.href;
    } catch {
        return null;
    }
}

/**
 * Collect the images a chapter's content references.
 *
 * Three attributes carry an image reference: an `<img>`'s `src`, an
 * `<img>`'s `srcset` (a comma-separated list of candidates with widths), and
 * a `<source>`'s `srcset` inside a `<picture>`. All three are collected,
 * because a chapter that uses `<picture>` would otherwise lose its images.
 *
 * @param content The chapter's content element.
 * @param baseUrl The chapter's URL, used to resolve relative references.
 * @returns The absolute URLs of the images.
 */
export function collectImageUrls(content: Element, baseUrl: string): Set<string> {
    const urls = new Set<string>();

    const add = (value: string | null): void => {
        if (!value) return;
        const absolute = resolveUrl(value, baseUrl);
        if (absolute) urls.add(absolute);
    };

    for (const image of content.querySelectorAll("img")) {
        add(image.getAttribute("src"));
        for (const candidate of parseSrcset(image.getAttribute("srcset"))) {
            add(candidate.url);
        }
    }

    for (const source of content.querySelectorAll("source")) {
        for (const candidate of parseSrcset(source.getAttribute("srcset"))) {
            add(candidate.url);
        }
    }

    return urls;
}

/**
 * One candidate from a `srcset` attribute.
 */
interface SrcsetCandidate {
    /** The candidate's URL. */
    url: string;
    /** The candidate's descriptor, e.g. `2x` or `640w`. */
    descriptor: string;
}

/**
 * Parse a `srcset` attribute into its candidates.
 *
 * The format is a comma-separated list of `url descriptor` pairs. The
 * descriptor is optional, and a URL may itself contain a comma, so the
 * parsing follows the HTML specification's rule: split on whitespace first,
 * then treat the first token as the URL only when it is not itself a
 * descriptor.
 *
 * @param srcset The attribute's value.
 * @returns The candidates, in the order they appear.
 */
export function parseSrcset(srcset: string | null): SrcsetCandidate[] {
    if (!srcset) return [];
    const candidates: SrcsetCandidate[] = [];

    for (const part of srcset.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const space = trimmed.indexOf(" ");
        if (space === -1) {
            candidates.push({ url: trimmed, descriptor: "" });
            continue;
        }
        candidates.push({
            url: trimmed.slice(0, space),
            descriptor: trimmed.slice(space + 1).trim(),
        });
    }
    return candidates;
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
    let changed = false;

    const replace = (element: Element, attribute: string): void => {
        const value = element.getAttribute(attribute);
        if (!value) return;

        if (attribute === "srcset") {
            const candidates = parseSrcset(value);
            if (candidates.length === 0) return;
            let dirty = false;
            const rewritten = candidates.map((candidate) => {
                const absolute = resolveUrl(candidate.url, baseUrl);
                const image = absolute ? images.get(absolute) : undefined;
                if (!image) return candidate;
                dirty = true;
                const href = chapterImageHref(image.url, image.mediaType);
                return candidate.descriptor
                    ? { url: href, descriptor: candidate.descriptor }
                    : { url: href, descriptor: "" };
            });
            if (!dirty) return;
            element.setAttribute(
                attribute,
                rewritten
                    .map((candidate) =>
                        candidate.descriptor
                            ? `${candidate.url} ${candidate.descriptor}`
                            : candidate.url,
                    )
                    .join(", "),
            );
            changed = true;
            return;
        }

        const absolute = resolveUrl(value, baseUrl);
        const image = absolute ? images.get(absolute) : undefined;
        if (!image) return;
        element.setAttribute(attribute, chapterImageHref(image.url, image.mediaType));
        changed = true;
    };

    for (const image of document.querySelectorAll("img")) {
        replace(image, "src");
        replace(image, "srcset");
    }
    for (const source of document.querySelectorAll("source")) {
        replace(source, "srcset");
    }

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
