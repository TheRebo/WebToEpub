/**
 * The popup's view.
 *
 * The popup is the extension's front door, and it is the first thing a new
 * user sees. These tests cover the states it can be in, because a half
 * updated popup is worse than no popup: the user has no idea what to do next.
 *
 * The states under test are the ones that used to be missing: `welcome` was
 * never reachable, so nothing told the user the extension had a first-run
 * flow.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-button";

import { setI18nApi } from "../../../src/ui/i18n";
import en from "../../../src/_locales/en/messages.json";
import {
    buildPopup,
    renderPopup,
    type PopupElements,
    type PopupViewState,
} from "../../../src/ui/pages/popup/view";

/** A locale entry, as the catalogue stores it. */
interface LocaleEntry {
    message: string;
    placeholders?: Record<string, { content: string }>;
}

/**
 * A stand-in for `browser.i18n`.
 *
 * It reads the real English catalogue and interpolates the placeholders the
 * way the browser's API does, so the tests prove that a message with a
 * placeholder — such as the unsupported-host message — really does reach the
 * user with the host name in it.
 *
 * @param overrides Messages to answer with something else, so that a test can
 *   tell a translated string from a hard-coded English one.
 */
function stubI18n(overrides: Record<string, string> = {}): void {
    setI18nApi({
        getMessage(key, substitutions) {
            const entry = (en as Record<string, LocaleEntry | undefined>)[key];
            const override = overrides[key];
            if (!entry && override === undefined) return "";
            const values = substitutions === undefined ? [] : [substitutions].flat().map(String);
            let text = override ?? entry?.message ?? "";
            for (const [name, placeholder] of Object.entries(entry?.placeholders ?? {})) {
                const index = Number(placeholder.content.replace("$", "")) - 1;
                const value = values[index];
                if (value !== undefined) {
                    text = text.replaceAll(`$${name.toUpperCase()}$`, value);
                }
            }
            return text;
        },
    });
}

/** A view state, with the defaults. */
function makeState(change: Partial<PopupViewState> = {}): PopupViewState {
    return {
        state: "loading",
        title: "",
        author: "",
        coverUrl: "",
        chapterCount: 0,
        hostName: "",
        accessHost: "",
        error: "",
        phase: "",
        done: 0,
        total: 0,
        percent: 0,
        ...change,
    };
}

/** Build the popup and render a state into it. */
function render(change: Partial<PopupViewState> = {}): {
    elements: PopupElements;
    state: PopupViewState;
} {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const elements = buildPopup(root);
    const state = makeState(change);
    renderPopup(elements, state);
    return { elements, state };
}

/** The primary button. */
function primary(elements: PopupElements): HTMLElement {
    return elements.primary;
}

describe("the popup's view", () => {
    beforeEach(() => {
        document.body.replaceChildren();
        stubI18n();
    });

    it("shows the welcome state on a first run", () => {
        const { elements } = render({ state: "welcome" });

        expect(elements.root.dataset["state"]).toBe("welcome");
        expect(elements.empty.hidden).toBe(false);
        expect(elements.card.hidden).toBe(true);
        expect(primary(elements).hidden).toBe(false);
        expect(primary(elements).dataset["action"]).toBe("onboarding");
        expect(primary(elements).textContent?.trim().length).toBeGreaterThan(0);
    });

    it("hides the library button in the welcome state", () => {
        const { elements } = render({ state: "welcome" });

        const library = elements.actions.querySelector<HTMLElement>('[data-action="library"]');
        expect(library?.hidden).toBe(true);
    });

    it("offers the workbench in the welcome state", () => {
        const { elements } = render({ state: "welcome" });

        const workbench = elements.actions.querySelector<HTMLElement>('[data-action="workbench"]');
        expect(workbench?.hidden).toBe(false);
    });

    it("shows the story card for a story", () => {
        const { elements } = render({
            state: "story",
            title: "A Long Title",
            author: "An Author",
            chapterCount: 12,
        });

        expect(elements.card.hidden).toBe(false);
        expect(elements.empty.hidden).toBe(true);
        expect(elements.title.textContent).toBe("A Long Title");
        expect(elements.subtitle.textContent).toBe("An Author");
        expect(elements.chapterCount.textContent).toContain("12");
    });

    it("uses the singular for one chapter", () => {
        const { elements } = render({ state: "story", chapterCount: 1 });

        expect(elements.chapterCount.textContent).toContain("1");
        expect(elements.chapterCount.textContent).not.toContain("chapters");
    });

    it("takes the chapter count from the catalogue, not from English", () => {
        // The popup used to write "chapters" into the page itself, so a user
        // with Firefox in another language saw an English word in an
        // otherwise translated window.
        stubI18n({
            popupChapterCount: "$COUNT$ hoofdstukken",
            popupChapterCountOne: "$COUNT$ hoofdstuk",
        });

        const many = render({ state: "story", chapterCount: 4 });
        expect(many.elements.chapterCount.textContent).toBe("4 hoofdstukken");

        const one = render({ state: "story", chapterCount: 1 });
        expect(one.elements.chapterCount.textContent).toBe("1 hoofdstuk");
    });

    it("hides the cover when there is none", () => {
        const { elements } = render({ state: "story", coverUrl: "" });

        expect(elements.cover.hidden).toBe(true);
        expect(elements.cover.hasAttribute("src")).toBe(false);
    });

    it("shows the cover when there is one", () => {
        const { elements } = render({ state: "story", coverUrl: "https://example.com/c.png" });

        expect(elements.cover.hidden).toBe(false);
        expect(elements.cover.getAttribute("src")).toBe("https://example.com/c.png");
    });

    it("offers a retry when something failed", () => {
        const { elements } = render({ state: "error", error: "Boom" });

        expect(primary(elements).dataset["action"]).toBe("retry");
        expect(primary(elements).textContent?.trim().length).toBeGreaterThan(0);
    });

    it("offers a way in when the host is not supported", () => {
        const { elements } = render({ state: "unsupported", hostName: "example.com" });

        expect(elements.empty.hidden).toBe(false);
        expect(elements.empty.textContent).toContain("example.com");
        expect(primary(elements).dataset["action"]).toBe("primary");
    });

    it("asks for access when the extension may not read the site", () => {
        const { elements } = render({ state: "access", accessHost: "example.com" });

        expect(elements.access.hidden).toBe(false);
        expect(elements.accessHost.textContent).toBe("example.com");
    });

    it("offers one button in the access state, and hides the primary one", () => {
        // The primary button would be a second way of doing the same thing,
        // and a screen reader should not be offered a button that does nothing.
        const { elements } = render({ state: "access", accessHost: "example.com" });

        const grant = elements.access.querySelector<HTMLElement>('[data-action="grant-access"]');
        expect(grant).not.toBeNull();
        expect(grant?.textContent?.trim().length).toBeGreaterThan(0);
        expect(primary(elements).hidden).toBe(true);
    });

    it("hides the access state in every other state", () => {
        const { elements } = render({ state: "story" });
        expect(elements.access.hidden).toBe(true);

        renderPopup(elements, makeState({ state: "error", error: "Boom" }));
        expect(elements.access.hidden).toBe(true);
    });

    it("shows the progress while a download runs", () => {
        const { elements } = render({
            state: "running",
            phase: "Fetching",
            done: 3,
            total: 10,
            percent: 30,
        });

        expect(elements.progress.hidden).toBe(false);
        expect(elements.progressCount.textContent).toBe("3 / 10");
        expect(elements.progressBar.style.getPropertyValue("--k-progress")).toBe("30%");
        expect(primary(elements).hidden).toBe(true);
    });

    it("hides everything while loading", () => {
        const { elements } = render({ state: "loading" });

        expect(elements.card.hidden).toBe(true);
        expect(elements.empty.hidden).toBe(true);
        expect(elements.progress.hidden).toBe(true);
        expect(primary(elements).hidden).toBe(true);
        expect(elements.actions.hidden).toBe(true);
    });

    it("never leaves a stale action on the primary button", () => {
        // The primary button is reused across states, so its action has to be
        // replaced every time — otherwise a "retry" button would open the
        // workbench.
        const { elements } = render({ state: "error" });
        expect(primary(elements).dataset["action"]).toBe("retry");

        renderPopup(elements, makeState({ state: "story" }));
        expect(primary(elements).dataset["action"]).toBe("primary");
    });
});
