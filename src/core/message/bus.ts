/**
 * The typed message bus.
 *
 * The background worker and the extension pages talk through a single
 * typed protocol. Every message is validated at the boundary, so a
 * malformed or hostile message cannot reach the worker's internals.
 *
 * The baseline passed messages with `chrome.runtime.sendMessage` and read
 * whatever came back, with no validation and no types.
 *
 * See ADR-0005.
 */
import { toUserFacingError, UserFacingErrorError, type UserFacingError } from "../util/errors";
import { validateHostName } from "../storage/site-selectors-store";
import type { ChapterFetchState } from "../download-manager";

/** The messages the worker can receive. */
export interface RequestMap {
    /** Ask for the parser and metadata for the current page. */
    "page:analyze": {
        request: { url: string; dom?: string };
        response: PageAnalysis;
    };
    /** Ask for the chapter list. */
    "chapters:list": {
        request: { url: string; dom?: string };
        response: ChapterListResult;
    };
    /** Start a download. */
    "download:start": {
        request: {
            url: string;
            title: string;
            chapters: Array<{ sourceUrl: string; title: string }>;
        };
        response: { jobId: string };
    };
    /** Cancel a download. */
    "download:cancel": {
        request: { jobId: string };
        response: { cancelled: boolean };
    };
    /** The current progress of a job. */
    "download:progress": {
        request: { jobId: string };
        response: DownloadProgress;
    };
    /** List the jobs. */
    "download:list": {
        request: Record<string, never>;
        response: { jobs: DownloadProgress[] };
    };
    /** Read the settings. */
    "settings:get": {
        request: Record<string, never>;
        response: { settings: unknown };
    };
    /** Write the settings. */
    "settings:set": {
        request: { settings: unknown };
        response: { settings: unknown };
    };
    /** List the library. */
    "library:list": {
        request: Record<string, never>;
        response: { entries: unknown[] };
    };
    /** Delete a library entry. */
    "library:delete": {
        request: { id: string };
        response: { deleted: boolean };
    };
    /** Check whether the extension has host access for a site. */
    "permissions:check": {
        request: { origin: string };
        response: { hasAccess: boolean };
    };
    /** Request host access for a site. */
    "permissions:request": {
        request: { origin: string };
        response: { granted: boolean };
    };
    /** The sites the extension has access to. */
    "permissions:list": {
        request: Record<string, never>;
        response: { origins: string[] };
    };
    /** Revoke host access. */
    "permissions:revoke": {
        request: { origin: string };
        response: { revoked: boolean };
    };
    /** Suggest CSS selectors for a site the rewrite has no parser for. */
    "site-selectors:suggest": {
        request: { url: string };
        response: SiteSelectorSuggestion;
    };
    /** Test CSS selectors against a page. */
    "site-selectors:test": {
        request: {
            url: string;
            contentCss: string;
            titleCss: string;
            removeCss: string;
        };
        response: SiteSelectorTest;
    };
    /** Save the CSS selectors for a host name. */
    "site-selectors:save": {
        request: {
            hostname: string;
            contentCss: string;
            titleCss: string;
            removeCss: string;
            /** The URL the selectors were tested against. */
            testUrl?: string;
        };
        response: { saved: boolean };
    };
    /** List the saved CSS selectors. */
    "site-selectors:list": {
        request: Record<string, never>;
        response: { entries: SiteSelectorEntry[] };
    };
    /** Forget a host name's CSS selectors. */
    "site-selectors:remove": {
        request: { hostname: string };
        response: { removed: boolean };
    };
}

/** The name of a request. */
export type RequestName = keyof RequestMap;

/** The result of analysing a page. */
export interface PageAnalysis {
    /** Whether a parser was found. */
    supported: boolean;
    /** The parser's name, if there is one. */
    parserName?: string;
    /** The story title. */
    title?: string;
    /** The author. */
    author?: string;
    /** The language. */
    language?: string;
    /** The cover image URL. */
    coverUrl?: string;
    /** The description. */
    description?: string;
    /** The error, if the page could not be analysed. */
    error?: UserFacingError;
    /**
     * Whether the default parser was used.
     *
     * The workbench shows its site-selector panel when this is true: the
     * fallback parser is guessing, and the user can make it stop guessing.
     */
    usedDefaultParser?: boolean;
}

/** The result of building a chapter list. */
export interface ChapterListResult {
    /** The chapters. */
    chapters: Array<{ sourceUrl: string; title: string; isIncludeable?: boolean }>;
    /** The error, if the list could not be built. */
    error?: UserFacingError;
}

/** The phase of a download. */
export type DownloadPhase =
    | "preparing"
    | "fetching-chapters"
    | "downloading-images"
    | "building-epub"
    | "saving"
    | "complete"
    | "failed"
    | "cancelled";

/** The progress of a download. */
export interface DownloadProgress {
    /** The job's ID. */
    jobId: string;
    /** The phase. */
    phase: DownloadPhase;
    /** How many chapters have been fetched. */
    chaptersDone: number;
    /** How many chapters there are in total. */
    chaptersTotal: number;
    /** The percentage, from 0 to 100. */
    percent: number;
    /** The message shown in the status bar. */
    message: string;
    /**
     * The chapter the job is on, and its state.
     *
     * The chapter list draws a state per row, and this is where that state
     * comes from. The index is the chapter's index **within the job**, which
     * is the list of chapters the user selected, not the workbench's full
     * list.
     */
    current?: { index: number; state: ChapterFetchState };
    /** The name of the saved file, once the download is complete. */
    fileName?: string;
    /** The size of the saved file, in bytes. */
    fileSize?: number;
    /** The error, if the download failed. */
    error?: UserFacingError;
}

/** The selectors the scanner suggests for a site. */
export interface SiteSelectorSuggestion {
    /** `success`, `toc_detected` or `failed`. */
    status: "success" | "toc_detected" | "failed";
    /** The selector that holds the chapter's body. */
    contentCss: string;
    /** The selector that holds the chapter's title. */
    titleCss: string;
    /** The error, when the scan failed. */
    error?: string;
}

export interface SiteSelectorEntry {
    /** The host name the selectors belong to. */
    hostname: string;
    /** The selector that holds the chapter's body. */
    contentCss: string;
    /** The selector that holds the chapter's title. */
    titleCss: string;
    /** The selector that holds the elements to strip from the body. */
    removeCss: string;
    /** The URL the selectors were tested against. */
    testUrl: string;
}

/** The result of testing a set of selectors against a page. */
export interface SiteSelectorTest {
    /** Whether the selectors found the content. */
    ok: boolean;
    /** How many characters the content selector matched. */
    contentChars: number;
    /** The text the title selector matched. */
    titleText: string;
    /** The error, when the page could not be read. */
    error?: string;
}

/** A message envelope. */
export interface Envelope<T> {
    /** The request name. */
    type: string;
    /** The payload. */
    payload: T;
    /** A correlation ID. */
    id: string;
}

/** A response envelope. */
export interface ResponseEnvelope<T> {
    /** The correlation ID of the request this answers. */
    id: string;
    /** The payload, when the call succeeded. */
    result?: T;
    /** The error, when the call failed. */
    error?: UserFacingError;
}

/** The messaging API a client needs to send a request. */
export interface MessagingApi {
    sendMessage(message: unknown): Promise<unknown>;
}

/** The messaging API a server needs to receive a request. */
export interface MessagingListenerApi {
    onMessage(listener: (message: unknown, sender: unknown) => Promise<unknown> | undefined): void;
}

/**
 * Send a request and await its response.
 *
 * The response is validated before it is returned, so a malformed reply
 * surfaces as an error rather than as `undefined` fields deeper in the UI.
 *
 * The correlation ID is checked: a reply that carries a different ID did not
 * answer this request, and returning it would mix one request's result into
 * another's.
 *
 * @throws A {@link UserFacingError} when the worker reported a failure, so
 * the caller keeps the machine-readable code and can translate the message.
 */
export async function sendRequest<N extends RequestName>(
    api: MessagingApi,
    type: N,
    payload: RequestMap[N]["request"],
): Promise<RequestMap[N]["response"]> {
    const id = crypto.randomUUID();
    const envelope: Envelope<unknown> = { type, payload, id };

    const raw = await api.sendMessage(envelope);
    const response = raw as ResponseEnvelope<RequestMap[N]["response"]> | undefined;

    if (!response || typeof response !== "object" || !("id" in response)) {
        throw new Error(`No response to ${type}`);
    }
    if (response.id !== id) {
        // The reply belongs to a different request. Accepting it would put
        // one request's result into another's place.
        throw new Error(`Mismatched response to ${type}`);
    }
    if (response.error) {
        throw new UserFacingErrorError(
            response.error.message,
            response.error.code,
            response.error.actions,
            response.error.url,
        );
    }
    if (!("result" in response) || response.result === undefined) {
        throw new Error(`Empty response to ${type}`);
    }
    return response.result as RequestMap[N]["response"];
}

/**
 * Handle incoming requests.
 *
 * The payload is validated before the handler sees it, so a message carrying
 * the wrong shape is answered with a clear error instead of reaching a
 * handler that assumes the shape. The error is converted to a
 * `UserFacingError` and sent back, so the caller never sees a raw exception.
 */
export async function handleRequests(
    api: MessagingListenerApi,
    handlers: Partial<{
        [K in RequestName]: (
            payload: RequestMap[K]["request"],
        ) => Promise<RequestMap[K]["response"]> | RequestMap[K]["response"];
    }>,
): Promise<void> {
    api.onMessage(async (message) => {
        const envelope = message as Envelope<unknown> | undefined;
        if (!envelope || typeof envelope !== "object" || !("type" in envelope)) {
            return undefined;
        }
        const type = envelope.type as RequestName;
        const handler = handlers[type];
        if (!handler) return undefined;

        try {
            if (!isValidPayload(type, envelope.payload)) {
                // The message is raised as a user-facing error so that it
                // survives the translation into a `UserFacingError`; a plain
                // exception would be shown as "Could not reach the site.",
                // which would send the user looking in the wrong place.
                throw new UserFacingErrorError(`The ${type} request was malformed.`, "UNKNOWN");
            }
            const result = await (handler as (payload: unknown) => Promise<unknown>)(
                envelope.payload,
            );
            const response: ResponseEnvelope<unknown> = { id: envelope.id, result };
            return response;
        } catch (error) {
            const response: ResponseEnvelope<unknown> = {
                id: envelope.id,
                error: toUserFacingError(error),
            };
            return response;
        }
    });
}

/* ------------------------------------------------------------------ */
/* Payload validation                                                  */
/* ------------------------------------------------------------------ */

/**
 * The shape a payload must have, for each request.
 *
 * The message bus is the boundary between the extension's own pages and the
 * worker. The types describe what the pages *send*; this describes what a
 * message has to look like to be *accepted*. Without it, a message carrying
 * the wrong shape reaches a handler that assumes the shape, and the failure
 * is a `TypeError` from deep inside the worker rather than a clear message
 * to the page that sent it.
 */
const PAYLOAD_RULES: {
    [K in RequestName]: (payload: unknown) => boolean;
} = {
    "page:analyze": (payload) => hasString(payload, "url"),
    "chapters:list": (payload) => hasString(payload, "url"),
    "download:start": (payload) =>
        hasString(payload, "url") &&
        hasString(payload, "title") &&
        hasArray(payload, "chapters") &&
        (payload as { chapters: unknown[] }).chapters.every(
            (chapter) =>
                typeof chapter === "object" &&
                chapter !== null &&
                hasString(chapter as object, "sourceUrl") &&
                hasString(chapter as object, "title"),
        ),
    "download:cancel": (payload) => hasString(payload, "jobId"),
    "download:progress": (payload) => hasString(payload, "jobId"),
    "download:list": () => true,
    "settings:get": () => true,
    "settings:set": (payload) => hasProperty(payload, "settings"),
    "library:list": () => true,
    "library:delete": (payload) => hasString(payload, "id"),
    "permissions:check": (payload) => hasString(payload, "origin"),
    "permissions:request": (payload) => hasString(payload, "origin"),
    "permissions:list": () => true,
    "permissions:revoke": (payload) => hasString(payload, "origin"),
    "site-selectors:suggest": (payload) => hasString(payload, "url"),
    "site-selectors:test": (payload) =>
        hasString(payload, "url") &&
        hasString(payload, "contentCss") &&
        hasString(payload, "titleCss") &&
        hasString(payload, "removeCss"),
    "site-selectors:save": (payload) =>
        hasString(payload, "hostname") &&
        isValidHostName((payload as { hostname: string }).hostname) &&
        hasString(payload, "contentCss") &&
        hasString(payload, "titleCss") &&
        hasString(payload, "removeCss"),
    "site-selectors:list": () => true,
    "site-selectors:remove": (payload) =>
        hasString(payload, "hostname") &&
        isValidHostName((payload as { hostname: string }).hostname),
};

/**
 * Whether a payload has a string property.
 */
function hasString(value: unknown, key: string): boolean {
    if (typeof value !== "object" || value === null) return false;
    return typeof (value as Record<string, unknown>)[key] === "string";
}

/**
 * Whether a payload has an array property.
 */
function hasArray(value: unknown, key: string): boolean {
    if (typeof value !== "object" || value === null) return false;
    return Array.isArray((value as Record<string, unknown>)[key]);
}

/**
 * Whether a payload has a property at all.
 */
function hasProperty(value: unknown, key: string): boolean {
    if (typeof value !== "object" || value === null) return false;
    return key in (value as Record<string, unknown>);
}

/**
 * Whether a host name names a host.
 *
 * The host name is the key the site selectors are filed under, and it decides
 * which site a set of selectors is applied to. A message carrying a whole URL,
 * a path or a wildcard is not naming a host, and must not be accepted.
 */
function isValidHostName(hostName: string): boolean {
    return validateHostName(hostName) !== null;
}

/**
 * Validate a message's payload for a request.
 *
 * @param type The request's name.
 * @param payload The payload.
 * @returns Whether the payload is acceptable.
 */
export function isValidPayload(type: RequestName, payload: unknown): boolean {
    const rule = PAYLOAD_RULES[type];
    if (!rule) return false;
    return rule(payload);
}
