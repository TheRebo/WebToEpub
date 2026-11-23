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
    workbenchIncludeAuthorNotes: ["Include author notes", "Keeps the notes at the end of a chapter."],
    workbenchIncludeTocPage: ["Include the contents page", "Adds the table of contents as a chapter."],
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
    optionsPrivacy: ["Privacy", "The privacy settings group."],
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
    optionsPrivacyNote: [
        "Kintsugi sends nothing to anyone. Every network request goes to the site you are reading.",
        "The note under the privacy settings.",
    ],

    // --- Options: library ---
    optionsLibrary: ["Library", "The library tab, and the books you have built."],
    optionsLibraryEmptyTitle: ["Your library is empty.", "The empty library's heading."],
    optionsLibraryEmptyText: [
        "Books you build are kept here, so you can update them when a new chapter is posted.",
        "The empty library's explanation.",
    ],
    optionsLibraryChapters: ["$COUNT$ chapters", "How many chapters a book has."],
    optionsNoResults: ["Nothing matches that search.", "Shown when a settings search finds nothing."],
    optionsNavLabel: ["Settings groups", "The accessible name of the settings navigation."],
    optionsLibraryMeta: ["$CHAPTERS$ chapters · $SIZE$", "The library card's metadata line."],

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
    settingCompressImages: ["Compress images", "The compress-images setting."],
    settingMaxResolution: ["Maximum resolution", "The maximum-resolution setting."],
    settingMaxResolutionHint: [
        "In pixels on the longest edge.",
        "Explains the maximum-resolution setting.",
    ],
    settingSkipFailedChapters: ["Skip chapters that fail", "The skip-failed-chapters setting."],
    settingSkipFailedChaptersHint: [
        "A failed chapter becomes a note in the book instead of stopping the run.",
        "Explains the skip-failed-chapters setting.",
    ],
    settingRetryOnEmptyPage: ["Retry on an empty page", "The retry-on-empty-page setting."],
    settingMinimumDelay: [
        "Minimum delay between requests",
        "The minimum-delay setting.",
    ],
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
    settingMetadataLookup: ["Look up book metadata", "The metadata-lookup setting."],
    settingMetadataLookupHint: [
        "Off by default. When on, the title is checked against a public database.",
        "Explains the metadata-lookup setting.",
    ],
    settingSendStoryUrl: ["Send the story URL with the lookup", "The send-story-url setting."],
    settingSendStoryUrlHint: [
        "Off by default. Without it, the lookup can only use the title.",
        "Explains the send-story-url setting.",
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
    filterInvalidPattern: ["That is not a valid pattern.", "Shown when the regex does not compile."],
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
};
/**
 * The translations.
 *
 * A locale that is missing a key falls back to English at run time, so
 * these files only need the keys that have been translated.
 */
const TRANSLATIONS = {
    en: {},
    id: {},
    fr: {
        appName: ["Kintsugi", "Le nom de l'extension."],
        appTagline: [
            "Transformez n'importe quel roman en ligne en un livre à garder.",
            "Une description en une ligne de l'extension.",
        ],
        workbenchTitle: ["Atelier", "Le titre de la page principale."],
        workbenchStoryDetails: ["Détails de l'histoire", "Le titre du panneau de métadonnées."],
        workbenchCover: ["Couverture", "Le titre de la section de couverture."],
        workbenchOptions: ["Options", "Le titre de la section des options."],
        workbenchChapters: ["Chapitres", "Le titre de la liste des chapitres."],
        workbenchChaptersFound: ["$COUNT$ chapitres trouvés", "Combien de chapitres ont été trouvés."],
        workbenchPack: ["Créer l'EPUB", "Le bouton qui crée le livre."],
        workbenchSave: ["Enregistrer", "Le bouton qui enregistre les métadonnées."],
        workbenchCancel: ["Annuler", "Le bouton qui arrête un téléchargement."],
        workbenchSelectAll: ["Tout sélectionner", "Le bouton qui sélectionne tous les chapitres."],
        workbenchSelectNone: ["Tout désélectionner", "Le bouton qui désélectionne tous les chapitres."],
        workbenchInvert: ["Inverser", "Le bouton qui inverse la sélection."],
        workbenchRanges: ["Plages", "Le bouton qui choisit une plage de chapitres."],
        workbenchFilter: ["Filtrer", "Le bouton qui ouvre le filtre."],
        workbenchNoChaptersSelected: ["Aucun chapitre sélectionné", "Affiché quand rien n'est coché."],
        workbenchWaitingForChapters: ["Recherche des chapitres…", "Affiché pendant le chargement."],
        workbenchFieldTitle: ["Titre", "Le titre de l'histoire."],
        workbenchFieldAuthor: ["Auteur", "L'auteur de l'histoire."],
        workbenchFieldLanguage: ["Langue", "La langue de l'histoire."],
        workbenchFieldFilename: ["Nom du fichier", "Le nom du fichier EPUB."],
        workbenchNoStoryHere: ["Aucune histoire trouvée sur cette page", "Quand la page n'est pas une histoire."],
        workbenchTryAnyway: ["Essayer quand même", "Ouvre l'atelier malgré tout."],
        workbenchUnsupportedSite: ["Ce site n'est pas encore pris en charge", "Quand aucun analyseur ne correspond."],
        popupOpenWorkbench: ["Ouvrir l'atelier", "Le bouton principal du popup."],
        popupAddToLibrary: ["Ajouter à la bibliothèque", "Le bouton de bibliothèque du popup."],
        popupSettings: ["Paramètres", "Le bouton de paramètres du popup."],
        popupNoStory: ["Aucune histoire détectée sur cette page.", "Quand la page n'est pas une histoire."],
        popupUnsupported: ["Ce site n'est pas encore pris en charge.", "Quand aucun analyseur ne correspond."],
        optionsAppearance: ["Apparence", "Le groupe des réglages d'apparence."],
        optionsStory: ["Histoire", "Le groupe des réglages d'histoire."],
        optionsEpub: ["EPUB", "Le groupe des réglages EPUB."],
        optionsImages: ["Images", "Le groupe des réglages d'images."],
        optionsBehaviour: ["Comportement", "Le groupe des réglages de comportement."],
        optionsPrivacy: ["Confidentialité", "Le groupe des réglages de confidentialité."],
        optionsAdvanced: ["Avancé", "Le groupe des réglages avancés."],
        optionsTheme: ["Thème", "Le réglage du thème."],
        optionsAccent: ["Accent", "Le réglage de la couleur d'accent."],
        optionsDensity: ["Densité", "Le réglage de la densité."],
        optionsThemeSystem: ["Système", "L'option de thème système."],
        optionsThemeLight: ["Clair", "L'option de thème clair."],
        optionsThemeDark: ["Sombre", "L'option de thème sombre."],
        onboardingWelcome: ["Bienvenue dans Kintsugi", "Le titre de la première étape."],
        onboardingNext: ["Suivant", "Le bouton qui passe à l'étape suivante."],
        onboardingBack: ["Retour", "Le bouton qui revient à l'étape précédente."],
        onboardingFinish: ["Terminer", "Le bouton qui termine l'introduction."],
        onboardingSkip: ["Passer", "Le bouton qui passe l'introduction."],
        errorGeneric: ["Une erreur est survenue. Veuillez réessayer.", "Le message d'erreur par défaut."],
        errorNetwork: ["Impossible de joindre le site.", "Un échec réseau."],
        errorNoParser: ["Kintsugi ne connaît pas encore ce site.", "Aucun analyseur ne correspond."],
        errorTimeout: ["Le site a mis trop de temps à répondre.", "Un délai dépassé."],
        errorCancelled: ["Annulé.", "L'utilisateur a annulé l'opération."],
        errorForbidden: ["Le site a refusé la requête.", "Une erreur HTTP 403."],
        errorParse: ["La page n'a pas pu être lue.", "La page n'a pas pu être analysée."],
        errorNoChapters: ["Aucun chapitre trouvé sur cette page.", "La liste des chapitres était vide."],
        filterSearch: ["Rechercher", "Le champ de recherche du filtre."],
        filterUseRegex: ["Utiliser une expression régulière", "Si la recherche est une regex."],
        filterInclude: ["Inclure", "Ne garde que les chapitres correspondants."],
        filterExclude: ["Exclure", "Retire les chapitres correspondants."],
        filterMatchCount: ["$COUNT$ correspondants", "Combien de chapitres correspondent."],
        filterClear: ["Effacer", "Efface le filtre."],
        filterApply: ["Appliquer", "Applique le filtre."],
        filterInvalidPattern: ["Ce motif n'est pas valide.", "Quand la regex ne compile pas."],
    },
    de: {
        appName: ["Kintsugi", "Der Name der Erweiterung."],
        appTagline: [
            "Verwandle jeden Webroman in ein Buch, das du behalten willst.",
            "Eine einzeilige Beschreibung der Erweiterung.",
        ],
        workbenchTitle: ["Werkbank", "Der Titel der Hauptseite."],
        workbenchStoryDetails: ["Story-Details", "Die Überschrift der Metadatenleiste."],
        workbenchCover: ["Cover", "Die Überschrift des Cover-Bereichs."],
        workbenchOptions: ["Optionen", "Die Überschrift des Optionsbereichs."],
        workbenchChapters: ["Kapitel", "Die Überschrift der Kapitelliste."],
        workbenchChaptersFound: ["$COUNT$ Kapitel gefunden", "Wie viele Kapitel gefunden wurden."],
        workbenchPack: ["EPUB erstellen", "Die Schaltfläche, die das Buch erstellt."],
        workbenchSave: ["Speichern", "Die Schaltfläche, die die Metadaten speichert."],
        workbenchCancel: ["Abbrechen", "Die Schaltfläche, die einen Download stoppt."],
        workbenchSelectAll: ["Alle auswählen", "Die Schaltfläche, die alle Kapitel auswählt."],
        workbenchSelectNone: ["Auswahl aufheben", "Die Schaltfläche, die alle Kapitel abwählt."],
        workbenchInvert: ["Umkehren", "Die Schaltfläche, die die Auswahl umkehrt."],
        workbenchRanges: ["Bereiche", "Die Schaltfläche für einen Kapitelbereich."],
        workbenchFilter: ["Filter", "Die Schaltfläche, die den Filter öffnet."],
        workbenchNoChaptersSelected: ["Keine Kapitel ausgewählt", "Wird angezeigt, wenn nichts angehakt ist."],
        workbenchWaitingForChapters: ["Suche nach Kapiteln…", "Wird beim Laden der Kapitelliste angezeigt."],
        workbenchFieldTitle: ["Titel", "Der Titel der Story."],
        workbenchFieldAuthor: ["Autor", "Der Autor der Story."],
        workbenchFieldLanguage: ["Sprache", "Die Sprache der Story."],
        workbenchFieldFilename: ["Dateiname", "Der Name der gespeicherten EPUB."],
        workbenchNoStoryHere: ["Auf dieser Seite wurde keine Story gefunden", "Wenn die Seite keine Story ist."],
        workbenchTryAnyway: ["Trotzdem versuchen", "Öffnet die Werkbank trotzdem."],
        workbenchUnsupportedSite: ["Diese Seite wird noch nicht unterstützt", "Wenn kein Parser passt."],
        popupOpenWorkbench: ["Werkbank öffnen", "Die Hauptschaltfläche des Popups."],
        popupAddToLibrary: ["Zur Bibliothek hinzufügen", "Die Bibliotheksschaltfläche des Popups."],
        popupSettings: ["Einstellungen", "Die Einstellungsschaltfläche des Popups."],
        popupNoStory: ["Auf dieser Seite wurde keine Story erkannt.", "Wenn die Seite keine Story ist."],
        popupUnsupported: ["Diese Seite wird noch nicht unterstützt.", "Wenn kein Parser passt."],
        optionsAppearance: ["Darstellung", "Die Gruppe der Darstellungsoptionen."],
        optionsStory: ["Story", "Die Gruppe der Story-Optionen."],
        optionsEpub: ["EPUB", "Die Gruppe der EPUB-Optionen."],
        optionsImages: ["Bilder", "Die Gruppe der Bildoptionen."],
        optionsBehaviour: ["Verhalten", "Die Gruppe der Verhaltensoptionen."],
        optionsPrivacy: ["Datenschutz", "Die Gruppe der Datenschutzoptionen."],
        optionsAdvanced: ["Erweitert", "Die Gruppe der erweiterten Optionen."],
        optionsTheme: ["Design", "Die Design-Einstellung."],
        optionsAccent: ["Akzentfarbe", "Die Einstellung der Akzentfarbe."],
        optionsDensity: ["Dichte", "Die Dichte-Einstellung."],
        optionsThemeSystem: ["System", "Die System-Design-Option."],
        optionsThemeLight: ["Hell", "Die helle Design-Option."],
        optionsThemeDark: ["Dunkel", "Die dunkle Design-Option."],
        onboardingWelcome: ["Willkommen bei Kintsugi", "Die Überschrift des ersten Schritts."],
        onboardingNext: ["Weiter", "Die Schaltfläche für den nächsten Schritt."],
        onboardingBack: ["Zurück", "Die Schaltfläche für den vorherigen Schritt."],
        onboardingFinish: ["Fertig", "Die Schaltfläche, die die Einführung beendet."],
        onboardingSkip: ["Überspringen", "Die Schaltfläche, die die Einführung überspringt."],
        errorGeneric: ["Etwas ist schiefgelaufen. Bitte versuche es erneut.", "Die Standard-Fehlermeldung."],
        errorNetwork: ["Die Seite war nicht erreichbar.", "Ein Netzwerkfehler."],
        errorNoParser: ["Kintsugi kennt diese Seite noch nicht.", "Kein Parser passte zur URL."],
        errorTimeout: ["Die Seite hat zu lange gebraucht.", "Eine Zeitüberschreitung."],
        errorCancelled: ["Abgebrochen.", "Der Nutzer hat den Vorgang abgebrochen."],
        errorForbidden: ["Die Seite hat die Anfrage abgelehnt.", "Ein HTTP 403."],
        errorParse: ["Die Seite konnte nicht gelesen werden.", "Die Seite konnte nicht ausgewertet werden."],
        errorNoChapters: ["Auf dieser Seite wurden keine Kapitel gefunden.", "Die Kapitelliste war leer."],
        filterSearch: ["Suchen", "Das Suchfeld des Filters."],
        filterUseRegex: ["Regulären Ausdruck verwenden", "Ob die Suche ein Regex ist."],
        filterInclude: ["Einschließen", "Behält nur passende Kapitel."],
        filterExclude: ["Ausschließen", "Entfernt passende Kapitel."],
        filterMatchCount: ["$COUNT$ passende", "Wie viele Kapitel zum Filter passen."],
        filterClear: ["Löschen", "Leert den Filter."],
        filterApply: ["Anwenden", "Wendet den Filter an."],
        filterInvalidPattern: ["Das ist kein gültiges Muster.", "Wenn der Regex nicht kompiliert."],
    },
    ja: {
        appName: ["Kintsugi", "拡張機能の名前。"],
        appTagline: ["どんなウェブ小説も、永く残したい一冊の本に。", "拡張機能を一行で説明する文。"],
        workbenchTitle: ["ワークベンチ", "メインページのタイトル。"],
        workbenchStoryDetails: ["物語の情報", "メタデータパネルの見出し。"],
        workbenchCover: ["表紙", "表紙セクションの見出し。"],
        workbenchOptions: ["オプション", "オプションセクションの見出し。"],
        workbenchChapters: ["話数", "章リストの見出し。"],
        workbenchChaptersFound: ["$COUNT$ 話が見つかりました", "見つかった章の数。"],
        workbenchPack: ["EPUB を作成", "本を作るボタン。"],
        workbenchSave: ["保存", "メタデータを保存するボタン。"],
        workbenchCancel: ["キャンセル", "ダウンロードを止めるボタン。"],
        workbenchSelectAll: ["すべて選択", "すべての章を選ぶボタン。"],
        workbenchSelectNone: ["選択を解除", "すべての章の選択を解除するボタン。"],
        workbenchInvert: ["反転", "選択を反転するボタン。"],
        workbenchRanges: ["範囲", "章の範囲を選ぶボタン。"],
        workbenchFilter: ["フィルター", "フィルターを開くボタン。"],
        workbenchNoChaptersSelected: ["章が選択されていません", "何もチェックされていないときに表示。"],
        workbenchWaitingForChapters: ["章を探しています…", "章リストを読み込み中に表示。"],
        workbenchFieldTitle: ["タイトル", "物語のタイトル。"],
        workbenchFieldAuthor: ["著者", "物語の著者。"],
        workbenchFieldLanguage: ["言語", "物語の言語。"],
        workbenchFieldFilename: ["ファイル名", "保存される EPUB の名前。"],
        workbenchNoStoryHere: ["このページに物語が見つかりません", "ページが物語ではないときに表示。"],
        workbenchTryAnyway: ["このまま試す", "検討中、通常はそのまま開きます。"],
        workbenchUnsupportedSite: ["このサイトはまだ対応していません", "パーサーが一致しなかったときに表示。"],
        popupOpenWorkbench: ["ワークベンチを開く", "ポップアップの主ボタン。"],
        popupAddToLibrary: ["ライブラリに追加", "ポップアップのライブラリボタン。"],
        popupSettings: ["設定", "ポップアップの設定ボタン。"],
        popupNoStory: ["このページに物語は検出されませんでした。", "ページが物語ではないときに表示。"],
        popupUnsupported: ["このサイトはまだ対応していません。", "パーサーが一致しなかったときに表示。"],
        optionsAppearance: ["外観", "外観設定のグループ。"],
        optionsStory: ["物語", "物語設定のグループ。"],
        optionsEpub: ["EPUB", "EPUB 設定のグループ。"],
        optionsImages: ["画像", "画像設定のグループ。"],
        optionsBehaviour: ["動作", "動作設定のグループ。"],
        optionsPrivacy: ["プライバシー", "プライバシー設定のグループ。"],
        optionsAdvanced: ["詳細", "詳細設定のグループ。"],
        optionsTheme: ["テーマ", "テーマの設定。"],
        optionsAccent: ["アクセント", "アクセントカラーの設定。"],
        optionsDensity: ["密度", "密度の設定。"],
        optionsThemeSystem: ["システム", "システムのテーマ選択。"],
        optionsThemeLight: ["ライト", "ライトテーマの選択。"],
        optionsThemeDark: ["ダーク", "ダークテーマの選択。"],
        onboardingWelcome: ["Kintsugi へようこそ", "最初のステップの見出し。"],
        onboardingNext: ["次へ", "次のステップへ進むボタン。"],
        onboardingBack: ["戻る", "前のステップへ戻るボタン。"],
        onboardingFinish: ["完了", "導入を終了するボタン。"],
        onboardingSkip: ["スキップ", "導入をスキップするボタン。"],
        errorGeneric: ["問題が発生しました。もう一度お試しください。", "既定のエラーメッセージ。"],
        errorNetwork: ["サイトに接続できませんでした。", "ネットワークエラー。"],
        errorNoParser: ["Kintsugi はまだこのサイトを知りません。", "URL に一致するパーサーがなかった。"],
        errorTimeout: ["サイトの応答に時間がかかりすぎました。", "タイムアウト。"],
        errorCancelled: ["キャンセルしました。", "ユーザーが操作を取り消した。"],
        errorForbidden: ["サイトがリクエストを拒否しました。", "HTTP 403。"],
        errorParse: ["ページを読み取れませんでした。", "ページを解析できなかった。"],
        errorNoChapters: ["このページに章は見つかりませんでした。", "章リストが空だった。"],
        filterSearch: ["検索", "フィルターの検索欄。"],
        filterUseRegex: ["正規表現を使う", "検索を正規表現にするかどうか。"],
        filterInclude: ["含める", "一致する章だけを残します。"],
        filterExclude: ["除外する", "一致する章を取り除きます。"],
        filterMatchCount: ["$COUNT$ 件が一致", "フィルターに一致する章の数。"],
        filterClear: ["クリア", "フィルターを消去します。"],
        filterApply: ["適用", "フィルターを適用します。"],
        filterInvalidPattern: ["有効なパターンではありません。", "正規表現がコンパイルできないときに表示。"],
    },
};

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
    for (const [locale, translations] of Object.entries(TRANSLATIONS)) {
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
