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
 * A code with no key here falls back to the worker's message.
 */
const ERROR_MESSAGE_KEYS: Partial<Record<ErrorCode, string>> = {
    NETWORK: "errorNetwork",
    HTTP_STATUS: "errorForbidden",
    RATE_LIMITED: "errorNetwork",
    CHALLENGE: "errorForbidden",
    EMPTY_CONTENT: "errorParse",
    TOO_MANY_CHAPTERS: "errorGeneric",
    STORAGE_FULL: "errorGeneric",
    PARSE_FAILED: "errorParse",
    CANCELLED: "errorCancelled",
    PERMISSION_DENIED: "errorForbidden",
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
    return errorSentence(error.message, error.code, error.url);
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
        return errorSentence(error.message, error.code, error.url);
    }
    if (error instanceof Error && error.message) return error.message;
    return t("errorGeneric");
}

/**
 * A sentence for a failure, in the user's language.
 */
function errorSentence(message: string, code: ErrorCode, url: string | undefined): string {
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
