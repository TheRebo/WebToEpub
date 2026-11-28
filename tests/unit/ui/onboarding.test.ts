/**
 * The onboarding flow.
 *
 * The onboarding used to ignore the settings that were already stored: it
 * started from hardcoded defaults, and it saved those defaults over whatever
 * the user had chosen before. These tests cover the fix — the controls start
 * from the stored values, and the stored values are what is saved.
 */
import { beforeEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-button";
import "../../../src/ui/components/k-skeleton";
import "../../../src/ui/components/k-switch";
import "../../../src/ui/components/k-toast";

import { DEFAULT_SETTINGS, type Settings } from "../../../src/core/storage/settings-store";
import { OnboardingController } from "../../../src/ui/pages/onboarding/controller";

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

/** The stored settings the onboarding has to start from. */
const STORED: Settings = {
    ...DEFAULT_SETTINGS,
    appearance: {
        theme: "dark",
        accent: "ink",
        density: "compact",
        reduceMotion: true,
    },
};

/** Start the onboarding. */
async function startOnboarding(settings: Settings = STORED) {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const { store, updates } = makeStore(settings);
    let closed = false;

    const controller = new OnboardingController({
        root,
        store,
        theme,
        close: () => {
            closed = true;
        },
    });
    await controller.start();

    return { controller, updates, wasClosed: () => closed };
}

/** Go to the appearance step. */
async function goToAppearance(controller: OnboardingController): Promise<void> {
    for (let index = 0; index < 2; index += 1) {
        controller.elements.next.dispatchEvent(
            new CustomEvent("k-click", { bubbles: true, composed: true }),
        );
        await Promise.resolve();
    }
}

/** The checked radio of a choice, by the choice's id. */
function checkedValue(stage: HTMLElement, id: string): string | undefined {
    const input = stage.querySelector<HTMLInputElement>(`input[name="onboarding-${id}"]:checked`);
    return input?.value;
}

describe("the onboarding", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("starts from the stored appearance", async () => {
        const { controller } = await startOnboarding();

        expect(controller.appearance.theme).toBe("dark");
        expect(controller.appearance.accent).toBe("ink");
        expect(controller.appearance.density).toBe("compact");
        expect(controller.appearance.reduceMotion).toBe(true);
    });

    it("shows the stored values in its controls", async () => {
        const { controller } = await startOnboarding();
        await goToAppearance(controller);

        const stage = controller.elements.stage;
        expect(checkedValue(stage, "theme")).toBe("dark");
        expect(checkedValue(stage, "accent")).toBe("ink");
        expect(checkedValue(stage, "density")).toBe("compact");

        const toggle = stage.querySelector("k-switch");
        expect(toggle?.hasAttribute("checked")).toBe(true);
    });

    it("saves the stored values when the user proceeds without changing anything", async () => {
        const { controller, updates } = await startOnboarding();
        await goToAppearance(controller);

        controller.elements.next.dispatchEvent(
            new CustomEvent("k-click", { bubbles: true, composed: true }),
        );
        await Promise.resolve();
        await Promise.resolve();

        const update = updates.at(-1);
        expect(update?.appearance?.theme).toBe("dark");
        expect(update?.appearance?.accent).toBe("ink");
        expect(update?.appearance?.density).toBe("compact");
        expect(update?.appearance?.reduceMotion).toBe(true);
        expect(update?.onboardingComplete).toBe(true);
    });

    it("saves a change the user makes", async () => {
        const { controller, updates } = await startOnboarding();
        await goToAppearance(controller);

        const light = controller.elements.stage.querySelector<HTMLInputElement>(
            'input[name="onboarding-theme"][value="light"]',
        );
        expect(light).toBeDefined();
        light?.click();
        await Promise.resolve();
        await Promise.resolve();

        const update = updates.at(-1);
        expect(update?.appearance?.theme).toBe("light");
        expect(update?.appearance?.density).toBe("compact");
    });

    it("saves the reduce-motion switch", async () => {
        const { controller, updates } = await startOnboarding();
        await goToAppearance(controller);

        const toggle = controller.elements.stage.querySelector("k-switch");
        expect(toggle).not.toBeNull();

        const inner = toggle?.shadowRoot?.querySelector("input") as HTMLInputElement;
        inner.checked = false;
        inner.dispatchEvent(new Event("change", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();

        const update = updates.at(-1);
        expect(update?.appearance?.reduceMotion).toBe(false);
        expect(update?.appearance?.theme).toBe("dark");
    });

    it("leaves the appearance alone when the onboarding is skipped", async () => {
        const { controller, updates } = await startOnboarding();

        controller.elements.skip.dispatchEvent(
            new CustomEvent("k-click", { bubbles: true, composed: true }),
        );
        await Promise.resolve();
        await Promise.resolve();

        const update = updates.at(-1);
        expect(update?.onboardingComplete).toBe(true);
        expect(update?.appearance).toBeUndefined();
    });

    it("gives every choice a label bound to its radio", async () => {
        const { controller } = await startOnboarding();
        await goToAppearance(controller);

        const inputs =
            controller.elements.stage.querySelectorAll<HTMLInputElement>('input[type="radio"]');
        expect(inputs.length).toBeGreaterThan(0);

        for (const input of inputs) {
            const label = controller.elements.stage.querySelector<HTMLLabelElement>(
                `label[for="${input.id}"]`,
            );
            expect(label, `no label for ${input.id}`).not.toBeNull();
            expect(label?.textContent?.trim().length).toBeGreaterThan(0);
        }
    });

    it("names each choice group with a legend", async () => {
        const { controller } = await startOnboarding();
        await goToAppearance(controller);

        const legends = controller.elements.stage.querySelectorAll("legend");
        expect(legends.length).toBeGreaterThan(0);
        for (const legend of legends) {
            expect(legend.textContent?.trim().length).toBeGreaterThan(0);
        }
    });

    it("selects the option when its label is clicked", async () => {
        const { controller } = await startOnboarding();
        await goToAppearance(controller);

        const stage = controller.elements.stage;
        const label = stage.querySelector<HTMLLabelElement>('label[for="onboarding-theme-dark"]');
        expect(label).not.toBeNull();

        label?.click();

        const dark = stage.querySelector<HTMLInputElement>(
            'input[name="onboarding-theme"][value="dark"]',
        );
        expect(dark?.checked).toBe(true);
    });

    it("shows the preview at the stored density and motion preference", async () => {
        const { controller } = await startOnboarding();
        await goToAppearance(controller);

        const preview = controller.elements.stage.querySelector<HTMLElement>(".onboarding-preview");
        expect(preview).not.toBeNull();
        expect(preview?.dataset["density"]).toBe("compact");
        expect(preview?.dataset["reduceMotion"]).toBe("true");
    });

    it("follows the density and motion preference when the user changes them", async () => {
        const { controller } = await startOnboarding();
        await goToAppearance(controller);

        const comfortable = controller.elements.stage.querySelector<HTMLInputElement>(
            'input[name="onboarding-density"][value="comfortable"]',
        );
        comfortable?.click();
        await Promise.resolve();

        const preview = controller.elements.stage.querySelector<HTMLElement>(".onboarding-preview");
        expect(preview?.dataset["density"]).toBe("comfortable");
        expect(preview?.dataset["reduceMotion"]).toBe("true");
    });

    it("shows an error state when the settings cannot be read", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);

        const controller = new OnboardingController({
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
            close: () => {},
        });
        await controller.start();

        expect(controller.elements.status.hidden).toBe(false);
        expect(controller.elements.status.textContent).toContain("The store is unavailable");
        expect(controller.elements.status.getAttribute("role")).toBe("alert");
    });

    it("does not save anything before the settings have been read", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);

        const updates: Array<Partial<Settings>> = [];
        const controller = new OnboardingController({
            root,
            store: {
                async get(): Promise<Settings> {
                    throw new Error("The store is unavailable");
                },
                async update(partial: Partial<Settings>): Promise<Settings> {
                    updates.push(partial);
                    return DEFAULT_SETTINGS;
                },
            },
            theme,
            close: () => {},
        });
        await controller.start();

        controller.elements.next.dispatchEvent(
            new CustomEvent("k-click", { bubbles: true, composed: true }),
        );
        await Promise.resolve();

        expect(updates).toHaveLength(0);
    });
});
