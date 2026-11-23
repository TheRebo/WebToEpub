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

    const described = describe(context);
    const result: UserFacingError = {
        message: described.message,
        code: described.code,
    };
    if (context.url) result.url = context.url;
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
        if (this.url) result.url = this.url;
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
