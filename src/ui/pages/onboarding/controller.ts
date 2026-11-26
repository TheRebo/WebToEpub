/**
 * The onboarding page's controller.
 *
 * The onboarding is the first thing a new user sees, so it has two jobs: it
 * has to be honest about what the extension does, and it has to remember
 * whatever the user has already chosen.
 *
 * The second job is the one that is easy to get wrong. The appearance settings
 * are read from the store when the page opens, and every control starts from
 * those values — so a user who has already chosen a dark theme is not asked to
 * choose it again, and a user who walks through the onboarding without
 * touching anything keeps the settings they had.
 *
 * The controller is deliberately separate from the entry point, and takes its
 * dependencies as arguments, so that it can be exercised without a browser
 * extension runtime.
 */
import { t } from "../../i18n";
import type { Settings, SettingsPatch } from "../../../core/storage/settings-store";
import {
    buildOnboarding,
    renderStatus,
    renderStep,
    updatePreview,
    type OnboardingAppearance,
    type OnboardingElements,
    type OnboardingStep,
} from "./view";

/** The settings store, as the controller uses it. */
export interface SettingsStorePort {
    /** Read the settings. */
    get(): Promise<Settings>;
    /** Write part of the settings, and return the whole result. */
    update(partial: SettingsPatch): Promise<Settings>;
}

/** The theme controller, as the controller uses it. */
export interface ThemePort {
    /** Start listening for the system theme. */
    start(): void;
    /** Apply the appearance settings. */
    applySettings(settings: Settings["appearance"]): void;
}

/** The controller's dependencies. */
export interface OnboardingControllerOptions {
    /** Where the page is built. */
    root: HTMLElement;
    /** The settings store. */
    store: SettingsStorePort;
    /** The theme controller. */
    theme: ThemePort;
    /** What closes the page when the onboarding is finished. */
    close?: () => void;
}

/** The appearance settings, as the onboarding starts them. */
const DEFAULT_APPEARANCE: OnboardingAppearance = {
    theme: "system",
    accent: "gold",
    density: "comfortable",
    reduceMotion: false,
};

/** The onboarding controller. */
export class OnboardingController {
    #elements: OnboardingElements;
    #store: SettingsStorePort;
    #theme: ThemePort;
    #close: () => void;
    #step: OnboardingStep = 0;
    #appearance: OnboardingAppearance = { ...DEFAULT_APPEARANCE };
    #loaded = false;

    constructor(options: OnboardingControllerOptions) {
        this.#elements = buildOnboarding(options.root);
        this.#store = options.store;
        this.#theme = options.theme;
        this.#close = options.close ?? (() => window.close());
        this.#wire();
    }

    /** The page's elements, for tests and for the entry point. */
    get elements(): OnboardingElements {
        return this.#elements;
    }

    /** The appearance the onboarding is showing. */
    get appearance(): OnboardingAppearance {
        return { ...this.#appearance };
    }

    /** The step the onboarding is on. */
    get step(): OnboardingStep {
        return this.#step;
    }

    /** Start the page. */
    async start(): Promise<void> {
        this.#theme.start();
        await this.#load();
    }

    /** Read the settings, and render them. */
    async #load(): Promise<void> {
        renderStatus(this.#elements, "loading");

        let settings: Settings;
        try {
            settings = await this.#store.get();
        } catch (error) {
            renderStatus(this.#elements, "error", messageOf(error));
            return;
        }

        // The controls start from the *stored* values, so the onboarding never
        // asks a question the user has already answered.
        this.#appearance = { ...settings.appearance };
        this.#loaded = true;

        this.#theme.applySettings(settings.appearance);
        renderStatus(this.#elements, "ready");
        this.#render();
    }

    /** Wire the events. */
    #wire(): void {
        this.#elements.root.addEventListener("k-click", (event) => {
            const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
                "[data-action]",
            );
            const action = target?.dataset["action"];
            if (!action) return;
            // The handler cannot be `async` — the browser does not wait for
            // it — so a failure inside it has to be caught here rather than
            // left as an unhandled rejection.
            void this.#handle(action).catch((error: unknown) => {
                this.#toast(messageOf(error) || t("errorGeneric"), "error");
            });
        });

        // The radio choices are native inputs in the light DOM, so their own
        // `change` event is the one to listen for. The switch is a component,
        // whose native event does not cross the shadow boundary: it speaks
        // `k-change` instead.
        this.#elements.stage.addEventListener("change", (event) => {
            const input = event.target as HTMLInputElement | null;
            const path = input?.dataset["path"];
            if (!path || typeof input?.value !== "string") return;
            this.#set(path, input.value);
        });

        this.#elements.stage.addEventListener("k-change", (event) => {
            const detail = (event as CustomEvent<{ value?: unknown; checked?: boolean }>).detail;
            const target = event.target as HTMLElement | null;
            const path = target?.dataset["path"];
            if (!path) return;
            const value = detail.value ?? detail.checked;
            if (value === undefined) return;
            this.#set(path, value);
        });
    }

    /** Handle an action. */
    async #handle(action: string): Promise<void> {
        // The appearance settings have not been read yet, so the controls do
        // not show the user's real preferences. Acting now would either lose
        // them or save a guess, so the page waits.
        if (!this.#loaded && action !== "retry") return;

        if (action === "back") {
            this.#step = Math.max(0, this.#step - 1) as OnboardingStep;
            this.#render();
            return;
        }
        if (action === "next") {
            if (this.#step < 2) {
                this.#step = (this.#step + 1) as OnboardingStep;
                this.#render();
                return;
            }
            await this.#finish();
            return;
        }
        if (action === "skip") {
            await this.#skip();
            return;
        }
        if (action === "retry") {
            await this.#load();
        }
    }

    /** Record a change to one of the appearance settings. */
    #set(path: string, value: unknown): void {
        if (!this.#loaded) return;

        if (path === "appearance.theme") {
            this.#appearance.theme = String(value) as OnboardingAppearance["theme"];
        } else if (path === "appearance.accent") {
            this.#appearance.accent = String(value) as OnboardingAppearance["accent"];
        } else if (path === "appearance.density") {
            this.#appearance.density = String(value) as OnboardingAppearance["density"];
        } else if (path === "appearance.reduceMotion") {
            this.#appearance.reduceMotion = Boolean(value);
        } else {
            return;
        }

        // The appearance applies live, so the choice is made by looking — and
        // the preview follows the same values, rather than its own.
        this.#theme.applySettings(this.#appearance);
        updatePreview(this.#elements.stage, this.#appearance);

        void this.#persist();
    }

    /** Write the appearance settings through to the store. */
    async #persist(): Promise<void> {
        try {
            await this.#store.update({ appearance: { ...this.#appearance } });
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
        }
    }

    /** Save the choices and close. */
    async #finish(): Promise<void> {
        try {
            // The whole appearance is written, so the density and the motion
            // preference the user already had are kept rather than reset to a
            // default.
            await this.#store.update({
                appearance: { ...this.#appearance },
                onboardingComplete: true,
            });
        } catch (error) {
            // The page stays where it is: the user can press Finish again
            // rather than being dropped back to the beginning.
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }
        this.#close();
    }

    /** Skip the onboarding, without touching the appearance. */
    async #skip(): Promise<void> {
        try {
            await this.#store.update({ onboardingComplete: true });
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }
        this.#close();
    }

    /** Show a toast. */
    #toast(message: string, variant: "success" | "info" | "warning" | "error"): void {
        const toast = document.createElement("k-toast");
        toast.setAttribute("message", message);
        toast.setAttribute("variant", variant);
        toast.setAttribute("duration", "4000");
        this.#elements.toastHost.appendChild(toast);
    }

    /** Render. */
    #render(): void {
        renderStep(this.#elements, this.#step, this.#appearance);
    }
}

/** The message of an error, or an empty string. */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : "";
}
