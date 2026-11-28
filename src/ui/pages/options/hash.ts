/**
 * The options page's address bar.
 *
 * The tab the user is on is part of the URL, so the page can be linked to
 * ("the library is at `options.html#library`") and the browser's back button
 * walks back through the tabs instead of leaving the page.
 *
 * The URL is written with `history.pushState` rather than by assigning to
 * `location.hash`, because assigning scrolls the page to any element with a
 * matching `id` — and the panels have ids — which would yank the page out from
 * under the user every time they changed tab.
 */
import type { NavTarget } from "./view";

/** The tab the page opens on when the URL names none. */
export const DEFAULT_TARGET: NavTarget = "appearance";

/** Every tab the URL may name. */
const TARGETS: readonly NavTarget[] = [
    "appearance",
    "story",
    "epub",
    "images",
    "behaviour",
    "advanced",
    "library",
    "site-selectors",
    "site-access",
];

/** The options page's address bar. */
export interface HashPort {
    /** The tab the URL names. */
    read(): NavTarget;
    /** Put a tab in the URL. */
    write(target: NavTarget): void;
    /** Call the listener whenever the URL changes. */
    subscribe(listener: () => void): void;
}

/**
 * Build the address bar, over the window's location.
 *
 * @param targets The tabs the URL may name.
 * @returns The address bar.
 */
export function createHashPort(targets: readonly NavTarget[] = TARGETS): HashPort {
    const read = (): NavTarget => {
        const name = window.location.hash.replace(/^#/, "");
        return targets.includes(name as NavTarget) ? (name as NavTarget) : DEFAULT_TARGET;
    };

    return {
        read,
        write(target: NavTarget): void {
            const next = `#${target}`;
            if (window.location.hash === next) return;
            // `pushState` changes the URL without scrolling, and without
            // firing `hashchange` — the controller has already switched tab by
            // the time this is called, so there is nothing to react to.
            window.history.pushState(null, "", next);
        },
        subscribe(listener: () => void): void {
            // `hashchange` covers the user editing the URL by hand;
            // `popstate` covers the back and forward buttons.
            window.addEventListener("hashchange", listener);
            window.addEventListener("popstate", listener);
        },
    };
}
