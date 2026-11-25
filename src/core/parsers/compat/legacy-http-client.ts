/**
 * The legacy `HttpClient` shim.
 *
 * The 437 legacy site parsers are the product's core asset, and they are
 * preserved verbatim in behaviour. They call a single ambient global —
 * `HttpClient` — with seven members. This module provides that global,
 * reimplemented on top of the rewrite's {@link FetchClient}.
 *
 * The legacy source is `plugin/js/HttpClient.js` on the `legacy` branch. That
 * file also held `FetchErrorHandler` and `FetchResponseHandler`, and both are
 * folded in here:
 *
 *  - `FetchResponseHandler` became the shape of the object `wrapFetch`
 *    returns: the raw response, the parsed document, and the raw bytes.
 *  - `FetchErrorHandler` became the error mapping below. The legacy handler
 *    asked the user to solve a captcha from a dialog in the popup; the
 *    rewrite has no such dialog, so a challenge is surfaced as a rejection
 *    whose error carries `isChallenge`, and the caller decides what to do.
 *
 * Two legacy behaviours are deliberately *not* reproduced, because the
 * rewrite replaced them:
 *
 *  - the retry table. The rewrite's {@link FetchClient} owns retries, with a
 *    single backoff policy, and this shim translates the legacy `retry`
 *    option onto it rather than running a second, competing loop;
 *  - the partitioned-cookie dance (`setPartitionCookies` /
 *    `unsetPartitionCookies`), which the rewrite's cookie bridge performs
 *    inside the fetch client, in a `finally` block.
 */

"use strict";

import {
    FetchError,
    parseHtml,
    type CustomErrorHandler,
    type FetchClient,
    type FetchOptions,
    type RetryPolicy,
} from "../../net/fetch-client";
import { util } from "./legacy-util";

/**
 * The legacy `fetch` options.
 *
 * The legacy client passed these straight to `fetch`, so they may carry any
 * body type `fetch` accepts — a legacy parser posts a `FormData`.
 */
export interface LegacyFetchInit {
    /** The request method. */
    method?: string;
    /** The request headers. */
    headers?: Record<string, string>;
    /** The request body. */
    body?: BodyInit | null;
    /** The credentials mode. */
    credentials?: RequestCredentials;
    /** The redirect mode. */
    redirect?: RequestRedirect;
    /** The abort signal. */
    signal?: AbortSignal;
    /** The `Referer` to send. */
    referer?: string;
}

/**
 * The legacy retry behaviour.
 *
 * `retryDelay` is a list of **seconds** to wait before each retry. The legacy
 * client popped the *last* entry, so the shortest wait came first.
 */
export interface LegacyRetryBehaviour {
    /** The wait before each retry, in seconds. */
    retryDelay: number[];
    /** Whether the user should be asked to retry. */
    promptUser?: boolean;
    /** The HTTP status the behaviour was chosen for. */
    HTTP?: number;
}

/**
 * The response object the legacy client handed back.
 *
 * The legacy parsers read `responseXML` (the parsed page), `json` (the parsed
 * API payload), `response` (the raw response), `contentType`, and
 * `arrayBuffer`. Some of them also handed the object straight to
 * `DOMParser.parseFromString`, which stringifies its argument — so the object
 * stringifies to the body text.
 */
export interface LegacyResponse {
    /** The raw response. */
    response: Response;
    /** The parsed document. Parsed on first access. */
    responseXML: Document;
    /** The parsed JSON. Parsed on first access; `undefined` when the body is not JSON. */
    json?: unknown;
    /** The body, as text. */
    text: string;
    /** The response's `Content-Type`. */
    contentType: string;
    /** The raw bytes, when the response was not HTML. */
    arrayBuffer?: ArrayBuffer;
    /** Whether the response was HTML. */
    isHtml(): boolean;
    /** The body text, so the object can be used where a string is expected. */
    toString(): string;
}

/**
 * The legacy parser hooks for custom error handling.
 *
 * The legacy signatures are preserved exactly: `isCustomError` receives the
 * legacy response object, and `setCustomErrorResponse` receives the URL, the
 * wrap options, and the response.
 */
export interface LegacyErrorParser {
    /** Whether the response is a challenge or a custom site failure. */
    isCustomError?(response: LegacyResponse): boolean;
    /** The response to use for a detected custom error. */
    setCustomErrorResponse?(
        url: string,
        wrapOptions: LegacyWrapOptions,
        response: LegacyResponse,
    ): unknown;
    /** Whether an empty page should be treated as a 403. */
    isNoContentToError403AndContentNull?(response: LegacyResponse): boolean;
    /** The response to use for an empty page. */
    setNoContentToError403Response?(
        url: string,
        wrapOptions: LegacyWrapOptions,
        response: LegacyResponse,
    ): unknown;
}

/**
 * The legacy `wrapOptions` object.
 *
 * The legacy client accepted an error handler, a response handler, and a
 * text-decoder factory alongside the parser and the fetch options. The first
 * three are accepted and ignored: the rewrite's fetch client does the work
 * they used to do.
 */
export interface LegacyWrapOptions {
    /** The parser whose custom error handling applies to this call. */
    parser?: LegacyErrorParser;
    /** Accepted and ignored. */
    errorHandler?: unknown;
    /** Accepted and ignored. */
    responseHandler?: unknown;
    /** The retry behaviour for this call. */
    retry?: LegacyRetryBehaviour;
    /** The `fetch` options for the request. */
    fetchOptions?: LegacyFetchInit;
    /** Accepted and ignored. */
    makeTextDecoder?: unknown;
}

/**
 * The options a legacy parser may pass to `fetchJson`, `fetchHtml`, and
 * `fetchText`: the `fetch` options, plus the parser for custom error
 * handling.
 */
export interface LegacyRequestOptions extends LegacyFetchInit {
    /** The parser whose custom error handling applies to this call. */
    parser?: LegacyErrorParser;
}

/**
 * The legacy JSON response.
 *
 * The legacy client returned the response handler, which carried the parsed
 * JSON and the raw response.
 */
export interface LegacyJsonResponse {
    /** The parsed JSON. */
    json: unknown;
    /** The raw response. */
    response: Response;
    /** The final URL, after redirects. */
    url: string;
    /** The response's `Content-Type`. */
    contentType: string;
}

/**
 * The document `fetchHtml` returns.
 *
 * The legacy client returned its response handler, so a legacy parser reads
 * `.responseXML` from the result. The rewrite's contract is that the result
 * *is* a document, so the document carries both: `responseXML` points at
 * itself, and `response` holds the raw response.
 */
export type LegacyHtmlDocument = Document & {
    /** The document itself, for legacy callers that read `.responseXML`. */
    responseXML: Document;
    /** The raw response. */
    response: Response;
};

/**
 * A declarative network request rule, as a legacy parser supplies it.
 *
 * The legacy rules were passed straight to the browser's DNR API, so they use
 * that API's shape, including the `value` of a header modification.
 */
export interface LegacyDnrRule {
    /** The rule's ID. */
    id: number;
    /** The rule's priority. */
    priority?: number;
    /** The rule's action. */
    action: {
        /** The action type. */
        type: string;
        /** The header modifications. */
        requestHeaders?: Array<{
            /** The header to modify. */
            header: string;
            /** The modification. */
            operation: "set" | "remove" | "append";
            /** The value to set. */
            value?: string;
        }>;
    };
    /** The rule's condition. */
    condition: {
        /** The URL filter. */
        urlFilter?: string;
        /** The resource types the rule applies to. */
        resourceTypes?: string[];
        /** The initiator domains. Set by the shim, never by the parser. */
        initiatorDomains?: string[];
        /** The request domains. */
        requestDomains?: string[];
    };
}

/**
 * The legacy `HttpClient` object.
 */
export interface LegacyHttpClient {
    /**
     * Fetch a page.
     *
     * @returns The legacy response object.
     */
    wrapFetch(url: string, wrapOptions?: LegacyWrapOptions): Promise<LegacyResponse>;
    /**
     * Fetch a JSON document.
     *
     * @returns The legacy JSON response.
     */
    fetchJson(url: string, options?: LegacyRequestOptions): Promise<LegacyJsonResponse>;
    /**
     * Fetch a page as a document.
     *
     * @returns The document, carrying `.responseXML` and `.response`.
     */
    fetchHtml(url: string, options?: LegacyRequestOptions): Promise<LegacyHtmlDocument>;
    /**
     * Fetch a page as text.
     *
     * @returns The body text.
     */
    fetchText(url: string, options?: LegacyRequestOptions): Promise<string>;
    /**
     * Install session-scoped declarative network request rules.
     *
     * The rules replace every rule this extension installed before, exactly
     * as the legacy client did.
     */
    setDeclarativeNetRequestRules(rules: LegacyDnrRule[]): Promise<void>;
    /** The hosts that must not be fetched. */
    blockedSites: Set<string>;
    /** The default `fetch` options. */
    makeOptions(): LegacyFetchInit;
}

/* ------------------------------------------------------------------ */
/* The installed client                                               */
/* ------------------------------------------------------------------ */

/** The client the shim delegates to. */
let installedClient: FetchClient | undefined;

/**
 * Install the fetch client the shim delegates to.
 *
 * The background worker owns the real client, and installs it here during
 * startup. Until it is installed, every fetch through the shim fails with a
 * message that says what to do about it.
 *
 * @param client The client, or `undefined` to uninstall the current one.
 */
export function installFetchClient(client: FetchClient | undefined): void {
    installedClient = client;
}

/**
 * The installed fetch client, if there is one.
 */
export function getFetchClient(): FetchClient | undefined {
    return installedClient;
}

/**
 * The installed client, or a clear error.
 *
 * The error names the fix, because "undefined is not a function" three
 * frames deep is not a diagnosis.
 */
function requireClient(): FetchClient {
    if (!installedClient) {
        throw new Error(
            "HttpClient has no fetch client installed. " +
                "Call installFetchClient(client) before using the legacy parsers.",
        );
    }
    return installedClient;
}

/**
 * A queue that serialises the shim's calls.
 *
 * The fetch client holds **one** custom error handler, so two calls with
 * different parsers running at the same time would see each other's parser.
 * The legacy client kept the parser in the per-call options and had no such
 * problem. The legacy download fetched one chapter at a time anyway, so
 * serialising the calls costs nothing and removes the hazard entirely.
 */
let callQueue: Promise<void> = Promise.resolve();

/**
 * Run an action with exclusive use of the fetch client.
 */
async function withClientLock<T>(action: () => Promise<T>): Promise<T> {
    const previous = callQueue;
    let release: () => void = () => {};
    callQueue = new Promise<void>((resolve) => {
        release = resolve;
    });
    await previous.catch(() => undefined);
    try {
        return await action();
    } finally {
        release();
    }
}

/* ------------------------------------------------------------------ */
/* Legacy response objects                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a body as JSON, or return `undefined` when it is not JSON.
 */
function tryParseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/**
 * Build the legacy response object.
 *
 * The document and the JSON are parsed on first access, because a parser
 * usually looks at one of them and never at the other, and parsing an HTML
 * page twice is not free.
 */
function createLegacyResponse(
    response: Response,
    text: string,
    dom?: Document,
    arrayBuffer?: ArrayBuffer,
): LegacyResponse {
    const contentType = response.headers.get("content-type") ?? "";
    let parsedDom = dom;
    let parsedJson: unknown;
    let jsonRead = false;

    const legacy = {
        response,
        contentType,
        text,
        arrayBuffer,
        isHtml: (): boolean => contentType.startsWith("text/html"),
        toString: (): string => text,
    } as LegacyResponse;

    Object.defineProperty(legacy, "responseXML", {
        enumerable: true,
        get: (): Document => {
            parsedDom ??= parseHtml(text, response.url);
            return parsedDom;
        },
    });

    Object.defineProperty(legacy, "json", {
        enumerable: true,
        get: (): unknown => {
            if (!jsonRead) {
                jsonRead = true;
                parsedJson = tryParseJson(text);
            }
            return parsedJson;
        },
    });

    return legacy;
}

/* ------------------------------------------------------------------ */
/* The parser bridge                                                  */
/* ------------------------------------------------------------------ */

/** A custom error the parser reported. */
interface LegacyCustomError {
    /** The status the parser asked for. */
    status: number;
    /** The message the parser supplied. */
    message?: string;
}

/**
 * The translated form of a parser's custom error response.
 */
interface TranslatedCustomError {
    /** The status. */
    status: number;
    /** The message, when the parser supplied one. */
    message?: string;
    /** The legacy retry delays, in seconds. */
    delays?: number[];
}

/**
 * Translate a legacy custom error response.
 *
 * The legacy parsers returned `{url, wrapOptions, response: {url, status,
 * retryDelay}, errorMessage}`, where `retryDelay` is a list of seconds and
 * the pseudo-status `999` means "this is a temporary failure, retry me". The
 * rewrite's shape is `{status, retryDelay}` with the delay in milliseconds.
 */
function translateCustomError(result: unknown, fallbackStatus: number): TranslatedCustomError {
    if (!result || typeof result !== "object") {
        return { status: fallbackStatus };
    }

    const legacy = result as {
        status?: number;
        retryDelay?: number;
        errorMessage?: string;
        response?: { status?: number; retryDelay?: number[] };
    };

    // The rewrite's own shape.
    if (typeof legacy.status === "number") {
        return {
            status: legacy.status,
            message: legacy.errorMessage,
            delays: typeof legacy.retryDelay === "number" ? [legacy.retryDelay] : undefined,
        };
    }

    // The legacy shape.
    if (legacy.response && typeof legacy.response.status === "number") {
        return {
            status: legacy.response.status,
            message: legacy.errorMessage,
            delays: Array.isArray(legacy.response.retryDelay) ? legacy.response.retryDelay : [],
        };
    }

    // The legacy base parser returned an empty object, which meant "throw".
    return { status: fallbackStatus };
}

/**
 * Bridges the legacy parser hooks onto the rewrite's custom error handler.
 *
 * The rewrite's handler is called with `(response, bodyText)` and answers
 * with `{status, retryDelay}`. The legacy hooks are called with the legacy
 * response object and answer with the legacy shape. This class does the
 * translation in both directions, and keeps the legacy retry delays, so a
 * parser that asks for thirty retries with an eighty-second wait still gets
 * them.
 */
class LegacyParserBridge implements CustomErrorHandler {
    #parser: LegacyErrorParser | undefined;
    #wrapOptions: LegacyWrapOptions;
    #response: Response | undefined;
    /** The legacy retry delays that have not been used yet, in milliseconds. */
    #pendingDelays: number[] = [];
    /** Whether the delay list has been read from the parser yet. */
    #delaysLoaded = false;
    /** The custom error the parser reported, if it reported one. */
    customError: LegacyCustomError | undefined;

    constructor(parser: LegacyErrorParser | undefined, wrapOptions: LegacyWrapOptions) {
        this.#parser = parser;
        this.#wrapOptions = wrapOptions;
    }

    /**
     * Whether the response is a challenge or a custom site failure.
     */
    isCustomError(response: Response, bodyText: string): boolean {
        const parser = this.#parser;
        // Each attempt starts afresh: a custom error from a previous attempt
        // must not be reported against a response that turned out to be fine.
        this.customError = undefined;
        if (!parser?.isCustomError) return false;

        // The legacy client only consulted the hook for a response it had
        // already accepted, so a 403 is handled by the fetch client's own
        // challenge detection instead.
        if (!response.ok) return false;

        this.#response = response;
        try {
            return parser.isCustomError(createLegacyResponse(response, bodyText)) === true;
        } catch (error) {
            // A parser that throws while inspecting a response must not break
            // the download. The error is logged, because a parser that throws
            // here is a parser that cannot tell a challenge from a normal
            // page, and that is worth knowing about.
            console.warn("Kintsugi: a parser's isCustomError hook threw.", error);
            return false;
        }
    }

    /**
     * The custom response for a detected error.
     */
    setCustomErrorResponse(
        url: string,
        status: number,
        bodyText: string,
    ): { status: number; retryDelay?: number } | undefined {
        const parser = this.#parser;
        const response = this.#response;
        if (!parser || !response) return undefined;

        let result: unknown;
        try {
            result = parser.setCustomErrorResponse?.(
                url,
                this.#wrapOptions,
                createLegacyResponse(response, bodyText),
            );
        } catch (error) {
            // A parser that throws while deciding on an error must not break
            // the download; the fetch client's own handling takes over.
            console.warn("Kintsugi: a parser's setCustomErrorResponse hook threw.", error);
            result = undefined;
        }

        const translated = translateCustomError(result, status >= 400 ? status : 403);
        this.customError = { status: translated.status, message: translated.message };

        if (translated.status !== 999) {
            return { status: translated.status };
        }

        // The pseudo-status 999 means "retry me". The legacy delays are in
        // seconds and the legacy client used the shortest one first, so the
        // list is reversed here.
        if (!this.#delaysLoaded) {
            this.#delaysLoaded = true;
            this.#pendingDelays = (translated.delays ?? [])
                .slice()
                .reverse()
                .map((seconds) => seconds * 1000);
        }

        return { status: 999, retryDelay: this.takeDelay() ?? 0 };
    }

    /**
     * Whether the parser considers the page to be empty.
     */
    isNoContent(response: LegacyResponse): boolean {
        const parser = this.#parser;
        if (!parser?.isNoContentToError403AndContentNull) return false;
        try {
            return parser.isNoContentToError403AndContentNull(response) === true;
        } catch (error) {
            console.warn(
                "Kintsugi: a parser's isNoContentToError403AndContentNull hook threw.",
                error,
            );
            return false;
        }
    }

    /**
     * Whether a legacy retry delay is still waiting.
     */
    hasPendingDelay(): boolean {
        return this.#pendingDelays.length > 0;
    }

    /**
     * Take the next legacy retry delay, in milliseconds.
     */
    takeDelay(): number | undefined {
        return this.#pendingDelays.shift();
    }
}

/* ------------------------------------------------------------------ */
/* Option translation                                                 */
/* ------------------------------------------------------------------ */

/**
 * Translate the legacy `fetch` options into the rewrite's fetch options.
 */
function toFetchOptions(init: LegacyFetchInit | undefined): FetchOptions {
    const options: FetchOptions = {};
    if (!init) return options;

    if (init.method) {
        options.method = init.method as FetchOptions["method"];
    }
    if (init.headers) {
        options.headers = { ...init.headers };
    }
    if (init.body !== undefined && init.body !== null) {
        // `fetch` accepts more body types than the rewrite's option type
        // declares — a legacy parser posts a `FormData` — so the value is
        // widened rather than dropped.
        options.body = init.body as unknown as string;
    }
    if (init.credentials) {
        options.credentials = init.credentials;
    }
    if (init.signal) {
        options.signal = init.signal;
    }
    if (init.referer) {
        options.referer = init.referer;
    }

    return options;
}

/**
 * Translate the legacy retry behaviour into the rewrite's retry policy.
 *
 * The legacy delays are seconds and ascend from the shortest to the longest;
 * the rewrite's policy ascends geometrically, which is close enough, and the
 * number of attempts matches the number of legacy delays.
 */
function toRetryPolicy(retry: LegacyRetryBehaviour | undefined): Partial<RetryPolicy> | undefined {
    const delays = retry?.retryDelay;
    if (!delays || delays.length === 0) return undefined;

    const seconds = delays.filter((delay) => typeof delay === "number" && delay > 0);
    if (seconds.length === 0) {
        // The legacy client retried immediately when the delay list was empty.
        return { maxAttempts: 2, baseDelayMs: 0, backoffFactor: 1, maxDelayMs: 0 };
    }

    return {
        maxAttempts: seconds.length + 1,
        baseDelayMs: Math.min(...seconds) * 1000,
        backoffFactor: 2,
        maxDelayMs: Math.max(...seconds) * 1000,
    };
}

/**
 * Refuse to fetch a host the user blocked.
 */
function assertNotBlocked(url: string): void {
    let hostname: string;
    try {
        hostname = new URL(url).hostname;
    } catch {
        throw new Error(`Invalid URL: ${url}`);
    }

    if (HttpClient.blockedSites.has(hostname)) {
        throw new Error(`The site ${hostname} is blocked, so ${url} was not fetched.`);
    }
}

/* ------------------------------------------------------------------ */
/* The fetches                                                        */
/* ------------------------------------------------------------------ */

/**
 * Fetch the raw bytes of a response that was not HTML.
 *
 * The legacy client read the body once and kept it as an `ArrayBuffer` when
 * the response was not HTML. The rewrite's client decodes the body as text,
 * which is lossy for a binary body, so a binary response is fetched a second
 * time to recover the exact bytes. A text body survives the round trip
 * through the decoder, so it is not fetched again.
 */
async function fetchBytes(
    client: FetchClient,
    url: string,
    fetchOptions: FetchOptions,
    legacy: LegacyResponse,
): Promise<ArrayBuffer | undefined> {
    if (legacy.isHtml()) {
        // The legacy client did not return the bytes of an HTML response.
        return undefined;
    }

    const isText =
        legacy.contentType.startsWith("text/") ||
        legacy.contentType.includes("json") ||
        legacy.contentType.includes("xml");
    if (isText) {
        return new TextEncoder().encode(legacy.text).buffer as ArrayBuffer;
    }

    try {
        const binary = await client.fetchBinary(url, fetchOptions);
        return binary.data.slice().buffer as ArrayBuffer;
    } catch {
        // The bytes are a convenience; the response itself already succeeded.
        return new TextEncoder().encode(legacy.text).buffer as ArrayBuffer;
    }
}

/**
 * Fetch a page, applying the legacy error semantics.
 */
async function runLegacyFetch(
    client: FetchClient,
    url: string,
    fetchOptions: FetchOptions,
    retry: Partial<RetryPolicy> | undefined,
    bridge: LegacyParserBridge,
): Promise<LegacyResponse> {
    let retried403 = false;

    for (;;) {
        try {
            const result = await client.fetchHtml(
                url,
                retry ? { ...fetchOptions, retry } : fetchOptions,
            );

            const custom = bridge.customError;
            if (custom) {
                if (custom.status === 999 && bridge.hasPendingDelay()) {
                    // The fetch client ran out of attempts before the legacy
                    // delay list did, so the legacy sequence continues here.
                    await util.sleep(bridge.takeDelay() ?? 0);
                    continue;
                }
                throw new FetchError(custom.message ?? `Custom error for ${url}`, {
                    status: custom.status,
                    url,
                    attempts: 1,
                    isChallenge: custom.status === 403,
                });
            }

            const legacy = createLegacyResponse(result.response, result.text, result.dom);

            if (bridge.isNoContent(legacy)) {
                // The legacy client turned an empty page into a 403.
                throw new FetchError(`No content at ${url}`, {
                    status: 403,
                    url,
                    attempts: 1,
                    isChallenge: true,
                });
            }

            legacy.arrayBuffer = await fetchBytes(client, url, fetchOptions, legacy);
            return legacy;
        } catch (error) {
            // The legacy client retried a 403 once, after a second, and then
            // asked the user to solve the captcha. The rewrite keeps the
            // retry; the challenge is surfaced as a rejection instead of a
            // dialog.
            if (error instanceof FetchError) {
                const custom = bridge.customError;
                const status = custom?.status ?? error.status;

                // The fetch client's own retry budget ran out while the legacy
                // delay list still has delays left. The legacy sequence
                // continues here, so a parser that asked for thirty retries
                // with an eighty-second wait still gets them.
                if (status === 999 && bridge.hasPendingDelay()) {
                    await util.sleep(bridge.takeDelay() ?? 0);
                    continue;
                }

                if (status === 403 && !retried403) {
                    retried403 = true;
                    await util.sleep(1000);
                    continue;
                }
                if (custom?.message) {
                    // The parser supplied the message for this failure, so it
                    // is the one the user should see.
                    throw new FetchError(custom.message, {
                        status: custom.status,
                        url,
                        attempts: 1,
                        isChallenge: custom.status === 403,
                    });
                }
            }
            throw error;
        }
    }
}

/**
 * Fetch a page.
 */
async function wrapFetch(
    url: string,
    wrapOptions: LegacyWrapOptions = {},
): Promise<LegacyResponse> {
    const client = requireClient();
    assertNotBlocked(url);

    const options = wrapOptions ?? {};
    const fetchOptions = toFetchOptions(options.fetchOptions);
    const retry = toRetryPolicy(options.retry);
    const bridge = new LegacyParserBridge(options.parser, options);

    return withClientLock(async () => {
        client.setCustomErrorHandler(bridge);
        try {
            return await runLegacyFetch(client, url, fetchOptions, retry, bridge);
        } finally {
            client.setCustomErrorHandler(undefined);
        }
    });
}

/**
 * Fetch a JSON document.
 */
async function fetchJson(
    url: string,
    options: LegacyRequestOptions = {},
): Promise<LegacyJsonResponse> {
    const client = requireClient();
    assertNotBlocked(url);

    const parser = options.parser;
    const fetchOptions = toFetchOptions(options);
    const bridge = new LegacyParserBridge(parser, { parser });

    return withClientLock(async () => {
        client.setCustomErrorHandler(bridge);
        try {
            const result = await client.fetchJson(url, fetchOptions);
            const custom = bridge.customError;
            if (custom) {
                throw new FetchError(custom.message ?? `Custom error for ${url}`, {
                    status: custom.status,
                    url,
                    attempts: 1,
                    isChallenge: custom.status === 403,
                });
            }
            return {
                json: result.json,
                response: result.response,
                url: result.url,
                contentType: result.response.headers.get("content-type") ?? "",
            };
        } finally {
            client.setCustomErrorHandler(undefined);
        }
    });
}

/**
 * Fetch a page as a document.
 */
async function fetchHtml(
    url: string,
    options: LegacyRequestOptions = {},
): Promise<LegacyHtmlDocument> {
    const legacy = await wrapFetch(url, { fetchOptions: options, parser: options.parser });
    const dom = legacy.responseXML;

    // The legacy parsers read `.responseXML` from the result of
    // `fetchHtml`, while the rewrite's contract is that the result *is* the
    // document. The document carries both.
    Object.defineProperty(dom, "responseXML", {
        value: dom,
        configurable: true,
        enumerable: false,
    });
    Object.defineProperty(dom, "response", {
        value: legacy.response,
        configurable: true,
        enumerable: false,
    });

    return dom as LegacyHtmlDocument;
}

/**
 * Fetch a page as text.
 */
async function fetchText(url: string, options: LegacyRequestOptions = {}): Promise<string> {
    const legacy = await wrapFetch(url, { fetchOptions: options, parser: options.parser });
    return legacy.text;
}

/* ------------------------------------------------------------------ */
/* Declarative network request rules                                  */
/* ------------------------------------------------------------------ */

/**
 * The session-rule API of the browser's DNR namespace.
 */
interface DnrSessionApi {
    updateSessionRules(options: { removeRuleIds?: number[]; addRules?: unknown[] }): Promise<void>;
    getSessionRules(): Promise<Array<{ id: number }>>;
}

/**
 * The DNR namespace, if the browser exposes one.
 *
 * Firefox exposes the promise-based `browser` namespace and Chromium the
 * callback-based `chrome` one; both have the session-rule API, so both are
 * tried.
 */
function dnrApi(): DnrSessionApi | undefined {
    if (typeof browser !== "undefined" && browser.declarativeNetRequest) {
        return browser.declarativeNetRequest;
    }

    const global = globalThis as unknown as {
        chrome?: { declarativeNetRequest?: DnrSessionApi };
    };
    return global.chrome?.declarativeNetRequest;
}

/**
 * The extension's own origin host, for scoping a declarative network request
 * rule.
 *
 * Firefox validates `initiatorDomains` entries as canonical domains, and the
 * extension's add-on ID is not one: this project's ID is `kintsugi@localhost`,
 * and `new URL("http://kintsugi@localhost").hostname` is `localhost`, so
 * Firefox rejects the rule with `Invalid domain kintsugi@localhost`.
 *
 * The host of the extension's own origin — the per-profile UUID in
 * `moz-extension://<uuid>/` — is a canonical domain, and is the value Firefox
 * actually derives the initiator from. On Chromium the same expression yields
 * the extension ID, which is the initiator there too.
 *
 * @returns The host, or an empty string when it cannot be determined.
 */
function initiatorHost(): string {
    try {
        const api = globalThis as unknown as {
            browser?: { runtime?: { getURL?(path: string): string } };
            chrome?: { runtime?: { getURL?(path: string): string } };
        };
        const getURL = api.browser?.runtime?.getURL ?? api.chrome?.runtime?.getURL;
        if (!getURL) return "";
        return new URL(getURL("")).hostname;
    } catch {
        return "";
    }
}

/**
 * Install session-scoped declarative network request rules.
 *
 * The legacy parsers use this to spoof the `Referer` and `Sec-Fetch-*`
 * headers that a Cloudflare-protected site expects. The rules replace every
 * rule the extension installed before, exactly as the legacy client did.
 */
async function setDeclarativeNetRequestRules(rules: LegacyDnrRule[]): Promise<void> {
    const api = dnrApi();
    if (!api) {
        console.warn("HttpClient: this browser has no declarativeNetRequest API.");
        return;
    }

    const host = initiatorHost();
    const prepared = rules.map((rule) => ({
        ...rule,
        priority: rule.priority ?? 1,
        condition: {
            ...rule.condition,
            // Scope the rule to this extension, so it can only ever affect
            // the extension's own requests. The key is omitted rather than
            // set to an empty array when the origin is unknown: Firefox's
            // schema requires at least one entry, and a rule with no
            // initiator condition would match every request in the browser.
            ...(host ? { initiatorDomains: [host] } : {}),
        },
    }));

    if (!host) {
        console.warn(
            "HttpClient: the extension's origin is unknown, so the request rules cannot be scoped to it. They will not be installed.",
        );
        return;
    }

    let oldRules: Array<{ id: number }> = [];
    try {
        oldRules = await api.getSessionRules();
    } catch {
        // Firefox has been known to fail this call; start from nothing.
        oldRules = [];
    }

    await api.updateSessionRules({
        removeRuleIds: oldRules.map((rule) => rule.id),
        addRules: prepared,
    });
}

/**
 * The default `fetch` options.
 *
 * The legacy client only set the credentials mode; the redirect mode is
 * stated explicitly because the rewrite's fetch client follows redirects
 * itself.
 */
function makeOptions(): LegacyFetchInit {
    return { credentials: "include", redirect: "follow" };
}

/* ------------------------------------------------------------------ */
/* The legacy global                                                  */
/* ------------------------------------------------------------------ */

/**
 * The legacy `HttpClient` object.
 *
 * The 437 legacy parsers call `HttpClient.<member>(…)`; this is that object.
 */
export const HttpClient: LegacyHttpClient = {
    wrapFetch: (url, wrapOptions) => wrapFetch(url, wrapOptions),
    fetchJson: (url, options) => fetchJson(url, options),
    fetchHtml: (url, options) => fetchHtml(url, options),
    fetchText: (url, options) => fetchText(url, options),
    setDeclarativeNetRequestRules: (rules) => setDeclarativeNetRequestRules(rules),
    blockedSites: new Set<string>(),
    makeOptions: () => makeOptions(),
};
