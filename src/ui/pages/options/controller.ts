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
import { t, tCount } from "../../i18n";
import { runGuarded } from "../../guarded";
import type { Settings, SettingsPatch } from "../../../core/storage/settings-store";
import {
    buildSettingsFile,
    parseSettingsFile,
    SETTINGS_FILE_NAME,
} from "../../../core/storage/settings-file";
import { getNamespace } from "../../../core/browser-api";
import { DEFAULT_IMPORT_LIMITS } from "../../../core/storage/import-limits";
import {
    applyValues,
    buildOptions,
    firstMatchingGroup,
    formatBytes,
    renderGroups,
    renderLibrary,
    renderLibraryError,
    renderLibraryLoading,
    renderNav,
    renderSiteAccess,
    renderSiteAccessError,
    renderSiteAccessLoading,
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
import type { HashPort } from "./hash";

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
                hint: "settingRemoveChapterNumbersHint",
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
            {
                kind: "switch",
                path: "behaviour.emptyPageIsError",
                label: "settingEmptyPageIsError",
                hint: "settingEmptyPageIsErrorHint",
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
        actions: [
            { id: "export", kind: "button", label: "optionsExportSettings" },
            { id: "import", kind: "file", label: "optionsImportSettings" },
            { id: "reset", kind: "button", label: "optionsResetAll" },
        ],
    },
];

/** The settings store, as the controller uses it. */
export interface SettingsStorePort {
    /** Read the settings. */
    get(): Promise<Settings>;
    /** Write part of the settings, and return the whole result. */
    update(partial: SettingsPatch): Promise<Settings>;
    /** Write the whole settings, and return the result. */
    set?(settings: Settings): Promise<Settings>;
    /** Put the settings back to their defaults, and return the result. */
    reset?(): Promise<Settings>;
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
    /** Remove one book from the library. */
    removeFromLibrary?(id: string): Promise<void>;
    /** Import a library exported by WebToEpub 1.x. */
    importLibrary?(data: ArrayBuffer): Promise<number>;
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

/**
 * The host access the options page shows and changes.
 *
 * The permissions API is available to the options page directly — it is an
 * extension page, and it is the user who is in front of it — so this does not
 * go through the background worker.
 */
export interface HostAccessPort {
    /** The sites the extension may read. */
    list(): Promise<string[]>;
    /** Take away access to one site. */
    revoke(pattern: string): Promise<boolean>;
    /** Take away access to every site. */
    revokeAll(): Promise<boolean>;
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
    /** The host access the page shows. */
    hostAccess?: HostAccessPort;
    /** The navigation target to open on. */
    target?: NavTarget;
    /** The address bar, so the tab the user is on is part of the URL. */
    hash?: HashPort;
}

/** The options page's controller. */
export class OptionsController {
    #elements: OptionsElements;
    #store: SettingsStorePort;
    #theme: ThemePort;
    #background: BackgroundPort | undefined;
    #hostAccess: HostAccessPort | undefined;
    #settings: Settings | undefined;
    #hash: HashPort | undefined;
    #active: NavTarget = "appearance";
    #query = "";
    #libraryLoaded = false;
    #selectorsLoaded = false;
    #accessLoaded = false;

    constructor(options: OptionsControllerOptions) {
        this.#elements = buildOptions(options.root);
        this.#store = options.store;
        this.#theme = options.theme;
        this.#background = options.background;
        this.#hostAccess = options.hostAccess;
        this.#hash = options.hash;
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

    /**
     * Run work that the user started, without waiting for it.
     *
     * An event handler cannot be `async` — the browser does not wait for it —
     * so a failure inside it would be an unhandled rejection: logged by the
     * browser, shown to nobody, and the thing the user asked for silently not
     * happening. The work is started through {@link runGuarded}, and a failure
     * is shown as a toast.
     *
     * @param work The work to do.
     */
    #run(work: () => Promise<unknown>): void {
        runGuarded(work, (error) => this.#toast(messageOf(error) || t("errorGeneric"), "error"));
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

        // The address bar. The tab the user is on is part of the URL, so the
        // back button walks back through the tabs, and a link to a tab opens
        // that tab. This is subscribed to only once the page is ready, so a
        // change that arrives mid-load cannot show a tab on an empty page.
        this.#hash?.subscribe(() => {
            const next = this.#hash?.read();
            if (!next || next === this.#active) return;
            this.#show(next, { writeHash: false });
        });
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

            this.#show(group as NavTarget);
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
            this.#run(() => this.#write(path, value));
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
                this.#run(() => this.#loadSettings());
                return;
            }
            if (action === "export") {
                this.#run(() => this.#exportSettings());
                return;
            }
            if (action === "import") {
                // The button stands in front of a real file input: the input
                // is what opens the picker, and the browser only opens it from
                // a user gesture.
                this.#elements.files.get("import")?.click();
                return;
            }
            if (action === "import-library") {
                // The same arrangement for the library import: the button opens
                // the picker, and the input is what the browser fills in.
                this.#elements.files.get("import-library")?.click();
                return;
            }
            if (action === "reset") {
                this.#elements.resetDialog.setAttribute("open", "");
                return;
            }
            if (action === "retry-library") {
                this.#libraryLoaded = false;
                this.#run(() => this.#loadLibrary());
                return;
            }
            if (action === "retry-site-selectors") {
                this.#selectorsLoaded = false;
                this.#run(() => this.#loadSiteSelectors());
                return;
            }
            if (action === "retry-site-access") {
                this.#accessLoaded = false;
                this.#run(() => this.#loadSiteAccess());
                return;
            }
            if (action === "revoke-all-access") {
                this.#run(() => this.#revokeAllAccess());
                return;
            }
            const origin = target?.dataset["origin"];
            if (origin) {
                this.#run(() => this.#revokeAccess(origin));
                return;
            }
            const hostname = target?.dataset["hostname"];
            if (hostname) {
                this.#run(() => this.#forgetSiteSelectors(hostname));
                return;
            }

            const libraryId = target?.dataset["libraryId"];
            if (libraryId) this.#run(() => this.#removeFromLibrary(libraryId));
        });

        // The file inputs behind the import buttons.
        this.#elements.root.addEventListener("change", (event) => {
            const target = event.target as HTMLInputElement | null;
            if (!(target instanceof HTMLInputElement)) return;
            const action = target.dataset["action"];
            if (action !== "import" && action !== "import-library") return;

            const file = target.files?.[0];
            // The input is emptied, so that choosing the same file twice in a
            // row fires the change event again.
            target.value = "";
            if (!file) return;
            if (action === "import-library") {
                this.#run(() => this.#importLibrary(file));
                return;
            }
            this.#run(() => this.#importSettings(file));
        });

        // The reset dialog's buttons.
        this.#elements.resetConfirm.addEventListener("k-click", () => {
            this.#elements.resetDialog.removeAttribute("open");
            this.#run(() => this.#resetSettings());
        });
        this.#elements.resetCancel.addEventListener("k-click", () => {
            this.#elements.resetDialog.removeAttribute("open");
        });
        this.#elements.resetDialog.addEventListener("k-close", () => {
            this.#elements.resetDialog.removeAttribute("open");
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

        // A settings path is exactly `group.key`. Splitting it and taking the
        // first two segments would silently write `a.b.c` to `a.b`, which is a
        // setting nobody asked for. Reject the path instead.
        const segments = path.split(".");
        if (segments.length !== 2) return;
        const [group, key] = segments;
        if (!group || !key) return;

        const groupValue = (settings as unknown as Record<string, Record<string, unknown>>)[group];
        if (!groupValue) return;

        const previous = groupValue[key];
        const next = coerce(previous, value);
        if (next === previous) return;

        try {
            this.#settings = await this.#store.update({
                [group]: { [key]: next },
            } as unknown as SettingsPatch);
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
    /** Forget the selectors for a host name. */
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

    /**
     * Load the list of sites the extension may read.
     *
     * The list is read from the browser's own permissions, so it is the truth:
     * it says what the extension can reach right now, not what the extension
     * believes it was given.
     */
    async #loadSiteAccess(): Promise<void> {
        if (this.#accessLoaded) return;
        this.#accessLoaded = true;

        if (!this.#hostAccess) {
            renderSiteAccessError(this.#elements, t("errorGeneric"));
            return;
        }

        renderSiteAccessLoading(this.#elements);

        try {
            const origins = await this.#hostAccess.list();
            renderSiteAccess(this.#elements, origins);
        } catch (error) {
            this.#accessLoaded = false;
            renderSiteAccessError(this.#elements, messageOf(error));
        }
    }

    /**
     * Take away access to one site.
     *
     * @param pattern The site's granted pattern.
     */
    async #revokeAccess(pattern: string): Promise<void> {
        if (!this.#hostAccess) return;
        try {
            await this.#hostAccess.revoke(pattern);
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }
        this.#accessLoaded = false;
        await this.#loadSiteAccess();
        this.#toast(t("optionsRevoked"), "info");
    }

    /** Take away access to every site. */
    async #revokeAllAccess(): Promise<void> {
        if (!this.#hostAccess) return;
        try {
            await this.#hostAccess.revokeAll();
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }
        this.#accessLoaded = false;
        await this.#loadSiteAccess();
        this.#toast(t("optionsRevokedAll"), "info");
    }

    /**
     * Remove a book from the library.
     *
     * The book itself is on the user's disk; this removes the library's
     * record of it.
     */
    async #removeFromLibrary(id: string): Promise<void> {
        if (!this.#background?.removeFromLibrary) return;
        try {
            await this.#background.removeFromLibrary(id);
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }
        this.#libraryLoaded = false;
        await this.#loadLibrary();
        this.#toast(t("libraryRemoved"), "info");
    }

    /**
     * Import a library that WebToEpub 1.x exported.
     *
     * The user exports from the old extension and imports the file here.
     * The file is read into memory and handed to the worker, which does the
     * reading: the page has no business knowing what a book looks like.
     *
     * The file's size is checked before it is read, so that a file nobody
     * could have exported by accident is refused without first being pulled
     * into memory. The worker checks it again — this is the friendly half of
     * a limit that is also enforced where the bytes are actually read.
     */
    async #importLibrary(file: File): Promise<void> {
        if (!this.#background?.importLibrary) {
            this.#toast(t("errorGeneric"), "error");
            return;
        }

        if (file.size > DEFAULT_IMPORT_LIMITS.maxArchiveBytes) {
            this.#toast(
                t("optionsLibraryTooLarge", [formatBytes(DEFAULT_IMPORT_LIMITS.maxArchiveBytes)]),
                "error",
            );
            return;
        }

        let data: ArrayBuffer;
        try {
            data = await file.arrayBuffer();
        } catch {
            this.#toast(t("errorGeneric"), "error");
            return;
        }

        let imported: number;
        try {
            imported = await this.#background.importLibrary(data);
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }

        this.#libraryLoaded = false;
        await this.#loadLibrary();
        this.#toast(tCount("optionsLibraryImported", imported), "info");
    }

    /**
     * Write the settings out to a file.
     *
     * The file is a small JSON document with a marker in it, so that a file
     * that is not a settings file is refused on the way back in rather than
     * half-applied.
     */
    async #exportSettings(): Promise<void> {
        const settings = this.#settings ?? (await this.#store.get());
        const file = buildSettingsFile(settings);
        const text = JSON.stringify(file, null, 2);

        const api = getNamespace();
        if (!api) {
            this.#toast(t("errorGeneric"), "error");
            return;
        }

        try {
            const blob = new Blob([text], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            try {
                await api.downloads.download({
                    url,
                    filename: SETTINGS_FILE_NAME,
                    conflictAction: "uniquify",
                });
            } finally {
                // The blob URL has to be revoked, or it leaks for the life of
                // the page.
                setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }

        this.#toast(t("optionsExported"), "success");
    }

    /**
     * Read settings from a file.
     *
     * The file is validated before anything is written, so a file that is not
     * a settings file leaves the user's settings exactly as they were.
     */
    async #importSettings(file: File): Promise<void> {
        let text: string;
        try {
            text = await file.text();
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }

        const result = parseSettingsFile(text);
        if (!result.ok) {
            this.#toast(t("optionsImportInvalid"), "error");
            return;
        }

        if (!this.#store.set) {
            this.#toast(t("errorGeneric"), "error");
            return;
        }

        try {
            this.#settings = await this.#store.set(result.settings);
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }

        // The controls were built with the old values, so they are told what
        // the new ones are.
        applyValues(this.#elements, flatten(this.#settings));
        this.#theme.applySettings(this.#settings.appearance);
        this.#toast(t("optionsImported"), "success");
    }

    /**
     * Put the settings back to their defaults.
     *
     * Only the settings are reset. The library, the saved site selectors and
     * everything else the user has made are left alone: "reset the
     * preferences" should not mean "throw away my work".
     */
    async #resetSettings(): Promise<void> {
        if (!this.#store.reset) {
            this.#toast(t("errorGeneric"), "error");
            return;
        }

        try {
            this.#settings = await this.#store.reset();
        } catch (error) {
            this.#toast(messageOf(error) || t("errorGeneric"), "error");
            return;
        }

        applyValues(this.#elements, flatten(this.#settings));
        this.#theme.applySettings(this.#settings.appearance);
        this.#toast(t("optionsResetDone"), "success");
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
     * Show a tab.
     *
     * Choosing a group explicitly clears the search. The search narrows
     * *within* a group, so leaving it in place would show an empty group the
     * moment the user picked a different one.
     *
     * @param next The tab to show.
     * @param options Whether the address bar should be written.
     */
    #show(next: NavTarget, options: { writeHash?: boolean } = {}): void {
        if (next === this.#active) return;

        this.#active = next;

        if (this.#query !== "") {
            this.#query = "";
            this.#elements.search.value = "";
        }

        this.#render();

        if (options.writeHash !== false) this.#hash?.write(next);

        if (this.#active === "library") this.#run(() => this.#loadLibrary());
        if (this.#active === "site-selectors") this.#run(() => this.#loadSiteSelectors());
        if (this.#active === "site-access") this.#run(() => this.#loadSiteAccess());
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
        const onAccess = this.#active === "site-access";
        this.#elements.content.hidden = onLibrary || onSelectors || onAccess;
        this.#elements.library.hidden = !onLibrary;
        this.#elements.siteSelectors.hidden = !onSelectors;
        this.#elements.siteAccess.hidden = !onAccess;
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
