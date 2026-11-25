/**
 * The user's preferences, in the shape the legacy parsers read them.
 *
 * The 437 migrated parsers were written against the baseline's
 * `UserPreferences`: a bag of `{ value }` boxes, read directly by the parser.
 * The rewrite keeps its settings in a typed, validated store, so the two
 * shapes have to meet somewhere.
 *
 * This module is that meeting point. It turns the rewrite's settings into the
 * legacy shape, so a migrated parser sees exactly what it was written to see.
 *
 * Without it, every legacy parser ran with the *defaults* — the author notes
 * were never removed, the information page was never added, the highest-
 * resolution image was never used — however the user had configured the
 * extension. The settings were stored, validated and shown in the options
 * page, and then quietly did nothing.
 *
 * See ADR-0026.
 */

import type { Settings } from "../../storage/settings-store";
import { makeLegacyUserPreferences, type LegacyUserPreferences } from "./legacy-image-collector";

/**
 * Turn the rewrite's settings into the legacy preferences.
 *
 * The mapping is one-to-one, with the two legacy names that the rewrite
 * renamed kept in step:
 *
 * - `removeAuthorNotes` is the story group's setting of the same name;
 * - `highestResolutionImages` is the image group's `preferHighestResolution`;
 * - `removeDuplicateImages` is the image group's `removeDuplicates`;
 * - `useSvgForImages` is the image group's `useSvg`;
 * - `skipChaptersThatFailFetch` is the behaviour group's `skipFailedChapters`.
 *
 * @param settings The user's settings.
 * @returns The preferences, in the shape the legacy parsers read.
 */
export function toLegacyUserPreferences(settings: Settings): LegacyUserPreferences {
    const preferences = makeLegacyUserPreferences();

    const flag = (target: { value: boolean }, value: boolean): void => {
        target.value = value;
    };

    // --- Story ---
    flag(preferences.removeAuthorNotes, settings.story.removeAuthorNotes);
    flag(preferences.removeChapterNumbers, settings.story.removeChapterNumbers);
    flag(preferences.chaptersPageInChapterList, settings.story.includeTocPage);

    // --- Behaviour ---
    flag(preferences.skipChaptersThatFailFetch, settings.behaviour.skipFailedChapters);
    preferences.manualDelayPerChapter.value = String(settings.behaviour.delayPerChapter);
    // The rewrite's `minimumDelay` is a floor, not an override: the parser's
    // own politeness budget always wins. The legacy flag meant "replace the
    // parser's delay with mine", which is a different thing and would have
    // made the extension hammer a site that asked for a longer pause.
    preferences.overrideMinimumDelay.value = false;

    // --- Images ---
    flag(preferences.skipImages, settings.images.skipImages);
    flag(preferences.removeDuplicateImages, settings.images.removeDuplicates);
    flag(preferences.highestResolutionImages, settings.images.preferHighestResolution);
    flag(preferences.useSvgForImages, settings.images.useSvg);

    // --- EPUB ---
    flag(preferences.addInformationPage, settings.epub.addInfoPage);
    flag(preferences.removeNextAndPreviousChapterHyperlinks, settings.epub.removeNextPrevLinks);
    flag(preferences.includeImageSourceUrl, settings.epub.includeSourceUrl);

    // --- Privacy ---
    flag(preferences.noContentToError403, settings.privacy.metadataLookup);

    return preferences;
}

/**
 * The preferences a parser should run with, when the settings cannot be read.
 *
 * A failure to read the settings is not a reason to fail the download, so the
 * defaults are used. They are the same defaults the settings store has, so
 * the run behaves the way the user would expect.
 */
export function defaultLegacyUserPreferences(): LegacyUserPreferences {
    return makeLegacyUserPreferences();
}
