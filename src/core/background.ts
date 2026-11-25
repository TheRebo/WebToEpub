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
import { DownloadManager } from "./download-manager";
import { FetchClient } from "./net/fetch-client";
import { CookieBridge } from "./net/cookie-bridge";
import { createCookieApi } from "./net/browser-cookie-api";
import { installOriginStripRule } from "./net/dnr-rules";
import { legacyRegistry } from "./parsers/compat/legacy-factory";
import { installFetchClient } from "./parsers/compat/legacy-http-client";
import { setParserServices } from "./parsers/services-context";
import { buildParserUtilities } from "./util/parser-utilities";
import { handleRequests, type RequestMap } from "./message/bus";
import { localStorageAdapter, onMessage, getNamespace } from "./browser-api";
import { SettingsStore } from "./storage/settings-store";
import { LibraryStore } from "./storage/library-store";
import { siteSelectors } from "./storage/site-selectors";
import { scanDocument } from "./parsers/heuristic-scanner";
import { toUserFacingError } from "./util/errors";
import { validateFetchableUrl, validateOrigin } from "./util/sanitize";
import { DefaultParser } from "./parsers/default-parser";
import { registerAllParsers } from "./parsers/register-all";
import type { ParserServices } from "./parsers/parser";
import { listChapterUrls } from "./parsers/parser";

/** The worker. */
class BackgroundWorker {
    /**
     * The registry.
     *
     * The migrated parsers register themselves with the legacy factory, which
     * writes into this registry.
     */
    #registry = legacyRegistry;
    #cookies: CookieBridge | undefined;
    #fetch: FetchClient;
    #downloads: DownloadManager;
    #settings = new SettingsStore(localStorageAdapter);
    #library = new LibraryStore();

    constructor() {
        // The cookie bridge copies the site's partitioned cookies into
        // unpartitioned ones for the duration of a request. Without it, a
        // site that authenticates with a partitioned cookie answers the
        // extension's request with a login page instead of the chapter.
        const cookieApi = createCookieApi(getNamespace()?.cookies);
        if (cookieApi) {
            this.#cookies = new CookieBridge(cookieApi);
        }

        this.#fetch = new FetchClient({
            fetch: globalThis.fetch.bind(globalThis),
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
            cookies: this.#cookies,
        });

        // The legacy HTTP facade needs the rewrite's fetch client, so that
        // every request — whether it comes from the new pipeline or from a
        // migrated parser — goes through the same cookie handling, retry
        // policy and abort plumbing.
        installFetchClient(this.#fetch);

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
            // When a job ends — whether it completed, failed or was cancelled
            // — the copied partitioned cookies are removed. Without this a
            // long session would leave copies of the user's session cookies
            // behind, and they would be sent with every later request.
            onFinished: () => {
                void this.#cookies?.removeAll().catch(() => {
                    // Cleanup failure must never break the job's result.
                });
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

        // The saved site selectors have to be in the cache before the first
        // chapter is fetched, or a site the user has already taught would be
        // parsed by the fallback parser one more time.
        await siteSelectors.hydrate();

        // The origin-stripping rule replaces the baseline's `webRequest`
        // listener. It is reinstalled on every worker start, because a
        // dynamic rule does not survive the worker being torn down.
        await installOriginStripRule(getNamespace()?.declarativeNetRequest);

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
                    // The origin is turned into a permission pattern, so it has
                    // to be a plain host: an origin carrying a path or a
                    // wildcard would grant more than the user was shown.
                    const origin = validateOrigin(payload.origin);
                    if (!origin) return { granted: false };
                    const granted = await api.permissions.request({
                        origins: [`${origin}/*`],
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
                    const origin = validateOrigin(payload.origin);
                    if (!origin) return { revoked: false };
                    const revoked = await api.permissions.remove({
                        origins: [`${origin}/*`],
                    });
                    return { revoked };
                },
                "site-selectors:suggest": async (payload) => this.#suggestSelectors(payload.url),
                "site-selectors:test": async (payload) =>
                    this.#testSelectors(payload.url, payload.contentCss, payload.titleCss),
                "site-selectors:save": async (payload) => {
                    await siteSelectors.setForHost(payload.hostname, {
                        contentCss: payload.contentCss,
                        titleCss: payload.titleCss,
                        removeCss: payload.removeCss,
                        testUrl: payload.testUrl ?? "",
                    });
                    return { saved: true };
                },
                "site-selectors:list": async () => {
                    const all = await siteSelectors.list();
                    const entries = [...all.entries()].map(([hostname, config]) => ({
                        hostname,
                        ...config,
                    }));
                    return { entries };
                },
                "site-selectors:remove": async (payload) => {
                    await siteSelectors.removeForHost(payload.hostname);
                    return { removed: true };
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
                usedDefaultParser: parser instanceof DefaultParser,
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

            const chapters = await listChapterUrls(parser, result.dom);
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
        // The titles come from the chapter list the user picked from. Without
        // them the book's table of contents would be a list of URLs.
        //
        // Every URL is validated before the job starts. The extension fetches
        // these URLs from its own context, where it can reach further than
        // the page that asked; a page that asked the extension to fetch a
        // `file:` URL, or a URL on the local network, would be using the
        // extension as a proxy. The same check guards `page:analyze` and
        // `chapters:list`.
        if (!validateFetchableUrl(payload.url)) {
            throw new Error("The story's URL is not a web address.");
        }

        const chapters: Array<{ sourceUrl: string; title: string }> = [];
        for (const chapter of payload.chapters) {
            if (!validateFetchableUrl(chapter.sourceUrl)) {
                throw new Error("A chapter's URL is not a web address.");
            }
            chapters.push({
                sourceUrl: chapter.sourceUrl,
                title: chapter.title || chapter.sourceUrl,
            });
        }

        const jobId = this.#downloads.start(payload.url, payload.title, chapters);
        return { jobId };
    }

    /** Whether the extension has host access to an origin. */
    async #hasAccess(origin: string): Promise<boolean> {
        const api = getNamespace();
        if (!api) return false;
        const validated = validateOrigin(origin);
        if (!validated) return false;
        return api.permissions.contains({ origins: [`${validated}/*`] });
    }

    /**
     * Test a set of selectors against a page.
     *
     * The worker fetches the page, because it owns the fetch layer — with its
     * cookies, its retry policy and its rate limiting — and because the
     * extension page has no access to the site's DOM.
     */
    async #testSelectors(
        url: string,
        contentCss: string,
        titleCss: string,
    ): Promise<RequestMap["site-selectors:test"]["response"]> {
        const validated = validateFetchableUrl(url);
        if (!validated) {
            return { ok: false, contentChars: 0, titleText: "", error: "Unsupported URL." };
        }
        try {
            const result = await this.#fetch.fetchHtml(url);
            const content = querySafely(result.dom, contentCss);
            const title = querySafely(result.dom, titleCss);
            const contentChars = (content?.textContent ?? "").trim().length;
            const titleText = (title?.textContent ?? "").trim();
            return { ok: contentChars > 0, contentChars, titleText };
        } catch (error) {
            return {
                ok: false,
                contentChars: 0,
                titleText: "",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Suggest the CSS selectors for a site.
     *
     * The scanner works on the page's DOM, so the page is fetched here rather
     * than in the extension page: the worker already owns the fetch layer, with
     * its cookies and its retry policy.
     */
    async #suggestSelectors(
        url: string,
    ): Promise<RequestMap["site-selectors:suggest"]["response"]> {
        const validated = validateFetchableUrl(url);
        if (!validated) {
            return { status: "failed", contentCss: "", titleCss: "", error: "Unsupported URL." };
        }
        try {
            const result = await this.#fetch.fetchHtml(url);
            const scan = scanDocument(result.dom);
            if (scan.status === "failed") {
                return { status: "failed", contentCss: "", titleCss: "", error: scan.error };
            }
            return {
                status: scan.status,
                contentCss: scan.contentCss,
                titleCss: scan.titleCss,
            };
        } catch (error) {
            return {
                status: "failed",
                contentCss: "",
                titleCss: "",
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

/** Query for the first element that matches, ignoring a bad selector. */
function querySafely(dom: Document, selector: string): Element | null {
    if (selector.trim() === "") return null;
    try {
        return dom.querySelector(selector);
    } catch {
        return null;
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
    safe = [...safe]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code > 0x1f && !(code >= 0x7f && code <= 0x9f);
        })
        .join("");
    if (!safe) safe = "untitled";
    if (safe.length > maxLength) safe = safe.slice(0, maxLength).trim();
    return safe;
}

/** Start the worker. */
const worker = new BackgroundWorker();
void worker.start();
