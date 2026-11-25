import { describe, expect, it } from "vitest";
import {
    DEFAULT_SETTINGS,
    SETTINGS_KEY,
    SettingsStore,
    validateSettings,
    type Settings,
    type SettingsStorage,
} from "../../src/core/storage/settings-store";

/** A storage adapter that keeps everything in memory. */
function memoryStorage(initial: Record<string, unknown> = {}): SettingsStorage & {
    data: Record<string, unknown>;
} {
    const data: Record<string, unknown> = { ...initial };
    return {
        data,
        async get(keys) {
            if (keys === null) return { ...data };
            const list = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};
            for (const key of list) {
                if (key in data) result[key] = data[key];
            }
            return result;
        },
        async set(items) {
            Object.assign(data, items);
        },
        async remove(keys) {
            for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key];
        },
    };
}

describe("validateSettings", () => {
    it("returns the defaults for nothing at all", () => {
        expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    });

    it("keeps the values that are valid", () => {
        const settings = validateSettings({
            appearance: { theme: "dark", accent: "plum", density: "compact", reduceMotion: true },
        });
        expect(settings.appearance.theme).toBe("dark");
        expect(settings.appearance.accent).toBe("plum");
        expect(settings.appearance.density).toBe("compact");
        expect(settings.appearance.reduceMotion).toBe(true);
    });

    it("replaces the values that are not valid", () => {
        const settings = validateSettings({
            appearance: {
                theme: "neon",
                accent: "chartreuse",
                density: "tiny",
                reduceMotion: "yes",
            },
        });
        expect(settings.appearance.theme).toBe("system");
        expect(settings.appearance.accent).toBe("gold");
        expect(settings.appearance.density).toBe("comfortable");
        expect(settings.appearance.reduceMotion).toBe(false);
    });

    it("fills in the parts that are missing", () => {
        const settings = validateSettings({ appearance: { theme: "dark" } });
        expect(settings.appearance.theme).toBe("dark");
        expect(settings.appearance.accent).toBe("gold");
        expect(settings.story).toEqual(DEFAULT_SETTINGS.story);
        expect(settings.epub).toEqual(DEFAULT_SETTINGS.epub);
    });

    it("keeps the defaults for the other settings in a partly-stored group", () => {
        // A setting added in a later version is missing from the settings an
        // existing user already has. The rest of its group must keep their
        // defaults: a stored `images` group without `useSvg` must not turn
        // SVG support off, and a stored `story` group without
        // `defaultLanguage` must not leave the language empty.
        const settings = validateSettings({ images: { skipImages: true } });
        expect(settings.images.skipImages).toBe(true);
        expect(settings.images.useSvg).toBe(DEFAULT_SETTINGS.images.useSvg);
        expect(settings.images.removeDuplicates).toBe(DEFAULT_SETTINGS.images.removeDuplicates);

        const story = validateSettings({ story: { removeAuthorNotes: true } });
        expect(story.story.removeAuthorNotes).toBe(true);
        expect(story.story.defaultLanguage).toBe(DEFAULT_SETTINGS.story.defaultLanguage);
        expect(story.story.filenameTemplate).toBe(DEFAULT_SETTINGS.story.filenameTemplate);

        const behaviour = validateSettings({ behaviour: { minimumDelay: 1000 } });
        expect(behaviour.behaviour.minimumDelay).toBe(1000);
        expect(behaviour.behaviour.skipFailedChapters).toBe(
            DEFAULT_SETTINGS.behaviour.skipFailedChapters,
        );
        expect(behaviour.behaviour.retryOnEmptyPage).toBe(
            DEFAULT_SETTINGS.behaviour.retryOnEmptyPage,
        );

        const epub = validateSettings({ epub: { version: 2 } });
        expect(epub.epub.version).toBe(2);
        expect(epub.epub.removeNextPrevLinks).toBe(DEFAULT_SETTINGS.epub.removeNextPrevLinks);
    });

    it("uses the default for a value that is not valid", () => {
        // An unusable value falls back to the documented default, not to a
        // zero: a corrupt `useSvg` must not quietly turn SVG support off.
        const settings = validateSettings({
            images: { useSvg: "yes", removeDuplicates: "no" },
        });
        expect(settings.images.useSvg).toBe(DEFAULT_SETTINGS.images.useSvg);
        expect(settings.images.removeDuplicates).toBe(DEFAULT_SETTINGS.images.removeDuplicates);
    });

    it("refuses a value that is not an object", () => {
        expect(validateSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
        expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
    });

    it("clamps a number that is out of range", () => {
        const settings = validateSettings({ behaviour: { maxChapters: 999999 } });
        expect(settings.behaviour.maxChapters).toBe(100000);
    });

    it("does not keep a setting that has been taken away", () => {
        // The settings that were removed in this release are not in the
        // schema, so they are dropped rather than carried forward into a
        // settings file that would then export them again.
        const settings = validateSettings({
            images: { compress: true, maxResolution: 4000 },
            privacy: { metadataLookup: true, sendStoryUrl: true },
        }) as unknown as Record<string, Record<string, unknown>>;

        expect(settings["images"]).not.toHaveProperty("compress");
        expect(settings["images"]).not.toHaveProperty("maxResolution");
        expect(settings["privacy"]).toBeUndefined();
    });

    it("cannot be used to inject a prototype", () => {
        const settings = validateSettings(JSON.parse('{"__proto__": {"polluted": true}}'));
        expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
        expect(settings).toEqual(DEFAULT_SETTINGS);
    });
});

describe("SettingsStore", () => {
    it("reads the defaults when nothing has been stored", async () => {
        const store = new SettingsStore(memoryStorage());
        const settings = await store.get();
        expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it("reads what was stored", async () => {
        const storage = memoryStorage({
            [SETTINGS_KEY]: { appearance: { theme: "dark" } },
        });
        const store = new SettingsStore(storage);
        const settings = await store.get();
        expect(settings.appearance.theme).toBe("dark");
    });

    it("writes the whole object back", async () => {
        const storage = memoryStorage();
        const store = new SettingsStore(storage);
        const settings = await store.get();
        settings.appearance.accent = "verdigris";
        await store.set(settings);
        expect(storage.data[SETTINGS_KEY]).toBeDefined();
        const reread = await new SettingsStore(storage).get();
        expect(reread.appearance.accent).toBe("verdigris");
    });

    it("merges a partial update", async () => {
        const storage = memoryStorage();
        const store = new SettingsStore(storage);
        await store.update({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: "dark" } });
        const settings = await store.get();
        expect(settings.appearance.theme).toBe("dark");
        expect(settings.appearance.accent).toBe("gold");
    });

    it("removes only its own key when it is reset", async () => {
        const storage = memoryStorage({ "something.else": "keep me" });
        const store = new SettingsStore(storage);
        await store.set({ ...DEFAULT_SETTINGS } as Settings);
        await store.reset();
        expect(storage.data[SETTINGS_KEY]).toBeUndefined();
        expect(storage.data["something.else"]).toBe("keep me");
    });

    it("does not let two overlapping updates discard each other", async () => {
        // An update is a read-modify-write. Two of them that overlap each
        // read the same snapshot, so the second write would drop the first
        // one's change. The workbench saves the story's options from two
        // different handlers, so this happens in real use.
        const storage = memoryStorage();
        const store = new SettingsStore(storage);

        const first = store.update({
            appearance: { ...DEFAULT_SETTINGS.appearance, theme: "dark" },
        });
        const second = store.update({
            story: { ...DEFAULT_SETTINGS.story, defaultLanguage: "fr" },
        });
        await Promise.all([first, second]);

        const settings = await store.get();
        expect(settings.appearance.theme).toBe("dark");
        expect(settings.story.defaultLanguage).toBe("fr");
    });

    it("keeps the queue working after a failed write", async () => {
        const storage = memoryStorage();
        let failNext = true;
        const failing: SettingsStorage = {
            ...storage,
            async set(items) {
                if (failNext) {
                    failNext = false;
                    throw new Error("the disk is full");
                }
                await storage.set(items);
            },
        };
        const store = new SettingsStore(failing);

        await expect(
            store.update({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: "dark" } }),
        ).rejects.toThrow("the disk is full");

        // The next update still runs.
        await store.update({ appearance: { ...DEFAULT_SETTINGS.appearance, theme: "light" } });
        expect((await store.get()).appearance.theme).toBe("light");
    });

    it("does not report a value that was never written", async () => {
        // The cache is only updated once the write has succeeded. A failed
        // write — a full disk, say — must not leave the store reporting a
        // value that was never persisted.
        const storage = memoryStorage();
        const failing: SettingsStorage = {
            ...storage,
            async set() {
                throw new Error("the disk is full");
            },
        };
        const store = new SettingsStore(failing);

        // The default settings object is shared, so it is copied deeply
        // before anything is changed.
        const settings = structuredClone(DEFAULT_SETTINGS) as Settings;
        settings.appearance.theme = "dark";
        await expect(store.set(settings)).rejects.toThrow("the disk is full");

        // Nothing was stored, so a read still reports the defaults rather
        // than the theme that failed to save.
        expect((await store.get()).appearance.theme).toBe("system");
        expect(storage.data[SETTINGS_KEY]).toBeUndefined();
    });
});
