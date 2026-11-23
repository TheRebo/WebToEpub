/**
 * CSS selector helpers.
 *
 * These live apart from `util/dom.ts` because they have to work in **both**
 * worlds the extension runs in: an extension page, which has a DOM, and the
 * background worker, which may not.
 *
 * That distinction matters more than it looks. The baseline's `DefaultParser`
 * stored the user's selectors in `localStorage`, which only an extension page
 * has, so the parser ran in the page. The rewrite moved the parsers into the
 * worker (ADR-0005), and the worker is not guaranteed a DOM — Firefox runs
 * MV3 background code as an event page, which has one, but the platform does
 * not promise it, and a strict-CSP build must not depend on it.
 *
 * So the authoritative check here is **syntactic**, and the DOM is used only
 * as a second opinion when one happens to be available.
 */

/**
 * Whether a selector is syntactically plausible.
 *
 * This catches the shapes that are obviously broken — an unbalanced bracket,
 * an unterminated string — without needing a DOM. It is deliberately
 * conservative: it never rejects a selector that a browser would accept, so
 * a false positive cannot lock a user out of a working selector.
 *
 * @param selector The selector to check.
 * @returns Whether the selector's brackets and quotes balance.
 */
export function isSyntacticallyPlausible(selector: string): boolean {
    if (selector.trim() === "") return false;

    let depth = 0;
    let quote: string | undefined;

    for (const character of selector) {
        if (quote !== undefined) {
            if (character === quote) quote = undefined;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === "(" || character === "[") {
            depth += 1;
            continue;
        }
        if (character === ")" || character === "]") {
            depth -= 1;
            if (depth < 0) return false;
        }
    }

    return depth === 0 && quote === undefined;
}

/**
 * Whether a selector can be used.
 *
 * When a DOM is available it is asked to parse the selector, which is the
 * authority. When it is not — the background worker — the syntactic check
 * stands on its own.
 *
 * @param selector The selector to check.
 * @returns Whether the selector is usable.
 */
export function isParsableSelector(selector: string): boolean {
    if (!isSyntacticallyPlausible(selector)) return false;

    if (typeof document === "undefined" || typeof document.createDocumentFragment !== "function") {
        return true;
    }

    try {
        document.createDocumentFragment().querySelector(selector);
        return true;
    } catch {
        return false;
    }
}

/**
 * Escape a string for use in a CSS selector.
 *
 * `CSS.escape` is used when it is available, because it handles every case
 * correctly. The fallback covers the characters that actually turn up in
 * class names.
 *
 * @param value The string to escape.
 * @returns The escaped string.
 */
export function escapeCssIdentifier(value: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}
