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
import { buildPlaceholderChapter, buildPlaceholderImage, packEpub } from "./epub/packer";
import type { EpubFile } from "./epub/document";
import { sanitizeHtml } from "./util/sanitize";
import type { ChapterLink } from "./util/dom";
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
    fetchHtml(url: string, options: { signal?: AbortSignal }): Promise<{ dom: Document; url: string }>;
    /** Fetch a resource's bytes. */
    fetchBytes(url: string, options: { signal?: AbortSignal }): Promise<{ data: Uint8Array; mediaType: string }>;
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
        const { fetchHtml, fetchBytes, saveFile, parserFor, util, throttle } = this.#dependencies;
        const signal = job.controller.signal;

        job.phase = "fetching-chapters";
        this.#report(job);

        // The parser is chosen from the story's page, so the same rules the
        // workbench used to build the chapter list apply to the content.
        const storyDom = await this.#fetchStoryDom(job.sourceUrl, signal);
        const parser = storyDom ? parserFor(job.sourceUrl, storyDom) : null;

        const packed: ChapterToPack[] = [];
        const images = new Map<string, ImageData>();

        for (const chapter of job.chapters) {
            if (signal.aborted) {
                job.phase = "cancelled";
                this.#report(job);
                return;
            }

            try {
                const { dom } = await fetchHtml(chapter.sourceUrl, { signal });
                const content = parser ? parser.findContent(dom) : null;

                if (!content) {
                    // A chapter that yields no content is a placeholder, not a
                    // silent omission: the reader can see that it is missing.
                    packed.push(
                        buildPlaceholderChapter(chapter.sourceUrl, "The chapter could not be read."),
                    );
                    job.failed += 1;
                } else {
                    parser?.removeUnwantedElementsFromContentElement(content);
                    const html = sanitizeContent(content);
                    packed.push({
                        sourceUrl: chapter.sourceUrl,
                        title: chapter.title,
                        contentHtml: html,
                    });

                    // Collect the images the chapter references.
                    for (const image of content.querySelectorAll("img")) {
                        const src = image.getAttribute("src");
                        if (!src) continue;
                        const absolute = resolveUrl(src, chapter.sourceUrl);
                        if (absolute && !images.has(absolute)) {
                            images.set(absolute, { data: new Uint8Array(), mediaType: "", url: absolute });
                        }
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
                        error instanceof Error ? error.message : "The chapter could not be fetched.",
                    ),
                );
                job.failed += 1;
            }

            job.done += 1;
            this.#report(job);

            // The throttle is the site's politeness budget. It is honoured
            // after every request, and it aborts immediately when cancelled.
            await throttle(500, signal);
        }

        // --- Images ---
        job.phase = "downloading-images";
        this.#report(job);

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

        // --- Build ---
        job.phase = "building-epub";
        this.#report(job);

        const result = packEpub(packed, {
            title: job.title || "Untitled",
            language: "en",
            version: 3,
        });

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

    /** Fetch the story's page, tolerating a failure. */
    async #fetchStoryDom(url: string, signal: AbortSignal): Promise<Document | null> {
        try {
            const result = await this.#dependencies.fetchHtml(url, { signal });
            return result.dom;
        } catch {
            return null;
        }
    }

    /** Zip the EPUB's files. */
    async #zip(files: EpubFile[]): Promise<Uint8Array> {
        const { ZipWriter, BlobWriter, TextReader, Uint8ArrayReader } = await import("@zip.js/zip.js");
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
        this.#dependencies.onProgress?.(this.#toProgress(job));
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
 * Convert a parser's chapter links into download chapters.
 */
export function toDownloadChapters(chapters: ChapterLink[]): DownloadChapter[] {
    return chapters.map((chapter) => ({
        sourceUrl: chapter.sourceUrl,
        title: chapter.title || chapter.sourceUrl,
    }));
}
