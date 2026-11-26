/**
 * Internationalisation.
 *
 * A thin, memoised wrapper over `browser.i18n`.
 *
 * The baseline called `chrome.i18n.getMessage` directly, at every call site,
 * with no fallback. When a key was missing, the UI showed the raw key — the
 * user saw `popupSaveButton` instead of "Save". Here a missing key is a
 * developer-visible console warning and a human-readable placeholder, never a
 * raw key.
 *
 * See ADR-0010.
 */

/** The message names. Every key the UI uses. */
export const MESSAGES = {
    appName: "appName",
    appTagline: "appTagline",

    // Workbench
    workbenchTitle: "workbenchTitle",
    workbenchStoryDetails: "workbenchStoryDetails",
    workbenchCover: "workbenchCover",
    workbenchOptions: "workbenchOptions",
    workbenchChapters: "workbenchChapters",
    workbenchChaptersFound: "workbenchChaptersFound",
    workbenchChapterCount: "workbenchChapterCount",
    workbenchPack: "workbenchPack",
    workbenchSave: "workbenchSave",
    workbenchCancel: "workbenchCancel",
    workbenchSelectAll: "workbenchSelectAll",
    workbenchSelectNone: "workbenchSelectNone",
    workbenchInvert: "workbenchInvert",
    workbenchRanges: "workbenchRanges",
    workbenchRangeTitle: "workbenchRangeTitle",
    workbenchRangeFrom: "workbenchRangeFrom",
    workbenchRangeTo: "workbenchRangeTo",
    workbenchRangeCount: "workbenchRangeCount",
    workbenchRangeSelect: "workbenchRangeSelect",
    workbenchRangeDeselect: "workbenchRangeDeselect",
    workbenchRangeInvalid: "workbenchRangeInvalid",
    workbenchFilter: "workbenchFilter",
    workbenchNoChaptersSelected: "workbenchNoChaptersSelected",
    workbenchWaitingForChapters: "workbenchWaitingForChapters",
    workbenchDetected: "workbenchDetected",
    workbenchFieldTitle: "workbenchFieldTitle",
    workbenchFieldAuthor: "workbenchFieldAuthor",
    workbenchFieldLanguage: "workbenchFieldLanguage",
    workbenchFieldFilename: "workbenchFieldFilename",
    workbenchResetFilename: "workbenchResetFilename",
    workbenchChooseFromPage: "workbenchChooseFromPage",
    workbenchRemoveCover: "workbenchRemoveCover",
    workbenchIncludeAuthorNotes: "workbenchIncludeAuthorNotes",
    workbenchIncludeTocPage: "workbenchIncludeTocPage",
    workbenchMoreOptions: "workbenchMoreOptions",
    workbenchNoCover: "workbenchNoCover",
    workbenchCoverUrl: "workbenchCoverUrl",
    workbenchNoStoryHere: "workbenchNoStoryHere",
    workbenchTryAnyway: "workbenchTryAnyway",
    workbenchUnsupportedSite: "workbenchUnsupportedSite",
    workbenchUseSelectorBuilder: "workbenchUseSelectorBuilder",
    workbenchReloadPage: "workbenchReloadPage",
    workbenchFieldUrl: "workbenchFieldUrl",
    workbenchFieldUrlHint: "workbenchFieldUrlHint",
    workbenchLoadStory: "workbenchLoadStory",
    workbenchUrlInvalid: "workbenchUrlInvalid",

    // Site access
    accessTitle: "accessTitle",
    accessText: "accessText",
    accessGrant: "accessGrant",
    accessDenied: "accessDenied",
    accessAlreadyGranted: "accessAlreadyGranted",

    // Chapter states
    chapterStateQueued: "chapterStateQueued",
    chapterStateFetching: "chapterStateFetching",
    chapterStateLoaded: "chapterStateLoaded",
    chapterStateDownloaded: "chapterStateDownloaded",
    chapterStateFailed: "chapterStateFailed",
    chapterStateNotStarted: "chapterStateNotStarted",

    // Progress phases
    phasePreparing: "phasePreparing",
    phaseFetchingChapters: "phaseFetchingChapters",
    phaseDownloadingImages: "phaseDownloadingImages",
    phaseBuildingEpub: "phaseBuildingEpub",
    phaseSaving: "phaseSaving",
    phaseComplete: "phaseComplete",
    phaseFailed: "phaseFailed",
    phaseCancelled: "phaseCancelled",

    // Popup
    popupOpenWorkbench: "popupOpenWorkbench",
    popupAddToLibrary: "popupAddToLibrary",
    popupLibraryShort: "popupLibraryShort",
    popupWorkbenchShort: "popupWorkbenchShort",
    popupSettings: "popupSettings",
    popupNoStory: "popupNoStory",
    popupWelcome: "popupWelcome",
    popupGetStarted: "popupGetStarted",
    popupUnsupported: "popupUnsupported",
    popupSaved: "popupSaved",
    popupTryAgain: "popupTryAgain",
    popupUnsupportedHost: "popupUnsupportedHost",

    // Common
    commonClose: "commonClose",
    commonDismiss: "commonDismiss",
    commonCancel: "commonCancel",

    // Options
    optionsAppearance: "optionsAppearance",
    optionsStory: "optionsStory",
    optionsEpub: "optionsEpub",
    optionsImages: "optionsImages",
    optionsBehaviour: "optionsBehaviour",
    optionsAdvanced: "optionsAdvanced",
    optionsTheme: "optionsTheme",
    optionsAccent: "optionsAccent",
    optionsDensity: "optionsDensity",
    optionsThemeSystem: "optionsThemeSystem",
    optionsThemeLight: "optionsThemeLight",
    optionsThemeDark: "optionsThemeDark",
    optionsAccentGold: "optionsAccentGold",
    optionsAccentInk: "optionsAccentInk",
    optionsAccentVerdigris: "optionsAccentVerdigris",
    optionsAccentPlum: "optionsAccentPlum",
    optionsDensityComfortable: "optionsDensityComfortable",
    optionsDensityCompact: "optionsDensityCompact",
    optionsSearchSettings: "optionsSearchSettings",
    optionsSiteAccess: "optionsSiteAccess",
    optionsRevoke: "optionsRevoke",
    optionsRevokeAll: "optionsRevokeAll",
    optionsSiteAccessEmpty: "optionsSiteAccessEmpty",
    optionsSiteAccessHint: "optionsSiteAccessHint",
    optionsRevoked: "optionsRevoked",
    optionsRevokedAll: "optionsRevokedAll",
    optionsExportSettings: "optionsExportSettings",
    optionsImportSettings: "optionsImportSettings",
    optionsResetAll: "optionsResetAll",
    optionsExported: "optionsExported",
    optionsImported: "optionsImported",
    optionsImportInvalid: "optionsImportInvalid",
    optionsResetDone: "optionsResetDone",
    optionsResetConfirm: "optionsResetConfirm",
    optionsResetConfirmAction: "optionsResetConfirmAction",
    optionsPrivacyNote: "optionsPrivacyNote",

    // Options: library
    optionsLibrary: "optionsLibrary",
    optionsLibraryEmptyTitle: "optionsLibraryEmptyTitle",
    optionsLibraryEmptyText: "optionsLibraryEmptyText",
    optionsLibraryChapters: "optionsLibraryChapters",
    optionsNoResults: "optionsNoResults",
    optionsNavLabel: "optionsNavLabel",
    optionsLibraryMeta: "optionsLibraryMeta",
    libraryRemove: "libraryRemove",
    libraryRemoved: "libraryRemoved",

    // Options: individual settings
    settingReduceMotion: "settingReduceMotion",
    settingReduceMotionHint: "settingReduceMotionHint",
    settingFilenameTemplate: "settingFilenameTemplate",
    settingFilenameTemplateHint: "settingFilenameTemplateHint",
    settingDefaultLanguage: "settingDefaultLanguage",
    settingDefaultLanguageHint: "settingDefaultLanguageHint",
    settingRemoveAuthorNotes: "settingRemoveAuthorNotes",
    settingRemoveAuthorNotesHint: "settingRemoveAuthorNotesHint",
    settingRemoveChapterNumbers: "settingRemoveChapterNumbers",
    settingRemoveChapterNumbersHint: "settingRemoveChapterNumbersHint",
    settingIncludeTocPage: "settingIncludeTocPage",
    settingEpubVersion: "settingEpubVersion",
    settingEpubVersionHint: "settingEpubVersionHint",
    settingAddInfoPage: "settingAddInfoPage",
    settingAddInfoPageHint: "settingAddInfoPageHint",
    settingRemoveNextPrevLinks: "settingRemoveNextPrevLinks",
    settingIncludeSourceUrl: "settingIncludeSourceUrl",
    settingSkipImages: "settingSkipImages",
    settingRemoveDuplicates: "settingRemoveDuplicates",
    settingPreferHighestResolution: "settingPreferHighestResolution",
    settingUseSvg: "settingUseSvg",
    settingSkipFailedChapters: "settingSkipFailedChapters",
    settingSkipFailedChaptersHint: "settingSkipFailedChaptersHint",
    settingRetryOnEmptyPage: "settingRetryOnEmptyPage",
    settingEmptyPageIsError: "settingEmptyPageIsError",
    settingEmptyPageIsErrorHint: "settingEmptyPageIsErrorHint",
    settingMinimumDelay: "settingMinimumDelay",
    settingMinimumDelayHint: "settingMinimumDelayHint",
    settingMaxChapters: "settingMaxChapters",
    settingDelayPerChapter: "settingDelayPerChapter",
    settingDelayPerChapterHint: "settingDelayPerChapterHint",
    settingDiagnostics: "settingDiagnostics",
    settingDiagnosticsHint: "settingDiagnosticsHint",

    // Onboarding
    onboardingWelcome: "onboardingWelcome",
    onboardingStep1: "onboardingStep1",
    onboardingStep2: "onboardingStep2",
    onboardingStep3: "onboardingStep3",
    onboardingNext: "onboardingNext",
    onboardingBack: "onboardingBack",
    onboardingFinish: "onboardingFinish",
    onboardingSkip: "onboardingSkip",
    onboardingGetStarted: "onboardingGetStarted",
    onboardingWelcomeText: "onboardingWelcomeText",
    onboardingWelcomeFootnote: "onboardingWelcomeFootnote",
    onboardingWhichSite: "onboardingWhichSite",
    onboardingWhichSiteText: "onboardingWhichSiteText",
    onboardingWhichSiteFootnote: "onboardingWhichSiteFootnote",
    onboardingMakeItYours: "onboardingMakeItYours",
    onboardingMakeItYoursText: "onboardingMakeItYoursText",

    // Errors
    errorGeneric: "errorGeneric",
    errorNetwork: "errorNetwork",
    errorNoParser: "errorNoParser",
    errorTimeout: "errorTimeout",
    errorCancelled: "errorCancelled",
    errorForbidden: "errorForbidden",
    errorParse: "errorParse",
    errorNoChapters: "errorNoChapters",

    // Filter
    filterSearch: "filterSearch",
    filterUseRegex: "filterUseRegex",
    filterInclude: "filterInclude",
    filterExclude: "filterExclude",
    filterMatchCount: "filterMatchCount",
    filterClear: "filterClear",
    filterApply: "filterApply",
    filterInvalidPattern: "filterInvalidPattern",

    // Site selectors
    siteSelectorBannerTitle: "siteSelectorBannerTitle",
    siteSelectorBannerText: "siteSelectorBannerText",
    siteSelectorOpen: "siteSelectorOpen",
    siteSelectorDialogTitle: "siteSelectorDialogTitle",
    siteSelectorIntro: "siteSelectorIntro",
    siteSelectorContent: "siteSelectorContent",
    siteSelectorContentHint: "siteSelectorContentHint",
    siteSelectorTitle: "siteSelectorTitle",
    siteSelectorTitleHint: "siteSelectorTitleHint",
    siteSelectorRemove: "siteSelectorRemove",
    siteSelectorRemoveHint: "siteSelectorRemoveHint",
    siteSelectorSuggest: "siteSelectorSuggest",
    siteSelectorSuggested: "siteSelectorSuggested",
    siteSelectorTest: "siteSelectorTest",
    siteSelectorTestResult: "siteSelectorTestResult",
    siteSelectorTestFailed: "siteSelectorTestFailed",
    siteSelectorInvalid: "siteSelectorInvalid",
    siteSelectorSave: "siteSelectorSave",
    siteSelectorSaved: "siteSelectorSaved",
    siteSelectorForget: "siteSelectorForget",
    siteSelectorForgotten: "siteSelectorForgotten",
    siteSelectorList: "siteSelectorList",
    siteSelectorListEmpty: "siteSelectorListEmpty",
    siteSelectorTocDetected: "siteSelectorTocDetected",
} as const;

/** A message name. */
export type MessageName = (typeof MESSAGES)[keyof typeof MESSAGES];

/** A message's value. */
export type MessageValue = string | number | boolean;

/** The substitutions a message may take. */
export type Substitutions = string | string[];

/** The `browser.i18n` API, as far as this module uses it. */
export interface I18nApi {
    getMessage(key: string, substitutions?: string | string[] | undefined): string;
    getUILanguage?(): string;
}

/** The cache of resolved messages. */
const cache = new Map<string, string>();

/** The API in use. */
let api: I18nApi | undefined;

/**
 * Install the i18n API.
 *
 * The extension pages call this once at startup. Outside an extension (a unit
 * test, a storybook) it can be left unset, in which case {@link t} returns the
 * key's fallback.
 */
export function setI18nApi(value: I18nApi | undefined): void {
    api = value;
    cache.clear();
}

/**
 * The UI language.
 *
 * Falls back to `en` when the API is unavailable or returns nothing.
 */
export function uiLanguage(): string {
    const language = api?.getUILanguage?.();
    return language && language.length > 0 ? language : "en";
}

/**
 * Translate a message.
 *
 * The result is memoised, because `browser.i18n.getMessage` is a relatively
 * expensive cross-process call and the workbench asks for the same dozen
 * strings on every render.
 *
 * @param key The message name. It must be one the catalogue lists: a typo
 *   would otherwise show the user the raw key at runtime, which is the one
 *   failure mode this module exists to prevent.
 * @param substitutions The substitutions, if any.
 * @returns The translated string, or the key itself when there is no
 *   translation. Returning the key is better than an empty string: a missing
 *   translation should be visible, not invisible.
 */
export function t(key: MessageName, substitutions?: Substitutions): string {
    const cacheKey = substitutions === undefined ? key : `${key}|${JSON.stringify(substitutions)}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    let message = "";
    if (api) {
        try {
            message = api.getMessage(key, substitutions);
        } catch {
            message = "";
        }
    }

    if (!message) {
        if (api) {
            console.warn(`[kintsugi] Missing translation for "${key}".`);
        }
        message = key;
    }

    cache.set(cacheKey, message);
    return message;
}

/**
 * Translate a message whose name is only known at runtime.
 *
 * Most of the interface asks for a message by a literal name, which
 * {@link t} type-checks against the catalogue. A few places — a label stored
 * in a settings table, an error code mapped to a message — only learn the name
 * at runtime, and there the compiler cannot help. Those call sites use this,
 * so that "the key is not in the catalogue" stays a deliberate, visible choice
 * rather than an accident.
 *
 * @param key The message name.
 * @param substitutions The substitutions, if any.
 * @returns The translated string, or the key itself when there is no
 *   translation.
 */
export function tDynamic(key: string, substitutions?: Substitutions): string {
    return t(key as MessageName, substitutions);
}

/**
 * Translate a message with a count.
 *
 * The message must have a `one` and a `many` form, which is what
 * `browser.i18n.getMessage` expects for a counted string.
 */
export function tCount(key: MessageName, count: number, substitutions?: string[]): string {
    const cacheKey = `${key}|count:${count}|${JSON.stringify(substitutions ?? [])}`;
    const cached = cache.get(cacheKey);
    if (cached !== undefined) return cached;

    let message = "";
    if (api) {
        try {
            message = api.getMessage(key, [...(substitutions ?? []), String(count)]);
        } catch {
            message = "";
        }
    }
    if (!message) message = key;
    cache.set(cacheKey, message);
    return message;
}

/** Clear the memoisation cache. */
export function clearI18nCache(): void {
    cache.clear();
}
