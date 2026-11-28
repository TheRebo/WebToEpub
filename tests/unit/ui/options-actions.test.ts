/**
 * The options page's actions.
 *
 * Exporting, importing and resetting the settings were promised by the design
 * and by the message catalogue, and none of them was wired to anything: the
 * buttons were not there, and the store's `reset` was never called.
 *
 * These tests cover the three of them, and the two things that matter most
 * about an import: a file that is not a settings file changes nothing, and a
 * file that is one is read as far as it can be.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/ui/components/k-button";
import "../../../src/ui/components/k-dialog";
import "../../../src/ui/components/k-field";
import "../../../src/ui/components/k-radio-group";
import "../../../src/ui/components/k-switch";
import "../../../src/ui/components/k-toast";

import { DEFAULT_SETTINGS, type Settings } from "../../../src/core/storage/settings-store";
import { setNamespace } from "../../../src/core/browser-api";
import { OptionsController } from "../../../src/ui/pages/options/controller";

/** A store that keeps the settings in memory. */
function makeStore(settings: Settings = DEFAULT_SETTINGS) {
    let current = settings;
    const writes: Settings[] = [];
    let resets = 0;

    return {
        writes,
        /** How many times the settings have been reset. */
        resetCount: () => resets,
        store: {
            async get(): Promise<Settings> {
                return current;
            },
            async update(partial: Partial<Settings>): Promise<Settings> {
                current = {
                    ...current,
                    ...partial,
                    appearance: { ...current.appearance, ...(partial.appearance ?? {}) },
                } as Settings;
                return current;
            },
            async set(next: Settings): Promise<Settings> {
                writes.push(next);
                current = next;
                return current;
            },
            async reset(): Promise<Settings> {
                resets += 1;
                current = DEFAULT_SETTINGS;
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
async function startPage(settings: Settings = DEFAULT_SETTINGS) {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const { store, writes, resetCount } = makeStore(settings);
    const controller = new OptionsController({ root, store, theme });
    await controller.start();
    return { controller, writes, resetCount };
}

/** The text of the toasts on the page. */
function toastTexts(controller: OptionsController): string[] {
    return [...controller.elements.toastHost.querySelectorAll("k-toast")].map(
        (toast) => toast.getAttribute("message") ?? "",
    );
}

/** A file holding the given text. */
function makeFile(text: string, name = "settings.json"): File {
    return new File([text], name, { type: "application/json" });
}

describe("the options actions", () => {
    beforeEach(() => {
        document.body.replaceChildren();
        setNamespace(undefined);
        vi.restoreAllMocks();
    });

    it("offers the three actions in the advanced group", async () => {
        const { controller } = await startPage();

        expect(controller.elements.actions.has("export")).toBe(true);
        expect(controller.elements.actions.has("import")).toBe(true);
        expect(controller.elements.actions.has("reset")).toBe(true);
    });

    it("writes the settings to a file when the user exports them", async () => {
        const download = vi.fn().mockResolvedValue(1);
        setNamespace({
            downloads: { download },
        } as unknown as Parameters<typeof setNamespace>[0]);
        vi.stubGlobal("URL", {
            ...URL,
            createObjectURL: () => "blob:settings",
            revokeObjectURL: () => {},
        });

        const { controller } = await startPage();
        controller.elements.actions.get("export")?.click();

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(download).toHaveBeenCalledOnce();
        const options = download.mock.calls[0]?.[0] as { filename: string };
        expect(options.filename).toBe("kintsugi-settings.json");
        expect(toastTexts(controller).join(" ")).not.toHaveLength(0);
    });

    it("loads the settings from a file when the user imports one", async () => {
        const { controller, writes } = await startPage();

        const input = controller.elements.files.get("import");
        expect(input).toBeDefined();

        const file = makeFile(
            JSON.stringify({
                format: "kintsugi-settings",
                version: 1,
                settings: { appearance: { theme: "dark" } },
            }),
        );
        Object.defineProperty(input as HTMLInputElement, "files", { value: [file] });
        input?.dispatchEvent(new Event("change", { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(writes).toHaveLength(1);
        expect(writes[0]?.appearance.theme).toBe("dark");
    });

    it("changes nothing when the imported file is not a settings file", async () => {
        const { controller, writes } = await startPage();

        const input = controller.elements.files.get("import");
        const file = makeFile("this is not a settings file");
        Object.defineProperty(input as HTMLInputElement, "files", { value: [file] });
        input?.dispatchEvent(new Event("change", { bubbles: true }));

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(writes).toHaveLength(0);
    });

    it("asks before it resets the settings", async () => {
        const { controller, resetCount } = await startPage();

        controller.elements.actions.get("reset")?.click();
        expect(controller.elements.resetDialog.hasAttribute("open")).toBe(true);
        expect(resetCount()).toBe(0);

        controller.elements.resetConfirm.dispatchEvent(
            new CustomEvent("k-click", { bubbles: true, composed: true }),
        );

        await Promise.resolve();
        await Promise.resolve();

        expect(resetCount()).toBe(1);
    });

    it("puts the controls back to their defaults after a reset", async () => {
        const dark = {
            ...DEFAULT_SETTINGS,
            appearance: { ...DEFAULT_SETTINGS.appearance, theme: "dark" as const },
        };
        const { controller } = await startPage(dark);

        const themeControl = controller.elements.valueHosts.get("appearance.theme") as unknown as {
            value: string;
        };
        expect(themeControl.value).toBe("dark");

        // The reset asks first; only the confirm button runs it.
        controller.elements.root
            .querySelector('[data-action="reset"]')
            ?.dispatchEvent(new CustomEvent("k-click", { bubbles: true, composed: true }));
        expect(controller.elements.resetDialog.hasAttribute("open")).toBe(true);

        controller.elements.resetConfirm.dispatchEvent(
            new CustomEvent("k-click", { bubbles: true, composed: true }),
        );

        await Promise.resolve();
        await Promise.resolve();

        expect(themeControl.value).toBe(DEFAULT_SETTINGS.appearance.theme);
    });
});
