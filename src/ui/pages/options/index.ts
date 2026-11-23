/**
 * The options page.
 *
 * Settings live in one place, and every change is written immediately. There
 * is no "Apply" button, because there is nothing to batch: a setting that
 * takes effect on the next page is a setting the user cannot trust.
 *
 * The appearance settings apply *live*, as they are changed, so the user
 * chooses the theme by looking at it rather than by imagining it.
 */
import "../../components/base";
import "../../components/icons";
import "../../components/k-button";
import "../../components/k-field";
import "../../components/k-radio-group";
import "../../components/k-switch";
import "../../components/k-toast";

import { localStorageAdapter, sendMessage } from "../../../core/browser-api";
import {
    SettingsStore,
    type Settings,
    type AppearanceSettings,
    type StorySettings,
    type EpubSettings,
    type ImageSettings,
    type BehaviourSettings,
    type PrivacySettings,
    type AdvancedSettings,
} from "../../../core/storage/settings-store";
import { themeController } from "../../styles/theme-controller";
import { sendRequest } from "../../../core/message/bus";
import { installI18n } from "../../i18n-bootstrap";
import { t } from "../../i18n";
import {
    buildOptions,
    renderGroups,
    renderLibrary,
    renderNav,
    renderSiteSelectors,
    type GroupId,
    type GroupSpec,
    type OptionsElements,
} from "./view";

/**
 * The settings groups, in the order they are shown.
 *
 * Every string is a message key rather than a literal, so the whole page is
 * translatable. The keys are resolved at render time, which means a language
 * change takes effect without rebuilding the page.
 */
const GROUPS: GroupSpec[] = [
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
            { kind: "switch", path: "behaviour.retryOnEmptyPage", label: "settingRetryOnEmptyPage" },
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

/** The options page's controller. */
class OptionsController {
    #elements: OptionsElements;
    #store = new SettingsStore(localStorageAdapter);
    #settings: Settings | undefined;
    #active: GroupId | "library" | "site-selectors" = "appearance";
    #query = "";

    constructor(root: HTMLElement) {
        this.#elements = buildOptions(root);
        this.#wire();
    }

    /** Start the page. */
    async start(): Promise<void> {
        themeController.start();
        this.#settings = await this.#store.get();
        themeController.applySettings(this.#settings.appearance);

        const hash = window.location.hash.replace("#", "");
        if (hash === "library") this.#active = "library";
        else if (hash === "site-selectors") this.#active = "site-selectors";
        else if (GROUPS.some((group) => group.id === hash)) this.#active = hash as GroupId;

        this.#render();

        if (this.#active === "library") await this.#loadLibrary();
        if (this.#active === "site-selectors") await this.#loadSiteSelectors();
    }

    /** Wire the events. */
    #wire(): void {
        this.#elements.nav.addEventListener("click", (event) => {
            const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-group]");
            const group = target?.dataset["group"];
            if (!group) return;
            this.#active =
                group === "library"
                    ? "library"
                    : group === "site-selectors"
                      ? "site-selectors"
                      : (group as GroupId);
            this.#render();
            if (this.#active === "library") void this.#loadLibrary();
            if (this.#active === "site-selectors") void this.#loadSiteSelectors();
        });

        this.#elements.search.addEventListener("input", () => {
            this.#query = this.#elements.search.value;
            this.#render();
        });

        // Every control writes straight through to storage. The path in the
        // dataset is the settings path, e.g. `appearance.theme`.
        this.#elements.content.addEventListener("k-change", (event) => {
            const detail = (event as CustomEvent<{ value?: string; checked?: boolean }>).detail;
            const path = this.#pathOf(event.target as HTMLElement);
            if (!path) return;
            const value = detail.value ?? detail.checked;
            void this.#write(path, value);
        });

        this.#elements.content.addEventListener("input", (event) => {
            const target = event.target as HTMLElement;
            const path = this.#pathOf(target);
            if (!path) return;
            const value = (target as HTMLInputElement).value;
            void this.#write(path, value);
        });

        this.#elements.content.addEventListener("change", (event) => {
            const target = event.target as HTMLElement;
            const path = this.#pathOf(target);
            if (!path) return;
            const value = (target as HTMLInputElement).value;
            void this.#write(path, value);
        });

        // The Forget button in the site-selector list.
        this.#elements.siteSelectors.addEventListener("k-click", (event) => {
            const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-hostname]");
            const hostname = target?.dataset["hostname"];
            if (hostname) void this.#forgetSiteSelectors(hostname);
        });
    }

    /** The settings path a control belongs to. */
    #pathOf(element: HTMLElement | null): string | undefined {
        if (!element) return undefined;
        const row = element.closest<HTMLElement>("[data-path]");
        return row?.dataset["path"];
    }

    /** Write one setting. */
    async #write(path: string, value: unknown): Promise<void> {
        if (!this.#settings) return;

        const [group, key] = path.split(".");
        if (!group || !key) return;

        const groupValue = (this.#settings as unknown as Record<string, Record<string, unknown>>)[
            group
        ];
        if (!groupValue) return;

        const previous = groupValue[key];
        const next = coerce(previous, value);
        if (next === previous) return;

        groupValue[key] = next as never;
        this.#settings = await this.#store.update(
            { [group]: groupValue } as unknown as Partial<Settings>,
        );

        // The appearance settings take effect immediately, so the user sees
        // the theme they just chose rather than a preview of it.
        if (group === "appearance") {
            themeController.applySettings(this.#settings.appearance);
        }
    }

    /** Load the library. */
    async #loadLibrary(): Promise<void> {
        try {
            const { entries } = await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "library:list",
                {},
            );
            const list = (entries as Array<Record<string, unknown>>) ?? [];
            renderLibrary(
                this.#elements,
                list.map((entry) => ({
                    id: String(entry["id"] ?? ""),
                    title: String(entry["title"] ?? ""),
                    author: typeof entry["author"] === "string" ? entry["author"] : undefined,
                    chapterCount: Number(entry["chapterCount"] ?? 0),
                    size: Number(entry["size"] ?? 0),
                    updatedAt: Number(entry["updatedAt"] ?? 0),
                })),
            );
        } catch {
            renderLibrary(this.#elements, []);
        }
    }

    /** Load the saved site selectors. */
    async #loadSiteSelectors(): Promise<void> {
        try {
            const { entries } = await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "site-selectors:list",
                {},
            );
            renderSiteSelectors(
                this.#elements,
                entries.map((entry) => ({
                    hostname: entry.hostname,
                    contentCss: entry.contentCss,
                    titleCss: entry.titleCss,
                    removeCss: entry.removeCss,
                })),
            );
        } catch {
            renderSiteSelectors(this.#elements, []);
        }
    }

    /** Forget one site's saved selectors. */
    async #forgetSiteSelectors(hostname: string): Promise<void> {
        try {
            await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "site-selectors:remove",
                { hostname },
            );
        } catch {
            // Nothing to do: the list is reloaded below either way.
        }
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

    /** Render. */
    #render(): void {
        if (!this.#settings) return;

        const values = flatten(this.#settings);
        const active = this.#active === "library" || this.#active === "site-selectors"
            ? "appearance"
            : this.#active;
        renderNav(this.#elements, GROUPS, active);
        renderGroups(this.#elements, GROUPS, values, this.#query);

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
function flatten(settings: Settings): Record<string, unknown> {
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

/** Start the page. */
async function main(): Promise<void> {
    installI18n();
    const controller = new OptionsController(document.body);
    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The options page failed to start:", error);
});

// The types are re-exported so a reader of this file can see which settings
// groups exist without opening the settings store.
export type { AppearanceSettings, StorySettings, EpubSettings, ImageSettings, BehaviourSettings, PrivacySettings, AdvancedSettings };
