/**
 * The options page's navigation.
 *
 * The navigation is a tab list: it has one panel per group, and choosing a
 * group shows that group's panel and hides the rest. These tests cover the two
 * defects that made it decorative:
 *
 *  - Bug 9: the nav moved `aria-current` but every group stayed visible.
 *  - Bug 10: the nav was rebuilt on every render, so the button the user had
 *    just pressed was removed from the DOM and the focus fell back to `<body>`.
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
async function startPage(): Promise<OptionsController> {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const controller = new OptionsController({
        root,
        store: makeStore().store,
        theme,
    });
    await controller.start();
    return controller;
}

/** Press a key on an element. */
function press(element: HTMLElement, key: string): void {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("the options navigation", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("shows only the selected group's panel", async () => {
        const controller = await startPage();
        const { sections } = controller.elements;

        expect(sections.get("appearance")?.hidden).toBe(false);
        expect(sections.get("story")?.hidden).toBe(true);
        expect(sections.get("epub")?.hidden).toBe(true);
        expect(sections.get("privacy")?.hidden).toBe(true);
    });

    it("shows only the selected group's rows", async () => {
        const controller = await startPage();
        const { rows } = controller.elements;

        expect(rows.get("appearance.theme")?.hidden).toBe(false);
        expect(rows.get("story.filenameTemplate")?.hidden).toBe(true);
        expect(rows.get("privacy.sendStoryUrl")?.hidden).toBe(true);
    });

    it("shows the chosen group's panel when the nav is used", async () => {
        const controller = await startPage();
        const button = controller.elements.navButtons.get("story");
        expect(button).toBeDefined();

        button?.click();

        expect(controller.active).toBe("story");
        expect(controller.elements.sections.get("story")?.hidden).toBe(false);
        expect(controller.elements.sections.get("appearance")?.hidden).toBe(true);
        expect(controller.elements.rows.get("story.filenameTemplate")?.hidden).toBe(false);
        expect(controller.elements.rows.get("appearance.theme")?.hidden).toBe(true);
    });

    it("marks the selected tab, and only that one", async () => {
        const controller = await startPage();
        const buttons = controller.elements.navButtons;

        expect(buttons.get("appearance")?.getAttribute("aria-selected")).toBe("true");
        expect(buttons.get("appearance")?.getAttribute("aria-current")).toBe("true");
        expect(buttons.get("story")?.getAttribute("aria-selected")).toBe("false");
        expect(buttons.get("story")?.hasAttribute("aria-current")).toBe(false);

        buttons.get("privacy")?.click();

        expect(buttons.get("privacy")?.getAttribute("aria-selected")).toBe("true");
        expect(buttons.get("privacy")?.getAttribute("aria-current")).toBe("true");
        expect(buttons.get("appearance")?.getAttribute("aria-selected")).toBe("false");
        expect(buttons.get("appearance")?.hasAttribute("aria-current")).toBe(false);
    });

    it("keeps the focus on the button the user pressed", async () => {
        const controller = await startPage();
        const button = controller.elements.navButtons.get("story");
        expect(button).toBeDefined();

        button?.focus();
        button?.click();

        expect(document.activeElement).toBe(button);
    });

    it("does not replace the nav buttons when the page re-renders", async () => {
        const controller = await startPage();
        const button = controller.elements.navButtons.get("appearance");
        const before = button;

        controller.elements.navButtons.get("story")?.click();

        expect(controller.elements.navButtons.get("appearance")).toBe(before);
    });

    it("moves the selection with the arrow keys", async () => {
        const controller = await startPage();
        const buttons = controller.elements.navButtons;

        const first = buttons.get("appearance");
        first?.focus();
        press(first as HTMLElement, "ArrowDown");

        expect(controller.active).toBe("story");
        expect(document.activeElement).toBe(buttons.get("story"));

        press(buttons.get("story") as HTMLElement, "ArrowUp");

        expect(controller.active).toBe("appearance");
        expect(document.activeElement).toBe(first);
    });

    it("jumps to the ends with Home and End", async () => {
        const controller = await startPage();
        const buttons = controller.elements.navButtons;

        const first = buttons.get("appearance");
        first?.focus();
        press(first as HTMLElement, "End");

        const last = [...buttons.values()].at(-1);
        expect(controller.active).toBe(last?.dataset["group"]);
        expect(document.activeElement).toBe(last);

        press(last as HTMLElement, "Home");

        expect(controller.active).toBe("appearance");
        expect(document.activeElement).toBe(first);
    });

    it("clears the search when the user picks a group", async () => {
        const controller = await startPage();

        controller.elements.search.value = "privacy";
        controller.elements.search.dispatchEvent(new Event("input", { bubbles: true }));
        expect(controller.active).toBe("privacy");

        controller.elements.navButtons.get("appearance")?.click();

        expect(controller.elements.search.value).toBe("");
        expect(controller.active).toBe("appearance");
        expect(controller.elements.rows.get("appearance.theme")?.hidden).toBe(false);
    });

    it("shows the library and the site selectors as peers of the groups", async () => {
        const controller = await startPage();
        const buttons = controller.elements.navButtons;

        buttons.get("library")?.click();

        expect(controller.active).toBe("library");
        expect(controller.elements.content.hidden).toBe(true);
        expect(controller.elements.library.hidden).toBe(false);
        expect(controller.elements.sections.get("appearance")?.hidden).toBe(true);
    });
});
