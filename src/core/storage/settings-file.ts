/**
 * The settings file.
 *
 * The user can take their settings out of the extension and put them back —
 * on another computer, or after reinstalling. The file is a small JSON
 * document with a format marker, so that a file that is *not* a settings file
 * is refused rather than half-applied.
 *
 * The file holds the settings and nothing else. It deliberately does not hold
 * the library, the saved site selectors, or anything else: those are the
 * user's work, not their preferences, and a file that travels between
 * machines should not silently carry a library with it.
 *
 * See ADR-0028.
 */

import { validateSettings, type Settings } from "./settings-store";

/** The marker that says "this file is a Kintsugi settings file". */
export const SETTINGS_FILE_FORMAT = "kintsugi-settings";

/** The version of the file format. */
export const SETTINGS_FILE_VERSION = 1;

/** The name of the exported file. */
export const SETTINGS_FILE_NAME = "kintsugi-settings.json";

/** A settings file. */
export interface SettingsFile {
    /** The format marker. */
    format: string;
    /** The format's version. */
    version: number;
    /** The settings themselves. */
    settings: Settings;
}

/**
 * Build the file's contents.
 *
 * @param settings The settings.
 * @returns The file, ready to be written as JSON.
 */
export function buildSettingsFile(settings: Settings): SettingsFile {
    return {
        format: SETTINGS_FILE_FORMAT,
        version: SETTINGS_FILE_VERSION,
        settings: validateSettings(settings),
    };
}

/**
 * What is wrong with a file that could not be read.
 *
 * - `not-json`: the file is not JSON at all.
 * - `wrong-file`: the file is JSON, but it is not a settings file.
 * - `damaged`: the file is a settings file, but its settings are not usable.
 */
export type SettingsFileProblem = "not-json" | "wrong-file" | "damaged";

/** The result of reading a settings file. */
export type SettingsFileResult =
    | { ok: true; settings: Settings }
    | { ok: false; problem: SettingsFileProblem };

/**
 * Read a settings file.
 *
 * The settings are validated against the schema, so a file that has been
 * edited by hand — or written by a newer version of the extension — is read
 * as far as it can be, and the parts that cannot be read fall back to their
 * defaults rather than failing the whole import.
 *
 * @param text The file's contents.
 * @returns The settings, or the reason they could not be read.
 */
export function parseSettingsFile(text: string): SettingsFileResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { ok: false, problem: "not-json" };
    }

    if (typeof parsed !== "object" || parsed === null) {
        return { ok: false, problem: "wrong-file" };
    }

    const file = parsed as Partial<SettingsFile>;
    if (file.format !== SETTINGS_FILE_FORMAT) {
        return { ok: false, problem: "wrong-file" };
    }

    if (typeof file.settings !== "object" || file.settings === null) {
        return { ok: false, problem: "damaged" };
    }

    return { ok: true, settings: validateSettings(file.settings) };
}
