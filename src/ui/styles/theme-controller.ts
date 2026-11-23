/**
 * The theme controller.
 *
 * Owns the `data-theme`, `data-accent`, and `data-density` attributes on the
 * document element.
 *
 * The baseline had two stylesheets — `alwaysDark.css` and `autoDark.css` —
 * toggled by adding and removing a class. That made dark mode depend on the
 * cascade order of the stylesheets, and it broke whenever a new rule was
 * added to the wrong file.
 *
 * Here there is one stylesheet. The theme controller resolves `system` to
 * `light` or `dark` **before** the attribute lands, so the stylesheet only
 * ever sees a resolved value. This is the fix for the baseline's biggest
 * dark-mode fragility.
 */
import type { Settings } from "../../core/storage/settings-store";

/** The themes. */
export type ThemeName = "system" | "light" | "dark";

/** The accent colours. */
export type AccentName = "gold" | "ink" | "verdigris" | "plum";

/** The densities. */
export type DensityName = "comfortable" | "compact";

/** The controller. */
export class ThemeController {
    #mediaQuery: MediaQueryList | undefined;
    #onChange: (() => void) | undefined;
    #theme: ThemeName = "system";
    #resolvedTheme: "light" | "dark" = "light";

    /** Start listening for the system theme. */
    start(): void {
        this.#mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        this.#onChange = () => this.#apply();
        this.#mediaQuery.addEventListener("change", this.#onChange);
    }

    /** Stop listening. */
    stop(): void {
        if (this.#mediaQuery && this.#onChange) {
            this.#mediaQuery.removeEventListener("change", this.#onChange);
        }
    }

    /** The user's chosen theme. */
    get theme(): ThemeName {
        return this.#theme;
    }

    /** The theme actually in effect. */
    get resolvedTheme(): "light" | "dark" {
        return this.#resolvedTheme;
    }

    /** Apply the settings. */
    applySettings(settings: {
        appearance: Pick<Settings["appearance"], "theme" | "accent" | "density" | "reduceMotion">;
    }): void {
        this.#theme = settings.appearance.theme;
        document.documentElement.dataset.accent = settings.appearance.accent;
        document.documentElement.dataset.density = settings.appearance.density;
        document.documentElement.dataset.reduceMotion = String(settings.appearance.reduceMotion);
        this.#apply();
    }

    /** Apply the theme attribute. */
    #apply(): void {
        const prefersDark = this.#mediaQuery?.matches ?? false;
        this.#resolvedTheme = this.#theme === "system" ? (prefersDark ? "dark" : "light") : this.#theme;
        document.documentElement.dataset.theme = this.#resolvedTheme;
    }
}

/** The shared controller instance. */
export const themeController = new ThemeController();
