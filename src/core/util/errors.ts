/**
 * The error model.
 *
 * Every failure that crosses a boundary — from the worker to the page, from
 * the fetcher to the packer — is expressed as a `UserFacingError`: a
 * sentence a user can act on, a machine-readable code, and an optional list
 * of actions the UI may offer.
 *
 * The mapping from a technical failure to a `UserFacingError` is a single
 * pure function, so it is exhaustively testable and the UI never has to
 * interpret an exception.
 */
import { redactUrl } from "./url";

/** The machine-readable causes. */
export type ErrorCode =
    | "NETWORK"
    | "HTTP_STATUS"
    | "RATE_LIMITED"
    | "CHALLENGE"
    | "EMPTY_CONTENT"
    | "TOO_MANY_CHAPTERS"
    | "STORAGE_FULL"
    | "PARSE_FAILED"
    | "UNSUPPORTED"
    | "UNSUPPORTED_CONTENT"
    | "CANCELLED"
    | "PERMISSION_DENIED"
    | "UNKNOWN";

/** An action the UI may offer in response to an error. */
export interface ErrorAction {
    /** A stable identifier, so the UI can dispatch on it. */
    id: "retry" | "skip" | "cancel" | "open-url" | "raise-limit" | "use-builder" | "grant-access";
    /** The button label. */
    label: string;
}

/** A failure, as it crosses a boundary. */
export interface UserFacingError {
    /** A sentence a user can act on. Never a stack trace. */
    message: string;
    /** The machine-readable cause. */
    code: ErrorCode;
    /** The URL involved, when relevant. */
    url?: string;
    /** The actions the UI may offer. */
    actions?: ErrorAction[];
    /** Technical detail, shown only behind a disclosure. */
    detail?: string;
}

/** The technical detail behind a `UserFacingError`. */
export interface ErrorContext {
    /** The URL that failed, if there was one. */
    url?: string;
    /** The HTTP status, if the failure was an HTTP one. */
    status?: number;
    /** How many attempts were made. */
    attempts?: number;
    /** The original error, for the technical detail. */
    cause?: unknown;
    /** Whether the site asked the user to verify themselves. */
    challenge?: boolean;
    /** The chapter index, when the failure was chapter-specific. */
    chapterIndex?: number;
    /** The machine-readable cause, when the failure already knows it. */
    code?: ErrorCode;
    /** The media type the server sent, when it was the wrong one. */
    mediaType?: string;
}

/** The host part of a URL, for a message that mentions the site. */
function hostOf(url: string | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}

/**
 * A URL with its query string and fragment removed.
 *
 * The implementation lives in `util/url.ts`, because the rule — a query string
 * is a secret — has to be the same everywhere a URL is shown: in an error, in
 * a log, and in an exported book.
 */
export { redactUrl } from "./url";

/** A sentence describing the failure, with the site named where possible. */
function describe(context: ErrorContext): {
    message: string;
    code: ErrorCode;
    actions?: ErrorAction[];
} {
    const host = hostOf(context.url);

    if (context.challenge) {
        return {
            message: host
                ? `${host} is asking the browser to verify you before it will show the chapter.`
                : "This site is asking the browser to verify you before it will show the chapter.",
            code: "CHALLENGE",
            actions: [
                { id: "open-url", label: "Open the page" },
                { id: "retry", label: "Retry" },
            ],
        };
    }

    if (context.code === "PERMISSION_DENIED") {
        return {
            message: host
                ? `The extension is not allowed to read ${host}. Grant it access and try again.`
                : "The extension is not allowed to read that site.",
            code: "PERMISSION_DENIED",
            actions: [
                { id: "grant-access", label: "Grant access" },
                { id: "cancel", label: "Cancel" },
            ],
        };
    }

    if (context.code === "UNSUPPORTED_CONTENT") {
        const sent = describeMediaType(context.mediaType);
        return {
            message: host
                ? `${host} sent ${sent} instead of a page.`
                : `The site sent ${sent} instead of a page.`,
            code: "UNSUPPORTED_CONTENT",
            actions: [
                { id: "open-url", label: "Open the page" },
                { id: "retry", label: "Retry" },
            ],
        };
    }

    if (context.status === 429) {
        return {
            message: host
                ? `${host} is rate limiting requests. Wait a moment and try again.`
                : "The site is rate limiting requests. Wait a moment and try again.",
            code: "RATE_LIMITED",
            actions: [
                { id: "retry", label: "Retry later" },
                { id: "cancel", label: "Cancel" },
            ],
        };
    }

    if (context.status !== undefined && context.status >= 400) {
        const attempts =
            context.attempts && context.attempts > 1 ? ` after ${context.attempts} tries` : "";
        return {
            message: host
                ? `${host} returned ${context.status}${attempts}.`
                : `The server returned ${context.status}${attempts}.`,
            code: "HTTP_STATUS",
            actions: [
                { id: "skip", label: "Skip this chapter" },
                { id: "retry", label: "Retry" },
            ],
        };
    }

    if (context.status !== undefined) {
        return {
            message: `The server returned ${context.status}.`,
            code: "HTTP_STATUS",
            actions: [{ id: "retry", label: "Retry" }],
        };
    }

    return {
        message: host ? `Could not reach ${host}.` : "Could not reach the site.",
        code: "NETWORK",
        actions: [
            { id: "retry", label: "Retry" },
            { id: "cancel", label: "Cancel" },
        ],
    };
}

/**
 * A friendly name for a media type, so the message reads like a sentence.
 *
 * The user does not know what "application/xhtml+xml" is; they know what a
 * PDF is. Anything unknown keeps its raw name, which is still better than
 * saying nothing.
 */
function describeMediaType(mediaType: string | undefined): string {
    switch (mediaType) {
        case "application/pdf":
            return "a PDF";
        case "text/plain":
            return "plain text";
        case "application/json":
            return "JSON";
        case "image/svg+xml":
            return "an SVG image";
        case "application/zip":
            return "a ZIP archive";
        case "application/xhtml+xml":
        case "text/html":
            return "HTML";
        case "video/mp4":
            return "a video";
        case "audio/mpeg":
            return "audio";
        default:
            return mediaType ? `a ${mediaType} file` : "something that is not a page";
    }
}

/**
 * The facts a failure carries about itself.
 *
 * The network layer knows the status the server answered with, how many
 * attempts were made, and whether the site asked the user to prove they were
 * human. It puts all three on the error it throws. Without reading them here,
 * every server failure would be reported as "could not reach the site" — which
 * is wrong advice for a rate limit, a missing chapter, or a challenge.
 *
 * The error is read by shape rather than by type, so that this layer does not
 * have to know about the network layer — the rule is about what an error
 * *may* carry, not about where it came from.
 */
function failureFacts(error: unknown): {
    status?: number;
    attempts?: number;
    challenge?: boolean;
    code?: ErrorCode;
    mediaType?: string;
} {
    if (!error || typeof error !== "object") return {};
    const candidate = error as {
        status?: unknown;
        attempts?: unknown;
        isChallenge?: unknown;
        code?: unknown;
        mediaType?: unknown;
    };
    const facts: {
        status?: number;
        attempts?: number;
        challenge?: boolean;
        code?: ErrorCode;
        mediaType?: string;
    } = {};

    // A status of zero means the request never reached a server, so it is a
    // transport failure rather than an answer from one.
    if (typeof candidate.status === "number" && candidate.status > 0) {
        facts.status = candidate.status;
    }
    if (typeof candidate.attempts === "number" && candidate.attempts > 0) {
        facts.attempts = candidate.attempts;
    }
    if (candidate.isChallenge === true) facts.challenge = true;
    if (typeof candidate.code === "string") facts.code = candidate.code as ErrorCode;
    if (typeof candidate.mediaType === "string" && candidate.mediaType) {
        facts.mediaType = candidate.mediaType;
    }
    return facts;
}

/**
 * Turn any thrown value into a `UserFacingError`.
 *
 * This is the only place in the extension that inspects an exception, which
 * is what keeps stack traces out of the UI.
 */
export function toUserFacingError(error: unknown, context: ErrorContext = {}): UserFacingError {
    // A cancelled fetch is not a failure; it is a decision the user made.
    if (isAbortError(error)) {
        return { message: "Download cancelled.", code: "CANCELLED" };
    }

    if (error instanceof UserFacingErrorError) {
        return error.toUserFacingError();
    }

    if (error instanceof Error && error.name === "QuotaExceededError") {
        return {
            message: "There is not enough space to save this book.",
            code: "STORAGE_FULL",
            detail: error.message,
        };
    }

    // What the failure knows about itself fills in what the caller did not
    // say. The caller always wins: it is the one that knows which URL the
    // user was actually trying to reach.
    const facts = failureFacts(error);
    const described = describe({
        ...context,
        status: context.status ?? facts.status,
        attempts: context.attempts ?? facts.attempts,
        challenge: context.challenge ?? facts.challenge,
        code: context.code ?? facts.code,
        mediaType: context.mediaType ?? facts.mediaType,
    });
    const result: UserFacingError = {
        message: described.message,
        code: described.code,
    };
    // The URL is redacted: its query string can carry a session token, and the
    // error travels over the message bus to the extension's own pages.
    const safeUrl = redactUrl(context.url);
    if (safeUrl) result.url = safeUrl;
    if (described.actions) result.actions = described.actions;
    if (error instanceof Error && error.message) {
        result.detail = `${error.name}: ${error.message}`;
    } else if (error !== undefined && error !== null) {
        result.detail = String(error);
    }
    return result;
}

/** True when the error is an abort, from a cancelled fetch. */
export function isAbortError(error: unknown): boolean {
    if (error instanceof DOMException && error.name === "AbortError") return true;
    if (error instanceof Error && error.name === "AbortError") return true;
    return false;
}

/**
 * An error that already knows how to describe itself.
 *
 * Used by the layers that understand the domain — the EPUB packer, the
 * parser — so they can raise an error with the exact wording the user
 * should see.
 */
export class UserFacingErrorError extends Error {
    readonly code: ErrorCode;
    readonly actions?: ErrorAction[];
    readonly url?: string;

    constructor(
        message: string,
        code: ErrorCode = "UNKNOWN",
        actions?: ErrorAction[],
        url?: string,
    ) {
        super(message);
        this.name = "UserFacingErrorError";
        this.code = code;
        if (actions) this.actions = actions;
        if (url) this.url = url;
    }

    toUserFacingError(): UserFacingError {
        const result: UserFacingError = { message: this.message, code: this.code };
        if (this.actions) result.actions = this.actions;
        const safeUrl = redactUrl(this.url);
        if (safeUrl) result.url = safeUrl;
        return result;
    }
}

/** Raise a `UserFacingErrorError`. */
export function userError(
    message: string,
    code: ErrorCode = "UNKNOWN",
    actions?: ErrorAction[],
    url?: string,
): never {
    throw new UserFacingErrorError(message, code, actions, url);
}

/** The message for an empty chapter. */
export function emptyContentError(url?: string): UserFacingErrorError {
    return new UserFacingErrorError(
        "The chapter came back empty. The site may have changed, or the chapter may be locked.",
        "EMPTY_CONTENT",
        [
            { id: "skip", label: "Skip this chapter" },
            { id: "retry", label: "Retry" },
        ],
        url,
    );
}
