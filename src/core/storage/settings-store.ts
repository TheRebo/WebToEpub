/**
 * Typed settings storage.
 *
 * Settings live in `browser.storage.local` under a single namespaced key, and
 * are **validated against a schema on read**. A value that does not match the
 * schema is discarded and the default used, rather than merged into live
 * state — which is what makes prototype pollution through stored data
 * impossible.
 *
 * The baseline had two defects here: `chrome.storage.local.clear()` wiped
 * *every* key, including data belonging to other features, and there was no
 * validation at all.
 *
 * See ADR-0006.
 */

/** The appearance settings. */
export interface AppearanceSettings {
    /** `system`, `light`, or `dark`. */
    theme: "system" | "light" | "dark";
    /** The accent colour name. */
    accent: "gold" | "ink" | "verdigris" | "plum";
    /** `comfortable` or `compact`. */
    density: "comfortable" | "compact";
    /** Whether to reduce motion regardless of the system setting. */
    reduceMotion: boolean;
}

/** The per-story settings. */
export interface StorySettings {
    /** The filename template. */
    filenameTemplate: string;
    /** The default language. */
    defaultLanguage: string;
    /** Whether to strip author notes. */
    removeAuthorNotes: boolean;
    /** Whether to strip chapter numbers from titles. */
    removeChapterNumbers: boolean;
    /** Whether to include the table-of-contents page as a chapter. */
    includeTocPage: boolean;
}

/** The EPUB settings. */
export interface EpubSettings {
    /** The EPUB version. */
    version: 2 | 3;
    /** Whether to add an information page. */
    addInfoPage: boolean;
    /** Whether to remove next/previous chapter links. */
    removeNextPrevLinks: boolean;
    /** Whether to include the source URL in each chapter. */
    includeSourceUrl: boolean;
}

/** The image settings. */
export interface ImageSettings {
    /** Whether to skip images entirely. */
    skipImages: boolean;
    /** Whether to remove duplicate images. */
    removeDuplicates: boolean;
    /** Whether to prefer the highest resolution source. */
    preferHighestResolution: boolean;
    /** Whether to allow SVG images. */
    useSvg: boolean;
    /** Whether to compress images. */
    compress: boolean;
    /** The maximum resolution, in pixels. */
    maxResolution: number;
}

/** The behaviour settings. */
export interface BehaviourSettings {
    /** Whether to skip chapters that fail to fetch. */
    skipFailedChapters: boolean;
    /** Whether to retry on an empty page. */
    retryOnEmptyPage: boolean;
    /** The minimum delay between requests, in milliseconds. */
    minimumDelay: number;
    /** The maximum number of chapters in one EPUB. */
    maxChapters: number;
    /** The delay between chapters, in milliseconds. */
    delayPerChapter: number;
}

/** The privacy settings. */
export interface PrivacySettings {
    /** Whether to look up book metadata. */
    metadataLookup: boolean;
    /** Whether to send the story URL to the metadata service. */
    sendStoryUrl: boolean;
}

/** The advanced settings. */
export interface AdvancedSettings {
    /** Whether developer diagnostics are enabled. */
    diagnostics: boolean;
}

/** Every setting. */
export interface Settings {
    appearance: AppearanceSettings;
    story: StorySettings;
    epub: EpubSettings;
    images: ImageSettings;
    behaviour: BehaviourSettings;
    privacy: PrivacySettings;
    advanced: AdvancedSettings;
    /** Whether the onboarding has been completed. */
    onboardingComplete: boolean;
}

/** The default settings. */
export const DEFAULT_SETTINGS: Settings = {
    appearance: {
        theme: "system",
        accent: "gold",
        density: "comfortable",
        reduceMotion: false,
    },
    story: {
        filenameTemplate: "{title}",
        defaultLanguage: "en",
        removeAuthorNotes: false,
        removeChapterNumbers: false,
        includeTocPage: false,
    },
    epub: {
        version: 3,
        addInfoPage: false,
        removeNextPrevLinks: true,
        includeSourceUrl: false,
    },
    images: {
        skipImages: false,
        removeDuplicates: true,
        preferHighestResolution: true,
        useSvg: true,
        compress: false,
        maxResolution: 2000,
    },
    behaviour: {
        skipFailedChapters: true,
        retryOnEmptyPage: true,
        minimumDelay: 500,
        maxChapters: 5000,
        delayPerChapter: 0,
    },
    privacy: {
        metadataLookup: false,
        sendStoryUrl: false,
    },
    advanced: {
        diagnostics: false,
    },
    onboardingComplete: false,
};

/** The storage key. */
export const SETTINGS_KEY = "kintsugi.settings";

/** A validator for a value. */
type Validator<T> = (value: unknown) => T;

/** A validator for a boolean. */
const boolean: Validator<boolean> = (value) => (typeof value === "boolean" ? value : false);

/** A validator for a string. */
const string: Validator<string> = (value) => (typeof value === "string" ? value : "");

/** A validator for a number within a range. */
const integerIn =
    (min: number, max: number, fallback: number): Validator<number> =>
    (value) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, Math.round(value)));
    };

/** A validator for one of a set of literals. */
const oneOf =
    <T extends string>(allowed: readonly T[], fallback: T): Validator<T> =>
    (value) =>
        typeof value === "string" && (allowed as readonly string[]).includes(value)
            ? (value as T)
            : fallback;

/** A validator for one of a set of numeric literals. */
const oneOfNumber =
    <T extends number>(allowed: readonly T[], fallback: T): Validator<T> =>
    (value) =>
        typeof value === "number" && (allowed as readonly number[]).includes(value)
            ? (value as T)
            : fallback;

/** Build a validator for an object from a shape. */
function shape<T extends Record<string, Validator<unknown>>>(
    definition: T,
): Validator<Record<string, unknown>> {
    return (value) => {
        const result: Record<string, unknown> = {};
        if (typeof value !== "object" || value === null) return result;
        const source = value as Record<string, unknown>;
        for (const [key, validator] of Object.entries(definition)) {
            result[key] = validator(source[key]);
        }
        return result;
    };
}

/** The schema for the settings. */
const SETTINGS_SCHEMA = {
    appearance: shape({
        theme: oneOf(["system", "light", "dark"] as const, "system"),
        accent: oneOf(["gold", "ink", "verdigris", "plum"] as const, "gold"),
        density: oneOf(["comfortable", "compact"] as const, "comfortable"),
        reduceMotion: boolean,
    }),
    story: shape({
        filenameTemplate: string,
        defaultLanguage: string,
        removeAuthorNotes: boolean,
        removeChapterNumbers: boolean,
        includeTocPage: boolean,
    }),
    epub: shape({
        version: oneOfNumber([2, 3] as const, 3),
        addInfoPage: boolean,
        removeNextPrevLinks: boolean,
        includeSourceUrl: boolean,
    }),
    images: shape({
        skipImages: boolean,
        removeDuplicates: boolean,
        preferHighestResolution: boolean,
        useSvg: boolean,
        compress: boolean,
        maxResolution: integerIn(100, 10000, 2000),
    }),
    behaviour: shape({
        skipFailedChapters: boolean,
        retryOnEmptyPage: boolean,
        minimumDelay: integerIn(0, 60000, 500),
        maxChapters: integerIn(1, 100000, 5000),
        delayPerChapter: integerIn(0, 60000, 0),
    }),
    privacy: shape({
        metadataLookup: boolean,
        sendStoryUrl: boolean,
    }),
    advanced: shape({
        diagnostics: boolean,
    }),
    onboardingComplete: boolean,
};

/**
 * Validate a stored value against the schema, filling in the defaults for
 * anything missing or invalid.
 */
export function validateSettings(value: unknown): Settings {
    const validated = SETTINGS_SCHEMA as unknown as Validator<Record<string, unknown>>;
    const result = validated(value);

    // Merge the validated result over the defaults so a partially-written
    // settings object still yields a complete, coherent set.
    const defaults = structuredClone(DEFAULT_SETTINGS);
    return deepMerge(defaults, result) as Settings;
}

/** Merge a partial object over a base object. */
function deepMerge<T>(base: T, override: Record<string, unknown>): T {
    if (typeof base !== "object" || base === null) return base as T;
    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(override)) {
        if (value === undefined) continue;
        const current = result[key];
        if (
            typeof current === "object" &&
            current !== null &&
            !Array.isArray(current) &&
            typeof value === "object" &&
            value !== null &&
            !Array.isArray(value)
        ) {
            result[key] = deepMerge(current, value as Record<string, unknown>);
        } else if (value !== null && value !== undefined) {
            result[key] = value;
        }
    }
    return result as T;
}

/** The storage API the store depends on. */
export interface SettingsStorage {
    get(keys: string | string[] | null): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
    remove(keys: string | string[]): Promise<void>;
}

/**
 * The settings store.
 */
export class SettingsStore {
    #storage: SettingsStorage;
    #cache: Settings | undefined;

    constructor(storage: SettingsStorage) {
        this.#storage = storage;
    }

    /** Read the settings, validating them. */
    async get(): Promise<Settings> {
        if (this.#cache) return this.#cache;
        const stored = await this.#storage.get(SETTINGS_KEY);
        const raw = stored[SETTINGS_KEY];
        this.#cache = validateSettings(raw);
        return this.#cache;
    }

    /** Write the settings. */
    async set(settings: Settings): Promise<void> {
        const validated = validateSettings(settings);
        this.#cache = validated;
        await this.#storage.set({ [SETTINGS_KEY]: validated });
    }

    /**
     * Update part of the settings.
     */
    async update(partial: Partial<Settings>): Promise<Settings> {
        const current = await this.get();
        const next = validateSettings(deepMerge(current, partial as Record<string, unknown>));
        await this.set(next);
        return next;
    }

    /**
     * Reset the settings to their defaults.
     *
     * Unlike the baseline's `chrome.storage.local.clear()`, this removes
     * **only** the settings key. Other keys — the reading list, the custom
     * parsers — are untouched.
     */
    async reset(): Promise<Settings> {
        await this.#storage.remove(SETTINGS_KEY);
        this.#cache = undefined;
        return this.get();
    }

    /** Clear the cache, so the next read comes from storage. */
    invalidate(): void {
        this.#cache = undefined;
    }
}
