/**
 * The settings file.
 *
 * The user can take their settings out of the extension and put them back. A
 * file that is not a settings file has to be refused rather than half-applied,
 * and a file that has been edited by hand has to be read as far as it can be.
 */
import { describe, expect, it } from "vitest";
import {
    buildSettingsFile,
    parseSettingsFile,
    SETTINGS_FILE_FORMAT,
    SETTINGS_FILE_NAME,
    SETTINGS_FILE_VERSION,
} from "../../src/core/storage/settings-file";
import { DEFAULT_SETTINGS } from "../../src/core/storage/settings-store";

describe("the settings file", () => {
    it("is named after the extension", () => {
        expect(SETTINGS_FILE_NAME).toBe("kintsugi-settings.json");
    });

    it("carries the settings and a marker", () => {
        const file = buildSettingsFile(DEFAULT_SETTINGS);

        expect(file.format).toBe(SETTINGS_FILE_FORMAT);
        expect(file.version).toBe(SETTINGS_FILE_VERSION);
        expect(file.settings.appearance.theme).toBe(DEFAULT_SETTINGS.appearance.theme);
    });

    it("round-trips", () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            appearance: { ...DEFAULT_SETTINGS.appearance, theme: "dark" as const },
        };

        const text = JSON.stringify(buildSettingsFile(settings));
        const result = parseSettingsFile(text);

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.appearance.theme).toBe("dark");
    });

    it("refuses a file that is not JSON", () => {
        const result = parseSettingsFile("this is not a file");

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problem).toBe("not-json");
    });

    it("refuses a file that is not a settings file", () => {
        const result = parseSettingsFile(JSON.stringify({ hello: "world" }));

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problem).toBe("wrong-file");
    });

    it("refuses a settings file with no settings in it", () => {
        const result = parseSettingsFile(
            JSON.stringify({ format: SETTINGS_FILE_FORMAT, version: SETTINGS_FILE_VERSION }),
        );

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.problem).toBe("damaged");
    });

    it("fills in the settings a file leaves out", () => {
        // A file written by hand, or by a version of the extension that knows
        // about a setting this one does not, is read as far as it can be.
        const result = parseSettingsFile(
            JSON.stringify({
                format: SETTINGS_FILE_FORMAT,
                version: SETTINGS_FILE_VERSION,
                settings: { appearance: { theme: "dark" } },
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.appearance.theme).toBe("dark");
        expect(result.settings.appearance.accent).toBe(DEFAULT_SETTINGS.appearance.accent);
        expect(result.settings.behaviour.minimumDelay).toBe(
            DEFAULT_SETTINGS.behaviour.minimumDelay,
        );
    });

    it("does not let a file carry a setting that has been taken away", () => {
        const result = parseSettingsFile(
            JSON.stringify({
                format: SETTINGS_FILE_FORMAT,
                version: SETTINGS_FILE_VERSION,
                settings: { images: { compress: true, maxResolution: 4000 } },
            }),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.settings.images).not.toHaveProperty("compress");
        expect(result.settings.images).not.toHaveProperty("maxResolution");
    });
});
