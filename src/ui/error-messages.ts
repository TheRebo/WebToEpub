/**
 * Turning a failure into a sentence the user can read.
 *
 * The background worker has no locale, so it cannot write a sentence the user
 * can act on. It sends a **code** — `NETWORK`, `RATE_LIMITED` — and the page
 * turns that into a sentence in the user's own language.
 *
 * The worker's own message is kept as a fallback. It names the host that
 * failed, which is useful, and it is only used when there is no translation
 * for the code.
 *
 * See ADR-0010.
 */
import { t, tDynamic } from "./i18n";
import { UserFacingErrorError, type ErrorCode, type UserFacingError } from "../core/util/errors";

/**
 * The message key for each error code.
 *
 * A code with no key here falls back to the worker's message: the one for
 * too many chapters names the count and the limit, which a translation
 * without them would lose.
 */
const ERROR_MESSAGE_KEYS: Partial<Record<ErrorCode, string>> = {
    NETWORK: "errorNetwork",
    HTTP_STATUS: "errorHttpStatus",
    RATE_LIMITED: "errorRateLimited",
    CHALLENGE: "errorChallenge",
    EMPTY_CONTENT: "errorEmptyChapter",
    STORAGE_FULL: "errorStorageFull",
    PARSE_FAILED: "errorParse",
    CANCELLED: "errorCancelled",
    PERMISSION_DENIED: "errorPermission",
    BUSY: "errorBusy",
    UNKNOWN: "errorGeneric",
};

/**
 * A sentence for a failure.
 *
 * @param error The failure, as the worker reported it.
 * @returns A sentence in the user's language.
 */
export function errorMessage(error: UserFacingError | undefined): string {
    if (!error) return "";
    return errorSentence(error.message, error.code, error.url, error.detail);
}

/**
 * A sentence for a caught failure.
 *
 * A failure that came from the worker carries its code, so it is translated
 * like any other. A failure the page raised itself — a bug, say — does not,
 * and its own message is shown, because the generic wording would hide what
 * actually went wrong.
 *
 * @param error The caught value.
 * @returns A sentence in the user's language.
 */
export function caughtErrorMessage(error: unknown): string {
    if (error instanceof UserFacingErrorError) {
        return errorSentence(error.message, error.code, error.url, error.detail);
    }
    if (error instanceof Error && error.message) return error.message;
    return t("errorGeneric");
}

/**
 * A sentence for a failure, in the user's language.
 */
function errorSentence(
    message: string,
    code: ErrorCode,
    url: string | undefined,
    detail: string | undefined,
): string {
    // "Something went wrong" alone leaves the user, and any bug report, with
    // nothing to go on. An unknown failure is a bug, so what the worker knows
    // about it is shown: its detail, or a message more specific than its
    // stock fallback.
    if (code === "UNKNOWN") {
        const specific = detail ?? (message.startsWith("Something went wrong") ? "" : message);
        if (specific) return `${t("errorGeneric")} (${specific})`;
    }
    const key = ERROR_MESSAGE_KEYS[code];
    if (key) {
        // The worker's message names the host, which is worth keeping, so it
        // is appended when it adds something the translation does not say.
        const translated = tDynamic(key);
        const host = hostOf(url);
        if (host && !translated.includes(host)) {
            return `${translated} (${host})`;
        }
        return translated;
    }
    return message;
}

/**
 * The host of a URL, for a message that mentions the site.
 */
function hostOf(url: string | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
}
