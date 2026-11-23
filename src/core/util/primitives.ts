/**
 * Small, dependency-free helpers shared across the extension.
 *
 * Everything here is pure and side-effect free unless stated otherwise, so
 * it can be unit tested without a DOM.
 */

/** A value that may be absent. */
export type Maybe<T> = T | null | undefined;

/**
 * Narrow a value to a string, returning `null` for anything else.
 *
 * Used at every boundary where untrusted data (page content, storage values)
 * enters typed code.
 */
export function asString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

/** Narrow a value to a finite number, returning `null` for anything else. */
export function asNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Narrow a value to a boolean, returning `null` for anything else. */
export function asBoolean(value: unknown): boolean | null {
    return typeof value === "boolean" ? value : null;
}

/** True when the value is `null`, `undefined`, or an empty string. */
export function isNullOrEmpty(value: Maybe<string>): boolean {
    return value === null || value === undefined || value.length === 0;
}

/** Trim a string, returning `null` if nothing is left. */
export function trimmedOrNull(value: Maybe<string>): string | null {
    if (value === null || value === undefined) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
}

/**
 * Remove characters that are unsafe in a filename on any of the platforms a
 * reader might sync an EPUB to.
 *
 * The reserved-name check covers Windows' `CON`, `PRN`, `AUX`, `NUL`, `COM1`
 * … `COM9`, and `LPT1` … `LPT9`, which fail silently in some tools and
 * loudly in others.
 */
const RESERVED_FILENAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Whether a character is a control character.
 *
 * C0 controls (U+0000–U+001F), the delete character (U+007F), and the C1
 * range (U+0080–U+009F) are all illegal or dangerous in a filename. This is a
 * function rather than a regular expression because `no-control-regex` (rightly)
 * refuses to let control characters live inside a pattern literal, and
 * escaping them does not satisfy the rule.
 */
function isControlCharacter(character: string): boolean {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

export function safeForFileName(title: string, maxLength = 120): string {
    let safe = title
        // Path separators and characters that are illegal on Windows.
        .replace(/[\\/:*?"<>|]/g, "-")
        // Leading and trailing dots and spaces, which Windows silently strips.
        .replace(/^[\s.]+|[\s.]+$/g, "")
        // Collapse runs of whitespace to a single space.
        .replace(/\s+/g, " ")
        .trim();

    // Control characters, removed by code point rather than by pattern.
    safe = [...safe].filter((character) => !isControlCharacter(character)).join("");

    if (safe.length === 0) safe = "untitled";
    if (RESERVED_FILENAMES.test(safe)) safe = `_${safe}`;

    if (safe.length > maxLength) {
        safe = safe.slice(0, maxLength).trim();
        // Truncation can leave a trailing dot or space behind.
        safe = safe.replace(/[\s.]+$/g, "");
    }

    return safe;
}

/**
 * Normalise a URL so two references to the same page compare equal.
 *
 * Strips the protocol, the trailing slash, the fragment, and any tracking
 * parameters, and lowercases the host. Used to decide whether a chapter the
 * user already downloaded is the same chapter the parser just returned.
 */
export function normalizeUrlForCompare(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        // Not a valid URL: fall back to a conservative string comparison.
        return url.trim().toLowerCase();
    }

    const params = new URLSearchParams(parsed.search);
    for (const key of [...params.keys()]) {
        if (/^(utm_|fbclid|gclid|ref|source|spm)/i.test(key)) params.delete(key);
    }

    const path = parsed.pathname.replace(/\/+$/, "");
    const query = params.toString();

    return `${parsed.host.toLowerCase()}${path}${query ? `?${query}` : ""}`;
}

/** Sleep for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clamp a number into a range.
 */
export function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/**
 * Escape a string for literal use inside a regular expression.
 *
 * `RegExp.escape` is not available in every engine the extension must run
 * in, so this is a conservative implementation that escapes every character
 * that could carry meaning.
 */
export function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile a user-supplied regular expression safely.
 *
 * Returns `null` rather than throwing, so the UI can show the error inline
 * instead of crashing. The pattern is length-capped to bound the cost of a
 * pathological expression.
 */
export function compileUserPattern(pattern: string, maxLength = 200): RegExp | null {
    if (pattern.length > maxLength) return null;
    try {
        return new RegExp(pattern, "i");
    } catch {
        return null;
    }
}

/**
 * Run a function and return a result that is either a value or an error.
 *
 * Used at boundaries where a thrown exception would otherwise unwind through
 * a message handler with no useful context.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export function attempt<T>(fn: () => T): Result<T> {
    try {
        return { ok: true, value: fn() };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error)),
        };
    }
}

/**
 * A promise that resolves after `ms`, and can be cancelled.
 */
export class Delay {
    #timer: ReturnType<typeof setTimeout> | undefined;
    #resolve: (() => void) | undefined;

    /** Wait for the given duration. */
    wait(ms: number): Promise<void> {
        return new Promise((resolve) => {
            this.#timer = setTimeout(() => {
                this.#timer = undefined;
                resolve();
            }, ms);
            this.#resolve = resolve;
        });
    }

    /** Cancel a pending wait, resolving it immediately. */
    cancel(): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
            this.#timer = undefined;
            this.#resolve?.();
            this.#resolve = undefined;
        }
    }
}

/**
 * Format a byte count for display.
 *
 * Uses binary units, because that is what operating systems report.
 */
export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/**
 * Format a duration for display.
 */
export function formatDuration(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
    const seconds = Math.round(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}
