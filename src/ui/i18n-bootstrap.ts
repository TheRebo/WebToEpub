/**
 * The i18n bootstrap.
 *
 * Every extension page calls {@link installI18n} once, before it renders
 * anything. Without this step {@link t} has no API to talk to and returns the
 * raw message key — the user sees `popupSettings` instead of "Settings".
 *
 * The page entry points call it rather than the i18n module itself, because
 * the module must stay usable outside an extension (in a unit test, or in a
 * static preview of a component) where there is no `browser` global at all.
 */
import { setI18nApi, type I18nApi } from "./i18n";

/**
 * Read the extension's i18n API, if this context has one.
 *
 * Firefox exposes `browser`; Chromium exposes `chrome`. Both are checked so
 * that the same bundle can be loaded in either browser during development,
 * even though only Firefox is a supported target.
 */
function readI18nApi(): I18nApi | undefined {
    const global = globalThis as unknown as {
        browser?: { i18n?: I18nApi };
        chrome?: { i18n?: I18nApi };
    };

    const api = global.browser?.i18n ?? global.chrome?.i18n;
    if (!api || typeof api.getMessage !== "function") return undefined;

    return api;
}

/**
 * Install the i18n API into the translation module.
 *
 * Safe to call more than once: the last call wins, and the memoisation cache
 * is cleared so that a late install does not serve stale fallbacks.
 */
export function installI18n(): void {
    setI18nApi(readI18nApi());
}
