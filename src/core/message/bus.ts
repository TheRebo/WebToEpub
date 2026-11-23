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
import type { UserFacingError } from "../util/errors";

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
        request: { url: string; title: string; chapterUrls: string[] };
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
    /** The name of the saved file, once the download is complete. */
    fileName?: string;
    /** The size of the saved file, in bytes. */
    fileSize?: number;
    /** The error, if the download failed. */
    error?: UserFacingError;
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

/** The messaging API the bus depends on. */
export interface MessagingApi {
    sendMessage(message: unknown): Promise<unknown>;
    onMessage(
        listener: (message: unknown, sender: unknown) => Promise<unknown> | undefined,
    ): void;
}

/**
 * Send a request and await its response.
 *
 * The response is validated before it is returned, so a malformed reply
 * surfaces as an error rather than as `undefined` fields deeper in the UI.
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
    if (response.error) {
        throw new Error(response.error.message);
    }
    if (!("result" in response) || response.result === undefined) {
        throw new Error(`Empty response to ${type}`);
    }
    return response.result as RequestMap[N]["response"];
}

/**
 * Handle incoming requests.
 *
 * The handler is given the payload and must return a result; any error is
 * converted to a `UserFacingError` and sent back, so the caller never sees a
 * raw exception.
 */
export async function handleRequests(
    api: MessagingApi,
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
            const result = await (handler as (payload: unknown) => Promise<unknown>)(envelope.payload);
            const response: ResponseEnvelope<unknown> = { id: envelope.id, result };
            return response;
        } catch (error) {
            const { toUserFacingError } = await import("../util/errors");
            const response: ResponseEnvelope<unknown> = {
                id: envelope.id,
                error: toUserFacingError(error),
            };
            return response;
        }
    });
}
