/**
 * The fetch layer.
 *
 * Everything the extension fetches goes through here. This is a rewrite of
 * the baseline's `HttpClient.js`, which had three defects the discovery
 * audit flagged as high severity:
 *
 *  1. The custom-error path was broken — `setCustomErrorResponse` returned
 *     `{}`, so a parser's custom error handling never ran.
 *  2. Cookie cleanup was not in a `finally`, so a thrown request leaked
 *     unpartitioned cookies to the next request.
 *  3. There was no way to abort an in-flight request, so "pause" did not
 *     actually pause anything.
 *
 * See ADR-0004.
 */

/** How a request should be retried. */
export interface RetryPolicy {
    /** How many attempts in total, including the first. */
    maxAttempts: number;
    /** The base delay between attempts, in milliseconds. */
    baseDelayMs: number;
    /** The multiplier applied to the delay after each attempt. */
    backoffFactor: number;
    /** The longest delay between attempts. */
    maxDelayMs: number;
}

/** The default retry policy. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
    maxAttempts: 3,
    baseDelayMs: 400,
    backoffFactor: 2,
    maxDelayMs: 8000,
};

/** The HTTP statuses that are worth retrying. */
export const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504, 520, 522, 524]);

/** The statuses that indicate the site is asking the user to verify. */
const CHALLENGE_STATUSES = new Set([403, 503]);

/** A marker a parser can set to signal that a response is a bot challenge. */
const CHALLENGE_MARKERS = [
    "cf-browser-verification",
    "cf_chl_opt",
    "just a moment",
    "checking your browser",
    "enable javascript and cookies to continue",
    "ddos protection by",
    "captcha-delivery",
];

/** Options for a fetch. */
export interface FetchOptions {
    /** The request method. */
    method?: "GET" | "POST" | "HEAD";
    /** Request headers. */
    headers?: Record<string, string>;
    /** A request body. */
    body?: string | null;
    /** The signal used to abort the request. */
    signal?: AbortSignal;
    /** The retry policy. Defaults to {@link DEFAULT_RETRY_POLICY}. */
    retry?: Partial<RetryPolicy>;
    /** Credentials mode. Defaults to `include`. */
    credentials?: RequestCredentials;
    /** Whether to copy the site's partitioned cookies for this request. */
    useCookies?: boolean;
    /** The page URL the request is made on behalf of, for the `Referer`. */
    referer?: string;
}

/** A successful response. */
export interface FetchResult {
    /** The raw response. */
    response: Response;
    /** The body, parsed as text. */
    text: string;
    /** The body, parsed as an HTML document. */
    dom: Document;
    /** The final URL, after redirects. */
    url: string;
}

/** A response whose body should be parsed as JSON. */
export interface JsonFetchResult {
    /** The raw response. */
    response: Response;
    /** The parsed body. */
    json: unknown;
    /** The final URL, after redirects. */
    url: string;
}

/** A response whose body is binary, such as an image. */
export interface BinaryFetchResult {
    /** The raw response. */
    response: Response;
    /** The body. */
    data: Uint8Array;
    /** The response's `Content-Type`, without any parameters. */
    mediaType: string;
    /** The final URL, after redirects. */
    url: string;
}

/** The error thrown by the fetch layer. */
export class FetchError extends Error {
    readonly status: number | undefined;
    readonly url: string;
    readonly attempts: number;
    readonly isChallenge: boolean;

    constructor(
        message: string,
        options: { status?: number; url: string; attempts: number; isChallenge?: boolean },
    ) {
        super(message);
        this.name = "FetchError";
        this.status = options.status;
        this.url = options.url;
        this.attempts = options.attempts;
        this.isChallenge = options.isChallenge ?? false;
    }
}

/** The cookie bridge, injected so the fetch layer can be tested without a browser. */
export interface CookieBridge {
    /**
     * Copy the site's partitioned cookies into unpartitioned cookies so the
     * extension's request authenticates the same way the tab does.
     *
     * @returns The names of the cookies that were set, so they can be removed.
     */
    copyForDomain(domain: string): Promise<string[]>;
    /** Remove cookies previously copied for a domain. */
    removeForDomain(domain: string, names: string[]): Promise<void>;
}

/** The browser APIs the fetch layer depends on, injected for testability. */
export interface FetchEnvironment {
    /** Performs the request. */
    fetch: typeof globalThis.fetch;
    /** The cookie bridge. */
    cookies?: CookieBridge;
    /** A function that resolves after a delay, used between retries. */
    sleep: (ms: number) => Promise<void>;
}

/** The default environment: the real browser APIs. */
function defaultEnvironment(): FetchEnvironment {
    return {
        fetch: globalThis.fetch.bind(globalThis),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    };
}

/**
 * A parser's custom error handling.
 *
 * The baseline's version of this interface was broken: `setCustomErrorResponse`
 * returned an empty object, so a parser that asked for a 403 (to prompt the
 * user for a captcha) got nothing.
 */
export interface CustomErrorHandler {
    /**
     * Whether a response represents a challenge, a captcha, or a custom
     * site failure.
     */
    isCustomError(response: Response, bodyText: string): boolean;
    /**
     * The custom response for a detected error.
     *
     * Returning `403` asks the user to solve a captcha; returning `999` asks
     * for an automatic retry after the given delay.
     */
    setCustomErrorResponse(
        url: string,
        status: number,
        bodyText: string,
    ): { status: number; retryDelay?: number } | undefined;
}

/** Detect a bot-challenge page in a response body. */
export function looksLikeChallenge(bodyText: string): boolean {
    if (!bodyText) return false;
    const lowered = bodyText.slice(0, 8000).toLowerCase();
    return CHALLENGE_MARKERS.some((marker) => lowered.includes(marker));
}

/** The fetch client. */
export class FetchClient {
    #environment: FetchEnvironment;
    #customErrorHandler: CustomErrorHandler | undefined;

    constructor(environment: FetchEnvironment = defaultEnvironment()) {
        this.#environment = environment;
    }

    /** Install the parser's custom error handler. */
    setCustomErrorHandler(handler: CustomErrorHandler | undefined): void {
        this.#customErrorHandler = handler;
    }

    /** The environment in use, exposed for tests. */
    get environment(): FetchEnvironment {
        return this.#environment;
    }

    /**
     * Fetch a page and parse it as HTML.
     */
    async fetchHtml(url: string, options: FetchOptions = {}): Promise<FetchResult> {
        const policy = { ...DEFAULT_RETRY_POLICY, ...options.retry };

        return this.#withCookies(url, options, async () => {
            let lastError: FetchError | undefined;

            for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
                if (options.signal?.aborted) throw abortError();

                try {
                    const response = await this.#performRequest(url, options);
                    const text = await response.text();

                    const custom = this.#evaluateCustomError(url, response, text);
                    if (custom?.status === 999) {
                        // The parser asked for an automatic retry. On the last
                        // attempt there is nothing left to retry *into*, so
                        // the request fails rather than returning a page the
                        // parser has already said is broken.
                        if (attempt < policy.maxAttempts) {
                            await this.#environment.sleep(custom.retryDelay ?? policy.baseDelayMs);
                            continue;
                        }
                        throw new FetchError(`Custom error for ${url}`, {
                            status: 999,
                            url,
                            attempts: attempt,
                        });
                    }
                    if (custom) {
                        throw new FetchError(`Custom error for ${url}`, {
                            status: custom.status,
                            url,
                            attempts: attempt,
                            isChallenge: custom.status === 403,
                        });
                    }

                    if (!response.ok) {
                        const isChallenge =
                            CHALLENGE_STATUSES.has(response.status) && looksLikeChallenge(text);
                        const error = new FetchError(`HTTP ${response.status} for ${url}`, {
                            status: response.status,
                            url,
                            attempts: attempt,
                            isChallenge,
                        });
                        if (
                            RETRYABLE_STATUSES.has(response.status) &&
                            attempt < policy.maxAttempts
                        ) {
                            lastError = error;
                            await this.#environment.sleep(this.#delayFor(policy, attempt));
                            continue;
                        }
                        throw error;
                    }

                    return {
                        response,
                        text,
                        dom: parseHtml(text, response.url || url),
                        url: response.url || url,
                    };
                } catch (error) {
                    if (isAbort(error)) throw error;
                    if (error instanceof FetchError) {
                        if (
                            RETRYABLE_STATUSES.has(error.status ?? 0) &&
                            attempt < policy.maxAttempts
                        ) {
                            lastError = error;
                            await this.#environment.sleep(this.#delayFor(policy, attempt));
                            continue;
                        }
                        throw error;
                    }
                    // A transport-level failure.
                    lastError = new FetchError(
                        error instanceof Error ? error.message : String(error),
                        {
                            url,
                            attempts: attempt,
                        },
                    );
                    if (attempt < policy.maxAttempts) {
                        await this.#environment.sleep(this.#delayFor(policy, attempt));
                        continue;
                    }
                    throw lastError;
                }
            }

            throw (
                lastError ??
                new FetchError(`Could not fetch ${url}`, { url, attempts: policy.maxAttempts })
            );
        });
    }

    /** Fetch and parse a JSON body. */
    async fetchJson(url: string, options: FetchOptions = {}): Promise<JsonFetchResult> {
        const policy = { ...DEFAULT_RETRY_POLICY, ...options.retry };

        return this.#withCookies(url, options, async () => {
            for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
                if (options.signal?.aborted) throw abortError();
                try {
                    const response = await this.#performRequest(url, {
                        ...options,
                        headers: { Accept: "application/json", ...options.headers },
                    });
                    const text = await response.text();

                    const custom = this.#evaluateCustomError(url, response, text);
                    if (custom?.status === 999) {
                        // The parser asked for an automatic retry. The last
                        // attempt has to fail, or the broken body would be
                        // handed back as a successful response.
                        if (attempt < policy.maxAttempts) {
                            await this.#environment.sleep(custom.retryDelay ?? policy.baseDelayMs);
                            continue;
                        }
                        throw new FetchError(`Custom error for ${url}`, {
                            status: 999,
                            url,
                            attempts: attempt,
                        });
                    }
                    if (custom) {
                        throw new FetchError(`Custom error for ${url}`, {
                            status: custom.status,
                            url,
                            attempts: attempt,
                            isChallenge: custom.status === 403,
                        });
                    }

                    if (!response.ok) {
                        const error = new FetchError(`HTTP ${response.status} for ${url}`, {
                            status: response.status,
                            url,
                            attempts: attempt,
                        });
                        if (
                            RETRYABLE_STATUSES.has(response.status) &&
                            attempt < policy.maxAttempts
                        ) {
                            await this.#environment.sleep(this.#delayFor(policy, attempt));
                            continue;
                        }
                        throw error;
                    }

                    let json: unknown;
                    try {
                        json = JSON.parse(text);
                    } catch {
                        throw new FetchError(`Invalid JSON from ${url}`, {
                            url,
                            attempts: attempt,
                        });
                    }
                    return { response, json, url: response.url || url };
                } catch (error) {
                    if (isAbort(error)) throw error;
                    if (error instanceof FetchError && error.status !== undefined) throw error;
                    if (attempt >= policy.maxAttempts) {
                        throw error instanceof FetchError
                            ? error
                            : new FetchError(
                                  error instanceof Error ? error.message : String(error),
                                  {
                                      url,
                                      attempts: attempt,
                                  },
                              );
                    }
                    await this.#environment.sleep(this.#delayFor(policy, attempt));
                }
            }

            throw new FetchError(`Could not fetch ${url}`, { url, attempts: policy.maxAttempts });
        });
    }

    /** Fetch a body as raw text. */
    async fetchText(url: string, options: FetchOptions = {}): Promise<string> {
        const result = await this.fetchHtml(url, options);
        return result.text;
    }

    /** Fetch a body as bytes, for images. */
    async fetchBinary(url: string, options: FetchOptions = {}): Promise<BinaryFetchResult> {
        const policy = { ...DEFAULT_RETRY_POLICY, ...options.retry };

        return this.#withCookies(url, options, async () => {
            for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
                if (options.signal?.aborted) throw abortError();
                try {
                    const response = await this.#performRequest(url, options);
                    if (!response.ok) {
                        const error = new FetchError(`HTTP ${response.status} for ${url}`, {
                            status: response.status,
                            url,
                            attempts: attempt,
                        });
                        if (
                            RETRYABLE_STATUSES.has(response.status) &&
                            attempt < policy.maxAttempts
                        ) {
                            await this.#environment.sleep(this.#delayFor(policy, attempt));
                            continue;
                        }
                        throw error;
                    }
                    const buffer = await response.arrayBuffer();
                    return {
                        response,
                        data: new Uint8Array(buffer),
                        mediaType: mediaTypeOf(response.headers.get("content-type")),
                        url: response.url || url,
                    };
                } catch (error) {
                    if (isAbort(error)) throw error;
                    if (attempt >= policy.maxAttempts) throw error;
                    await this.#environment.sleep(this.#delayFor(policy, attempt));
                }
            }
            throw new FetchError(`Could not fetch ${url}`, { url, attempts: policy.maxAttempts });
        });
    }

    /**
     * Run a request with the site's partitioned cookies copied in, and remove
     * them again afterwards.
     *
     * A partitioned (CHIPS) cookie is scoped to the site that set it. A
     * request made from the extension's own context does not receive it, so
     * the site answers with a login page instead of the chapter. Copying the
     * cookie into an unpartitioned one for the duration of the request makes
     * the extension's request look like the tab's.
     *
     * The copy is removed in a `finally`, whether the request succeeded or
     * threw. Leaving an unpartitioned copy of the user's session cookie
     * behind would be a privacy problem: it would be sent to every other
     * request the extension makes.
     *
     * @param url The URL being requested.
     * @param options The fetch options.
     * @param run The request to run.
     * @returns Whatever `run` returns.
     */
    async #withCookies<T>(url: string, options: FetchOptions, run: () => Promise<T>): Promise<T> {
        const bridge = this.#environment.cookies;
        const useCookies = options.useCookies ?? true;
        const domain = useCookies && bridge ? domainOf(url) : null;
        if (!bridge || !domain) return run();

        let copied: string[] = [];
        try {
            copied = await bridge.copyForDomain(domain);
            return await run();
        } finally {
            if (copied.length > 0) {
                await bridge.removeForDomain(domain, copied).catch(() => {
                    // Cleanup failure must never mask the original error.
                });
            }
        }
    }

    /** Perform one request, handling cookies and the `Referer`. */
    async #performRequest(url: string, options: FetchOptions): Promise<Response> {
        const headers: Record<string, string> = { ...options.headers };
        if (options.referer) headers.Referer = options.referer;

        return this.#environment.fetch(url, {
            method: options.method ?? "GET",
            headers,
            body: options.body ?? null,
            signal: options.signal,
            credentials: options.credentials ?? "include",
            redirect: "follow",
        });
    }

    /** Evaluate the parser's custom error handler, if there is one. */
    #evaluateCustomError(
        url: string,
        response: Response,
        bodyText: string,
    ): { status: number; retryDelay?: number } | undefined {
        const handler = this.#customErrorHandler;
        if (!handler) return undefined;
        try {
            if (!handler.isCustomError(response, bodyText)) return undefined;
            return handler.setCustomErrorResponse(url, response.status, bodyText);
        } catch {
            // A parser that throws while inspecting a response must not break
            // the download; treat it as "no custom error".
            return undefined;
        }
    }

    /** The delay before the next attempt. */
    #delayFor(policy: RetryPolicy, attempt: number): number {
        const delay = policy.baseDelayMs * policy.backoffFactor ** (attempt - 1);
        return Math.min(delay, policy.maxDelayMs);
    }
}

/** The registrable domain of a URL, or `null`. */
function domainOf(url: string): string | null {
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * The media type of a response, without its parameters.
 *
 * A server that omits `Content-Type` gives us an empty string, which the
 * packer treats as "unknown" and stores with a `.bin` extension. Guessing from
 * the URL is better than nothing, so the extension is used as a fallback.
 */
function mediaTypeOf(contentType: string | null): string {
    if (!contentType) return "";
    return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/** An abort error, so the caller can distinguish a cancel from a failure. */
function abortError(): DOMException {
    return new DOMException("The operation was aborted.", "AbortError");
}

/** True when the error is an abort. */
function isAbort(error: unknown): boolean {
    return (
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
    );
}

/**
 * Parse an HTML string into a document.
 *
 * The baseline used `DOMParser`, which is fine, but it always produced an
 * `application/xhtml+xml` document in some engines. `text/html` is what
 * every parser in this extension expects.
 */
export function parseHtml(html: string, url: string): Document {
    const parser = new DOMParser();
    const dom = parser.parseFromString(html, "text/html");
    try {
        // Give the document a base URL so relative links resolve.
        const base = dom.createElement("base");
        base.href = url;
        dom.head?.prepend(base);
    } catch {
        // A document with no head is unusual but not fatal.
    }
    return dom;
}
