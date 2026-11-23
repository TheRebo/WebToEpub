/**
 * The onboarding page.
 *
 * Shown once, on the first run. Three steps: what the extension does, where
 * it works, and how it should look.
 *
 * The onboarding never blocks the user. It can be skipped at any point, it
 * makes no network call, and it asks for nothing — no account, no email, no
 * permission. The only thing it writes is `onboardingComplete`, so the page
 * is not shown again.
 */
import "../../components/base";
import "../../components/icons";
import "../../components/k-button";
import "../../components/k-radio-group";

import { localStorageAdapter } from "../../../core/browser-api";
import { SettingsStore } from "../../../core/storage/settings-store";
import { themeController, type AccentName, type ThemeName } from "../../styles/theme-controller";
import { installI18n } from "../../i18n-bootstrap";
import { buildOnboarding, renderStep, type OnboardingElements, type OnboardingStep } from "./view";

/** The onboarding controller. */
class OnboardingController {
    #elements: OnboardingElements;
    #store = new SettingsStore(localStorageAdapter);
    #step: OnboardingStep = 0;
    #accent = "gold";
    #theme = "system";

    constructor(root: HTMLElement) {
        this.#elements = buildOnboarding(root);
        this.#wire();
    }

    /** Start the page. */
    async start(): Promise<void> {
        themeController.start();

        const settings = await this.#store.get();
        this.#accent = settings.appearance.accent;
        this.#theme = settings.appearance.theme;

        themeController.applySettings({
            theme: settings.appearance.theme,
            accent: settings.appearance.accent,
            density: settings.appearance.density,
            reduceMotion: settings.appearance.reduceMotion,
        });

        this.#render();
    }

    /** Wire the events. */
    #wire(): void {
        this.#elements.root.addEventListener("k-click", (event) => {
            const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-action]");
            const action = target?.dataset["action"];
            if (!action) return;
            void this.#handle(action);
        });

        // The theme and accent apply live, so the choice is made by looking.
        this.#elements.stage.addEventListener("k-change", (event) => {
            const detail = (event as CustomEvent<{ value: string }>).detail;
            const path = (event.target as HTMLElement)?.dataset["path"];
            if (!path) return;

            if (path === "appearance.theme") this.#theme = detail.value;
            if (path === "appearance.accent") this.#accent = detail.value;

            themeController.applySettings({
                theme: this.#theme as ThemeName,
                accent: this.#accent as AccentName,
                density: "comfortable",
                reduceMotion: false,
            });
        });
    }

    /** Handle an action. */
    async #handle(action: string): Promise<void> {
        if (action === "back") {
            this.#step = Math.max(0, this.#step - 1) as OnboardingStep;
            this.#render();
            return;
        }
        if (action === "skip") {
            await this.#finish();
            return;
        }
        if (action === "next") {
            if (this.#step < 2) {
                this.#step = (this.#step + 1) as OnboardingStep;
                this.#render();
                return;
            }
            await this.#finish();
        }
    }

    /** Save the choices and close. */
    async #finish(): Promise<void> {
        const current = await this.#store.get();
        await this.#store.update({
            appearance: {
                ...current.appearance,
                theme: this.#theme as ThemeName,
                accent: this.#accent as AccentName,
            },
            onboardingComplete: true,
        });
        window.close();
    }

    /** Render. */
    #render(): void {
        renderStep(this.#elements, this.#step, this.#accent);
    }
}

/** Start the page. */
async function main(): Promise<void> {
    installI18n();
    const controller = new OnboardingController(document.body);
    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The onboarding failed to start:", error);
});
