/**
 * The background worker.
 *
 * Owns the parser registry, the network layer, and the download manager. The
 * extension pages never fetch anything themselves; they ask the worker.
 *
 * This is the only place that holds the 437 parsers, which is what keeps the
 * popup small: the popup ships no parser code at all.
 *
 * See ADR-0005.
 */
import { DownloadManager, toDownloadChapters } from "./download-manager";
import { FetchClient } from "./net/fetch-client";
import { ParserRegistry, setParserServices } from "./parsers/registry";
import { buildParserUtilities } from "./util/parser-utilities";
import { handleRequests, type RequestMap } from "./message/bus";
import { localStorageAdapter, onMessage, getNamespace } from "./browser-api";
import { SettingsStore } from "./storage/settings-store";
import { LibraryStore } from "./storage/library-store";
import { toUserFacingError } from "./util/errors";
import { validateFetchableUrl } from "./util/sanitize";
import { DefaultParser } from "./parsers/default-parser";
import { registerAllParsers } from "./parsers/register-all";
import type { ParserServices } from "./parsers/parser";

/** The worker. */
class BackgroundWorker {
    #registry = new ParserRegistry();
    #fetch = new FetchClient();
    #downloads: DownloadManager;
    #settings = new SettingsStore(localStorageAdapter);
    #library = new LibraryStore();

    constructor() {
        this.#downloads = new DownloadManager({
            fetchHtml: async (url, options) => {
                const result = await this.#fetch.fetchHtml(url, options);
                return { dom: result.dom, url: result.url };
            },
            fetchBytes: async (url, options) => {
                const result = await this.#fetch.fetchBinary(url, options);
                return { data: result.data, mediaType: result.mediaType };
            },
            saveFile: async (fileName, bytes) => {
                const api = getNamespace();
                const blob = new Blob([bytes as BlobPart], { type: "application/epub+zip" });
                const url = URL.createObjectURL(blob);
                try {
                    if (api) {
                        await api.downloads.download({
                            url,
                            filename: fileName,
                            conflictAction: "uniquify",
                        });
                    }
                    return { fileName, fileSize: bytes.length };
                } finally {
                    // The blob URL must be revoked, or it leaks for the life
                    // of the page.
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                }
            },
            parserFor: (url, dom) => this.#registry.fetch(url, dom),
            util: {
                safeForFileName: (title, maxLength) => safeFileName(title, maxLength),
            },
            throttle: async (ms, signal) => {
                await sleep(ms, signal);
            },
        });

        // The services are built once and shared: every parser gets the same
        // utilities and the same fetch layer, so the throttling and the
        // cookie handling are enforced in exactly one place.
        const services = this.#buildServices();
        setParserServices(services);

        this.#registry.registerDefault((services) => new DefaultParser(services));
    }

    /** Build the services injected into parsers. */
    #buildServices(): ParserServices {
        return {
            fetchHtml: async (url, options) => {
                const result = await this.#fetch.fetchHtml(url, options);
                return { dom: result.dom, url: result.url };
            },
            fetchJson: async (url, options) => this.#fetch.fetchJson(url, options),
            util: buildParserUtilities(),
            imageCollector: createImageCollector(),
        };
    }

    /** Start the worker. */
    async start(): Promise<void> {
        // The parsers are registered before any request is handled. If this
        // were not awaited, a request that arrived during the registration
        // would find an empty registry and fall back to the default parser for
        // a site that does have a dedicated one.
        await registerAllParsers(this.#registry);

        handleRequests(
            { onMessage },
            {
                "page:analyze": (payload) => this.#analyse(payload.url),
                "chapters:list": (payload) => this.#listChapters(payload.url),
                "download:start": (payload) => this.#startDownload(payload),
                "download:cancel": (payload) => ({
                    cancelled: this.#downloads.cancel(payload.jobId),
                }),
                "download:progress": (payload) => {
                    const progress = this.#downloads.progress(payload.jobId);
                    if (!progress) throw new Error("No such job.");
                    return progress;
                },
                "download:list": () => ({ jobs: this.#downloads.list() }),
                "settings:get": async () => ({ settings: await this.#settings.get() }),
                "settings:set": async (payload) => {
                    await this.#settings.set(payload.settings as never);
                    return { settings: await this.#settings.get() };
                },
                "library:list": async () => ({ entries: await this.#library.list() }),
                "library:delete": async (payload) => {
                    const entry = await this.#library.get(payload.id);
                    if (!entry) return { deleted: false };
                    await this.#library.delete(payload.id);
                    return { deleted: true };
                },
                "permissions:check": async (payload) => ({
                    hasAccess: await this.#hasAccess(payload.origin),
                }),
                "permissions:request": async (payload) => {
                    const api = getNamespace();
                    if (!api) return { granted: false };
                    const granted = await api.permissions.request({
                        origins: [`${payload.origin}/*`],
                    });
                    return { granted };
                },
                "permissions:list": async () => {
                    const api = getNamespace();
                    if (!api) return { origins: [] };
                    const all = await api.permissions.getAll();
                    return { origins: all.origins ?? [] };
                },
                "permissions:revoke": async (payload) => {
                    const api = getNamespace();
                    if (!api) return { revoked: false };
                    const revoked = await api.permissions.remove({
                        origins: [`${payload.origin}/*`],
                    });
                    return { revoked };
                },
            },
        );
    }

    /** Analyse a page. */
    async #analyse(url: string): Promise<RequestMap["page:analyze"]["response"]> {
        const validated = validateFetchableUrl(url);
        if (!validated) {
            return { supported: false, error: toUserFacingError(new Error("Unsupported URL.")) };
        }

        try {
            const result = await this.#fetch.fetchHtml(url);
            const parser = this.#registry.fetch(url, result.dom);
            if (!parser) {
                return { supported: false, error: toUserFacingError(new Error("No parser.")) };
            }

            const title = parser.extractTitleImpl(result.dom);
            const titleText =
                typeof title === "string"
                    ? title
                    : title && "textContent" in title
                      ? (title.textContent ?? "")
                      : "";

            return {
                supported: true,
                parserName: parser.constructor.name,
                title: titleText.trim() || undefined,
                author: parser.extractAuthor(result.dom)?.trim() || undefined,
                language: parser.extractLanguage(result.dom)?.trim() || undefined,
                coverUrl: parser.findCoverImageUrl(result.dom) ?? undefined,
                description: parser.extractDescription(result.dom)?.trim() || undefined,
            };
        } catch (error) {
            return { supported: false, error: toUserFacingError(error) };
        }
    }

    /** List a page's chapters. */
    async #listChapters(url: string): Promise<RequestMap["chapters:list"]["response"]> {
        const validated = validateFetchableUrl(url);
        if (!validated) {
            return { chapters: [], error: toUserFacingError(new Error("Unsupported URL.")) };
        }

        try {
            const result = await this.#fetch.fetchHtml(url);
            const parser = this.#registry.fetch(url, result.dom);
            if (!parser) {
                return { chapters: [], error: toUserFacingError(new Error("No parser.")) };
            }

            const chapters = await parser.getChapterUrls(result.dom);
            return {
                chapters: chapters.map((chapter) => ({
                    sourceUrl: chapter.sourceUrl,
                    title: chapter.title,
                    // A chapter the parser marks as not includeable starts
                    // unchecked in the UI.
                    isIncludeable: chapter.isIncludeable ?? true,
                })),
            };
        } catch (error) {
            return { chapters: [], error: toUserFacingError(error) };
        }
    }

    /** Start a download. */
    async #startDownload(
        payload: RequestMap["download:start"]["request"],
    ): Promise<RequestMap["download:start"]["response"]> {
        const chapters = toDownloadChapters(
            payload.chapterUrls.map((url) => ({ sourceUrl: url, title: "" })),
        );
        const jobId = this.#downloads.start(payload.url, payload.title, chapters);
        return { jobId };
    }

    /** Whether the extension has host access to an origin. */
    async #hasAccess(origin: string): Promise<boolean> {
        const api = getNamespace();
        if (!api) return false;
        return api.permissions.contains({ origins: [`${origin}/*`] });
    }
}

/** The image collector handed to parsers. */
function createImageCollector() {
    const images = new Map<string, unknown>();
    return {
        images,
        async addImage(url: string): Promise<void> {
            if (!validateFetchableUrl(url)) return;
            images.set(url, url);
        },
    };
}

/** Sleep, but stop early when the signal aborts. */
async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new Error("Aborted");
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = (): void => {
            clearTimeout(timer);
            reject(new Error("Aborted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

/** A safe file name. */
function safeFileName(title: string, maxLength = 120): string {
    return sanitizeFileName(title, maxLength);
}

/** A safe file name, without pulling in the whole utilities module. */
function sanitizeFileName(title: string, maxLength: number): string {
    let safe = title
        .replace(/[\\/:*?"<>|]/g, "-")
        .replace(/^[\s.]+|[\s.]+$/g, "")
        .replace(/\s+/g, " ")
        .trim();
    safe = [...safe].filter((character) => {
        const code = character.charCodeAt(0);
        return code > 0x1f && !(code >= 0x7f && code <= 0x9f);
    }).join("");
    if (!safe) safe = "untitled";
    if (safe.length > maxLength) safe = safe.slice(0, maxLength).trim();
    return safe;
}

/** Start the worker. */
const worker = new BackgroundWorker();
void worker.start();
