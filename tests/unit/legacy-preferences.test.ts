/**
 * Tests for the user's preferences reaching the migrated parsers.
 *
 * The 437 migrated parsers were written against the baseline's
 * `UserPreferences`. The rewrite keeps its settings in a typed store, so the
 * two shapes have to meet somewhere — and if they do not, every legacy parser
 * silently runs with the defaults, whatever the user has configured.
 *
 * These tests pin the bridge down.
 */
import { describe, expect, it } from "vitest";
import {
    defaultLegacyUserPreferences,
    toLegacyUserPreferences,
} from "../../src/core/parsers/compat/legacy-preferences";
import { LegacyParser } from "../../src/core/parsers/compat/legacy-parser";
import type { ParserServices } from "../../src/core/parsers/parser";
import { DEFAULT_SETTINGS, type Settings } from "../../src/core/storage/settings-store";

/** The settings, with one group changed. */
function settingsWith(overrides: Record<string, Record<string, unknown>>): Settings {
    const settings = structuredClone(DEFAULT_SETTINGS);
    for (const [group, value] of Object.entries(overrides)) {
        Object.assign(
            settings[group as keyof Settings] as unknown as Record<string, unknown>,
            value,
        );
    }
    return settings;
}

describe("the legacy preferences", () => {
    it("carry the story settings", () => {
        const preferences = toLegacyUserPreferences(
            settingsWith({ story: { removeAuthorNotes: true, removeChapterNumbers: true } }),
        );
        expect(preferences.removeAuthorNotes.value).toBe(true);
        expect(preferences.removeChapterNumbers.value).toBe(true);
    });

    it("carry the behaviour settings", () => {
        const preferences = toLegacyUserPreferences(
            settingsWith({ behaviour: { skipFailedChapters: true, delayPerChapter: 1500 } }),
        );
        expect(preferences.skipChaptersThatFailFetch.value).toBe(true);
        expect(preferences.manualDelayPerChapter.value).toBe("1500");
    });

    it("carry the image settings", () => {
        const preferences = toLegacyUserPreferences(
            settingsWith({
                images: {
                    skipImages: true,
                    removeDuplicates: false,
                    preferHighestResolution: false,
                    useSvg: false,
                },
            }),
        );
        expect(preferences.skipImages.value).toBe(true);
        expect(preferences.removeDuplicateImages.value).toBe(false);
        expect(preferences.highestResolutionImages.value).toBe(false);
        expect(preferences.useSvgForImages.value).toBe(false);
    });

    it("carry the EPUB settings", () => {
        const preferences = toLegacyUserPreferences(
            settingsWith({
                epub: { addInfoPage: true, removeNextPrevLinks: false, includeSourceUrl: true },
            }),
        );
        expect(preferences.addInformationPage.value).toBe(true);
        expect(preferences.removeNextAndPreviousChapterHyperlinks.value).toBe(false);
        expect(preferences.includeImageSourceUrl.value).toBe(true);
    });

    it("treat the minimum delay as a floor rather than an override", () => {
        // The rewrite's `minimumDelay` is the user's *floor*: a site that asks
        // for a longer pause always gets it. The legacy flag meant "replace
        // the parser's delay with mine", which is a different thing entirely,
        // and honouring it would let the extension hammer a site that asked
        // to be left alone.
        const preferences = toLegacyUserPreferences(
            settingsWith({ behaviour: { minimumDelay: 5000 } }),
        );
        expect(preferences.overrideMinimumDelay.value).toBe(false);
    });

    it("fall back to the defaults when the settings cannot be read", () => {
        const preferences = defaultLegacyUserPreferences();
        // The same defaults the settings store has, so a download behaves
        // the same whether or not the settings could be read.
        expect(preferences.removeAuthorNotes.value).toBe(DEFAULT_SETTINGS.story.removeAuthorNotes);
        expect(preferences.addInformationPage.value).toBe(DEFAULT_SETTINGS.epub.addInfoPage);
        expect(preferences.skipChaptersThatFailFetch.value).toBe(
            DEFAULT_SETTINGS.behaviour.skipFailedChapters,
        );
        expect(preferences.highestResolutionImages.value).toBe(
            DEFAULT_SETTINGS.images.preferHighestResolution,
        );
    });

    it("removes the untranslated text by default, as the original extension did", () => {
        expect(defaultLegacyUserPreferences().removeOriginal.value).toBe(true);
        expect(toLegacyUserPreferences(DEFAULT_SETTINGS).removeOriginal.value).toBe(true);
    });
});

/** A parser that does nothing, but is a legacy one. */
class StubLegacyParser extends LegacyParser {
    override getChapterUrls(): never[] {
        return [];
    }
    override findContent(): null {
        return null;
    }
}

describe("a migrated parser", () => {
    it("is given the preferences from the services", () => {
        const preferences = toLegacyUserPreferences(
            settingsWith({ story: { removeAuthorNotes: true } }),
        );
        const services = {
            fetchHtml: async () => ({
                dom: new DOMParser().parseFromString("", "text/html"),
                url: "",
            }),
            fetchJson: async () => ({ json: null }),
            util: {} as ParserServices["util"],
            imageCollector: { images: new Map(), addImage: async () => undefined },
            preferences,
        } satisfies ParserServices;

        const parser = new StubLegacyParser(services);
        expect(parser.userPreferences.removeAuthorNotes.value).toBe(true);
    });

    it("keeps the defaults when the services carry no preferences", () => {
        const services = {
            fetchHtml: async () => ({
                dom: new DOMParser().parseFromString("", "text/html"),
                url: "",
            }),
            fetchJson: async () => ({ json: null }),
            util: {} as ParserServices["util"],
            imageCollector: { images: new Map(), addImage: async () => undefined },
        } satisfies ParserServices;

        const parser = new StubLegacyParser(services);
        expect(parser.userPreferences.removeAuthorNotes.value).toBe(false);
    });

    it("ignores something in the services that is not the preferences", () => {
        const services = {
            fetchHtml: async () => ({
                dom: new DOMParser().parseFromString("", "text/html"),
                url: "",
            }),
            fetchJson: async () => ({ json: null }),
            util: {} as ParserServices["util"],
            imageCollector: { images: new Map(), addImage: async () => undefined },
            preferences: { somethingElse: true },
        } satisfies ParserServices;

        const parser = new StubLegacyParser(services);
        expect(parser.userPreferences.removeAuthorNotes.value).toBe(false);
    });
});
