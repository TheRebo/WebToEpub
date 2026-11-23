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

    it("refuses a value that is not an object", () => {
        expect(validateSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
        expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
    });

    it("clamps a number that is out of range", () => {
        const settings = validateSettings({ images: { maxResolution: 999999 } });
        expect(settings.images.maxResolution).toBe(10000);
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
});
