/**
 * The workbench view.
 *
 * Builds the DOM and keeps it in sync with the store. The view is written
 * imperatively, without a virtual DOM, because the surface is small and
 * mostly static: the app bar, three sidebar panels, the chapter list, and the
 * status bar. Only the chapter list changes often, and that is already
 * virtualised by `<k-list>`.
 */
import { t } from "../../i18n";
import { buildFileName, DEFAULT_FILENAME_TEMPLATE } from "../../../core/util/file-name";
import { displayOrigin } from "../../../core/host-access";
import { createIcon, type IconName } from "../../components/icons";
import { stateLabel } from "../../components/k-list";
import type { KList } from "../../components/k-list";
import type { KButton } from "../../components/k-button";
import type { KSwitch } from "../../components/k-switch";
import type { Chapter, ChapterState, WorkbenchState } from "./state";

/** The icons for each chapter state. */
const STATE_ICONS: Record<ChapterState, IconName> = {
    idle: "empty-circle",
    queued: "half-circle",
    fetching: "spinner",
    loaded: "filled-circle",
    downloaded: "check-circle",
    failed: "alert-triangle",
};

/** The workbench's elements. */
export interface WorkbenchElements {
    /** The story's title. */
    title: HTMLElement;
    /** The story's author. */
    author: HTMLElement;
    /** The story's address field. */
    urlField: HTMLInputElement;
    /** The button that loads the story at the given address. */
    urlLoadButton: KButton;
    /** The title field. */
    titleField: HTMLInputElement;
    /** The author field. */
    authorField: HTMLInputElement;
    /** The language field. */
    languageField: HTMLSelectElement;
    /** The filename field. */
    filenameField: HTMLInputElement;
    /** The reset-filename button. */
    resetFilename: HTMLButtonElement;
    /** The cover's preview. */
    coverPreview: HTMLElement;
    /** The cover's URL field. */
    coverUrlField: HTMLInputElement;
    /** The remove-cover button. */
    removeCover: KButton;
    /** The choose-from-page button. */
    chooseCover: KButton;
    /** The author-notes switch. */
    authorNotesSwitch: KSwitch;
    /** The toc-page switch. */
    tocPageSwitch: KSwitch;
    /** The Save button. */
    saveButton: KButton;
    /** The Pack button. */
    packButton: KButton;
    /** The select-all checkbox. */
    selectAll: HTMLInputElement;
    /** The "select all" toolbar button. */
    selectAllButton: KButton;
    /** The "select none" toolbar button. */
    selectNoneButton: KButton;
    /** The "invert" toolbar button. */
    invertButton: KButton;
    /** The "ranges" toolbar button. */
    rangesButton: KButton;
    /** The range dialog. */
    rangeDialog: HTMLElement;
    /** The range dialog's "first chapter" field. */
    rangeFrom: HTMLInputElement;
    /** The range dialog's "last chapter" field. */
    rangeTo: HTMLInputElement;
    /** The range dialog's error. */
    rangeError: HTMLElement;
    /** The range dialog's count of covered chapters. */
    rangeCount: HTMLElement;
    /** The range dialog's "select" button. */
    rangeSelect: KButton;
    /** The range dialog's "deselect" button. */
    rangeDeselect: KButton;
    /** The "filter" toolbar button. */
    filterButton: KButton;
    /** The chapter count. */
    chapterCount: HTMLElement;
    /** The chapter list. */
    list: KList;
    /** The empty state. */
    emptyState: HTMLElement;
    /** The loading state. */
    loadingState: HTMLElement;
    /** The status bar. */
    statusBar: HTMLElement;
    /** The status bar's label. */
    statusLabel: HTMLElement;
    /** The status bar's count. */
    statusCount: HTMLElement;
    /** The status bar's track. */
    statusTrack: HTMLElement;
    /** The status bar's fill. */
    statusFill: HTMLElement;
    /** The status bar's percentage. */
    statusPercent: HTMLElement;
    /** The status bar's icon. */
    statusIcon: HTMLElement;
    /** The status bar's actions. */
    statusActions: HTMLElement;
    /** The filter dialog. */
    filterDialog: HTMLElement;
    /** The filter's search field. */
    filterSearch: HTMLInputElement;
    /** The filter's regex switch. */
    filterRegex: HTMLElement;
    /** The filter's include field. */
    filterInclude: HTMLInputElement;
    /** The filter's exclude field. */
    filterExclude: HTMLInputElement;
    /** The filter's match count. */
    filterCount: HTMLElement;
    /** The filter's error. */
    filterError: HTMLElement;
    /** The filter's clear button. */
    filterClear: HTMLElement;
    /** The filter's apply button. */
    filterApply: HTMLElement;
    /** The banner that offers the site-selector dialog. */
    selectorBanner: HTMLElement;
    /** The banner that asks for access to the site. */
    accessBanner: HTMLElement;
    /** The site the banner is asking about. */
    accessBannerHost: HTMLElement;
    /** The banner's "allow access" button. */
    accessGrantButton: KButton;
    /** The error banner. */
    errorBanner: HTMLElement;
    /** The error banner's message. */
    errorText: HTMLElement;
    /** The banner's "set up this site" button. */
    selectorBannerButton: KButton;
    /** The site-selector dialog. */
    selectorDialog: HTMLElement;
    /** The dialog's content-selector field. */
    selectorContent: HTMLInputElement;
    /** The dialog's title-selector field. */
    selectorTitle: HTMLInputElement;
    /** The dialog's remove-selector field. */
    selectorRemove: HTMLInputElement;
    /** The dialog's "suggest" button. */
    selectorSuggest: KButton;
    /** The dialog's "test" button. */
    selectorTest: KButton;
    /** The dialog's "save" button. */
    selectorSave: KButton;
    /** The dialog's "forget this site" button. */
    selectorForget: KButton;
    /** The dialog's status line. */
    selectorStatus: HTMLElement;
    /** The toast host. */
    toastHost: HTMLElement;
}

/** The languages offered in the language field. */
const LANGUAGES: Array<{ code: string; name: string }> = [
    { code: "en", name: "English" },
    { code: "zh", name: "中文" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "es", name: "Español" },
    { code: "pt", name: "Português" },
    { code: "it", name: "Italiano" },
    { code: "ru", name: "Русский" },
    { code: "uk", name: "Українська" },
    { code: "pl", name: "Polski" },
    { code: "nl", name: "Nederlands" },
    { code: "sv", name: "Svenska" },
    { code: "tr", name: "Türkçe" },
    { code: "ar", name: "العربية" },
    { code: "he", name: "עברית" },
    { code: "hi", name: "हिन्दी" },
    { code: "id", name: "Bahasa Indonesia" },
    { code: "ms", name: "Bahasa Melayu" },
    { code: "th", name: "ไทย" },
    { code: "vi", name: "Tiếng Việt" },
    { code: "fil", name: "Filipino" },
    { code: "pt-BR", name: "Português (Brasil)" },
    { code: "es-419", name: "Español (Latinoamérica)" },
];

/**
 * Build the workbench's DOM.
 *
 * The returned element references are the only coupling between the view and
 * the controller: the controller never queries the DOM by selector.
 */
export function buildWorkbench(root: HTMLElement): WorkbenchElements {
    root.replaceChildren();

    const shell = el("div", "k-shell");
    root.appendChild(shell);

    // --- App bar ---
    const appBar = el("header", "k-app-bar");

    const mark = el("div", "k-app-bar__mark");
    const markIcon = createIcon("sparkle", 20);
    mark.appendChild(markIcon);
    const markText = el("span", "");
    markText.textContent = t("appName");
    mark.appendChild(markText);

    const titleWrap = el("div", "workbench-title");
    const title = el("span", "workbench-title__name");
    const author = el("span", "workbench-title__author");
    titleWrap.append(title, author);

    const actions = el("div", "workbench-actions");
    const saveButton = document.createElement("k-button") as KButton;
    saveButton.setAttribute("variant", "ghost");
    saveButton.setAttribute("size", "md");
    saveButton.textContent = t("workbenchSave");
    saveButton.hidden = true;

    const packButton = document.createElement("k-button") as KButton;
    packButton.setAttribute("variant", "primary");
    packButton.setAttribute("size", "md");
    packButton.setAttribute("icon", "download");
    packButton.textContent = t("workbenchPack");

    actions.append(saveButton, packButton);
    appBar.append(mark, titleWrap, actions);
    shell.appendChild(appBar);

    // --- Layout ---
    const layout = el("div", "workbench-layout");
    const sidebar = el("aside", "workbench-sidebar");
    const main = el("main", "workbench-main");
    layout.append(sidebar, main);
    shell.appendChild(layout);

    // --- The site access banner ---
    //
    // The extension ships with no host permissions at all. It asks for one
    // site at a time, at the moment the user opens a story there. Until the
    // user says yes, the page cannot be read — so this banner is the one thing
    // the workbench has to say, and it says it plainly rather than failing
    // with a network error the user cannot act on.
    const accessBanner = el("div", "access-banner");
    accessBanner.setAttribute("role", "status");
    accessBanner.hidden = true;

    const accessBannerIcon = el("div", "access-banner__icon");
    accessBannerIcon.setAttribute("aria-hidden", "true");
    accessBannerIcon.appendChild(createIcon("lock", 18));

    const accessBannerBody = el("div", "access-banner__body");
    const accessBannerTitle = el("p", "access-banner__title");
    accessBannerTitle.textContent = t("accessTitle");
    const accessBannerText = el("p", "access-banner__text");
    accessBannerText.textContent = t("accessText");
    const accessBannerHost = el("p", "access-banner__host");
    accessBannerBody.append(accessBannerTitle, accessBannerText, accessBannerHost);

    const accessGrantButton = document.createElement("k-button") as KButton;
    accessGrantButton.setAttribute("variant", "primary");
    accessGrantButton.setAttribute("size", "sm");
    accessGrantButton.textContent = t("accessGrant");

    accessBanner.append(accessBannerIcon, accessBannerBody, accessGrantButton);
    main.appendChild(accessBanner);

    // --- The error banner ---
    //
    // An error that is stored but never shown is a silent failure: the user
    // would see an empty chapter list and no idea why. The banner is the one
    // place the workbench says what went wrong.
    const errorBanner = el("div", "workbench-error");
    errorBanner.setAttribute("role", "alert");
    errorBanner.hidden = true;

    const errorIcon = el("span", "workbench-error__icon");
    errorIcon.setAttribute("aria-hidden", "true");
    errorIcon.appendChild(createIcon("alert-triangle", 18));

    const errorText = el("p", "workbench-error__text");

    errorBanner.append(errorIcon, errorText);
    main.appendChild(errorBanner);

    // --- Story details panel ---
    const storyPanel = el("details", "workbench-panel");
    storyPanel.open = true;
    const storySummary = el("summary", "workbench-panel__summary");
    const storyTitle = el("span", "workbench-panel__title");
    storyTitle.textContent = t("workbenchStoryDetails");
    const storyChevron = el("span", "workbench-panel__chevron");
    storyChevron.appendChild(createIcon("chevron-down", 16));
    storySummary.append(storyTitle, storyChevron);
    const storyBody = el("div", "workbench-panel__body");
    const storyFields = el("div", "story-fields");
    storyBody.appendChild(storyFields);

    const titleField = makeTextField(t("workbenchFieldTitle"), "story-title");
    const authorField = makeTextField(t("workbenchFieldAuthor"), "story-author");

    // The story's address.
    //
    // The workbench is normally opened on a page, and the address is already
    // known. But it can also be opened on its own, and then it has nothing to
    // work with. The field is what makes that case usable: paste the address
    // of a chapter list, and the workbench reads it.
    const urlField = makeTextField(t("workbenchFieldUrl"), "story-url");
    const urlRow = el("div", "story-field__row");
    const urlLoadButton = document.createElement("k-button") as KButton;
    urlLoadButton.setAttribute("variant", "secondary");
    urlLoadButton.setAttribute("size", "sm");
    urlLoadButton.textContent = t("workbenchLoadStory");
    urlRow.append(urlField.wrapper, urlLoadButton);
    const urlHint = el("p", "story-field__hint");
    urlHint.textContent = t("workbenchFieldUrlHint");
    const urlGroup = el("div", "story-field__group");
    urlGroup.append(urlRow, urlHint);

    const languageField = document.createElement("select");
    languageField.id = "story-language";
    languageField.className = "story-field__input";
    for (const language of LANGUAGES) {
        const option = document.createElement("option");
        option.value = language.code;
        option.textContent = language.name;
        languageField.appendChild(option);
    }
    const languageGroup = makeField(t("workbenchFieldLanguage"), languageField);

    const filenameField = makeTextField(t("workbenchFieldFilename"), "story-filename");
    const filenameGroup = el("div", "story-field__group");
    const filenameRow = el("div", "story-field__row");
    const resetFilename = document.createElement("button");
    resetFilename.type = "button";
    resetFilename.className = "story-field__reset";
    resetFilename.setAttribute("aria-label", t("workbenchResetFilename"));
    resetFilename.title = t("workbenchResetFilename");
    resetFilename.appendChild(createIcon("refresh", 14));
    filenameRow.append(filenameField.wrapper, resetFilename);
    filenameGroup.appendChild(filenameRow);

    storyFields.append(
        urlGroup,
        titleField.wrapper,
        authorField.wrapper,
        languageGroup,
        filenameGroup,
    );
    storyPanel.append(storySummary, storyBody);
    sidebar.appendChild(storyPanel);

    // --- Cover panel ---
    const coverPanel = el("details", "workbench-panel");
    const coverSummary = el("summary", "workbench-panel__summary");
    const coverHeading = el("span", "workbench-panel__title");
    coverHeading.textContent = t("workbenchCover");
    const coverBadge = el("span", "workbench-panel__badge");
    const coverChevron = el("span", "workbench-panel__chevron");
    coverChevron.appendChild(createIcon("chevron-down", 16));
    coverSummary.append(coverHeading, coverBadge, coverChevron);

    const coverBody = el("div", "workbench-panel__body");
    const coverRow = el("div", "cover-row");
    const coverPreview = el("div", "cover-preview");
    coverPreview.setAttribute("aria-hidden", "true");
    const coverSide = el("div", "cover-side");
    const coverUrlField = makeTextField(t("workbenchCoverUrl"), "cover-url");
    const coverActions = el("div", "cover-actions");
    const chooseCover = document.createElement("k-button") as KButton;
    chooseCover.setAttribute("variant", "secondary");
    chooseCover.setAttribute("size", "sm");
    chooseCover.textContent = t("workbenchChooseFromPage");
    const removeCover = document.createElement("k-button") as KButton;
    removeCover.setAttribute("variant", "ghost");
    removeCover.setAttribute("size", "sm");
    removeCover.textContent = t("workbenchRemoveCover");
    removeCover.hidden = true;
    coverActions.append(chooseCover, removeCover);
    coverSide.append(coverUrlField.wrapper, coverActions);
    coverRow.append(coverPreview, coverSide);
    coverBody.appendChild(coverRow);
    coverPanel.append(coverSummary, coverBody);
    sidebar.appendChild(coverPanel);

    // --- Options panel ---
    const optionsPanel = el("details", "workbench-panel");
    const optionsSummary = el("summary", "workbench-panel__summary");
    const optionsHeading = el("span", "workbench-panel__title");
    optionsHeading.textContent = t("workbenchOptions");
    const optionsChevron = el("span", "workbench-panel__chevron");
    optionsChevron.appendChild(createIcon("chevron-down", 16));
    optionsSummary.append(optionsHeading, optionsChevron);
    const optionsBody = el("div", "workbench-panel__body");
    const optionRows = el("div", "option-rows");

    const authorNotesSwitch = document.createElement("k-switch") as KSwitch;
    const authorNotesRow = el("div", "option-row");
    const authorNotesLabel = el("div", "option-row__label");
    authorNotesLabel.textContent = t("workbenchIncludeAuthorNotes");
    // The label is drawn outside the switch, so the switch needs the name
    // separately: without it the control reaches a screen reader unnamed.
    authorNotesSwitch.setAttribute("aria-label", t("workbenchIncludeAuthorNotes"));
    authorNotesRow.append(authorNotesLabel, authorNotesSwitch);

    const tocPageSwitch = document.createElement("k-switch") as KSwitch;
    const tocPageRow = el("div", "option-row");
    const tocPageLabel = el("div", "option-row__label");
    tocPageLabel.textContent = t("workbenchIncludeTocPage");
    tocPageSwitch.setAttribute("aria-label", t("workbenchIncludeTocPage"));
    tocPageRow.append(tocPageLabel, tocPageSwitch);

    const moreOptions = document.createElement("button");
    moreOptions.type = "button";
    moreOptions.className = "workbench-link";
    moreOptions.textContent = t("workbenchMoreOptions");
    moreOptions.appendChild(createIcon("arrow-right", 14));

    optionRows.append(authorNotesRow, tocPageRow, moreOptions);
    optionsBody.appendChild(optionRows);
    optionsPanel.append(optionsSummary, optionsBody);
    sidebar.appendChild(optionsPanel);

    // --- The site-selector banner ---
    //
    // The banner is the extension's way of saying "I am guessing here". It is
    // deliberately a banner and not an error: the workbench still works, it is
    // just guessing, and the user can make it stop guessing in one click.
    const selectorBanner = el("div", "selector-banner");
    selectorBanner.hidden = true;
    selectorBanner.setAttribute("role", "status");

    const selectorBannerIcon = el("div", "selector-banner__icon");
    selectorBannerIcon.setAttribute("aria-hidden", "true");
    selectorBannerIcon.appendChild(createIcon("sparkle", 18));

    const selectorBannerBody = el("div", "selector-banner__body");
    const selectorBannerTitle = el("p", "selector-banner__title");
    selectorBannerTitle.textContent = t("siteSelectorBannerTitle");
    const selectorBannerText = el("p", "selector-banner__text");
    selectorBannerText.textContent = t("siteSelectorBannerText");
    selectorBannerBody.append(selectorBannerTitle, selectorBannerText);

    const selectorBannerButton = document.createElement("k-button") as KButton;
    selectorBannerButton.setAttribute("variant", "secondary");
    selectorBannerButton.setAttribute("size", "sm");
    selectorBannerButton.textContent = t("siteSelectorOpen");

    selectorBanner.append(selectorBannerIcon, selectorBannerBody, selectorBannerButton);
    main.appendChild(selectorBanner);

    // --- Chapters panel ---
    const chaptersPanel = el("section", "chapters-panel");
    const chaptersHeader = el("header", "chapters-header");

    const selectAllLabel = document.createElement("label");
    selectAllLabel.className = "chapters-header__select";
    const selectAll = document.createElement("input");
    selectAll.type = "checkbox";
    selectAll.id = "select-all-chapters";
    selectAll.setAttribute("aria-label", t("workbenchSelectAll"));
    selectAllLabel.appendChild(selectAll);

    const chaptersHeading = el("h2", "chapters-header__title");
    chaptersHeading.textContent = t("workbenchChapters");
    const chapterCount = el("span", "chapters-header__count");
    const headerSpacer = el("div", "chapters-header__spacer");

    chaptersHeader.append(selectAllLabel, chaptersHeading, chapterCount, headerSpacer);

    const list = document.createElement("k-list") as KList;
    list.className = "chapters-list";
    list.setAttribute("row-height", "32");
    list.setAttribute("aria-label", t("workbenchChapters"));

    const loadingState = el("div", "workbench-state");
    loadingState.hidden = true;
    const loadingSkeleton = document.createElement("k-skeleton");
    loadingSkeleton.setAttribute("rows", "8");
    loadingState.appendChild(loadingSkeleton);

    const emptyState = el("div", "workbench-state");
    const emptyIcon = el("div", "workbench-state__icon");
    emptyIcon.appendChild(createIcon("book", 24));
    const emptyTitle = el("p", "workbench-state__title");
    emptyTitle.textContent = t("workbenchNoStoryHere");
    const emptyBody = el("p", "workbench-state__body");
    emptyBody.textContent = t("workbenchTryAnyway");
    const emptyAction = document.createElement("k-button");
    emptyAction.setAttribute("variant", "secondary");
    emptyAction.setAttribute("size", "md");
    emptyAction.textContent = t("workbenchTryAnyway");
    emptyState.append(emptyIcon, emptyTitle, emptyBody, emptyAction);

    const chaptersBody = el("div", "chapters-body");
    chaptersBody.append(loadingState, emptyState, list);

    const toolbar = el("div", "chapters-toolbar");
    const allButton = makeToolbarButton(t("workbenchSelectAll")) as KButton;
    const noneButton = makeToolbarButton(t("workbenchSelectNone")) as KButton;
    const invertButton = makeToolbarButton(t("workbenchInvert")) as KButton;
    const toolbarSpacer = el("div", "chapters-toolbar__spacer");
    const rangesButton = makeToolbarButton(t("workbenchRanges")) as KButton;
    const filterButton = document.createElement("k-button") as KButton;
    filterButton.setAttribute("variant", "secondary");
    filterButton.setAttribute("size", "sm");
    filterButton.setAttribute("icon", "filter");
    filterButton.textContent = t("workbenchFilter");
    toolbar.append(allButton, noneButton, invertButton, toolbarSpacer, rangesButton, filterButton);

    chaptersPanel.append(chaptersHeader, chaptersBody, toolbar);
    main.appendChild(chaptersPanel);

    // --- Status bar ---
    const statusBar = el("footer", "status-bar");
    statusBar.hidden = true;
    const statusIcon = el("div", "status-bar__icon");
    const statusBody = el("div", "status-bar__body");
    const statusLabel = el("span", "status-bar__label");
    const statusCount = el("span", "status-bar__count");
    const statusTrack = el("div", "status-bar__track");
    const statusFill = el("div", "status-bar__fill");
    statusTrack.appendChild(statusFill);
    const statusPercent = el("span", "status-bar__percent");
    statusBody.append(statusLabel, statusCount, statusTrack, statusPercent);
    const statusActions = el("div", "status-bar__actions");
    statusBar.append(statusIcon, statusBody, statusActions);
    shell.appendChild(statusBar);

    // --- Filter dialog ---
    //
    // The filter narrows the chapter list without changing the selection, so
    // it has its own Apply and Clear buttons rather than acting on every
    // keystroke: typing a query should not silently change what is selected.
    const filterDialog = document.createElement("k-dialog");
    filterDialog.setAttribute("heading", t("workbenchFilter"));
    filterDialog.setAttribute("size", "md");

    const filterBody = el("div", "filter-body");

    // The wrapper is kept, not just the input: the wrapper holds the label,
    // and a field without one has no name for a screen reader to read.
    const filterSearchField = makeTextField(t("filterSearch"), "filter-search");
    const filterSearch = filterSearchField.input;

    const filterRegex = document.createElement("k-switch");
    filterRegex.setAttribute("label", t("filterUseRegex"));

    const filterIncludeField = makeTextField(t("filterInclude"), "filter-include");
    const filterInclude = filterIncludeField.input;
    const filterExcludeField = makeTextField(t("filterExclude"), "filter-exclude");
    const filterExclude = filterExcludeField.input;

    const filterError = el("p", "filter-error");
    filterError.setAttribute("role", "alert");
    filterError.hidden = true;

    const filterCount = el("p", "filter-count");

    filterBody.append(
        filterSearchField.wrapper,
        filterRegex,
        filterIncludeField.wrapper,
        filterExcludeField.wrapper,
        filterError,
        filterCount,
    );
    filterDialog.appendChild(filterBody);

    const filterFooter = document.createElement("div");
    filterFooter.setAttribute("slot", "footer");
    filterFooter.className = "filter-footer";

    const filterClear = document.createElement("k-button");
    filterClear.setAttribute("variant", "ghost");
    filterClear.setAttribute("size", "md");
    filterClear.textContent = t("filterClear");

    const filterApply = document.createElement("k-button");
    filterApply.setAttribute("variant", "primary");
    filterApply.setAttribute("size", "md");
    filterApply.textContent = t("filterApply");

    filterFooter.append(filterClear, filterApply);
    filterDialog.appendChild(filterFooter);

    root.appendChild(filterDialog);

    // --- The site-selector dialog ---
    //
    // The dialog edits the selectors for one host name. It offers three ways
    // to fill them in — a guess from the scanner, a manual entry, and a test
    // against the live page — because the user may know the answer, may not,
    // and may want to know before committing either way.
    const selectorDialog = document.createElement("k-dialog");
    selectorDialog.setAttribute("heading", t("siteSelectorDialogTitle"));
    selectorDialog.setAttribute("size", "md");

    const selectorBody = el("div", "selector-body");

    const selectorIntro = el("p", "selector-intro");
    selectorIntro.textContent = t("siteSelectorIntro");

    const contentField = makeSelectorField(
        t("siteSelectorContent"),
        t("siteSelectorContentHint"),
        "selector-content",
    );
    const selectorTitleField = makeSelectorField(
        t("siteSelectorTitle"),
        t("siteSelectorTitleHint"),
        "selector-title",
    );
    const removeField = makeSelectorField(
        t("siteSelectorRemove"),
        t("siteSelectorRemoveHint"),
        "selector-remove",
    );

    const selectorStatus = el("p", "selector-status");
    selectorStatus.setAttribute("role", "status");
    selectorStatus.setAttribute("aria-live", "polite");
    selectorStatus.hidden = true;

    selectorBody.append(
        selectorIntro,
        contentField.wrapper,
        selectorTitleField.wrapper,
        removeField.wrapper,
        selectorStatus,
    );
    selectorDialog.appendChild(selectorBody);

    const selectorFooter = document.createElement("div");
    selectorFooter.setAttribute("slot", "footer");
    selectorFooter.className = "selector-footer";

    const selectorForget = document.createElement("k-button") as KButton;
    selectorForget.setAttribute("variant", "ghost");
    selectorForget.setAttribute("size", "md");
    selectorForget.textContent = t("siteSelectorForget");

    const selectorSuggest = document.createElement("k-button") as KButton;
    selectorSuggest.setAttribute("variant", "ghost");
    selectorSuggest.setAttribute("size", "md");
    selectorSuggest.textContent = t("siteSelectorSuggest");

    const selectorTest = document.createElement("k-button") as KButton;
    selectorTest.setAttribute("variant", "secondary");
    selectorTest.setAttribute("size", "md");
    selectorTest.textContent = t("siteSelectorTest");

    const selectorSave = document.createElement("k-button") as KButton;
    selectorSave.setAttribute("variant", "primary");
    selectorSave.setAttribute("size", "md");
    selectorSave.textContent = t("siteSelectorSave");

    selectorFooter.append(selectorForget, selectorSuggest, selectorTest, selectorSave);
    selectorDialog.appendChild(selectorFooter);

    root.appendChild(selectorDialog);

    // --- The range dialog ---
    //
    // The baseline taught range selection with a native `alert()` after five
    // mis-clicks, and offered the range as two dropdowns of every chapter.
    // This is the keyboard-reachable equivalent: two numbers and two
    // buttons, with the count of the range shown as it is typed.
    const rangeDialog = document.createElement("k-dialog");
    rangeDialog.setAttribute("heading", t("workbenchRangeTitle"));
    rangeDialog.setAttribute("size", "md");

    // The range body reuses the filter body's styles: both are a short form
    // in a dialog, and a second copy of the same rules would only drift.
    const rangeBody = el("div", "filter-body");

    const rangeFromField = makeTextField(t("workbenchRangeFrom"), "range-from");
    rangeFromField.input.type = "number";
    rangeFromField.input.min = "1";
    rangeFromField.input.inputMode = "numeric";

    const rangeToField = makeTextField(t("workbenchRangeTo"), "range-to");
    rangeToField.input.type = "number";
    rangeToField.input.min = "1";
    rangeToField.input.inputMode = "numeric";

    const rangeError = el("p", "filter-error");
    rangeError.setAttribute("role", "alert");
    rangeError.hidden = true;

    const rangeCount = el("p", "filter-count");
    rangeCount.setAttribute("aria-live", "polite");

    rangeBody.append(rangeFromField.wrapper, rangeToField.wrapper, rangeCount, rangeError);
    rangeDialog.appendChild(rangeBody);

    const rangeFooter = document.createElement("div");
    rangeFooter.setAttribute("slot", "footer");
    rangeFooter.className = "filter-footer";

    const rangeDeselect = document.createElement("k-button") as KButton;
    rangeDeselect.setAttribute("variant", "ghost");
    rangeDeselect.setAttribute("size", "md");
    rangeDeselect.textContent = t("workbenchRangeDeselect");

    const rangeSelect = document.createElement("k-button") as KButton;
    rangeSelect.setAttribute("variant", "primary");
    rangeSelect.setAttribute("size", "md");
    rangeSelect.textContent = t("workbenchRangeSelect");

    rangeFooter.append(rangeDeselect, rangeSelect);
    rangeDialog.appendChild(rangeFooter);

    root.appendChild(rangeDialog);

    // --- The toast host ---
    const toastHost = el("div", "workbench-toasts");

    root.appendChild(toastHost);

    return {
        title,
        author,
        urlField: urlField.input,
        urlLoadButton,
        titleField: titleField.input,
        authorField: authorField.input,
        languageField,
        filenameField: filenameField.input,
        resetFilename,
        coverPreview,
        coverUrlField: coverUrlField.input,
        removeCover,
        chooseCover,
        authorNotesSwitch,
        tocPageSwitch,
        saveButton,
        packButton,
        selectAll,
        selectAllButton: allButton,
        selectNoneButton: noneButton,
        invertButton: invertButton,
        rangesButton: rangesButton,
        rangeDialog,
        rangeFrom: rangeFromField.input,
        rangeTo: rangeToField.input,
        rangeError,
        rangeCount,
        rangeSelect,
        rangeDeselect,
        filterButton,
        chapterCount,
        list,
        emptyState,
        loadingState,
        statusBar,
        statusLabel,
        statusCount,
        statusTrack,
        statusFill,
        statusPercent,
        statusIcon,
        statusActions,
        filterDialog,
        filterSearch,
        filterRegex,
        filterInclude,
        filterExclude,
        filterCount,
        filterError,
        filterClear,
        filterApply,
        selectorBanner,
        selectorBannerButton,
        accessBanner,
        accessBannerHost,
        accessGrantButton,
        errorBanner,
        errorText,
        selectorDialog,
        selectorContent: contentField.input,
        selectorTitle: selectorTitleField.input,
        selectorRemove: removeField.input,
        selectorSuggest,
        selectorTest,
        selectorSave,
        selectorForget,
        selectorStatus,
        toastHost,
    };
}

/**
 * Update the view from the state.
 *
 * Only the parts that can have changed are touched, so a chapter fetch does
 * not rebuild the sidebar.
 */
export function renderWorkbench(
    elements: WorkbenchElements,
    state: WorkbenchState,
    visibleChapters: number[],
    selectedCount: number,
): void {
    // --- App bar ---
    if (state.story.title) {
        elements.title.textContent = state.story.title;
        elements.title.removeAttribute("data-placeholder");
    } else {
        elements.title.textContent = t("appName");
    }
    elements.author.textContent = state.story.author;

    // --- Story fields ---
    setInputValue(elements.titleField, state.story.title);
    setInputValue(elements.authorField, state.story.author);
    setInputValue(elements.filenameField, state.story.fileName);

    const languageOptions = Array.from(elements.languageField.options);
    const hasLanguage = languageOptions.some((option) => option.value === state.story.language);
    if (!hasLanguage && state.story.language) {
        const option = document.createElement("option");
        option.value = state.story.language;
        option.textContent = state.story.language;
        elements.languageField.appendChild(option);
    }
    elements.languageField.value = state.story.language;

    // --- Cover ---
    renderCover(elements, state.story.coverUrl);

    // --- The site-access banner ---
    //
    // The banner is shown only while the extension is waiting to be allowed to
    // read the site. It carries the host name, so the user can see that the
    // request is about the site they are on and nothing else.
    elements.accessBanner.hidden = !state.accessOrigin;
    elements.accessBannerHost.textContent = state.accessOrigin
        ? displayOrigin(state.accessOrigin)
        : "";

    // --- The site-selector banner ---
    //
    // The banner is only shown while the fallback parser is in charge. Once the
    // user has saved selectors for the site, the extension stops guessing
    // there, and the banner has nothing left to say.
    elements.selectorBanner.hidden = !state.usedDefaultParser;

    // --- The error banner ---
    elements.errorBanner.hidden = !state.error;
    elements.errorText.textContent = state.error ?? "";

    // --- Buttons ---
    elements.saveButton.hidden = !state.dirty;
    const packable = selectedCount > 0 && !state.loadingChapters;
    elements.packButton.toggleAttribute("disabled", !packable);
    elements.packButton.setAttribute(
        "title",
        state.loadingChapters
            ? t("workbenchWaitingForChapters")
            : selectedCount > 0
              ? ""
              : t("workbenchNoChaptersSelected"),
    );

    // --- Chapters ---
    const total = state.chapters.length;
    elements.chapterCount.textContent = t("workbenchChapterCount", [
        String(visibleChapters.length),
        String(total),
    ]);

    const selected = state.chapters.filter((chapter) => chapter.selected).length;
    elements.selectAll.checked = total > 0 && selected === total;
    elements.selectAll.indeterminate = selected > 0 && selected < total;
    elements.selectAll.disabled = total === 0;

    elements.loadingState.hidden = !state.loadingChapters;
    elements.emptyState.hidden = state.loadingChapters || total > 0;
    elements.list.hidden = state.loadingChapters || total === 0;

    if (!state.loadingChapters && total > 0) {
        const items = visibleChapters.map((index) => {
            const chapter = state.chapters[index] as Chapter;
            return {
                id: String(index),
                title: chapter.title,
                selected: chapter.selected,
                icon: STATE_ICONS[chapter.state],
                meta: chapter.size !== undefined ? formatSize(chapter.size) : "",
                accessibleName: `${chapter.title}, ${stateLabel(chapter.state)}`,
            };
        });
        const list = elements.list as unknown as { setItems(items: unknown[]): void };
        list.setItems(items);
    }

    // --- Status bar ---
    renderStatus(elements, state);
}

/** Render the cover preview. */
function renderCover(elements: WorkbenchElements, coverUrl: string): void {
    elements.coverPreview.replaceChildren();
    elements.removeCover.hidden = !coverUrl;

    if (!coverUrl) {
        elements.coverPreview.appendChild(createIcon("image", 24));
        return;
    }

    const image = document.createElement("img");
    image.src = coverUrl;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
        // A broken cover shows the placeholder, never a broken-image glyph.
        elements.coverPreview.replaceChildren(createIcon("image", 24));
    });
    elements.coverPreview.appendChild(image);
}

/** Render the status bar. */
function renderStatus(elements: WorkbenchElements, state: WorkbenchState): void {
    const progress = state.progress;

    if (!progress) {
        elements.statusBar.hidden = true;
        elements.statusActions.replaceChildren();
        return;
    }

    elements.statusBar.hidden = false;
    elements.statusBar.dataset.variant = progress.succeeded ? "success" : "running";
    elements.statusLabel.textContent = progress.message;
    elements.statusCount.textContent = `${progress.done} / ${progress.total}`;
    elements.statusPercent.textContent = `${Math.round(progress.percent)}%`;

    // Only `transform` is animated, so the bar never triggers a layout pass.
    elements.statusFill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress.percent / 100))})`;

    elements.statusIcon.replaceChildren(
        createIcon(progress.succeeded ? "check-circle" : "spinner", 16),
    );
    const spinner = elements.statusIcon.querySelector("svg");
    if (!progress.succeeded) spinner?.setAttribute("data-spin", "true");

    // The Cancel button only exists while a job is running.
    elements.statusActions.replaceChildren();
    if (!progress.succeeded && progress.phase !== "failed" && progress.phase !== "cancelled") {
        const cancel = document.createElement("k-button") as KButton;
        cancel.setAttribute("variant", "ghost");
        cancel.setAttribute("size", "sm");
        cancel.textContent = t("workbenchCancel");
        elements.statusActions.appendChild(cancel);
    }
}

/**
 * Derive the file name from the title and the user's template.
 *
 * @param title The book's title.
 * @param author The book's author.
 * @param template The user's filename template.
 * @returns The file name, extension included.
 */
export function deriveFilename(
    title: string,
    author = "",
    template = DEFAULT_FILENAME_TEMPLATE,
): string {
    return buildFileName(template, { title, author });
}

/** Format a byte count for the size column. */
export function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Set an input's value only when it differs, so the caret does not jump. */
function setInputValue(input: HTMLInputElement, value: string): void {
    if (input.value !== value) input.value = value;
}

/** Create an element with a class. */
function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    element.className = className;
    return element;
}

/** A labelled text field. */
function makeTextField(
    labelText: string,
    id: string,
): { wrapper: HTMLElement; input: HTMLInputElement } {
    const wrapper = el("div", "story-field");
    const label = el("label", "story-field__label");
    label.htmlFor = id;
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.className = "story-field__input";
    wrapper.append(label, input);
    return { wrapper, input };
}

/** A labelled select. */
function makeField(labelText: string, control: HTMLElement): HTMLElement {
    const wrapper = el("div", "story-field");
    const label = el("label", "story-field__label");
    label.htmlFor = control.id;
    label.textContent = labelText;
    wrapper.append(label, control);
    return wrapper;
}

/** A small toolbar button. */
function makeToolbarButton(label: string): HTMLElement {
    const button = document.createElement("k-button");
    button.setAttribute("variant", "ghost");
    button.setAttribute("size", "sm");
    button.textContent = label;
    return button;
}

/**
 * A labelled text field with a hint.
 *
 * The hint is a real paragraph rather than a `title` attribute: a tooltip is
 * invisible to a keyboard user and to a screen reader until the pointer
 * happens to be over it.
 */
function makeSelectorField(
    labelText: string,
    hintText: string,
    id: string,
): { wrapper: HTMLElement; input: HTMLInputElement } {
    const wrapper = el("div", "selector-field");

    const label = el("label", "selector-field__label");
    label.htmlFor = id;
    label.textContent = labelText;

    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.className = "selector-field__input";
    input.spellcheck = false;
    input.autocomplete = "off";

    const hint = el("p", "selector-field__hint");
    hint.id = `${id}-hint`;
    input.setAttribute("aria-describedby", hint.id);
    hint.textContent = hintText;

    wrapper.append(label, input, hint);
    return { wrapper, input };
}
