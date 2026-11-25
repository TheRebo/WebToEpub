/**
 * The locale generator.
 *
 * The extension ships four languages. Keeping four hand-edited JSON files
 * in sync is a reliable way to ship a broken translation, so the English
 * source is the single truth and this script generates the rest from it.
 *
 * A translation that is missing falls back to the English string at run
 * time, so a partially-translated locale is still better than a broken one.
 *
 * Usage:
 *   node tools/make-locales.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src", "_locales");

/**
 * The English source.
 *
 * `message` is the text. `description` explains what the string is for, so a
 * translator knows what it means without reading the code.
 *
 * `placeholders` names the substitution points used by a message. Firefox
 * refuses to load a locale whose `$TOKEN$` has no matching declaration, so
 * every placeholder has to be declared explicitly — the generator does that
 * for all locales at once, which keeps the tokens in lockstep across
 * languages.
 */
const SOURCE = {
    appName: ["Kintsugi", "The extension's name."],
    appTagline: [
        "Turn any web novel into a book worth keeping.",
        "A one-line description of the extension.",
    ],

    // --- Workbench ---
    workbenchTitle: ["Workbench", "The title of the main page."],
    workbenchStoryDetails: ["Story details", "The heading of the metadata panel."],
    workbenchCover: ["Cover", "The heading of the cover section."],
    workbenchOptions: ["Options", "The heading of the options section."],
    workbenchChapters: ["Chapters", "The heading of the chapter list."],
    workbenchChaptersFound: ["$COUNT$ chapters found", "How many chapters were found."],
    workbenchChapterCount: [
        "$VISIBLE$ of $TOTAL$",
        "How many chapters are visible, out of how many were found.",
    ],
    workbenchPack: ["Build EPUB", "The button that builds the book."],
    workbenchSave: ["Save", "The button that saves the metadata."],
    workbenchCancel: ["Cancel", "The button that stops a download."],
    workbenchSelectAll: ["Select all", "The button that selects every chapter."],
    workbenchSelectNone: ["Select none", "The button that deselects every chapter."],
    workbenchInvert: ["Invert", "The button that inverts the selection."],
    workbenchRanges: ["Ranges", "The button that picks a range of chapters."],
    workbenchRangeTitle: ["Select a range", "The heading of the range dialog."],
    workbenchRangeFrom: ["First chapter", "The first chapter of the range."],
    workbenchRangeTo: ["Last chapter", "The last chapter of the range."],
    workbenchRangeCount: ["$COUNT$ chapters", "How many chapters the range covers."],
    workbenchRangeSelect: ["Select range", "Selects the chapters in the range."],
    workbenchRangeDeselect: ["Deselect range", "Deselects the chapters in the range."],
    workbenchRangeInvalid: [
        "Enter a chapter number between 1 and $COUNT$.",
        "Shown when the range cannot be used.",
    ],
    workbenchFilter: ["Filter", "The button that opens the filter."],
    workbenchNoChaptersSelected: ["No chapters selected", "Shown when nothing is ticked."],
    workbenchWaitingForChapters: ["Looking for chapters…", "Shown while the chapter list loads."],
    workbenchDetected: ["Detected", "Shown when a parser recognised the site."],
    workbenchFieldTitle: ["Title", "The story's title."],
    workbenchFieldAuthor: ["Author", "The story's author."],
    workbenchFieldLanguage: ["Language", "The story's language."],
    workbenchFieldFilename: ["File name", "The name the EPUB is saved under."],
    workbenchResetFilename: ["Reset", "Restores the default file name."],
    workbenchChooseFromPage: ["Choose from page", "Picks the cover image from the page."],
    workbenchRemoveCover: ["Remove cover", "Removes the cover image."],
    workbenchIncludeAuthorNotes: [
        "Include author notes",
        "Keeps the notes at the end of a chapter.",
    ],
    workbenchIncludeTocPage: [
        "Include the contents page",
        "Adds the table of contents as a chapter.",
    ],
    workbenchMoreOptions: ["More options", "Opens the full settings page."],
    workbenchNoCover: ["No cover", "Shown when there is no cover image."],
    workbenchCoverUrl: ["Cover image address", "The address of the cover image."],
    workbenchNoStoryHere: ["No story found on this page", "Shown when the page is not a story."],
    workbenchTryAnyway: ["Try anyway", "Opens the workbench regardless."],
    workbenchUnsupportedSite: ["This site is not supported yet", "Shown when no parser matched."],
    workbenchUseSelectorBuilder: ["Build a selector", "Opens the selector builder."],
    workbenchReloadPage: ["Reload the page", "Reloads the tab."],

    // --- Chapter states ---
    chapterStateQueued: ["Queued", "A chapter that is waiting to be fetched."],
    chapterStateFetching: ["Fetching", "A chapter that is being fetched."],
    chapterStateLoaded: ["Loaded", "A chapter that has been read."],
    chapterStateDownloaded: ["Downloaded", "A chapter that is in the book."],
    chapterStateFailed: ["Failed", "A chapter that could not be read."],
    chapterStateNotStarted: ["Not started", "A chapter that has not been fetched yet."],

    // --- Progress phases ---
    phasePreparing: ["Preparing", "The first stage of a download."],
    phaseFetchingChapters: ["Fetching chapters", "The stage that reads the chapters."],
    phaseDownloadingImages: ["Downloading images", "The stage that reads the images."],
    phaseBuildingEpub: ["Building the EPUB", "The stage that assembles the book."],
    phaseSaving: ["Saving", "The stage that writes the file."],
    phaseComplete: ["Saved", "Shown when the book is saved."],
    phaseFailed: ["Failed", "Shown when the download failed."],
    phaseCancelled: ["Cancelled", "Shown when the download was stopped."],

    // --- Popup ---
    popupOpenWorkbench: ["Open workbench", "The popup's main button."],
    popupAddToLibrary: ["Add to library", "The popup's library button."],
    popupLibraryShort: ["Library", "The popup's library button's visible label."],
    popupWorkbenchShort: ["Workbench", "The popup's workbench button's visible label."],
    popupSettings: ["Settings", "The popup's settings button."],
    popupNoStory: ["No story detected on this page.", "Shown when the page is not a story."],
    popupUnsupported: ["This site is not supported yet.", "Shown when no parser matched."],
    popupSaved: ["Your book is ready.", "Shown when a download finishes."],
    popupTryAgain: ["Try again", "The popup's retry button."],
    popupUnsupportedHost: [
        "$HOST$ is not supported yet.",
        "Shown when no parser matched the current site.",
    ],

    // --- Options ---
    optionsAppearance: ["Appearance", "The appearance settings group."],
    optionsStory: ["Story", "The story settings group."],
    optionsEpub: ["EPUB", "The EPUB settings group."],
    optionsImages: ["Images", "The image settings group."],
    optionsBehaviour: ["Behaviour", "The behaviour settings group."],
    optionsAdvanced: ["Advanced", "The advanced settings group."],
    optionsTheme: ["Theme", "The theme setting."],
    optionsAccent: ["Accent", "The accent colour setting."],
    optionsDensity: ["Density", "The density setting."],
    optionsThemeSystem: ["System", "The system theme option."],
    optionsThemeLight: ["Light", "The light theme option."],
    optionsThemeDark: ["Dark", "The dark theme option."],
    optionsAccentGold: ["Gold", "The gold accent option."],
    optionsAccentInk: ["Ink", "The ink accent option."],
    optionsAccentVerdigris: ["Verdigris", "The verdigris accent option."],
    optionsAccentPlum: ["Plum", "The plum accent option."],
    optionsDensityComfortable: ["Comfortable", "The comfortable density option."],
    optionsDensityCompact: ["Compact", "The compact density option."],
    optionsSearchSettings: ["Search settings", "The settings search box."],
    optionsSiteAccess: ["Site access", "The list of sites the extension may read."],
    optionsRevoke: ["Revoke", "Removes access to a site."],
    optionsRevokeAll: ["Revoke all", "Removes access to every site."],
    optionsExportSettings: ["Export settings", "Saves the settings to a file."],
    optionsImportSettings: ["Import settings", "Loads the settings from a file."],
    optionsResetAll: ["Reset all settings", "Restores every setting to its default."],
    optionsExported: [
        "The settings were saved to a file.",
        "Said after the settings are exported.",
    ],
    optionsImported: [
        "The settings were loaded from the file.",
        "Said after the settings are imported.",
    ],
    optionsImportInvalid: [
        "That file is not a Kintsugi settings file.",
        "Said when the imported file cannot be read.",
    ],
    optionsResetDone: [
        "Every setting is back to its default.",
        "Said after the settings are reset.",
    ],
    optionsResetConfirm: [
        "Every setting goes back to its default. Your library and your saved sites are not touched.",
        "The reset dialog's explanation.",
    ],
    optionsResetConfirmAction: ["Reset everything", "The reset dialog's confirm button."],
    optionsPrivacyNote: [
        "Kintsugi sends nothing to anyone. Every network request goes to the site you are reading.",
        "The note at the foot of the settings.",
    ],

    // --- Options: library ---
    optionsLibrary: ["Library", "The library tab, and the books you have built."],
    optionsLibraryEmptyTitle: ["Your library is empty.", "The empty library's heading."],
    optionsLibraryEmptyText: [
        "Books you build are kept here, so you can update them when a new chapter is posted.",
        "The empty library's explanation.",
    ],
    optionsLibraryChapters: ["$COUNT$ chapters", "How many chapters a book has."],
    optionsNoResults: [
        "Nothing matches that search.",
        "Shown when a settings search finds nothing.",
    ],
    optionsNavLabel: ["Settings groups", "The accessible name of the settings navigation."],
    optionsLibraryMeta: ["$CHAPTERS$ chapters · $SIZE$", "The library card's metadata line."],
    libraryRemove: ["Remove", "Removes a book from the library."],
    libraryRemoved: ["Removed from the library.", "Confirmation after removing a book."],

    // --- Options: individual settings ---
    settingReduceMotion: ["Always reduce motion", "The reduce-motion setting."],
    settingReduceMotionHint: [
        "Turns off transitions even when the system does not ask for it.",
        "Explains the reduce-motion setting.",
    ],
    settingFilenameTemplate: ["Filename template", "The filename-template setting."],
    settingFilenameTemplateHint: [
        "{title} and {author} are replaced when the file is saved.",
        "Explains the filename-template setting.",
    ],
    settingDefaultLanguage: ["Default language", "The default-language setting."],
    settingDefaultLanguageHint: [
        "The ISO 639 code used when a site does not declare one.",
        "Explains the default-language setting.",
    ],
    settingRemoveAuthorNotes: ["Remove author notes", "The remove-author-notes setting."],
    settingRemoveAuthorNotesHint: [
        "Strips the notes many authors put at the end of a chapter.",
        "Explains the remove-author-notes setting.",
    ],
    settingRemoveChapterNumbers: [
        "Remove chapter numbers from titles",
        "The remove-chapter-numbers setting.",
    ],
    settingIncludeTocPage: [
        "Include the table of contents as a chapter",
        "The include-toc-page setting.",
    ],
    settingEpubVersion: ["Version", "The EPUB-version setting."],
    settingEpubVersionHint: [
        "Version 3 is the standard. Version 2 is for older readers.",
        "Explains the EPUB-version setting.",
    ],
    settingAddInfoPage: ["Add an information page", "The information-page setting."],
    settingAddInfoPageHint: [
        "A page with the title, author, and source.",
        "Explains the information-page setting.",
    ],
    settingRemoveNextPrevLinks: [
        "Remove next and previous links",
        "The remove-next-prev-links setting.",
    ],
    settingIncludeSourceUrl: [
        "Include the source URL in each chapter",
        "The include-source-url setting.",
    ],
    settingSkipImages: ["Skip images entirely", "The skip-images setting."],
    settingRemoveDuplicates: ["Remove duplicate images", "The remove-duplicates setting."],
    settingPreferHighestResolution: [
        "Prefer the highest resolution",
        "The prefer-highest-resolution setting.",
    ],
    settingUseSvg: ["Allow SVG images", "The allow-SVG setting."],
    settingSkipFailedChapters: ["Skip chapters that fail", "The skip-failed-chapters setting."],
    settingSkipFailedChaptersHint: [
        "A failed chapter becomes a note in the book instead of stopping the run.",
        "Explains the skip-failed-chapters setting.",
    ],
    settingRetryOnEmptyPage: ["Retry on an empty page", "The retry-on-empty-page setting."],
    settingEmptyPageIsError: ["An empty page is an error", "The empty-page-is-error setting."],
    settingEmptyPageIsErrorHint: [
        "Some sites answer a blocked request with a blank page. When this is on, that page is reported as a failure instead of becoming an empty chapter.",
        "Explains the empty-page-is-error setting.",
    ],
    settingMinimumDelay: ["Minimum delay between requests", "The minimum-delay setting."],
    settingMinimumDelayHint: [
        "In milliseconds. Raise it for sites that rate-limit aggressively.",
        "Explains the minimum-delay setting.",
    ],
    settingMaxChapters: ["Maximum chapters per book", "The maximum-chapters setting."],
    settingDelayPerChapter: ["Extra delay per chapter", "The delay-per-chapter setting."],
    settingDelayPerChapterHint: [
        "In milliseconds, on top of the minimum delay.",
        "Explains the delay-per-chapter setting.",
    ],
    settingDiagnostics: ["Developer diagnostics", "The diagnostics setting."],
    settingDiagnosticsHint: [
        "Logs more detail to the console. Off by default.",
        "Explains the diagnostics setting.",
    ],

    // --- Onboarding ---
    onboardingWelcome: ["Welcome to Kintsugi", "The first onboarding step's heading."],
    onboardingStep1: ["Step 1 of 3", "The first onboarding step's label."],
    onboardingStep2: ["Step 2 of 3", "The second onboarding step's label."],
    onboardingStep3: ["Step 3 of 3", "The third onboarding step's label."],
    onboardingNext: ["Next", "The button that moves to the next step."],
    onboardingBack: ["Back", "The button that moves to the previous step."],
    onboardingFinish: ["Finish", "The button that completes the onboarding."],
    onboardingSkip: ["Skip", "The button that skips the onboarding."],
    onboardingGetStarted: ["Get started", "The button that leaves the onboarding."],
    onboardingWelcomeText: [
        "Turn any web novel into a book worth keeping. Point it at a chapter list, and it builds a clean EPUB — cover, table of contents, and all.",
        "The first onboarding step's explanation.",
    ],
    onboardingWelcomeFootnote: [
        "No account. No tracking. Works offline.",
        "The first onboarding step's footnote.",
    ],
    onboardingWhichSite: ["Which site are you reading?", "The second onboarding step's heading."],
    onboardingWhichSiteText: [
        "Kintsugi knows hundreds of sites. Open one, and it offers to build the book.",
        "The second onboarding step's explanation.",
    ],
    onboardingWhichSiteFootnote: [
        "Not listed? Kintsugi can still read it — you can build a selector yourself.",
        "The second onboarding step's footnote.",
    ],
    onboardingMakeItYours: ["Make it yours", "The third onboarding step's heading."],
    onboardingMakeItYoursText: [
        "This is a live preview. Pick what you like.",
        "The third onboarding step's explanation.",
    ],

    // --- Errors ---
    errorGeneric: ["Something went wrong. Please try again.", "The fallback error message."],
    errorNetwork: ["Could not reach the site.", "A network failure."],
    errorNoParser: ["Kintsugi does not know this site yet.", "No parser matched the URL."],
    errorTimeout: ["The site took too long to answer.", "A timeout."],
    errorCancelled: ["Cancelled.", "The user cancelled the operation."],
    errorForbidden: ["The site refused the request.", "An HTTP 403."],
    errorParse: ["The page could not be read.", "The page could not be parsed."],
    errorNoChapters: ["No chapters were found on this page.", "The chapter list was empty."],

    // --- Filter ---
    filterSearch: ["Search", "The filter's search box."],
    filterUseRegex: ["Use a regular expression", "Whether the search is a regex."],
    filterInclude: ["Include", "Only matching chapters are kept."],
    filterExclude: ["Exclude", "Matching chapters are removed."],
    filterMatchCount: ["$COUNT$ matching", "How many chapters match the filter."],
    filterClear: ["Clear", "Clears the filter."],
    filterApply: ["Apply", "Applies the filter."],
    filterInvalidPattern: [
        "That is not a valid pattern.",
        "Shown when the regex does not compile.",
    ],

    // --- Site selectors ---
    siteSelectorBannerTitle: [
        "No parser for this site",
        "The title of the banner shown when the fallback parser is used.",
    ],
    siteSelectorBannerText: [
        "Kintsugi is guessing where the story is. Tell it once and it will remember.",
        "The banner's explanation.",
    ],
    siteSelectorOpen: ["Set up this site", "The button that opens the site selector dialog."],
    siteSelectorDialogTitle: ["Site selectors", "The site selector dialog's heading."],
    siteSelectorIntro: [
        "These CSS selectors tell Kintsugi where a chapter's text is. They are remembered for this site alone.",
        "The dialog's introduction.",
    ],
    siteSelectorContent: ["Chapter text", "The label of the content selector field."],
    siteSelectorContentHint: [
        "The element that holds the chapter's text, as a CSS selector.",
        "The content selector's hint.",
    ],
    siteSelectorTitle: ["Chapter title", "The label of the title selector field."],
    siteSelectorTitleHint: [
        "The element that holds the chapter's title. Optional.",
        "The title selector's hint.",
    ],
    siteSelectorRemove: ["Elements to remove", "The label of the remove selector field."],
    siteSelectorRemoveHint: [
        "Comments, ads and navigation to strip out. Optional.",
        "The remove selector's hint.",
    ],
    siteSelectorSuggest: ["Suggest", "The button that asks the scanner for a suggestion."],
    siteSelectorSuggested: [
        "Guessed from the page. Test it before you save.",
        "Shown after the scanner has proposed selectors.",
    ],
    siteSelectorTest: ["Test", "The button that tests the selectors against the page."],
    siteSelectorTestResult: [
        "Matched $CHARS$ characters.",
        "How much text the content selector matched.",
    ],
    siteSelectorTestFailed: [
        "That selector did not match anything on this page.",
        "Shown when the test finds nothing.",
    ],
    siteSelectorInvalid: [
        "That is not a valid CSS selector.",
        "Shown when a selector does not parse.",
    ],
    siteSelectorSave: ["Save", "Saves the selectors."],
    siteSelectorSaved: [
        "Saved. Kintsugi will use these for this site from now on.",
        "Confirmation after saving.",
    ],
    siteSelectorForget: ["Forget this site", "Removes the saved selectors."],
    siteSelectorForgotten: [
        "Forgotten. Kintsugi will guess again.",
        "Confirmation after forgetting.",
    ],
    siteSelectorList: ["Site selectors", "The options page's site selector section."],
    siteSelectorListEmpty: [
        "No site has been set up yet.",
        "The empty state of the site selector list.",
    ],
    siteSelectorTocDetected: [
        "That page looks like a table of contents, not a chapter. Open a chapter and try again.",
        "Shown when the scanner recognises a table of contents.",
    ],

    // --- Shared across the components ---
    commonClose: ["Close", "The label of a button that closes a dialog."],
    commonDismiss: ["Dismiss", "The label of a button that dismisses a notification."],
    commonCancel: ["Cancel", "The label of a button that cancels an action."],
};

/**
 * The substitutions used by the messages above.
 *
 * `content` is the default text substituted when the caller does not supply
 * one, which is what keeps the raw `$COUNT$` token out of the UI if a
 * placeholder is ever forgotten at a call site.
 *
 * The `$1` here is a *default*; {@link buildMessages} rewrites it to the
 * message's own position, because Firefox substitutes placeholders
 * positionally. A message with two placeholders needs `$1` and `$2`, not two
 * `$1`s — otherwise the second value silently overwrites the first.
 */
const PLACEHOLDERS = {
    COUNT: {
        content: "$1",
        example: "42",
    },
    HOST: {
        content: "$1",
        example: "example.com",
    },
    CHAPTERS: {
        content: "$1",
        example: "42",
    },
    SIZE: {
        content: "$1",
        example: "1.2 MB",
    },
    VISIBLE: {
        content: "$1",
        example: "12",
    },
    TOTAL: {
        content: "$1",
        example: "48",
    },
    CHARS: {
        content: "$1",
        example: "4210",
    },
};
/**
 * The translations.
 *
 * A locale that is missing a key falls back to English at run time, so
 * these files only need the keys that have been translated.
 */
const LOCALES_DIR = join(ROOT, "tools", "locales");

/** The locales that are generated. */
const LOCALE_NAMES = ["en", "id", "fr", "de", "ja"];

/**
 * Load the translations for one locale.
 *
 * The files are read at run time rather than imported statically, so adding a
 * language is a matter of dropping a file in `tools/locales/`.
 */
async function loadTranslations(locale) {
    const module = await import(join(LOCALES_DIR, `${locale}.mjs`));
    return module.default ?? {};
}
/**
 * Find the `$TOKEN$` placeholders used by a message.
 *
 * @param {string} message
 * @returns {string[]} The token names, without the surrounding dollars, in the
 * order they appear.
 */
function placeholdersIn(message) {
    const names = [];
    for (const match of message.matchAll(/\$([A-Z_][A-Z0-9_]*)\$/g)) {
        if (!names.includes(match[1])) names.push(match[1]);
    }
    return names;
}

/** Build the messages object for a locale. */
function buildMessages(locale, translations) {
    const messages = {};
    for (const [key, [message, description]] of Object.entries(SOURCE)) {
        const translated = translations[key];
        const text = translated ? translated[0] : message;
        const entry = {
            message: text,
            description: translated ? translated[1] : description,
        };

        const used = placeholdersIn(text);
        if (used.length > 0) {
            entry.placeholders = {};
            used.forEach((name, index) => {
                const declaration = PLACEHOLDERS[name] ?? {
                    content: "$1",
                    example: "1",
                };
                entry.placeholders[name.toLowerCase()] = {
                    // Firefox substitutes positionally, so each placeholder in
                    // a message gets its own index.
                    content: `$${index + 1}`,
                    example: declaration.example,
                };
            });
        }

        messages[key] = entry;
    }
    return messages;
}

async function main() {
    for (const locale of LOCALE_NAMES) {
        const translations = await loadTranslations(locale);
        const directory = join(LOCALES, locale);
        await mkdir(directory, { recursive: true });
        const messages = buildMessages(locale, translations);
        await writeFile(
            join(directory, "messages.json"),
            JSON.stringify(messages, null, 2) + "\n",
            "utf8",
        );
        const count = Object.keys(translations).length;
        const total = Object.keys(SOURCE).length;
        console.log(
            `  ${locale}: ${count}/${total} translated${count === total ? "" : " (the rest fall back to English)"}`,
        );
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
