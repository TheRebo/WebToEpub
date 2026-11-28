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

import { mayFetchUrl } from "./fetch-policy";
import { diagnosticUrl } from "../util/diagnostics";
import { isAcceptableImageType, isAcceptablePageType, mediaTypeOf } from "./media-types";
import { imageFormatOf } from "../epub/image-format";
import type { CopiedCookie } from "./cookie-bridge";
import type { ErrorCode } from "../util/errors";

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

/**
 * How long a single request may take, in milliseconds.
 *
 * Without a timeout, a server that accepts the connection and never answers
 * leaves the job sitting in "fetching chapters" for ever. The user can cancel
 * it, but they should not have to.
 */
export const REQUEST_TIMEOUT_MS = 30_000;

/** How long a response's body may take to arrive once the headers have. */
export const BODY_TIMEOUT_MS = 120_000;

/**
 * The largest response body the extension will read, in bytes.
 *
 * A hostile or misconfigured server can answer with a body of any size. The
 * extension reads the body into memory before parsing it, so an unbounded
 * response is a way to exhaust the worker's memory.
 */
export const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/**
 * How many redirects the extension will follow.
 */
export const MAX_REDIRECTS = 5;

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
    /**
     * The decoder for a text body. Defaults to the one the response names
     * (see {@link decoderFor}); a parser for a site that lies about its
     * encoding supplies its own.
     */
    decoder?: (response: Response) => TextDecoder;
    /**
     * The custom-error handler for this request only. A parser's handler
     * judges that parser's requests, never an image fetch running beside it.
     */
    customErrorHandler?: CustomErrorHandler;
}

/** A successful response. */
export interface FetchResult {
    /** The raw response. */
    response: Response;
    /** The body, parsed as text. */
    text: string;
    /** The body's bytes, before decoding. */
    bytes: Uint8Array;
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
    /**
     * The cause, when the failure is not about the server's answer.
     *
     * A server that answers with a PDF when a page was asked for has answered
     * perfectly well; the failure is in what it sent, and the code says so.
     */
    readonly code: ErrorCode | undefined;
    /** The media type the server sent, when it was the wrong one. */
    readonly mediaType: string | undefined;

    constructor(
        message: string,
        options: {
            status?: number;
            url: string;
            attempts: number;
            isChallenge?: boolean;
            code?: ErrorCode;
            mediaType?: string;
        },
    ) {
        super(message);
        this.name = "FetchError";
        this.status = options.status;
        this.url = options.url;
        this.attempts = options.attempts;
        this.isChallenge = options.isChallenge ?? false;
        this.code = options.code;
        this.mediaType = options.mediaType;
    }
}

/** The cookie bridge, injected so the fetch layer can be tested without a browser. */
export interface CookieBridge {
    /**
     * Copy the site's partitioned cookies into unpartitioned cookies so the
     * extension's request authenticates the same way the tab does.
     *
     * @returns The cookies that were set, each with the place it was put, so
     *   that exactly those can be removed again.
     */
    copyForDomain(domain: string): Promise<CopiedCookie[]>;
    /** Remove the copies a request made. */
    removeForDomain(domain: string, copies: CopiedCookie[]): Promise<void>;
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
                    const { text, bytes } = await this.#readText(response, options);
                    diagnosticUrl(
                        `Fetched (attempt ${attempt})`,
                        url,
                        response.status,
                        `${text.length} characters`,
                    );

                    const custom = this.#evaluateCustomError(
                        url,
                        response,
                        text,
                        options.customErrorHandler,
                    );
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

                    // A page that is not HTML is not a page. Parsing it as one
                    // would produce an empty document that looks like a
                    // chapter with no prose in it.
                    //
                    // The status is deliberately left out: the server answered
                    // with a 200, and telling the user that the server
                    // returned 200 would be true and useless.
                    const contentType = response.headers.get("content-type");
                    if (!isAcceptablePageType(contentType)) {
                        throw new FetchError(
                            `Expected an HTML page from ${url} but got ${mediaTypeOf(contentType)}`,
                            {
                                url,
                                attempts: attempt,
                                code: "UNSUPPORTED_CONTENT",
                                mediaType: mediaTypeOf(contentType),
                            },
                        );
                    }

                    return {
                        response,
                        text,
                        bytes,
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
                    const { text } = await this.#readText(response, options);

                    const custom = this.#evaluateCustomError(
                        url,
                        response,
                        text,
                        options.customErrorHandler,
                    );
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
                    // A failure the layer has already classified — a refused
                    // URL, a body that is not JSON — is the server's answer,
                    // not a hiccup, and asking again only wastes its time.
                    if (error instanceof FetchError && error.code !== undefined) throw error;
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
                    const data = await this.#readBody(response, MAX_RESPONSE_BYTES, options.signal);
                    const declared = response.headers.get("content-type");
                    const mediaType = mediaTypeOf(declared);
                    // An image that is not an image would be written into the
                    // EPUB with the media type the server declared, which
                    // every e-reader rejects. A server that declares no type
                    // is allowed through: the bytes are what say what the
                    // picture is.
                    if (!isAcceptableImageType(declared)) {
                        throw new FetchError(`Expected an image from ${url} but got ${mediaType}`, {
                            url,
                            attempts: attempt,
                            code: "UNSUPPORTED_CONTENT",
                            mediaType,
                        });
                    }
                    // The bytes decide the media type, with the server's word
                    // as the tie-breaker. A server that declares nothing, or
                    // declares the wrong thing, would otherwise put a file
                    // into the book whose manifest entry names a media type
                    // the file is not — and a reader shows nothing for it.
                    const format = imageFormatOf(data, mediaType);
                    if (!format) {
                        throw new FetchError(`The picture from ${url} was not in a known format`, {
                            url,
                            attempts: attempt,
                            code: "UNSUPPORTED_CONTENT",
                            mediaType,
                        });
                    }
                    return {
                        response,
                        data,
                        mediaType: format.mediaType,
                        url: response.url || url,
                    };
                } catch (error) {
                    if (isAbort(error)) throw error;
                    // Only a transport failure or a status the server might
                    // answer differently next time is worth retrying. A 404, a
                    // 403 or a page that is not a page is the server's answer,
                    // and asking again only wastes the site's time.
                    if (!isRetryable(error) || attempt >= policy.maxAttempts) throw error;
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

        let copied: CopiedCookie[] = [];
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

    /**
     * Perform one request.
     *
     * Three things happen here that the baseline did not do at all:
     *
     *  - **The URL is validated.** Every request the extension makes goes
     *    through here, so this is the one place that has to refuse a URL
     *    naming the local machine or a private network. A site whose table of
     *    contents links to `http://169.254.169.254/` would otherwise use the
     *    extension as a proxy into the user's own network. A private host is
     *    allowed when — and only when — the user has given the extension
     *    access to it, which is what makes a story served from a home server
     *    work without opening the door to the rest of the network.
     *  - **Redirects are checked.** The browser follows them, because a
     *    manual redirect is opaque to an extension. A hop to a private
     *    address is blocked by a network rule before it is made, and the
     *    final address is checked again before the body is read.
     *  - **The request has a deadline.** A server that never answers cannot
     *    hold the job open for ever.
     */
    async #performRequest(url: string, options: FetchOptions): Promise<Response> {
        const headers: Record<string, string> = { ...options.headers };
        if (options.referer) headers.Referer = options.referer;

        let current = url;
        // The method and the body are tracked separately from the options,
        // because a redirect can change them: a 303 after a POST means "go
        // and GET the thing I am pointing at", not "do the same POST again".
        let method = options.method ?? "GET";
        let body = options.body ?? null;

        for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
            const validated = await mayFetchUrl(current);
            if (!validated) {
                throw new FetchError(`Refused to fetch ${current}`, {
                    url: current,
                    attempts: 1,
                    code: "PERMISSION_DENIED",
                });
            }

            const response = await this.#request(validated.href, headers, options, method, body);

            // The browser follows redirects itself: a manual redirect comes back
            // opaque, with no status and no location to follow. A private hop
            // is blocked in the network stack (`installPrivateNetworkRules`), and
            // the address the response finally came from is checked here too.
            if (response.redirected && response.url && response.url !== validated.href) {
                if (!(await mayFetchUrl(response.url))) {
                    await response.body?.cancel().catch(() => undefined);
                    throw new FetchError(`Refused to fetch ${response.url}`, {
                        url: response.url,
                        attempts: 1,
                        code: "PERMISSION_DENIED",
                    });
                }
            }

            // An environment that hands a redirect back unfollowed is still
            // walked hop by hop, each hop checked above.
            const location = response.headers.get("location");
            if (!location || response.status < 300 || response.status >= 400) {
                return response;
            }

            let next: string;
            try {
                next = new URL(location, validated.href).href;
            } catch {
                return response;
            }

            // The next hop is validated at the top of the loop, so a redirect
            // to a private address is refused before the request is made.
            if (hop === MAX_REDIRECTS) {
                throw new FetchError(`Too many redirects for ${url}`, {
                    status: response.status,
                    url: current,
                    attempts: 1,
                });
            }

            // RFC 9110 §15.4: a 303 always becomes a GET, and a 301 or 302
            // turns a POST into a GET as well. 307 and 308 keep both, because
            // they say the method is not what changed.
            if (
                response.status === 303 ||
                ((response.status === 301 || response.status === 302) && method === "POST")
            ) {
                method = "GET";
                body = null;
            }

            current = next;
        }

        throw new FetchError(`Too many redirects for ${url}`, {
            status: 0,
            url,
            attempts: 1,
        });
    }

    /**
     * Make a single request, with a deadline.
     */
    async #request(
        url: string,
        headers: Record<string, string>,
        options: FetchOptions,
        method: string,
        body: BodyInit | null,
    ): Promise<Response> {
        // The deadline covers the wait for the headers. The body then gets a
        // longer one of its own, so a large image on a slow link can finish.
        const deadline = new AbortController();
        let timer = setTimeout(() => deadline.abort(), REQUEST_TIMEOUT_MS);
        const signal = options.signal
            ? AbortSignal.any([options.signal, deadline.signal])
            : deadline.signal;

        try {
            const response = await this.#environment.fetch(url, {
                method,
                headers,
                body,
                signal,
                credentials: options.credentials ?? "include",
                redirect: "follow",
            });
            clearTimeout(timer);
            timer = setTimeout(() => deadline.abort(), BODY_TIMEOUT_MS);
            return response;
        } catch (error) {
            clearTimeout(timer);
            // A timeout is a transport failure like any other, so it is
            // retried; its name says what happened.
            if (deadline.signal.aborted && !options.signal?.aborted) {
                const timedOut = new Error(`The request to ${url} timed out.`);
                timedOut.name = "TimeoutError";
                throw timedOut;
            }
            throw error;
        }
    }

    /**
     * Read a response's body as text, refusing one that is too large.
     *
     * @param response The response.
     * @param options The fetch's options, for the signal and the decoder.
     * @returns The body's text and its bytes.
     */
    async #readText(
        response: Response,
        options: FetchOptions,
    ): Promise<{ text: string; bytes: Uint8Array }> {
        const bytes = await this.#readBody(response, MAX_RESPONSE_BYTES, options.signal);
        const decoder = options.decoder?.(response) ?? decoderFor(response, bytes);
        return { text: decoder.decode(bytes), bytes };
    }

    /**
     * Read a response's body, refusing one that is too large.
     *
     * The `Content-Length` header is checked first, because it is cheap and
     * most oversized bodies declare it. A body that does not declare its size
     * is read through a reader that counts the bytes and stops as soon as the
     * cap is passed.
     *
     * @param response The response.
     * @param limit The largest body to accept, in bytes.
     * @param signal The signal that stops the read, when there is one.
     * @returns The body's bytes.
     */
    async #readBody(response: Response, limit: number, signal?: AbortSignal): Promise<Uint8Array> {
        const declared = Number(response.headers.get("content-length") ?? "");
        if (Number.isFinite(declared) && declared > limit) {
            throw new FetchError("The response was too large to read.", {
                status: response.status,
                url: response.url,
                attempts: 1,
            });
        }

        const body = response.body;
        if (!body) {
            // A response without a stream — a `null` body for a `204`, or a
            // body that has already been read — is read the plain way. The
            // size is checked afterwards, because the size is known only
            // once the bytes are in hand. The check is not optional: a body
            // that does not declare its size must not be an unlimited one.
            const bytes = new Uint8Array(await response.arrayBuffer());
            if (bytes.byteLength > limit) {
                throw new FetchError("The response was too large to read.", {
                    status: response.status,
                    url: response.url,
                    attempts: 1,
                });
            }
            return bytes;
        }

        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
            for (;;) {
                if (signal?.aborted) throw abortError();
                const { done, value } = await reader.read();
                if (done) break;
                if (!value) continue;
                total += value.byteLength;
                if (total > limit) {
                    await reader.cancel().catch(() => {
                        // Cancelling a stream that has already ended is not an
                        // error worth reporting.
                    });
                    throw new FetchError("The response was too large to read.", {
                        status: response.status,
                        url: response.url,
                        attempts: 1,
                    });
                }
                chunks.push(value);
            }
        } catch (error) {
            // The read did not finish, so the stream is still open. Leaving it
            // open holds the connection — and the memory behind it — for as
            // long as the browser feels like. A cancel that arrives mid-read
            // has to close the stream, or the download keeps pulling bytes for
            // a job the user has already stopped.
            await reader.cancel().catch(() => {
                // Cancelling a stream that has already ended is not an error
                // worth reporting.
            });
            throw error;
        } finally {
            reader.releaseLock?.();
        }

        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    }

    /** Evaluate the parser's custom error handler, if there is one. */
    #evaluateCustomError(
        url: string,
        response: Response,
        bodyText: string,
        scoped?: CustomErrorHandler,
    ): { status: number; retryDelay?: number } | undefined {
        const handler = scoped ?? this.#customErrorHandler;
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

/**
 * True when the failure is worth asking the server again.
 *
 * A status the server might answer differently next time — a rate limit, a
 * gateway error — is worth retrying. Everything else is the server's answer:
 * a 404 stays a 404, a PDF stays a PDF, and a refused URL stays refused.
 *
 * A failure that carries a code has already been classified by the layer that
 * raised it, so it is never retried here.
 */
function isRetryable(error: unknown): boolean {
    if (!(error instanceof FetchError)) return true;
    if (error.code !== undefined) return false;
    if (error.status === undefined) return true;
    return RETRYABLE_STATUSES.has(error.status);
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
        // Give the document a base URL so relative links resolve — but only
        // when the page does not have a base of its own. The *first* `<base>`
        // in a document wins, so prepending ours over a site's own `<base>`
        // would send every relative link on the page to the wrong place.
        if (!dom.querySelector("base[href]")) {
            const base = dom.createElement("base");
            // The *attribute* is set, not the property. The property is a
            // reflected URL, so the browser parses its value against the
            // document's own base — which, for a document made by
            // `DOMParser`, is the page that created it. An absolute address
            // survives that, but a relative one would be resolved against
            // the extension's own pages instead of against the site.
            base.setAttribute("href", url);
            dom.head?.prepend(base);
        }
    } catch {
        // A document with no head is unusual but not fatal.
    }
    return dom;
}

/**
 * The decoder for a text body.
 *
 * The `charset` of the `Content-Type` wins, then a `<meta charset>` or
 * `http-equiv` in the first kilobyte, then UTF-8. Many Chinese and Japanese
 * novel sites are served in GBK or Shift_JIS, and decoding them as UTF-8
 * turns every chapter into mojibake.
 *
 * @param response The response.
 * @param bytes The body.
 * @returns The decoder.
 */
export function decoderFor(response: Response, bytes: Uint8Array): TextDecoder {
    const declared = /charset\s*=\s*["']?([\w.:-]+)/i.exec(
        response.headers.get("content-type") ?? "",
    )?.[1];
    const sniffed =
        declared ??
        /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(
            new TextDecoder("latin1").decode(bytes.subarray(0, 1024)),
        )?.[1];
    if (sniffed) {
        try {
            return new TextDecoder(sniffed);
        } catch {
            // An encoding the browser does not know falls back to UTF-8.
        }
    }
    return new TextDecoder();
}
