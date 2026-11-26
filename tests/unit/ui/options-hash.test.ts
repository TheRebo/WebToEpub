/**
 * The options page's address bar.
 *
 * The tab the user is on is part of the URL. That makes the page linkable —
 * "the library is at `options.html#library`" — and it makes the browser's
 * back button walk back through the tabs instead of leaving the page.
 *
 * These tests cover the two ways that could go wrong:
 *
 *  - The URL names a tab the page does not have, and the page shows nothing.
 *  - The page writes the URL in a way that scrolls the page out from under
 *    the user, because the panels have ids.
 */
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TARGET, createHashPort } from "../../../src/ui/pages/options/hash";

describe("the options address bar", () => {
    afterEach(() => {
        window.history.replaceState(null, "", window.location.pathname);
    });

    it("reads the tab the URL names", () => {
        window.history.replaceState(null, "", "#library");

        expect(createHashPort().read()).toBe("library");
    });

    it("falls back to the first tab when the URL names none", () => {
        expect(createHashPort().read()).toBe(DEFAULT_TARGET);
    });

    it("falls back to the first tab when the URL names a tab that does not exist", () => {
        window.history.replaceState(null, "", "#not-a-tab");

        expect(createHashPort().read()).toBe(DEFAULT_TARGET);
    });

    it("writes the tab into the URL", () => {
        const port = createHashPort();

        port.write("site-access");

        expect(window.location.hash).toBe("#site-access");
        expect(port.read()).toBe("site-access");
    });

    it("does not write the same tab twice", () => {
        const port = createHashPort();
        port.write("library");
        const before = window.history.length;

        port.write("library");

        expect(window.history.length).toBe(before);
    });

    it("tells the listener when the URL changes", () => {
        const port = createHashPort();
        let calls = 0;
        port.subscribe(() => {
            calls += 1;
        });

        window.history.replaceState(null, "", "#library");
        window.dispatchEvent(new HashChangeEvent("hashchange"));

        expect(calls).toBe(1);
        expect(port.read()).toBe("library");
    });

    it("tells the listener when the user goes back", () => {
        const port = createHashPort();
        let calls = 0;
        port.subscribe(() => {
            calls += 1;
        });

        window.dispatchEvent(new PopStateEvent("popstate"));

        expect(calls).toBe(1);
    });
});
