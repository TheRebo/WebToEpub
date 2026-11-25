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
        // `start` is called by every page that owns the controller, and a page
        // can be re-entered (the options page is opened in a new tab while the
        // old one is still alive). Registering the listener twice would make
        // every system theme change apply the theme twice.
        if (this.#mediaQuery) return;

        this.#mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        this.#onChange = () => this.#apply();
        this.#mediaQuery.addEventListener("change", this.#onChange);
    }

    /** Stop listening. */
    stop(): void {
        if (this.#mediaQuery && this.#onChange) {
            this.#mediaQuery.removeEventListener("change", this.#onChange);
        }
        this.#mediaQuery = undefined;
        this.#onChange = undefined;
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
        theme: ThemeName;
        accent: AccentName;
        density: DensityName;
        reduceMotion: boolean;
    }): void {
        this.#theme = settings.theme;
        document.documentElement.dataset.accent = settings.accent;
        document.documentElement.dataset.density = settings.density;
        document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
        this.#apply();
    }

    /** Apply the theme attribute. */
    #apply(): void {
        const prefersDark = this.#mediaQuery?.matches ?? false;
        this.#resolvedTheme =
            this.#theme === "system" ? (prefersDark ? "dark" : "light") : this.#theme;
        document.documentElement.dataset.theme = this.#resolvedTheme;
    }
}

/** The shared controller instance. */
export const themeController = new ThemeController();
