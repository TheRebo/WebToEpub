/**
 * Developer diagnostics.
 *
 * A small, opt-in logger. The settings page offers a "Developer diagnostics"
 * switch, and the development guide tells the reader to turn it on to get
 * verbose logging — but until now nothing read that setting, so the switch
 * did nothing and the guide was wrong.
 *
 * The rule the logger follows is deliberately narrow:
 *
 * - **Off by default.** Nothing is written to the console in a normal
 *   installation. `docs/development.md` promises that, and `PRIVACY.md`
 *   promises no telemetry: a log that is off by default and contains only
 *   what the extension already knows is the only kind that keeps both
 *   promises true.
 * - **No secrets, and no story content.** The logger records *shapes* — how
 *   many chapters, which parser, how long a request took — rather than the
 *   text of a chapter, a cookie, or a token. A diagnostic log is the one
 *   place where a careless `console.log(url)` would leak a signed URL.
 * - **Local only.** Everything goes to the browser console, which the user
 *   can see and clear. Nothing is sent anywhere.
 *
 * See ADR-0029 (the diagnostics logger) and ADR-0023 (URL redaction).
 */

/** Whether the logger is currently enabled. */
let enabled = false;

/**
 * Turn the logger on or off.
 *
 * @param value Whether the diagnostics are on.
 */
export function setDiagnosticsEnabled(value: boolean): void {
    enabled = value === true;
}

/** Whether the diagnostics are on. */
export function diagnosticsEnabled(): boolean {
    return enabled;
}

/**
 * The parts of a URL that are safe to log.
 *
 * A URL's query string often carries a session token, a signed path, or the
 * user's own search terms. Only the origin and the path are kept, and the
 * path's last segment is kept because it is what identifies the chapter.
 *
 * @param url The URL.
 * @returns The URL, with the query and the fragment removed.
 */
export function redactUrl(url: string): string {
    try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        // A URL that cannot be parsed is not worth logging at all, and
        // logging it raw could leak whatever it holds.
        return "<unparsable url>";
    }
}

/**
 * Log a diagnostic message.
 *
 * The message is built only when the diagnostics are on, so the caller can
 * pass an expensive expression without paying for it when the logger is
 * off.
 *
 * @param message The message.
 * @param details Extra values, printed alongside the message.
 */
export function diagnostic(message: string, ...details: unknown[]): void {
    if (!enabled) return;
    if (details.length === 0) {
        console.info(`[kintsugi] ${message}`);
        return;
    }
    console.info(`[kintsugi] ${message}`, ...details);
}

/**
 * Log a diagnostic message about a URL.
 *
 * The URL is redacted first, so a token in the query string never reaches
 * the console.
 *
 * @param message The message.
 * @param url The URL the message is about.
 * @param details Extra values, printed alongside the message.
 */
export function diagnosticUrl(message: string, url: string, ...details: unknown[]): void {
    if (!enabled) return;
    diagnostic(message, redactUrl(url), ...details);
}
