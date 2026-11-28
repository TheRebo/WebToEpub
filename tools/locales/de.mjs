/**
 * The de translations.
 *
 * Each entry is `[message, description]`. A missing key falls back to the
 * English source at build time, so a partial file is still usable.
 */
export default {
    appName: ["Kintsugi", "Der Name der Erweiterung."],
    appTagline: [
        "Verwandeln Sie jeden Webroman in ein Buch, das Sie behalten wollen.",
        "Eine einzeilige Beschreibung der Erweiterung.",
    ],
    workbenchTitle: ["Werkbank", "Der Titel der Hauptseite."],
    workbenchStoryDetails: ["Story-Details", "Die Überschrift der Metadatenleiste."],
    workbenchCover: ["Cover", "Die Überschrift des Cover-Bereichs."],
    workbenchOptions: ["Optionen", "Die Überschrift des Optionsbereichs."],
    workbenchChapters: ["Kapitel", "Die Überschrift der Kapitelliste."],
    workbenchChapterCount: [
        "$VISIBLE$ von $TOTAL$",
        "Wie viele Kapitel sichtbar sind, von wie vielen gefunden wurden.",
    ],
    workbenchPack: ["EPUB erstellen", "Die Schaltfläche, die das Buch erstellt."],
    workbenchCancel: ["Abbrechen", "Die Schaltfläche, die einen Download stoppt."],
    workbenchRetry: [
        "Erneut versuchen",
        "Startet einen fehlgeschlagenen oder abgebrochenen Download neu.",
    ],
    workbenchDismiss: ["Ausblenden", "Blendet den Status eines beendeten Downloads aus."],
    workbenchSavedAs: [
        "Gespeichert als $FILE$ ($SIZE$)",
        "Wird angezeigt, wenn das Buch gespeichert wurde.",
    ],
    workbenchSelectAll: ["Alle auswählen", "Die Schaltfläche, die alle Kapitel auswählt."],
    workbenchSelectNone: ["Auswahl aufheben", "Die Schaltfläche, die alle Kapitel abwählt."],
    workbenchInvert: ["Umkehren", "Die Schaltfläche, die die Auswahl umkehrt."],
    workbenchRanges: ["Bereiche", "Die Schaltfläche für einen Kapitelbereich."],
    workbenchRangeTitle: ["Bereich auswählen", "Die Überschrift des Bereich-Dialogs."],
    workbenchRangeFrom: ["Erstes Kapitel", "Das erste Kapitel des Bereichs."],
    workbenchRangeTo: ["Letztes Kapitel", "Das letzte Kapitel des Bereichs."],
    workbenchRangeCount: ["$COUNT$ Kapitel", "Wie viele Kapitel der Bereich umfasst."],
    workbenchRangeCountOne: [
        "$COUNT$ Kapitel",
        "Wie viele Kapitel der Bereich umfasst, wenn es nur eines ist.",
    ],
    workbenchRangeSelect: ["Bereich auswählen", "Wählt die Kapitel im Bereich aus."],
    workbenchRangeDeselect: ["Bereich abwählen", "Hebt die Auswahl im Bereich auf."],
    workbenchRangeInvalid: [
        "Geben Sie eine Kapitelnummer zwischen 1 und $COUNT$ ein.",
        "Wird angezeigt, wenn der Bereich nicht verwendet werden kann.",
    ],
    workbenchFilter: ["Filter", "Die Schaltfläche, die den Filter öffnet."],
    workbenchBusy: [
        "Ein Buch wird gerade erstellt",
        "Warum Erstellen während eines Downloads nicht geht.",
    ],
    workbenchNoChaptersSelected: [
        "Keine Kapitel ausgewählt",
        "Wird angezeigt, wenn nichts angehakt ist.",
    ],
    workbenchWaitingForChapters: [
        "Suche nach Kapiteln…",
        "Wird beim Laden der Kapitelliste angezeigt.",
    ],
    workbenchFieldTitle: ["Titel", "Der Titel der Story."],
    workbenchFieldAuthor: ["Autor", "Der Autor der Story."],
    workbenchFieldLanguage: ["Sprache", "Die Sprache der Story."],
    workbenchFieldFilename: ["Dateiname", "Der Name der gespeicherten EPUB."],
    workbenchResetFilename: ["Zurücksetzen", "Stellt den Standarddateinamen wieder her."],
    workbenchRemoveCover: ["Cover entfernen", "Entfernt das Coverbild."],
    workbenchIncludeAuthorNotes: [
        "Autorennotizen einschließen",
        "Behält die Notizen am Ende eines Kapitels.",
    ],
    workbenchIncludeTocPage: [
        "Inhaltsverzeichnis einfügen",
        "Fügt das Inhaltsverzeichnis als Kapitel hinzu.",
    ],
    workbenchOptionsHint: [
        "Das gilt für jedes Buch, das Sie erstellen.",
        "Erklärt, dass die Schalter die Einstellungen ändern.",
    ],
    workbenchMoreOptions: ["Weitere Optionen", "Öffnet die vollständige Einstellungsseite."],
    workbenchCoverUrl: ["Adresse des Coverbilds", "Die Adresse des Coverbilds."],
    workbenchNoStoryHere: [
        "Auf dieser Seite wurde keine Story gefunden",
        "Wenn die Seite keine Story ist.",
    ],
    workbenchNoStoryHint: [
        "Prüfen Sie, ob dies die Kapitelliste der Geschichte ist, oder zeigen Sie Kintsugi, wo die Kapitel stehen.",
        "Unter der leeren Kapitelliste.",
    ],
    workbenchFieldUrl: ["Story-Adresse", "Das Feld mit der Adresse der Story-Seite."],
    workbenchFieldUrlHint: [
        "Füge die Adresse der Kapitelliste ein.",
        "Der Hinweis unter dem Adressfeld.",
    ],
    workbenchLoadStory: ["Laden", "Die Schaltfläche, die die Story lädt."],
    workbenchUrlInvalid: [
        "Das ist keine Webadresse.",
        "Wenn die Adresse nicht verwendet werden kann.",
    ],
    accessTitle: ["Zugriff auf diese Seite erlauben", "Die Überschrift der Zugriffsfrage."],
    accessText: [
        "Kintsugi kann nur eine Seite lesen, die Sie erlaubt haben. Die Seiten werden auf Ihrem Rechner gelesen, und nichts wird verschickt.",
        "Der Text unter der Zugriffsfrage.",
    ],
    accessGrant: ["Zugriff erlauben", "Die Schaltfläche, die den Browser um Zugriff bittet."],
    accessDenied: [
        "Der Zugriff wurde nicht erlaubt, die Story kann nicht gelesen werden.",
        "Wenn der Browserdialog abgelehnt wird.",
    ],
    accessGranted: [
        "Kintsugi darf diese Seite jetzt lesen.",
        "Wenn die Seite gerade erlaubt wurde.",
    ],
    chapterStateQueued: ["In Warteschlange", "Ein Kapitel, das auf den Abruf wartet."],
    chapterStateFetching: ["Wird abgerufen", "Ein Kapitel, das gerade abgerufen wird."],
    chapterStateLoaded: ["Gelesen", "Ein Kapitel, das gelesen wurde."],
    chapterStateDownloaded: ["Heruntergeladen", "Ein Kapitel, das im Buch enthalten ist."],
    chapterStateFailed: ["Fehlgeschlagen", "Ein Kapitel, das nicht gelesen werden konnte."],
    chapterStateNotStarted: ["Nicht begonnen", "Ein Kapitel, das noch nicht abgerufen wurde."],
    phasePreparing: ["Wird vorbereitet", "Die erste Stufe eines Downloads."],
    phaseFetchingChapters: ["Kapitel werden abgerufen", "Die Stufe, die die Kapitel liest."],
    phaseDownloadingImages: ["Bilder werden geladen", "Die Stufe, die die Bilder liest."],
    phaseBuildingEpub: ["EPUB wird erstellt", "Die Stufe, die das Buch zusammensetzt."],
    phaseSaving: ["Wird gespeichert", "Die Stufe, die die Datei schreibt."],
    phaseComplete: ["Gespeichert", "Wird angezeigt, wenn das Buch gespeichert wurde."],
    phaseFailed: ["Fehlgeschlagen", "Wird angezeigt, wenn der Download fehlgeschlagen ist."],
    phaseCancelled: ["Abgebrochen", "Wird angezeigt, wenn der Download gestoppt wurde."],
    popupOpenWorkbench: ["Werkbank öffnen", "Die Hauptschaltfläche des Popups."],
    popupLibraryShort: ["Bibliothek", "Die sichtbare Beschriftung der Bibliotheksschaltfläche."],
    popupWorkbenchShort: ["Werkbank", "Die sichtbare Beschriftung der Werkbankschaltfläche."],
    popupSettings: ["Einstellungen", "Die Einstellungsschaltfläche des Popups."],
    popupNoStory: [
        "Auf dieser Seite wurde keine Story erkannt.",
        "Wenn die Seite keine Story ist.",
    ],
    popupWelcome: [
        "Willkommen bei Kintsugi. Richten wir alles ein, bevor Sie Ihr erstes Buch machen.",
        "Beim ersten Start, vor der Einführung.",
    ],
    popupGetStarted: [
        "Kintsugi einrichten",
        "Die Schaltfläche des Popups, die die Einführung öffnet.",
    ],
    popupSaved: ["Ihr Buch ist fertig.", "Wird angezeigt, wenn ein Download endet."],
    popupTryAgain: ["Erneut versuchen", "Die Wiederholen-Schaltfläche des Popups."],
    popupChecking: [
        "Diese Seite wird gelesen…",
        "Wird angezeigt, während das Popup auf den Hintergrundprozess wartet.",
    ],
    popupUnsupportedHost: [
        "$HOST$ wird noch nicht unterstützt.",
        "Wird angezeigt, wenn kein Parser zur aktuellen Seite passt.",
    ],
    popupChapterCount: ["$COUNT$ Kapitel", "Wie viele Kapitel das Popup gefunden hat."],
    popupChapterCountOne: [
        "$COUNT$ Kapitel",
        "Wie viele Kapitel das Popup gefunden hat, wenn es nur eines ist.",
    ],
    optionsAppearance: ["Darstellung", "Die Gruppe der Darstellungsoptionen."],
    optionsStory: ["Story", "Die Gruppe der Story-Optionen."],
    optionsEpub: ["EPUB", "Die Gruppe der EPUB-Optionen."],
    optionsImages: ["Bilder", "Die Gruppe der Bildoptionen."],
    optionsBehaviour: ["Verhalten", "Die Gruppe der Verhaltensoptionen."],
    optionsAdvanced: ["Erweitert", "Die Gruppe der erweiterten Optionen."],
    optionsTheme: ["Design", "Die Design-Einstellung."],
    optionsAccent: ["Akzentfarbe", "Die Einstellung der Akzentfarbe."],
    optionsDensity: ["Dichte", "Die Dichte-Einstellung."],
    optionsThemeSystem: ["System", "Die System-Design-Option."],
    optionsThemeLight: ["Hell", "Die helle Design-Option."],
    optionsThemeDark: ["Dunkel", "Die dunkle Design-Option."],
    optionsAccentGold: ["Gold", "Die goldene Akzentfarbe."],
    optionsAccentInk: ["Tinte", "Die Akzentfarbe Tinte."],
    optionsAccentVerdigris: ["Grünspan", "Die Akzentfarbe Grünspan."],
    optionsAccentPlum: ["Pflaume", "Die Akzentfarbe Pflaume."],
    optionsDensityComfortable: ["Komfortabel", "Die komfortable Dichte-Option."],
    optionsDensityCompact: ["Kompakt", "Die kompakte Dichte-Option."],
    optionsSearchSettings: ["Einstellungen durchsuchen", "Das Suchfeld für die Einstellungen."],
    optionsSiteAccess: ["Seitenzugriff", "Die Liste der Seiten, die die Erweiterung lesen darf."],
    optionsRevoke: ["Widerrufen", "Entfernt den Zugriff auf eine Seite."],
    optionsRevokeAll: ["Alle widerrufen", "Entfernt den Zugriff auf jede Seite."],
    optionsRevokeAllConfirm: [
        "Kintsugi kann keine dieser Seiten mehr lesen, bis Sie jede wieder erlauben.",
        "Erklärung im Dialog, der den Zugriff auf alle Seiten entfernt.",
    ],
    optionsSiteAccessEmpty: [
        "Noch keine Seiten. Kintsugi fragt, wenn Sie eine Geschichte öffnen.",
        "Der leere Zustand der Zugriffsliste.",
    ],
    optionsSiteAccessHint: [
        "Kintsugi kann nur die hier aufgeführten Seiten lesen.",
        "Der Hinweis unter der Zugriffsüberschrift.",
    ],
    optionsRevoked: [
        "Der Zugriff auf die Seite wurde zurückgenommen.",
        "Wird nach dem Widerruf gezeigt.",
    ],
    optionsRevokedAll: [
        "Der Zugriff auf jede Seite wurde zurückgenommen.",
        "Wird nach dem Widerruf aller Seiten gezeigt.",
    ],
    optionsExportSettings: [
        "Einstellungen exportieren",
        "Speichert die Einstellungen in einer Datei.",
    ],
    optionsImportSettings: ["Einstellungen importieren", "Lädt die Einstellungen aus einer Datei."],
    optionsResetAll: [
        "Alle Einstellungen zurücksetzen",
        "Setzt jede Einstellung auf den Standardwert.",
    ],
    optionsExported: [
        "Die Einstellungen wurden in einer Datei gespeichert.",
        "Wird nach dem Export der Einstellungen angezeigt.",
    ],
    optionsImported: [
        "Die Einstellungen wurden aus der Datei geladen.",
        "Wird nach dem Import der Einstellungen angezeigt.",
    ],
    optionsImportInvalid: [
        "Diese Datei ist keine Kintsugi-Einstellungsdatei.",
        "Wird angezeigt, wenn die importierte Datei nicht gelesen werden kann.",
    ],
    optionsResetDone: [
        "Jede Einstellung steht wieder auf ihrem Standardwert.",
        "Wird nach dem Zurücksetzen der Einstellungen angezeigt.",
    ],
    optionsResetConfirm: [
        "Jede Einstellung geht auf ihren Standardwert zurück. Ihre Bibliothek und Ihre gespeicherten Seiten bleiben unberührt.",
        "Die Erklärung im Dialog zum Zurücksetzen.",
    ],
    optionsResetConfirmAction: ["Alles zurücksetzen", "Die Bestätigungsschaltfläche im Dialog."],
    optionsPrivacyNote: [
        "Kintsugi sendet nichts an irgendwen. Jede Netzwerkanfrage geht an die Seite, die Sie lesen.",
        "Der Hinweis am Fuß der Einstellungen.",
    ],
    optionsLibrary: ["Bibliothek", "Der Bibliotheks-Tab und die von Ihnen erstellten Bücher."],
    optionsLibraryEmptyTitle: [
        "Ihre Bibliothek ist leer.",
        "Die Überschrift der leeren Bibliothek.",
    ],
    optionsLibraryEmptyText: [
        "Erstellte Bücher bleiben hier, damit Sie sie aktualisieren können, sobald ein neues Kapitel erscheint.",
        "Die Erklärung der leeren Bibliothek.",
    ],
    optionsNoResults: [
        "Nichts passt zu dieser Suche.",
        "Wird angezeigt, wenn eine Suche in den Einstellungen nichts findet.",
    ],
    optionsNavLabel: ["Einstellungsgruppen", "Der zugängliche Name der Einstellungs-Navigation."],
    optionsLibraryMeta: ["$CHAPTERS$ Kapitel · $SIZE$", "Die Metadatenzeile der Bibliothekskarte."],
    optionsLibraryMetaOne: [
        "$CHAPTERS$ Kapitel · $SIZE$",
        "Die Metadatenzeile der Bibliothekskarte, wenn das Buch nur ein Kapitel hat.",
    ],
    optionsLibraryImport: [
        "Aus WebToEpub importieren",
        "Die Schaltfläche, die eine von WebToEpub 1.x exportierte Bibliothek importiert.",
    ],
    optionsLibraryImported: [
        "$1 Bücher importiert.",
        "Bestätigung nach dem Import einer Bibliothek mit mehreren Büchern.",
    ],
    optionsLibraryImportedOne: [
        "$1 Buch importiert.",
        "Bestätigung nach dem Import einer Bibliothek mit einem Buch.",
    ],
    optionsLibraryTooLarge: [
        "Diese Datei ist zu groß zum Importieren. Die größte Bibliothek, die Kintsugi lesen kann, ist $SIZE$.",
        "Wird gezeigt, wenn der Benutzer einen Bibliotheksexport auswählt, der größer ist als Kintsugi liest.",
    ],
    libraryRemove: ["Entfernen", "Entfernt ein Buch aus der Bibliothek."],
    libraryRemoveTitle: [
        "Dieses Buch aus der Bibliothek entfernen?",
        "Überschrift des Entfernen-Dialogs.",
    ],
    libraryRemoveConfirm: [
        "Die gespeicherte EPUB-Datei bleibt, wo sie ist. Nur ihr Eintrag in der Bibliothek verschwindet.",
        "Erklärung im Entfernen-Dialog.",
    ],
    libraryRemoved: ["Aus der Bibliothek entfernt.", "Bestätigung nach dem Entfernen eines Buchs."],
    settingReduceMotion: [
        "Bewegung immer reduzieren",
        "Die Einstellung zur Reduzierung von Bewegung.",
    ],
    settingReduceMotionHint: [
        "Schaltet Übergänge auch dann ab, wenn das System es nicht verlangt.",
        "Erklärt die Einstellung zur Reduzierung von Bewegung.",
    ],
    settingFilenameTemplate: ["Dateinamen-Vorlage", "Die Einstellung für die Dateinamen-Vorlage."],
    settingFilenameTemplateHint: [
        "{title} und {author} werden beim Speichern der Datei ersetzt.",
        "Erklärt die Einstellung für die Dateinamen-Vorlage.",
    ],
    settingDefaultLanguage: ["Standardsprache", "Die Einstellung der Standardsprache."],
    settingDefaultLanguageHint: [
        "Die Sprache eines Buchs, wenn die Seite keine angibt.",
        "Erklärt die Einstellung der Standardsprache.",
    ],
    settingRemoveAuthorNotes: [
        "Autorennotizen entfernen",
        "Die Einstellung zum Entfernen von Autorennotizen.",
    ],
    settingRemoveAuthorNotesHint: [
        "Entfernt die Notizen, die viele Autoren ans Kapitelende setzen.",
        "Erklärt die Einstellung zum Entfernen von Autorennotizen.",
    ],
    settingRemoveChapterNumbers: [
        "Kapitelnummern aus Titeln entfernen",
        "Die Einstellung zum Entfernen von Kapitelnummern.",
    ],
    settingRemoveChapterNumbersHint: [
        "Entfernt die Nummer, die eine Seite an den Anfang eines Kapiteltitels setzt.",
        "Erklärt die Einstellung zum Entfernen von Kapitelnummern.",
    ],
    settingIncludeTocPage: [
        "Inhaltsverzeichnis als Kapitel einfügen",
        "Die Einstellung zum Einfügen des Inhaltsverzeichnisses.",
    ],
    settingEpubVersion: ["Version", "Die Einstellung der EPUB-Version."],
    settingEpubVersionHint: [
        "Version 3 ist der Standard. Version 2 ist für ältere Reader.",
        "Erklärt die Einstellung der EPUB-Version.",
    ],
    settingAddInfoPage: [
        "Informationsseite hinzufügen",
        "Die Einstellung für die Informationsseite.",
    ],
    settingAddInfoPageHint: [
        "Eine Seite mit Titel, Autor und Quelle.",
        "Erklärt die Einstellung für die Informationsseite.",
    ],
    settingRemoveNextPrevLinks: [
        "Links zu vorherigen und nächsten Kapiteln entfernen",
        "Die Einstellung zum Entfernen der Zurück- und Weiter-Links.",
    ],
    settingIncludeSourceUrl: [
        "Quell-URL in jedem Kapitel einfügen",
        "Die Einstellung zum Einfügen der Quell-URL.",
    ],
    settingSkipImages: [
        "Bilder ganz überspringen",
        "Die Einstellung zum Überspringen von Bildern.",
    ],
    settingRemoveDuplicates: [
        "Doppelte Bilder entfernen",
        "Die Einstellung zum Entfernen doppelter Bilder.",
    ],
    settingPreferHighestResolution: [
        "Höchste Auflösung bevorzugen",
        "Die Einstellung zur bevorzugten Auflösung.",
    ],
    settingUseSvg: ["SVG-Bilder zulassen", "Die Einstellung für SVG-Bilder."],
    settingSkipFailedChapters: [
        "Fehlgeschlagene Kapitel überspringen",
        "Die Einstellung zum Überspringen fehlgeschlagener Kapitel.",
    ],
    settingSkipFailedChaptersHint: [
        "Ein fehlgeschlagenes Kapitel wird zu einer Notiz im Buch, statt den Lauf abzubrechen.",
        "Erklärt die Einstellung zum Überspringen fehlgeschlagener Kapitel.",
    ],
    settingRetryOnEmptyPage: [
        "Bei leerer Seite erneut versuchen",
        "Die Einstellung zum erneuten Versuch bei leeren Seiten.",
    ],
    settingEmptyPageIsError: [
        "Eine leere Seite ist ein Fehler",
        "Die Einstellung, nach der eine leere Seite ein Fehler ist.",
    ],
    settingEmptyPageIsErrorHint: [
        "Manche Seiten antworten auf eine blockierte Anfrage mit einer leeren Seite. Ist diese Option an, wird eine leere Seite als Fehler gemeldet, statt zu einem leeren Kapitel zu werden.",
        "Erklärt die Einstellung, nach der eine leere Seite ein Fehler ist.",
    ],
    settingMinimumDelay: [
        "Mindestverzögerung zwischen Anfragen",
        "Die Einstellung der Mindestverzögerung.",
    ],
    settingMinimumDelayHint: [
        "In Millisekunden. Erhöhen Sie den Wert für Seiten mit strenger Ratenbegrenzung.",
        "Erklärt die Einstellung der Mindestverzögerung.",
    ],
    settingMaxChapters: [
        "Maximale Kapitelzahl pro Buch",
        "Die Einstellung der maximalen Kapitelzahl.",
    ],
    settingDelayPerChapter: [
        "Zusatzverzögerung pro Kapitel",
        "Die Einstellung der Verzögerung pro Kapitel.",
    ],
    settingDelayPerChapterHint: [
        "In Millisekunden, zusätzlich zur Mindestverzögerung.",
        "Erklärt die Einstellung der Verzögerung pro Kapitel.",
    ],
    settingDiagnostics: ["Entwickler-Diagnose", "Die Einstellung für die Diagnose."],
    settingDiagnosticsHint: [
        "Schreibt mehr Details in die Konsole. Standardmäßig aus.",
        "Erklärt die Einstellung für die Diagnose.",
    ],
    onboardingWelcome: ["Willkommen bei Kintsugi", "Die Überschrift des ersten Schritts."],
    onboardingStep1: ["Schritt 1 von 3", "Die Beschriftung des ersten Einführungsschritts."],
    onboardingStep2: ["Schritt 2 von 3", "Die Beschriftung des zweiten Einführungsschritts."],
    onboardingStep3: ["Schritt 3 von 3", "Die Beschriftung des dritten Einführungsschritts."],
    onboardingBack: ["Zurück", "Die Schaltfläche für den vorherigen Schritt."],
    onboardingFinish: ["Fertig", "Die Schaltfläche, die die Einführung beendet."],
    onboardingSkip: ["Überspringen", "Die Schaltfläche, die die Einführung überspringt."],
    onboardingNextSites: [
        "Weiter: welche Seiten gehen",
        "Vom Willkommensschritt zum Seitenschritt.",
    ],
    onboardingNextLook: ["Weiter: Aussehen wählen", "Vom Seitenschritt zum Aussehensschritt."],
    onboardingWelcomeText: [
        "Verwandeln Sie jeden Webroman in ein Buch, das sich lohnt. Richten Sie Kintsugi auf eine Kapitelliste, und es erstellt ein sauberes EPUB mit Cover und Inhaltsverzeichnis.",
        "Die Erklärung des ersten Einführungsschritts.",
    ],
    onboardingWelcomeFootnote: [
        "Kein Konto, kein Tracking. Kintsugi spricht nur mit den Seiten, die Sie lesen.",
        "Die Fußnote des ersten Einführungsschritts.",
    ],
    onboardingWhichSite: [
        "Welche Seite lesen Sie?",
        "Die Überschrift des zweiten Einführungsschritts.",
    ],
    onboardingWhichSiteText: [
        "Kintsugi kennt hunderte Seiten. Öffnen Sie eine davon, und es bietet an, das Buch zu erstellen.",
        "Die Erklärung des zweiten Einführungsschritts.",
    ],
    onboardingWhichSiteFootnote: [
        "Nicht dabei? Kintsugi kann die Seite trotzdem lesen, wenn Sie ihm zeigen, wo die Kapitel stehen.",
        "Die Fußnote des zweiten Einführungsschritts.",
    ],
    onboardingMakeItYours: [
        "Nach Ihrem Geschmack",
        "Die Überschrift des dritten Einführungsschritts.",
    ],
    onboardingMakeItYoursText: [
        "Das ist eine Live-Vorschau. Wählen Sie, was Ihnen gefällt.",
        "Die Erklärung des dritten Einführungsschritts.",
    ],
    errorGeneric: [
        "Etwas ist schiefgelaufen. Bitte versuche es erneut.",
        "Die Standard-Fehlermeldung.",
    ],
    errorNetwork: ["Die Seite war nicht erreichbar.", "Ein Netzwerkfehler."],
    errorNoParser: ["Kintsugi kennt diese Seite noch nicht.", "Kein Parser passte zur URL."],
    errorCancelled: ["Abgebrochen.", "Der Nutzer hat den Vorgang abgebrochen."],
    errorHttpStatus: [
        "Die Seite hat mit einem Fehler geantwortet.",
        "Der Server meldete einen HTTP-Fehler.",
    ],
    errorRateLimited: [
        "Die Seite begrenzt die Anfragen. Warten Sie kurz und versuchen Sie es erneut.",
        "Der Server antwortete mit 429.",
    ],
    errorChallenge: [
        "Die Seite möchte prüfen, ob Sie ein Mensch sind. Öffnen Sie die Seite und versuchen Sie es dann erneut.",
        "Die Seite zeigte eine Prüfung wie ein Captcha.",
    ],
    errorEmptyChapter: [
        "Das Kapitel kam leer zurück. Es ist vielleicht gesperrt, oder die Seite hat sich geändert.",
        "Eine Kapitelseite ohne Text.",
    ],
    errorStorageFull: [
        "Es ist nicht genug Platz, um dieses Buch zu speichern.",
        "Der Speicher des Browsers ist voll.",
    ],
    errorPermission: ["Kintsugi darf diese Seite nicht lesen.", "Die Seite wurde nicht erlaubt."],
    errorBusy: [
        "Ein anderes Buch wird noch erstellt. Warten Sie, bis es fertig ist, oder brechen Sie es ab.",
        "Ein zweiter Download wurde gestartet.",
    ],
    errorParse: [
        "Die Seite konnte nicht gelesen werden.",
        "Die Seite konnte nicht ausgewertet werden.",
    ],
    filterSearch: ["Suchen", "Das Suchfeld des Filters."],
    filterUseRegex: ["Regulären Ausdruck verwenden", "Ob die Suche ein Regex ist."],
    filterInclude: ["Einschließen", "Behält nur passende Kapitel."],
    filterExclude: ["Ausschließen", "Entfernt passende Kapitel."],
    filterMatchCount: ["$COUNT$ passende", "Wie viele Kapitel zum Filter passen."],
    filterClear: ["Löschen", "Leert den Filter."],
    filterNoMatches: [
        "Kein Kapitel passt zu diesen Filtern",
        "Wenn der Filter alle Kapitel ausblendet.",
    ],
    filterClearAll: [
        "Filter entfernen",
        "Entfernt den Filter, damit alle Kapitel wieder erscheinen.",
    ],
    optionsNumberRequired: [
        "Geben Sie eine Zahl ein.",
        "Unter einer leer gelassenen Zahleneinstellung.",
    ],
    filterApply: ["Anwenden", "Wendet den Filter an."],
    filterInvalidPattern: ["Das ist kein gültiges Muster.", "Wenn der Regex nicht kompiliert."],
    siteSelectorBannerTitle: [
        "Kein Parser für diese Seite",
        "Der Titel des Hinweises, wenn der Ersatzparser verwendet wird.",
    ],
    siteSelectorBannerText: [
        "Kintsugi errät, wo der Text steht. Sagen Sie es ihm einmal, und er merkt es sich.",
        "Die Erklärung des Hinweises.",
    ],
    siteSelectorOpen: [
        "Diese Seite einrichten",
        "Die Schaltfläche, die den Selektor-Dialog öffnet.",
    ],
    siteSelectorDialogTitle: ["CSS-Selektoren", "Die Überschrift des Selektor-Dialogs."],
    siteSelectorIntro: [
        "Diese CSS-Selektoren zeigen Kintsugi, wo der Text eines Kapitels steht. Sie werden nur für diese Seite gespeichert.",
        "Die Einleitung des Dialogs.",
    ],
    siteSelectorContent: ["Kapiteltext", "Die Beschriftung des Inhalts-Selektors."],
    siteSelectorContentHint: [
        "Das Element, das den Kapiteltext enthält, als CSS-Selektor.",
        "Der Hinweis zum Inhalts-Selektor.",
    ],
    siteSelectorTitle: ["Kapiteltitel", "Die Beschriftung des Titel-Selektors."],
    siteSelectorTitleHint: [
        "Das Element, das den Kapiteltitel enthält. Optional.",
        "Der Hinweis zum Titel-Selektor.",
    ],
    siteSelectorRemove: ["Zu entfernende Elemente", "Die Beschriftung des Entfernungs-Selektors."],
    siteSelectorRemoveHint: [
        "Kommentare, Werbung und Navigation, die entfernt werden. Optional.",
        "Der Hinweis zum Entfernungs-Selektor.",
    ],
    siteSelectorSuggest: [
        "Vorschlagen",
        "Die Schaltfläche, die den Scanner nach einem Vorschlag fragt.",
    ],
    siteSelectorSuggested: [
        "Von der Seite geraten. Testen Sie ihn vor dem Speichern.",
        "Wird angezeigt, nachdem der Scanner Selektoren vorgeschlagen hat.",
    ],
    siteSelectorTest: ["Testen", "Die Schaltfläche, die die Selektoren auf der Seite prüft."],
    siteSelectorTestResult: [
        "$CHARS$ Zeichen gefunden.",
        "Wie viel Text der Inhalts-Selektor gefunden hat.",
    ],
    siteSelectorTestFailed: [
        "Dieser Selektor hat auf dieser Seite nichts gefunden.",
        "Wenn der Test nichts findet.",
    ],
    siteSelectorInvalid: [
        "Das ist kein gültiger CSS-Selektor.",
        "Wenn ein Selektor nicht kompiliert.",
    ],
    siteSelectorSave: ["Speichern", "Speichert die Selektoren."],
    siteSelectorSaved: [
        "Gespeichert. Kintsugi verwendet sie ab jetzt für diese Seite.",
        "Bestätigung nach dem Speichern.",
    ],
    siteSelectorForget: ["Diese Seite vergessen", "Entfernt die gespeicherten Selektoren."],
    siteSelectorForgotten: [
        "Vergessen. Kintsugi wird wieder raten.",
        "Bestätigung nach dem Vergessen.",
    ],
    siteSelectorList: [
        "Seiten-Selektoren",
        "Der Abschnitt der Seiten-Selektoren auf der Optionsseite.",
    ],
    siteSelectorListEmpty: [
        "Noch keine Seite eingerichtet.",
        "Der leere Zustand der Selektorliste.",
    ],
    siteSelectorTocDetected: [
        "Diese Seite sieht wie ein Inhaltsverzeichnis aus, nicht wie ein Kapitel. Öffnen Sie ein Kapitel und versuchen Sie es erneut.",
        "Wenn der Scanner ein Inhaltsverzeichnis erkennt.",
    ],
    commonClose: ["Schließen", "Die Beschriftung einer Schaltfläche, die einen Dialog schließt."],
    commonDismiss: [
        "Ausblenden",
        "Die Beschriftung einer Schaltfläche, die eine Meldung ausblendet.",
    ],
    commonCancel: ["Abbrechen", "Die Beschriftung einer Schaltfläche, die eine Aktion abbricht."],
};
