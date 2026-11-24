/**
 * The options page's re-rendering.
 *
 * The page used to rebuild its whole content subtree on every render, which
 * threw away whatever the user was halfway through typing and moved the focus
 * back to the top of the document. These tests cover the fix: the page is
 * built once and then only updated.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-button";
import "../../../src/ui/components/k-field";
import "../../../src/ui/components/k-radio-group";
import "../../../src/ui/components/k-skeleton";
import "../../../src/ui/components/k-switch";
import "../../../src/ui/components/k-toast";

import { DEFAULT_SETTINGS, type Settings } from "../../../src/core/storage/settings-store";
import { OptionsController } from "../../../src/ui/pages/options/controller";

/** A store that keeps the settings in memory. */
function makeStore(settings: Settings = DEFAULT_SETTINGS) {
    let current = settings;
    const updates: Array<Partial<Settings>> = [];

    return {
        updates,
        store: {
            async get(): Promise<Settings> {
                return current;
            },
            async update(partial: Partial<Settings>): Promise<Settings> {
                updates.push(partial);
                current = {
                    ...current,
                    ...partial,
                    appearance: { ...current.appearance, ...(partial.appearance ?? {}) },
                } as Settings;
                return current;
            },
        },
    };
}

/** A theme controller that does nothing. */
const theme = {
    start(): void {},
    applySettings(): void {},
};

/** Start an options page. */
async function startPage() {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const { store, updates } = makeStore();
    const controller = new OptionsController({ root, store, theme });
    await controller.start();
    return { controller, updates };
}

/** The inner input of a field. */
function inputOf(field: Element): HTMLInputElement {
    const input = field.shadowRoot?.querySelector("input");
    if (!input) throw new Error("The field has no input");
    return input;
}

/** Type into a field, as a user would. */
function type(field: Element, value: string): HTMLInputElement {
    const input = inputOf(field);
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return input;
}

describe("the options page's re-render", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("does not replace the content subtree when the nav is used", async () => {
        const { controller } = await startPage();
        const before = controller.elements.content;

        controller.elements.navButtons.get("story")?.click();

        expect(controller.elements.content).toBe(before);
        expect(controller.elements.content.children.length).toBeGreaterThan(0);
    });

    it("keeps the control it already built", async () => {
        const { controller } = await startPage();
        const field = controller.elements.controls.get("story.filenameTemplate");
        expect(field).toBeDefined();

        controller.elements.navButtons.get("story")?.click();

        expect(controller.elements.controls.get("story.filenameTemplate")).toBe(field);
    });

    it("keeps the value the user has typed when the search re-renders the page", async () => {
        const { controller } = await startPage();
        controller.elements.navButtons.get("story")?.click();

        const field = controller.elements.controls.get("story.filenameTemplate");
        expect(field).toBeDefined();

        type(field as Element, "{title} - {chapter}");
        expect(inputOf(field as Element).value).toBe("{title} - {chapter}");

        // A keystroke in the search box re-renders the page.
        controller.elements.search.value = "optionsStory";
        controller.elements.search.dispatchEvent(new Event("input", { bubbles: true }));

        expect(inputOf(field as Element).value).toBe("{title} - {chapter}");
    });

    it("keeps the focus and the caret in the field the user is editing", async () => {
        const { controller } = await startPage();
        controller.elements.navButtons.get("story")?.click();

        const field = controller.elements.controls.get("story.filenameTemplate") as Element;
        const input = type(field, "hello world");
        input.focus();
        input.setSelectionRange(2, 7);

        expect(document.activeElement).toBe(field);

        controller.elements.search.value = "optionsStory";
        controller.elements.search.dispatchEvent(new Event("input", { bubbles: true }));

        expect(document.activeElement).toBe(field);
        expect(input.selectionStart).toBe(2);
        expect(input.selectionEnd).toBe(7);
        expect(input.value).toBe("hello world");
    });

    it("keeps the value even when the search hides the field's group", async () => {
        const { controller } = await startPage();
        controller.elements.navButtons.get("story")?.click();

        const field = controller.elements.controls.get("story.filenameTemplate") as Element;
        type(field, "kept");

        controller.elements.search.value = "privacy";
        controller.elements.search.dispatchEvent(new Event("input", { bubbles: true }));

        expect(inputOf(field).value).toBe("kept");
    });

    it("writes a typed value through to the store", async () => {
        const { controller, updates } = await startPage();
        controller.elements.navButtons.get("story")?.click();

        const field = controller.elements.controls.get("story.filenameTemplate") as Element;
        type(field, "{title} - {chapter}");

        await Promise.resolve();
        await Promise.resolve();

        const update = updates.find((partial) => partial.story !== undefined);
        expect(update?.story?.filenameTemplate).toBe("{title} - {chapter}");
    });

    it("writes a switch through to the store", async () => {
        const { controller, updates } = await startPage();

        const toggle = controller.elements.controls.get("appearance.reduceMotion") as Element;
        const inner = toggle.shadowRoot?.querySelector("input") as HTMLInputElement;
        inner.checked = true;
        inner.dispatchEvent(new Event("change", { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();

        const update = updates.find((partial) => partial.appearance !== undefined);
        expect(update?.appearance?.reduceMotion).toBe(true);
    });

    it("writes a segmented choice through to the store", async () => {
        const { controller, updates } = await startPage();

        // The theme row is a wrapper around a labelled field and the choice.
        const row = controller.elements.controls.get("appearance.theme") as Element;
        const group = row.querySelector("k-radio-group") as Element;
        const options = group.shadowRoot?.querySelectorAll("input[type=radio]");
        const dark = options?.[1] as HTMLInputElement;
        expect(dark).toBeDefined();
        dark.checked = true;
        dark.dispatchEvent(new Event("change", { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();

        const update = updates.find((partial) => partial.appearance !== undefined);
        expect(update?.appearance?.theme).toBe("dark");
    });

    it("writes a select through to the store", async () => {
        const { controller, updates } = await startPage();
        controller.elements.navButtons.get("epub")?.click();

        const field = controller.elements.controls.get("epub.version") as Element;
        const select = field.shadowRoot?.querySelector("select") as HTMLSelectElement;
        select.value = "2";
        select.dispatchEvent(new Event("change", { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();

        const update = updates.find((partial) => partial.epub !== undefined);
        expect(update?.epub?.version).toBe(2);
    });

    it("names each segmented choice without pointing at a shadow-DOM id", async () => {
        const { controller } = await startPage();

        for (const path of ["appearance.theme", "appearance.accent", "appearance.density"]) {
            const row = controller.elements.controls.get(path) as Element;
            const choice = row.querySelector("k-radio-group") as Element;
            expect(choice).not.toBeNull();

            // `aria-labelledby` would have to point at the label inside the
            // field's shadow root, where it cannot be resolved.
            expect(choice.getAttribute("aria-labelledby")).toBeNull();
            expect(choice.getAttribute("aria-label")).toBeTruthy();

            // The group names itself inside its own shadow root.
            const legend = choice.shadowRoot?.querySelector("legend");
            expect(legend?.textContent?.trim().length).toBeGreaterThan(0);
        }
    });

    it("shows a loading state while the settings are being read", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);

        let release: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });

        const controller = new OptionsController({
            root,
            store: {
                async get(): Promise<Settings> {
                    await gate;
                    return DEFAULT_SETTINGS;
                },
                async update(partial: Partial<Settings>): Promise<Settings> {
                    return { ...DEFAULT_SETTINGS, ...partial } as Settings;
                },
            },
            theme,
        });

        const started = controller.start();
        await Promise.resolve();

        expect(controller.elements.status.hidden).toBe(false);
        expect(controller.elements.status.getAttribute("aria-busy")).toBe("true");
        expect(controller.elements.status.textContent).not.toBe("");

        release?.();
        await started;

        expect(controller.elements.status.hidden).toBe(true);
        expect(controller.elements.status.hasAttribute("role")).toBe(false);
    });

    it("shows an error state when the settings cannot be read", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);

        const controller = new OptionsController({
            root,
            store: {
                async get(): Promise<Settings> {
                    throw new Error("The store is unavailable");
                },
                async update(): Promise<Settings> {
                    return DEFAULT_SETTINGS;
                },
            },
            theme,
        });
        await controller.start();

        expect(controller.elements.status.hidden).toBe(false);
        expect(controller.elements.status.getAttribute("role")).toBe("alert");
        expect(controller.elements.status.textContent).toContain("The store is unavailable");
    });

    it("shows an empty state when the library has nothing in it", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);

        const controller = new OptionsController({
            root,
            store: makeStore().store,
            theme,
            background: {
                async library() {
                    return [];
                },
                async siteSelectors() {
                    return [];
                },
                async forgetSiteSelectors() {},
            },
        });
        await controller.start();

        controller.elements.navButtons.get("library")?.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(controller.elements.library.hidden).toBe(false);
        expect(controller.elements.library.textContent?.trim().length).toBeGreaterThan(0);
    });

    it("shows an error state when there is no background worker to ask", async () => {
        const { controller } = await startPage();

        controller.elements.navButtons.get("library")?.click();
        await Promise.resolve();
        await Promise.resolve();

        expect(controller.elements.library.hidden).toBe(false);
        expect(controller.elements.library.textContent?.trim().length).toBeGreaterThan(0);
    });

    it("writes a number through to the store", async () => {
        const { controller, updates } = await startPage();
        controller.elements.navButtons.get("images")?.click();

        const field = controller.elements.controls.get("images.maxResolution") as Element;
        const input = inputOf(field);
        input.value = "2400";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();

        const update = updates.find((partial) => partial.images !== undefined);
        expect(update?.images?.maxResolution).toBe(2400);
    });
});
