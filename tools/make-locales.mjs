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
    workbenchChapterCount: [
        "$VISIBLE$ of $TOTAL$",
        "How many chapters are visible, out of how many were found.",
    ],
    workbenchPack: ["Build EPUB", "The button that builds the book."],
    workbenchCancel: ["Cancel", "The button that stops a download."],
    workbenchRetry: ["Try again", "The button that starts a failed or cancelled download again."],
    workbenchDismiss: ["Dismiss", "The button that hides a finished download's status."],
    workbenchSavedAs: [
        "Saved as $FILE$ ($SIZE$)",
        "Shown when the book has been saved, with its file name and size.",
    ],
    workbenchSelectAll: ["Select all", "The button that selects every chapter."],
    workbenchSelectNone: ["Select none", "The button that deselects every chapter."],
    workbenchInvert: ["Invert", "The button that inverts the selection."],
    workbenchRanges: ["Ranges", "The button that picks a range of chapters."],
    workbenchRangeTitle: ["Select a range", "The heading of the range dialog."],
    workbenchRangeFrom: ["First chapter", "The first chapter of the range."],
    workbenchRangeTo: ["Last chapter", "The last chapter of the range."],
    workbenchRangeCount: ["$COUNT$ chapters", "How many chapters the range covers."],
    workbenchRangeCountOne: [
        "$COUNT$ chapter",
        "How many chapters the range covers, when there is one.",
    ],
    workbenchRangeSelect: ["Select range", "Selects the chapters in the range."],
    workbenchRangeDeselect: ["Deselect range", "Deselects the chapters in the range."],
    workbenchRangeInvalid: [
        "Enter a chapter number between 1 and $COUNT$.",
        "Shown when the range cannot be used.",
    ],
    workbenchFilter: ["Filter", "The button that opens the filter."],
    workbenchNoChaptersSelected: ["No chapters selected", "Shown when nothing is ticked."],
    workbenchBusy: ["A book is being made", "Why Pack is unavailable while a download runs."],
    workbenchWaitingForChapters: ["Looking for chapters…", "Shown while the chapter list loads."],
    workbenchFieldTitle: ["Title", "The story's title."],
    workbenchFieldAuthor: ["Author", "The story's author."],
    workbenchFieldLanguage: ["Language", "The story's language."],
    workbenchFieldFilename: ["File name", "The name the EPUB is saved under."],
    workbenchResetFilename: ["Reset", "Restores the default file name."],
    workbenchRemoveCover: ["Remove cover", "Removes the cover image."],
    workbenchIncludeAuthorNotes: [
        "Include author notes",
        "Keeps the notes at the end of a chapter.",
    ],
    workbenchIncludeTocPage: [
        "Include the table of contents as a chapter",
        "Adds the table of contents as a chapter.",
    ],
    workbenchMoreOptions: ["More options", "Opens the full settings page."],
    workbenchOptionsHint: [
        "These apply to every book you make.",
        "Explains that the workbench's switches change the settings.",
    ],
    workbenchCoverUrl: ["Cover image address", "The address of the cover image."],
    workbenchNoStoryHere: ["No story found on this page", "Shown when the page is not a story."],
    workbenchNoStoryHint: [
        "Check that this is the story's chapter list, or show Kintsugi where the chapters are.",
        "Shown under the empty chapter list.",
    ],
    workbenchFieldUrl: ["Story address", "The field holding the address of the story's page."],
    workbenchFieldUrlHint: [
        "Paste the address of the story's chapter list.",
        "The hint under the story address field.",
    ],
    workbenchLoadStory: ["Load", "The button that loads the story at the given address."],
    workbenchUrlInvalid: [
        "That is not a web address.",
        "Shown when the address in the story field cannot be used.",
    ],

    // --- Site access ---
    accessTitle: ["Allow access to this site", "The heading of the site access prompt."],
    accessText: [
        "Kintsugi can only read a site you have allowed. The pages are read on your machine, and nothing is sent anywhere.",
        "The explanation under the site access prompt.",
    ],
    accessGrant: ["Allow access", "The button that asks the browser for access."],
    accessDenied: [
        "Access was not allowed, so the story cannot be read.",
        "Shown when the user declines the browser's permission prompt.",
    ],
    accessGranted: [
        "Kintsugi can now read this site.",
        "Shown when the user has just allowed the site.",
    ],

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
    popupLibraryShort: ["Library", "The popup's library button's visible label."],
    popupWorkbenchShort: ["Workbench", "The popup's workbench button's visible label."],
    popupSettings: ["Settings", "The popup's settings button."],
    popupNoStory: ["No story detected on this page.", "Shown when the page is not a story."],
    popupWelcome: [
        "Welcome to Kintsugi. Let’s set things up before your first book.",
        "Shown on the first run, before the onboarding.",
    ],
    popupGetStarted: ["Set up Kintsugi", "The popup's button that opens the onboarding."],
    popupSaved: ["Your book is ready.", "Shown when a download finishes."],
    popupTryAgain: ["Try again", "The popup's retry button."],
    popupChecking: ["Looking at this page…", "Shown while the popup waits for the worker."],
    popupUnsupportedHost: [
        "$HOST$ is not supported yet.",
        "Shown when no parser matched the current site.",
    ],
    popupChapterCount: ["$COUNT$ chapters", "How many chapters the popup found."],
    popupChapterCountOne: [
        "$COUNT$ chapter",
        "How many chapters the popup found, when there is one.",
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
    optionsRevoke: ["Remove access", "Removes access to a site."],
    optionsRevokeAll: ["Remove all access", "Removes access to every site."],
    optionsRevokeAllConfirm: [
        "Kintsugi will not be able to read any of these sites until you allow each one again.",
        "The explanation in the dialog that confirms removing access to every site.",
    ],
    optionsSiteAccessEmpty: [
        "No sites yet. Kintsugi asks when you open a story.",
        "The empty state of the site access list.",
    ],
    optionsSiteAccessHint: [
        "Kintsugi can only read the sites listed here.",
        "The hint under the site access heading.",
    ],
    optionsRevoked: [
        "Kintsugi can no longer read that site.",
        "Shown after a site's access is revoked.",
    ],
    optionsRevokedAll: [
        "Kintsugi can no longer read any site until you allow it again.",
        "Shown after access to every site is revoked.",
    ],
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
    optionsNoResults: [
        "Nothing matches that search.",
        "Shown when a settings search finds nothing.",
    ],
    optionsNavLabel: ["Settings groups", "The accessible name of the settings navigation."],
    optionsLibraryMeta: ["$CHAPTERS$ chapters · $SIZE$", "The library card's metadata line."],
    optionsLibraryMetaOne: [
        "$CHAPTERS$ chapter · $SIZE$",
        "The library card's metadata line, when the book has one chapter.",
    ],
    optionsLibraryImport: [
        "Import from WebToEpub",
        "The button that imports a library exported by WebToEpub 1.x.",
    ],
    optionsLibraryImported: [
        "Imported $1 books.",
        "Confirmation after importing a library, when it held several books.",
    ],
    optionsLibraryImportedOne: [
        "Imported $1 book.",
        "Confirmation after importing a library, when it held one book.",
    ],
    optionsLibraryTooLarge: [
        "That file is too large to import. The largest library Kintsugi can read is $SIZE$.",
        "Shown when the user picks a library export that is larger than Kintsugi will read.",
    ],
    libraryRemove: ["Remove", "Removes a book from the library."],
    libraryRemoveTitle: ["Remove this book from the library?", "The heading of the remove dialog."],
    libraryRemoveConfirm: [
        "The EPUB you saved stays where it is. Only its entry in the library goes.",
        "The explanation in the remove dialog.",
    ],
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
        "The language a book is marked as when its site does not say.",
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
    settingRemoveChapterNumbersHint: [
        "Removes the number a site puts at the start of a chapter's title.",
        "Explains the remove-chapter-numbers setting.",
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
    onboardingBack: ["Back", "The button that moves to the previous step."],
    onboardingFinish: ["Finish", "The button that completes the onboarding."],
    onboardingSkip: ["Skip", "The button that skips the onboarding."],
    onboardingNextSites: [
        "Next: which sites work",
        "Moves from the welcome step to the sites step.",
    ],
    onboardingNextLook: [
        "Next: choose a look",
        "Moves from the sites step to the appearance step.",
    ],
    onboardingWelcomeText: [
        "Turn any web novel into a book worth keeping. Point it at a chapter list and it builds a clean EPUB, with a cover and a table of contents.",
        "The first onboarding step's explanation.",
    ],
    onboardingWelcomeFootnote: [
        "No account, and nothing is tracked. Kintsugi talks only to the sites you read.",
        "The first onboarding step's footnote.",
    ],
    onboardingWhichSite: ["Which site are you reading?", "The second onboarding step's heading."],
    onboardingWhichSiteText: [
        "Kintsugi knows hundreds of sites. Open one, and it offers to build the book.",
        "The second onboarding step's explanation.",
    ],
    onboardingWhichSiteFootnote: [
        "Not listed? Kintsugi can still read it once you show it where the chapters are.",
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
    errorCancelled: ["Cancelled.", "The user cancelled the operation."],
    errorHttpStatus: [
        "The site answered with an error.",
        "The server returned an HTTP error status.",
    ],
    errorRateLimited: [
        "The site is limiting requests. Wait a moment, then try again.",
        "The server answered 429, too many requests.",
    ],
    errorChallenge: [
        "The site wants to check that you are a person. Open the page, then try again.",
        "The site served a challenge such as a captcha.",
    ],
    errorEmptyChapter: [
        "The chapter came back empty. It may be locked, or the site may have changed.",
        "A chapter page with no text in it.",
    ],
    errorStorageFull: [
        "There is not enough space to save this book.",
        "The browser's storage is full.",
    ],
    errorPermission: [
        "Kintsugi is not allowed to read this site.",
        "The site has not been allowed.",
    ],
    errorBusy: [
        "Another book is still being made. Wait for it to finish, or cancel it.",
        "A second download was started while one is running.",
    ],
    errorParse: ["The page could not be read.", "The page could not be parsed."],

    // --- Filter ---
    filterSearch: ["Search", "The filter's search box."],
    filterUseRegex: ["Use a regular expression", "Whether the search is a regex."],
    filterInclude: ["Include", "Only matching chapters are kept."],
    filterExclude: ["Exclude", "Matching chapters are removed."],
    filterMatchCount: ["$COUNT$ matching", "How many chapters match the filter."],
    filterClear: ["Clear", "Clears the filter."],
    optionsNumberRequired: ["Enter a number.", "Shown under a number setting that was left empty."],
    filterNoMatches: [
        "No chapters match these filters",
        "Shown when the filter hides every chapter.",
    ],
    filterClearAll: ["Clear filters", "Removes the filter so every chapter shows again."],
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
    commonLoading: ["Loading…", "Shown while a page reads what it needs."],
    siteSelectorSuggesting: ["Looking at the page…", "Shown while the scanner reads the page."],
    siteSelectorTesting: [
        "Trying the selectors on the page…",
        "Shown while the selectors are tested.",
    ],
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
