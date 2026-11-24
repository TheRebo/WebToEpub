/**
 * The options page's controller.
 *
 * The page is built once and then only *updated*: the navigation is a tab
 * list, and choosing a tab shows that tab's panel and hides the rest. Nothing
 * is torn down and rebuilt, so a setting the user is halfway through typing
 * survives every re-render — along with the caret and the focus.
 *
 * The controller is deliberately separate from the entry point, and takes its
 * dependencies as arguments, so that it can be exercised without a browser
 * extension runtime.
 */
import { t } from "../../i18n";
import type { Settings } from "../../../core/storage/settings-store";
import {
    buildOptions,
    firstMatchingGroup,
    renderGroups,
    renderLibrary,
    renderLibraryError,
    renderLibraryLoading,
    renderNav,
    renderSiteSelectors,
    renderSiteSelectorsError,
    renderSiteSelectorsLoading,
    renderStatus,
    updateGroups,
    updateNav,
    type GroupSpec,
    type NavTarget,
    type OptionsElements,
} from "./view";

/**
 * The settings groups, in the order they are shown.
 *
 * Every string is a message key rather than a literal, so the whole page is
 * translatable. The keys are resolved at render time, which means a language
 * change takes effect without rebuilding the page.
 */
export const GROUPS: GroupSpec[] = [
    {
        id: "appearance",
        title: "optionsAppearance",
        controls: [
            { kind: "theme", path: "appearance.theme", label: "optionsTheme" },
            { kind: "accent", path: "appearance.accent", label: "optionsAccent" },
            { kind: "density", path: "appearance.density", label: "optionsDensity" },
            {
                kind: "switch",
                path: "appearance.reduceMotion",
                label: "settingReduceMotion",
                hint: "settingReduceMotionHint",
            },
        ],
    },
    {
        id: "story",
        title: "optionsStory",
        controls: [
            {
                kind: "text",
                path: "story.filenameTemplate",
                label: "settingFilenameTemplate",
                hint: "settingFilenameTemplateHint",
                placeholder: "{title}",
            },
            {
                kind: "text",
                path: "story.defaultLanguage",
                label: "settingDefaultLanguage",
                hint: "settingDefaultLanguageHint",
                placeholder: "en",
            },
            {
                kind: "switch",
                path: "story.removeAuthorNotes",
                label: "settingRemoveAuthorNotes",
                hint: "settingRemoveAuthorNotesHint",
            },
            {
                kind: "switch",
                path: "story.removeChapterNumbers",
                label: "settingRemoveChapterNumbers",
            },
            {
                kind: "switch",
                path: "story.includeTocPage",
                label: "settingIncludeTocPage",
            },
        ],
    },
    {
        id: "epub",
        title: "optionsEpub",
        controls: [
            {
                kind: "select",
                path: "epub.version",
                label: "settingEpubVersion",
                hint: "settingEpubVersionHint",
                options: [
                    { value: "3", label: "EPUB 3" },
                    { value: "2", label: "EPUB 2" },
                ],
            },
            {
                kind: "switch",
                path: "epub.addInfoPage",
                label: "settingAddInfoPage",
                hint: "settingAddInfoPageHint",
            },
            {
                kind: "switch",
                path: "epub.removeNextPrevLinks",
                label: "settingRemoveNextPrevLinks",
            },
            {
                kind: "switch",
                path: "epub.includeSourceUrl",
                label: "settingIncludeSourceUrl",
            },
        ],
    },
    {
        id: "images",
        title: "optionsImages",
        controls: [
            { kind: "switch", path: "images.skipImages", label: "settingSkipImages" },
            { kind: "switch", path: "images.removeDuplicates", label: "settingRemoveDuplicates" },
            {
                kind: "switch",
                path: "images.preferHighestResolution",
                label: "settingPreferHighestResolution",
            },
            { kind: "switch", path: "images.useSvg", label: "settingUseSvg" },
            { kind: "switch", path: "images.compress", label: "settingCompressImages" },
            {
                kind: "number",
                path: "images.maxResolution",
                label: "settingMaxResolution",
                hint: "settingMaxResolutionHint",
                min: 100,
                max: 10000,
            },
        ],
    },
    {
        id: "behaviour",
        title: "optionsBehaviour",
        controls: [
            {
                kind: "switch",
                path: "behaviour.skipFailedChapters",
                label: "settingSkipFailedChapters",
                hint: "settingSkipFailedChaptersHint",
            },
            {
                kind: "switch",
                path: "behaviour.retryOnEmptyPage",
                label: "settingRetryOnEmptyPage",
            },
            {
                kind: "number",
                path: "behaviour.minimumDelay",
                label: "settingMinimumDelay",
                hint: "settingMinimumDelayHint",
                min: 0,
                max: 60000,
            },
            {
                kind: "number",
                path: "behaviour.maxChapters",
                label: "settingMaxChapters",
                min: 1,
                max: 100000,
            },
            {
                kind: "number",
                path: "behaviour.delayPerChapter",
                label: "settingDelayPerChapter",
                hint: "settingDelayPerChapterHint",
                min: 0,
                max: 60000,
            },
        ],
    },
    {
        id: "privacy",
        title: "optionsPrivacy",
        controls: [
            {
                kind: "switch",
                path: "privacy.metadataLookup",
                label: "settingMetadataLookup",
                hint: "settingMetadataLookupHint",
            },
            {
                kind: "switch",
                path: "privacy.sendStoryUrl",
                label: "settingSendStoryUrl",
                hint: "settingSendStoryUrlHint",
            },
        ],
    },
    {
        id: "advanced",
        title: "optionsAdvanced",
        controls: [
            {
                kind: "switch",
                path: "advanced.diagnostics",
                label: "settingDiagnostics",
                hint: "settingDiagnosticsHint",
            },
        ],
    },
];

/** The settings store, as the controller uses it. */
export interface SettingsStorePort {
    /** Read the settings. */
    get(): Promise<Settings>;
    /** Write part of the settings, and return the whole result. */
    update(partial: Partial<Settings>): Promise<Settings>;
}

/** The theme controller, as the controller uses it. */
export interface ThemePort {
    /** Start listening for the system theme. */
    start(): void;
    /** Apply the appearance settings. */
    applySettings(settings: Settings["appearance"]): void;
}

/** The background worker, as the controller uses it. */
export interface BackgroundPort {
    /** List the library. */
    library(): Promise<Array<Record<string, unknown>>>;
    /** List the saved site selectors. */
    siteSelectors(): Promise<
        Array<{
            hostname: string;
            contentCss: string;
            titleCss: string;
            removeCss: string;
        }>
    >;
    /** Forget one site's saved selectors. */
    forgetSiteSelectors(hostname: string): Promise<void>;
}

/** The controller's dependencies. */
export interface OptionsControllerOptions {
    /** Where the page is built. */
    root: HTMLElement;
    /** The settings store. */
    store: SettingsStorePort;
    /** The theme controller. */
    theme: ThemePort;
    /** The background worker. */
    background?: BackgroundPort;
    /** The navigation target to open on. */
    target?: NavTarget;
}

/** The options page's controller. */
export class OptionsController {
    #elements: OptionsElements;
    #store: SettingsStorePort;
    #theme: ThemePort;
    #background: BackgroundPort | undefined;
    #settings: Settings | undefined;
    #active: NavTarget = "appearance";
    #query = "";
    #libraryLoaded = false;
    #selectorsLoaded = false;

    constructor(options: OptionsControllerOptions) {
        this.#elements = buildOptions(options.root);
        this.#store = options.store;
        this.#theme = options.theme;
        this.#background = options.background;
        if (options.target) this.#active = options.target;
        this.#wire();
    }

    /** The page's elements, for tests and for the entry point. */
    get elements(): OptionsElements {
        return this.#elements;
    }

    /** The navigation target that is currently selected. */
    get active(): NavTarget {
        return this.#active;
    }

    /** Start the page. */
    async start(): Promise<void> {
        this.#theme.start();

        // The navigation is built before the settings are read: the tab list
        // does not depend on them, and building it first means the page has
        // its shape — and its loading state — immediately.
        renderNav(this.#elements, GROUPS);
        updateNav(this.#elements, this.#active);
        renderStatus(this.#elements, "loading");

        await this.#loadSettings();

        if (this.#active === "library") await this.#loadLibrary();
        if (this.#active === "site-selectors") await this.#loadSiteSelectors();
    }

    /** Read the settings, and render them. */
    async #loadSettings(): Promise<void> {
        renderStatus(this.#elements, "loading");

        let settings: Settings;
        try {
            settings = await this.#store.get();
        } catch (error) {
            renderStatus(this.#elements, "error", messageOf(error));
            return;
        }

        this.#settings = settings;
        this.#theme.applySettings(settings.appearance);

        // The groups are built once, from the settings that were read. After
        // this the controls own their own values, so a re-render can never
        // undo what the user has typed.
        renderGroups(this.#elements, GROUPS, flatten(settings));
        renderStatus(this.#elements, "ready");
        this.#render();
    }

    /** Wire the events. */
    #wire(): void {
        // The navigation. The buttons are never replaced, so the button the
        // user just pressed keeps the focus.
        this.#elements.nav.addEventListener("click", (event) => {
            const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
                "[data-group]",
            );
            const group = target?.dataset["group"];
            if (!group) return;

            const next = group as NavTarget;
            if (next === this.#active) return;

            this.#active = next;

            // Choosing a group explicitly clears the search. The search
            // narrows *within* a group, so leaving it in place would show an
            // empty group the moment the user picked a different one.
            if (this.#query !== "") {
                this.#query = "";
                this.#elements.search.value = "";
            }

            this.#render();

            if (this.#active === "library") void this.#loadLibrary();
            if (this.#active === "site-selectors") void this.#loadSiteSelectors();
        });

        // The search box. It is outside the content column, so it keeps its
        // own value and focus while the groups are filtered.
        this.#elements.search.addEventListener("input", () => {
            this.#query = this.#elements.search.value;

            // A tab list shows one panel at a time, so a search that matched a
            // setting in another group selects that group rather than
            // showing two panels at once.
            const match = firstMatchingGroup(GROUPS, this.#query);
            if (match && match !== this.#active) this.#active = match;

            this.#render();
        });

        // Every control writes straight through to storage. The path in the
        // dataset is the settings path, e.g. `appearance.theme`.
        this.#elements.root.addEventListener("k-change", (event) => {
            const detail = (
                event as CustomEvent<{
                    value?: string | number | boolean;
                    checked?: boolean;
                    name?: string | null;
                }>
            ).detail;
            const path = this.#pathOf(event.target as HTMLElement | null, detail.name);
            if (!path) return;
            const value = detail.value ?? detail.checked;
            if (value === undefined) return;
            void this.#write(path, value);
        });

        // The buttons in the status panels and the site-selector list. The
        // components emit `k-click` rather than a native click, because the
        // native event does not cross the shadow boundary.
        this.#elements.root.addEventListener("k-click", (event) => {
            const target = (event.target as HTMLElement | null)?.closest<HTMLElement>(
                "[data-action]",
            );
            const action = target?.dataset["action"];
            if (action === "retry") {
                void this.#loadSettings();
                return;
            }
            if (action === "retry-library") {
                this.#libraryLoaded = false;
                void this.#loadLibrary();
                return;
            }
            if (action === "retry-site-selectors") {
                this.#selectorsLoaded = false;
                void this.#loadSiteSelectors();
                return;
            }
            const hostname = target?.dataset["hostname"];
            if (hostname) void this.#forgetSiteSelectors(hostname);
        });
    }

    /** The settings path a control belongs to. */
    #pathOf(element: HTMLElement | null, name?: string | null): string | undefined {
        if (name) return name;
        if (!element) return undefined;
        const row = element.closest<HTMLElement>("[data-path]");
        return row?.dataset["path"];
    }

    /** Write one setting. */
    async #write(path: string, value: unknown): Promise<void> {
        const settings = this.#settings;
        if (!settings) return;

        const [group, key] = path.split(".");
        if (!group || !key) return;

        const groupValue = (settings as unknown as Record<string, Record<string, unknown>>)[group];
        if (!groupValue) return;

        const previous = groupValue[key];
        const next = coerce(previous, value);
        if (next === previous) return;

        try {
            this.#settings = await this.#store.update({
                [group]: { ...groupValue, [key]: next },
            } as unknown as Partial<Settings>);
        } catch (error) {
            // The value on the control stays as the user left it — they can
            // see what they typed — but the page says the write failed.
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }

        // The appearance settings take effect immediately, so the user sees
        // the theme they just chose rather than a preview of it.
        if (group === "appearance" && this.#settings) {
            this.#theme.applySettings(this.#settings.appearance);
        }
    }

    /** Load the library. */
    async #loadLibrary(): Promise<void> {
        if (this.#libraryLoaded) return;
        this.#libraryLoaded = true;

        // Without a background worker there is nothing to ask, and an empty
        // panel would be a state the page has never designed.
        if (!this.#background) {
            renderLibraryError(this.#elements, t("errorGeneric"));
            return;
        }

        renderLibraryLoading(this.#elements);

        try {
            const entries = await this.#background.library();
            renderLibrary(
                this.#elements,
                entries.map((entry) => ({
                    id: String(entry["id"] ?? ""),
                    title: String(entry["title"] ?? ""),
                    author: typeof entry["author"] === "string" ? entry["author"] : undefined,
                    chapterCount: Number(entry["chapterCount"] ?? 0),
                    size: Number(entry["size"] ?? 0),
                    updatedAt: Number(entry["updatedAt"] ?? 0),
                })),
            );
        } catch (error) {
            this.#libraryLoaded = false;
            renderLibraryError(this.#elements, messageOf(error));
        }
    }

    /** Load the saved site selectors. */
    async #loadSiteSelectors(): Promise<void> {
        if (this.#selectorsLoaded) return;
        this.#selectorsLoaded = true;

        // As with the library: without a background worker there is nothing to
        // ask, so the page says so rather than showing nothing.
        if (!this.#background) {
            renderSiteSelectorsError(this.#elements, t("errorGeneric"));
            return;
        }

        renderSiteSelectorsLoading(this.#elements);

        try {
            const entries = await this.#background.siteSelectors();
            renderSiteSelectors(this.#elements, entries);
        } catch (error) {
            this.#selectorsLoaded = false;
            renderSiteSelectorsError(this.#elements, messageOf(error));
        }
    }

    /** Forget one site's saved selectors. */
    async #forgetSiteSelectors(hostname: string): Promise<void> {
        if (!this.#background) return;
        try {
            await this.#background.forgetSiteSelectors(hostname);
        } catch {
            // Nothing to do: the list is reloaded below either way.
        }
        this.#selectorsLoaded = false;
        await this.#loadSiteSelectors();
        this.#toast(t("siteSelectorForgotten"), "info");
    }

    /** Show a toast. */
    #toast(message: string, variant: "success" | "info" | "warning" | "error"): void {
        const toast = document.createElement("k-toast");
        toast.setAttribute("message", message);
        toast.setAttribute("variant", variant);
        toast.setAttribute("duration", "4000");
        this.#elements.toastHost.appendChild(toast);
    }

    /**
     * Render.
     *
     * Nothing is rebuilt here. The navigation's selection state is updated,
     * the groups are shown or hidden, and the peer sections are shown or
     * hidden. The controls themselves are left exactly as they are, so what
     * the user has typed — and where their caret is — survives.
     */
    #render(): void {
        updateNav(this.#elements, this.#active);
        updateGroups(this.#elements, GROUPS, this.#active, this.#query);

        const onLibrary = this.#active === "library";
        const onSelectors = this.#active === "site-selectors";
        this.#elements.content.hidden = onLibrary || onSelectors;
        this.#elements.library.hidden = !onLibrary;
        this.#elements.siteSelectors.hidden = !onSelectors;
    }
}

/**
 * Coerce a raw control value to the type the setting already holds.
 *
 * A number field gives a string; a switch gives a boolean. The setting's
 * existing type is the authority, so the value is converted to match it.
 */
function coerce(previous: unknown, value: unknown): unknown {
    if (typeof previous === "boolean") return Boolean(value);
    if (typeof previous === "number") {
        const parsed = typeof value === "number" ? value : Number(value);
        return Number.isFinite(parsed) ? parsed : previous;
    }
    return typeof value === "string" ? value : previous;
}

/** Flatten the settings into a map of dotted paths. */
export function flatten(settings: Settings): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [group, values] of Object.entries(settings)) {
        if (group === "onboardingComplete") continue;
        if (typeof values !== "object" || values === null) continue;
        for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
            result[`${group}.${key}`] = value;
        }
    }
    return result;
}

/** The message of an error, or an empty string. */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : "";
}
