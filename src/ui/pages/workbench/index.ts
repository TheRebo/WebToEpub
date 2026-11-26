/**
 * The workbench page.
 *
 * The main surface. It owns the store, the view, and the wiring between
 * them, and it talks to the background worker through the typed message bus.
 *
 * The page never fetches a chapter itself: the background worker owns every
 * network request, so a download survives the tab being closed and the
 * throttling is enforced in one place.
 *
 * See ADR-0005.
 */
import "../../components/base";
import "../../components/icons";
import "../../components/k-button";
import "../../components/k-checkbox";
import "../../components/k-dialog";
import "../../components/k-empty";
import "../../components/k-field";
import "../../components/k-list";
import "../../components/k-panel";
import "../../components/k-progress";
import "../../components/k-skeleton";
import "../../components/k-switch";
import "../../components/k-toast";

import { sendRequest, type DownloadProgress } from "../../../core/message/bus";
import { isParsableSelector } from "../../../core/util/css";
import { validateHostName } from "../../../core/storage/site-selectors-store";
import { DEFAULT_FILENAME_TEMPLATE } from "../../../core/util/file-name";
import { localStorageAdapter, activePageUrl } from "../../../core/browser-api";
import { hasHostAccess, originOf, requestHostAccess } from "../../../core/host-access";
import { normaliseStoryUrl } from "../../../core/util/url";
import { SettingsStore, type Settings } from "../../../core/storage/settings-store";
import { caughtErrorMessage, errorMessage } from "../../error-messages";
import { pollUntilDone } from "../../poll";
import { themeController } from "../../styles/theme-controller";
import { t, tDynamic } from "../../i18n";
import { installI18n } from "../../i18n-bootstrap";
import { buildWorkbench, deriveFilename, renderWorkbench, type WorkbenchElements } from "./view";
import {
    WorkbenchStore,
    compilePattern,
    finishedChapterStates,
    matchingIndices,
    parseChapterRange,
    storyOptionSwitches,
    type Chapter,
    type ChapterRange,
    type FilterState,
    type StoryMeta,
    type WorkbenchState,
} from "./state";

/** The initial state. */
function initialState(): WorkbenchState {
    return {
        story: {
            title: "",
            author: "",
            language: "en",
            coverUrl: "",
            description: "",
            sourceUrl: "",
            parserName: "",
            fileName: "untitled.epub",
            fileNameEdited: false,
        },
        chapters: [],
        loadingChapters: false,
        filter: { query: "", useRegex: false, include: [], exclude: [] },
        dirty: false,
        usedDefaultParser: false,
        accessOrigin: undefined,
        progress: undefined,
        error: undefined,
    };
}

/** The workbench controller. */
class WorkbenchController {
    #store = new WorkbenchStore(initialState());
    #elements: WorkbenchElements;
    #settings: SettingsStore = new SettingsStore(localStorageAdapter);
    #settingsValue: Settings | undefined;
    #jobId: string | undefined;
    /**
     * The workbench's indexes of the chapters the running job is fetching.
     *
     * The job counts the chapters the user *selected*, which is a subset of
     * the workbench's list. The job's index therefore has to be mapped back
     * through this list before it can be shown on the right row.
     */
    #jobChapterIndexes: number[] = [];
    #pollTimer: ReturnType<typeof setTimeout> | undefined;
    /** Stops the poll for a running download. */
    #stopPoll: (() => void) | undefined;
    #renderQueued = false;

    constructor(root: HTMLElement) {
        this.#elements = buildWorkbench(root);
        this.#store.subscribe(() => this.#scheduleRender());
        this.#wire();
    }

    /** Start the page. */
    async start(): Promise<void> {
        this.#settingsValue = await this.#settings.get();
        themeController.start();
        themeController.applySettings(this.#settingsValue.appearance);
        this.#applyStoryOptions(this.#settingsValue);
        this.#render();

        // The popup hands over the URL it was invoked on. When the workbench is
        // opened directly, there is no query string, and the most recently
        // used web page is the best guess at what the user means.
        //
        // The address is checked before it is used: the workbench is an
        // extension page, so the tab it is looking at is the workbench itself,
        // and its address says nothing about a story.
        const url = requestedUrl() ?? (await activePageUrl());
        if (!url) {
            // The workbench can be opened on its own, without a page to read.
            // Rather than showing an error, the story address field is put
            // ready for the user to paste an address into.
            this.#elements.urlField.focus();
            this.#render();
            return;
        }

        await this.#loadStory(url);
    }

    /**
     * Load a story.
     *
     * The extension has no host permissions of its own, so it has to be
     * allowed to read the site before it can read anything there. When it has
     * not been allowed, the workbench asks for that permission instead of
     * failing with a network error the user cannot act on.
     *
     * @param url The story's URL.
     */
    async #loadStory(url: string): Promise<void> {
        this.#store.setError(undefined);
        this.#elements.urlField.value = url;

        const origin = originOf(url);
        if (origin && !(await hasHostAccess(origin))) {
            this.#store.setAccessOrigin(origin);
            this.#render();
            return;
        }

        this.#store.setAccessOrigin(undefined);
        await this.#analyse(url);
        // An analysis that failed has nothing to offer, and the chapter list
        // would only add a second error on top of the first.
        if (this.#store.state.error) return;
        await this.#loadChapters(url);
    }

    /**
     * Load the story at the address in the field.
     *
     * The address is checked before anything is fetched: a mistyped or
     * non-web address would otherwise turn into a confusing network error.
     */
    async #loadFromField(): Promise<void> {
        const url = normaliseStoryUrl(this.#elements.urlField.value);
        if (!url) {
            this.#store.setError(t("workbenchUrlInvalid"));
            this.#render();
            return;
        }
        await this.#loadStory(url);
    }

    /**
     * Ask the browser for access to the site the story is on.
     *
     * The permission request has to be made from the handler of the user's
     * click, with nothing awaited before it: Firefox only shows the prompt
     * when the request follows a real gesture. The origin is therefore read
     * from the state, and the request is made on the first line, before any
     * other work happens.
     */
    async #grantAccess(): Promise<void> {
        const origin = this.#store.state.accessOrigin;
        if (!origin) return;

        const granted = await requestHostAccess(origin);
        if (!granted) {
            this.#toast(t("accessDenied"), "warning");
            return;
        }

        const url = this.#elements.urlField.value;
        this.#store.setAccessOrigin(undefined);
        this.#toast(t("accessAlreadyGranted"), "success");
        await this.#loadStory(url);
    }

    /**
     * Show the story options as the settings have them.
     *
     * The switches used to start blank whatever the user had chosen, so a
     * story that had the author notes removed — or the contents page
     * included — showed the opposite of what was actually going to happen.
     */
    #applyStoryOptions(settings: Settings): void {
        const switches = storyOptionSwitches(settings.story);
        this.#elements.authorNotesSwitch.checked = switches.includeAuthorNotes;
        this.#elements.tocPageSwitch.checked = switches.includeTocPage;
    }

    /** Analyse the page, to fill in the metadata. */
    async #analyse(url: string): Promise<void> {
        try {
            const analysis = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "page:analyze",
                { url },
            );
            if (!analysis.supported) {
                this.#store.setError(t("errorNoParser"));
                return;
            }
            this.#store.setStory({
                title: analysis.title ?? "",
                author: analysis.author ?? "",
                language: analysis.language ?? this.#settingsValue?.story.defaultLanguage ?? "en",
                coverUrl: analysis.coverUrl ?? "",
                description: analysis.description ?? "",
                sourceUrl: url,
                parserName: analysis.parserName ?? "",
                fileName: deriveFilename(
                    analysis.title ?? "",
                    analysis.author ?? "",
                    this.#settingsValue?.story.filenameTemplate ?? DEFAULT_FILENAME_TEMPLATE,
                ),
                fileNameEdited: false,
            });
            this.#store.setUsedDefaultParser(analysis.usedDefaultParser === true);
        } catch (error) {
            this.#store.setError(caughtErrorMessage(error));
        }
    }

    /**
     * The file name the title and the author's name lead to.
     *
     * The user's filename template is filled in. It is only used while the
     * user has not named the file themselves.
     */
    #derivedFileName(title: string): Partial<StoryMeta> {
        if (this.#store.state.story.fileNameEdited) return {};
        const template = this.#settingsValue?.story.filenameTemplate ?? DEFAULT_FILENAME_TEMPLATE;
        return {
            fileName: deriveFilename(title, this.#store.state.story.author, template),
        };
    }

    /** Load the chapter list. */
    async #loadChapters(url: string): Promise<void> {
        this.#store.setLoading(true);
        this.#render();
        try {
            const result = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "chapters:list",
                { url },
            );
            if (result.error) {
                this.#store.setError(errorMessage(result.error));
                this.#store.setLoading(false);
                return;
            }
            const chapters: Chapter[] = result.chapters.map((chapter) => ({
                sourceUrl: chapter.sourceUrl,
                title: chapter.title,
                // A chapter the parser marked as locked starts unchecked, so
                // the user is never surprised by a failed fetch.
                selected: chapter.isIncludeable !== false,
                isIncludeable: chapter.isIncludeable !== false,
                state: "idle",
            }));
            this.#store.setChapters(chapters);
        } catch (error) {
            this.#store.setError(caughtErrorMessage(error));
            this.#store.setLoading(false);
        }
    }

    /** Wire the events. */
    #wire(): void {
        const elements = this.#elements;

        // --- The story's address ---
        //
        // The workbench can be opened on its own, without a page to read. The
        // field is what makes that case usable: paste an address, and the
        // workbench reads it.
        elements.urlLoadButton.addEventListener("k-click", () => {
            void this.#loadFromField();
        });
        elements.urlField.addEventListener("keydown", (event) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            event.preventDefault();
            void this.#loadFromField();
        });

        // --- The site access prompt ---
        elements.accessGrantButton.addEventListener("k-click", () => {
            void this.#grantAccess();
        });

        // --- Metadata fields ---
        elements.titleField.addEventListener("input", () => {
            this.#store.setStory({
                title: elements.titleField.value,
                // The file name follows the title until the user gives the
                // book a name of its own.
                ...this.#derivedFileName(elements.titleField.value),
            });
            this.#store.markDirty(true);
        });
        elements.authorField.addEventListener("input", () => {
            this.#store.setStory({ author: elements.authorField.value });
            this.#store.markDirty(true);
        });
        elements.languageField.addEventListener("change", () => {
            this.#store.setStory({ language: elements.languageField.value });
            this.#store.markDirty(true);
        });
        elements.filenameField.addEventListener("input", () => {
            // What the user typed is what the book is saved as. It used to be
            // thrown away: the field was overwritten on the next render, and
            // the name never reached the download.
            this.#store.setStory({
                fileName: elements.filenameField.value,
                fileNameEdited: true,
            });
            this.#store.markDirty(true);
        });
        elements.resetFilename.addEventListener("click", () => {
            this.#store.setStory({
                ...this.#derivedFileName(this.#store.state.story.title),
                fileNameEdited: false,
            });
            this.#store.markDirty(true);
        });

        // --- Cover ---
        elements.coverUrlField.addEventListener("input", () => {
            this.#store.setStory({ coverUrl: elements.coverUrlField.value });
            this.#store.markDirty(true);
        });
        elements.removeCover.addEventListener("click", () => {
            elements.coverUrlField.value = "";
            this.#store.setStory({ coverUrl: "" });
            this.#store.markDirty(true);
        });

        // --- Options ---
        elements.authorNotesSwitch.addEventListener("k-change", (event) => {
            const detail = (event as CustomEvent<{ checked: boolean }>).detail;
            void this.#saveStoryOption("removeAuthorNotes", !detail.checked);
        });
        elements.tocPageSwitch.addEventListener("k-change", (event) => {
            const detail = (event as CustomEvent<{ checked: boolean }>).detail;
            void this.#saveStoryOption("includeTocPage", detail.checked);
        });

        // --- Save ---
        elements.saveButton.addEventListener("k-click", () => {
            void this.#save();
        });

        // --- Pack ---
        elements.packButton.addEventListener("k-click", () => {
            void this.#pack();
        });

        // --- Chapter list ---
        elements.selectAll.addEventListener("change", () => {
            this.#store.setAllSelected(elements.selectAll.checked);
        });

        const list = elements.list;
        list.addEventListener("k-select", (event) => {
            const detail = (event as CustomEvent<{ id: string }>).detail;
            this.#store.toggleChapter(Number(detail.id));
        });

        // --- Toolbar ---
        elements.selectAllButton.addEventListener("k-click", () =>
            this.#store.setAllSelected(true),
        );
        elements.selectNoneButton.addEventListener("k-click", () =>
            this.#store.setAllSelected(false),
        );
        elements.invertButton.addEventListener("k-click", () => this.#store.invertSelection());
        elements.rangesButton.addEventListener("k-click", () => {
            this.#openRangeDialog();
        });
        elements.filterButton.addEventListener("k-click", () => {
            this.#openFilter();
        });

        // --- The filter dialog ---
        //
        // The dialog edits a *draft* filter. The live chapter list only changes
        // when the user applies it, so a half-typed query never makes the
        // selection jump around underneath them.
        elements.filterRegex.addEventListener("k-change", () => {
            this.#previewFilter();
        });
        for (const input of [
            elements.filterSearch,
            elements.filterInclude,
            elements.filterExclude,
        ]) {
            input.addEventListener("input", () => this.#previewFilter());
        }
        elements.filterClear.addEventListener("k-click", () => {
            this.#clearFilter();
        });
        elements.filterApply.addEventListener("k-click", () => {
            this.#applyFilter();
        });
        elements.filterDialog.addEventListener("k-close", () => {
            this.#resetFilterDraft();
        });

        // --- The range dialog ---
        elements.rangeSelect.addEventListener("k-click", () => {
            this.#applyRange(true);
        });
        elements.rangeDeselect.addEventListener("k-click", () => {
            this.#applyRange(false);
        });
        for (const input of [elements.rangeFrom, elements.rangeTo]) {
            input.addEventListener("input", () => {
                this.#previewRange();
            });
        }

        // --- The site-selector dialog ---
        elements.selectorBannerButton.addEventListener("k-click", () => {
            void this.#openSelectorDialog();
        });
        elements.selectorSuggest.addEventListener("k-click", () => {
            void this.#suggestSelectors();
        });
        elements.selectorTest.addEventListener("k-click", () => {
            void this.#testSelectors();
        });
        elements.selectorSave.addEventListener("k-click", () => {
            void this.#saveSelectors();
        });
        elements.selectorForget.addEventListener("k-click", () => {
            void this.#forgetSelectors();
        });

        // The Cancel button lives in the status bar and is rebuilt each time
        // the bar is rendered, so it never carries stale state.
        elements.statusActions.addEventListener("k-click", (event) => {
            if ((event.target as HTMLElement)?.closest?.("k-button")) {
                void this.#cancel();
            }
        });
    }

    /**
     * Open the filter dialog.
     *
     * The draft is seeded from the filter that is currently in effect, so the
     * dialog always opens showing what is actually applied.
     */
    #openFilter(): void {
        const elements = this.#elements;
        const filter = this.#store.state.filter;

        elements.filterSearch.value = filter.query;
        elements.filterInclude.value = filter.include.join(", ");
        elements.filterExclude.value = filter.exclude.join(", ");
        elements.filterRegex.toggleAttribute("checked", filter.useRegex);

        this.#previewFilter();

        const dialog = elements.filterDialog as unknown as { open(): void };
        dialog.open();
    }

    /**
     * Preview the draft filter.
     *
     * Shows how many chapters would match, and reports an invalid regular
     * expression inline instead of letting it throw.
     */
    #previewFilter(): void {
        const elements = this.#elements;
        const draft = this.#filterDraft();

        const pattern = draft.useRegex ? compilePattern(draft.query) : null;
        if (draft.useRegex && draft.query.trim() && !pattern) {
            elements.filterError.hidden = false;
            elements.filterError.textContent = t("filterInvalidPattern");
            elements.filterCount.textContent = "";
            return;
        }

        elements.filterError.hidden = true;

        const matches = matchingIndices(this.#store.state.chapters, draft).length;
        elements.filterCount.textContent = t("filterMatchCount", [String(matches)]);
    }

    /** The filter the dialog is currently editing. */
    #filterDraft(): FilterState {
        const elements = this.#elements;
        const split = (value: string): string[] =>
            value
                .split(",")
                .map((term) => term.trim())
                .filter(Boolean);

        return {
            query: elements.filterSearch.value,
            useRegex: elements.filterRegex.hasAttribute("checked"),
            include: split(elements.filterInclude.value),
            exclude: split(elements.filterExclude.value),
        };
    }

    /** Apply the draft filter. */
    #applyFilter(): void {
        this.#store.setFilter(this.#filterDraft());
        (this.#elements.filterDialog as unknown as { close(): void }).close();
    }

    /** Clear the filter, both in the draft and in effect. */
    #clearFilter(): void {
        const empty: FilterState = { query: "", useRegex: false, include: [], exclude: [] };
        this.#store.setFilter(empty);

        const elements = this.#elements;
        elements.filterSearch.value = "";
        elements.filterInclude.value = "";
        elements.filterExclude.value = "";
        elements.filterRegex.toggleAttribute("checked", false);
        this.#previewFilter();
    }

    /**
     * Open the range dialog.
     *
     * The fields are seeded with the whole chapter list, so the dialog opens
     * on something sensible and the user only has to change what they mean
     * to change.
     */
    #openRangeDialog(): void {
        const elements = this.#elements;
        const total = this.#store.state.chapters.length;
        if (total === 0) return;

        elements.rangeFrom.value = "1";
        elements.rangeTo.value = String(total);
        this.#previewRange();
        (elements.rangeDialog as unknown as { open(): void }).open();
    }

    /**
     * The range the dialog is editing, as the chapter numbers the user typed.
     *
     * The numbers are one-based, because that is how the chapters are
     * numbered in the list. `null` means the range is not usable.
     */
    #range(): ChapterRange | null {
        const elements = this.#elements;
        return parseChapterRange(
            elements.rangeFrom.value,
            elements.rangeTo.value,
            this.#store.state.chapters.length,
        );
    }

    /** Check the range the user typed, and say what it covers. */
    #previewRange(): void {
        const elements = this.#elements;
        const total = this.#store.state.chapters.length;
        const range = this.#range();
        if (!range) {
            elements.rangeError.hidden = false;
            elements.rangeError.textContent = t("workbenchRangeInvalid", [String(total)]);
            elements.rangeCount.textContent = "";
            return;
        }
        elements.rangeError.hidden = true;
        elements.rangeError.textContent = "";
        elements.rangeCount.textContent = t("workbenchRangeCount", [
            String(range.to - range.from + 1),
        ]);
    }

    /** Apply the range to the selection. */
    #applyRange(selected: boolean): void {
        const range = this.#range();
        if (!range) {
            this.#previewRange();
            return;
        }
        // The store counts the chapters from zero; the dialog counts them
        // from one.
        this.#store.setRange(range.from - 1, range.to - 1, selected);
        (this.#elements.rangeDialog as unknown as { close(): void }).close();
    }

    /** Reset the draft, so the next open starts from the applied filter. */
    #resetFilterDraft(): void {
        const filter = this.#store.state.filter;
        const elements = this.#elements;
        elements.filterSearch.value = filter.query;
        elements.filterInclude.value = filter.include.join(", ");
        elements.filterExclude.value = filter.exclude.join(", ");
        elements.filterRegex.toggleAttribute("checked", filter.useRegex);
    }
    // --- The site selectors ---
    //
    // The flow is deliberately forgiving. The user can accept the scanner's
    // guess, write the selectors by hand, or test what they have before
    // committing it. Nothing is saved until the user says so, and the banner
    // stays visible for as long as the extension is still guessing.

    /** The host name the selectors belong to. */
    #selectorHost(): string {
        const source = this.#store.state.story.sourceUrl;
        try {
            // The workbench and the worker have to agree on the key the
            // selectors are filed under, so the name is normalised by the
            // store's own rule rather than by a second, local one.
            return validateHostName(new URL(source).hostname) ?? "";
        } catch {
            return "";
        }
    }

    /** Open the site-selector dialog, seeded with what is already saved. */
    async #openSelectorDialog(): Promise<void> {
        const elements = this.#elements;
        elements.selectorContent.value = "";
        elements.selectorTitle.value = "";
        elements.selectorRemove.value = "";
        this.#setSelectorStatus("");

        const host = this.#selectorHost();
        if (host) {
            try {
                const { entries } = await sendRequest(
                    { sendMessage: (message) => sendMessageToWorker(message) },
                    "site-selectors:list",
                    {},
                );
                const entry = entries.find((candidate) => candidate.hostname === host);
                if (entry) {
                    elements.selectorContent.value = entry.contentCss;
                    elements.selectorTitle.value = entry.titleCss;
                    elements.selectorRemove.value = entry.removeCss;
                }
            } catch {
                // The list is a convenience; not being able to read it must not
                // stop the user from setting the selectors up by hand.
            }
        }

        (elements.selectorDialog as unknown as { open(): void }).open();
    }

    /** Ask the scanner for a suggestion. */
    async #suggestSelectors(): Promise<void> {
        const elements = this.#elements;
        const url = this.#store.state.story.sourceUrl;
        if (!url) return;

        this.#setSelectorStatus(t("workbenchWaitingForChapters"));
        try {
            const suggestion = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "site-selectors:suggest",
                { url },
            );
            if (suggestion.status === "toc_detected") {
                this.#setSelectorStatus(t("siteSelectorTocDetected"), "error");
                return;
            }
            if (suggestion.status === "failed") {
                this.#setSelectorStatus(suggestion.error ?? t("errorGeneric"), "error");
                return;
            }
            elements.selectorContent.value = suggestion.contentCss;
            elements.selectorTitle.value = suggestion.titleCss;
            this.#setSelectorStatus(t("siteSelectorSuggested"));
        } catch (error) {
            this.#setSelectorStatus(caughtErrorMessage(error), "error");
        }
    }

    /** Test the selectors against the live page. */
    async #testSelectors(): Promise<void> {
        const elements = this.#elements;
        const url = this.#store.state.story.sourceUrl;
        if (!url) return;

        const contentCss = elements.selectorContent.value.trim();
        if (contentCss === "" || !isValidSelector(contentCss)) {
            this.#setSelectorStatus(t("siteSelectorInvalid"), "error");
            return;
        }

        this.#setSelectorStatus(t("workbenchWaitingForChapters"));
        try {
            const result = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "site-selectors:test",
                {
                    url,
                    contentCss,
                    titleCss: elements.selectorTitle.value.trim(),
                    removeCss: elements.selectorRemove.value.trim(),
                },
            );
            if (result.error) {
                this.#setSelectorStatus(result.error, "error");
                return;
            }
            if (result.ok) {
                this.#setSelectorStatus(t("siteSelectorTestResult", [String(result.contentChars)]));
            } else {
                this.#setSelectorStatus(t("siteSelectorTestFailed"), "error");
            }
        } catch (error) {
            this.#setSelectorStatus(caughtErrorMessage(error), "error");
        }
    }

    /** Save the selectors for the host name. */
    async #saveSelectors(): Promise<void> {
        const elements = this.#elements;
        const host = this.#selectorHost();
        if (host === "") return;

        const contentCss = elements.selectorContent.value.trim();
        if (contentCss === "" || !isValidSelector(contentCss)) {
            this.#setSelectorStatus(t("siteSelectorInvalid"), "error");
            return;
        }
        const titleCss = elements.selectorTitle.value.trim();
        const removeCss = elements.selectorRemove.value.trim();
        if (titleCss !== "" && !isValidSelector(titleCss)) {
            this.#setSelectorStatus(t("siteSelectorInvalid"), "error");
            return;
        }
        if (removeCss !== "" && !isValidSelector(removeCss)) {
            this.#setSelectorStatus(t("siteSelectorInvalid"), "error");
            return;
        }

        try {
            await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "site-selectors:save",
                {
                    hostname: host,
                    contentCss,
                    titleCss,
                    removeCss,
                    testUrl: this.#store.state.story.sourceUrl,
                },
            );
        } catch (error) {
            this.#setSelectorStatus(caughtErrorMessage(error), "error");
            return;
        }

        (elements.selectorDialog as unknown as { close(): void }).close();
        this.#toast(t("siteSelectorSaved"), "success");
        this.#store.setUsedDefaultParser(false);

        // The saved selectors change what the extension sees on this site, so
        // the page is analysed again and the chapter list is rebuilt from it.
        await this.#analyse(this.#store.state.story.sourceUrl);
        await this.#loadChapters(this.#store.state.story.sourceUrl);
    }

    /** Forget the selectors for the host name. */
    async #forgetSelectors(): Promise<void> {
        const elements = this.#elements;
        const host = this.#selectorHost();
        if (host === "") return;

        try {
            await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "site-selectors:remove",
                { hostname: host },
            );
        } catch (error) {
            this.#setSelectorStatus(caughtErrorMessage(error), "error");
            return;
        }

        (elements.selectorDialog as unknown as { close(): void }).close();
        this.#toast(t("siteSelectorForgotten"), "info");
        this.#store.setUsedDefaultParser(true);
    }

    /** Show a message in the site-selector dialog. */
    #setSelectorStatus(message: string, variant: "info" | "error" = "info"): void {
        const status = this.#elements.selectorStatus;
        status.textContent = message;
        status.hidden = message === "";
        status.dataset["variant"] = variant;
    }

    /** Show a toast. */
    #toast(message: string, variant: "success" | "info" | "warning" | "error"): void {
        const toast = document.createElement("k-toast");
        toast.setAttribute("message", message);
        toast.setAttribute("variant", variant);
        toast.setAttribute("duration", "4000");
        this.#elements.toastHost.appendChild(toast);
    }

    /** Save one story option. */
    async #saveStoryOption(
        key: "removeAuthorNotes" | "includeTocPage",
        value: boolean,
    ): Promise<void> {
        const current = await this.#settings.get();
        const next = await this.#settings.update({
            story: { ...current.story, [key]: value },
        });
        // The snapshot has to be kept in step with the write. `#save` writes
        // the whole story group from the snapshot, so a stale one would undo
        // the option the user had just toggled: they turned the switch on,
        // pressed Save to save the metadata, and the switch silently went
        // back off.
        this.#settingsValue = next;
    }

    /** Save the metadata. */
    async #save(): Promise<void> {
        const state = this.#store.state;
        // The settings are already held from the start of the page; reading
        // them again would risk saving a value the user has changed
        // elsewhere since.
        const settings = this.#settingsValue ?? (await this.#settings.get());
        await this.#settings.update({
            story: {
                ...settings.story,
                defaultLanguage: state.story.language,
            },
        });
        this.#settingsValue = {
            ...settings,
            story: { ...settings.story, defaultLanguage: state.story.language },
        };
        this.#store.markDirty(false);
    }

    /** Start the download. */
    async #pack(): Promise<void> {
        const state = this.#store.state;
        const selected = state.chapters
            .map((chapter, index) => ({ chapter, index }))
            .filter((entry) => entry.chapter.selected);
        if (selected.length === 0) return;

        // The job counts its own chapters, so the mapping back to the
        // workbench's list is kept for the progress poll.
        this.#jobChapterIndexes = selected.map((entry) => entry.index);

        try {
            const { jobId } = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "download:start",
                {
                    url: state.story.sourceUrl,
                    title: state.story.title,
                    // The name the user chose, if they chose one. Without it the
                    // worker falls back to the filename template.
                    fileName: state.story.fileNameEdited ? state.story.fileName : undefined,
                    chapters: selected.map((entry) => ({
                        sourceUrl: entry.chapter.sourceUrl,
                        title: entry.chapter.title,
                    })),
                },
            );
            this.#jobId = jobId;
            this.#startPolling();
        } catch (error) {
            this.#store.setError(caughtErrorMessage(error));
        }
    }

    /** Poll the download's progress. */
    #startPolling(): void {
        if (!this.#jobId) return;
        this.#stopPolling();
        this.#stopPoll = pollUntilDone<DownloadProgress>({
            intervalMs: 500,
            step: async () => {
                const jobId = this.#jobId;
                if (!jobId) return undefined;
                const progress = await sendRequest(
                    { sendMessage: (message) => sendMessageToWorker(message) },
                    "download:progress",
                    { jobId },
                );
                this.#store.setProgress({
                    phase: progress.phase,
                    done: progress.chaptersDone,
                    total: progress.chaptersTotal,
                    percent: progress.percent,
                    // The worker sends the message *key*, so the page translates
                    // it in its own locale.
                    message: tDynamic(progress.message),
                    succeeded: progress.phase === "complete",
                });

                this.#applyChapterState(progress);

                if (
                    progress.phase === "complete" ||
                    progress.phase === "failed" ||
                    progress.phase === "cancelled"
                ) {
                    this.#jobId = undefined;
                    return undefined;
                }
                return progress;
            },
            onGiveUp: (error) => {
                // The job is gone: the worker was restarted, or the job was
                // cleaned up. Asking again would fail for ever.
                this.#jobId = undefined;
                this.#store.setError(caughtErrorMessage(error));
            },
        });
    }

    /** Stop polling, if the page is being torn down. */
    dispose(): void {
        this.#stopPolling();
    }

    /**
     * Show which chapter the job is on.
     *
     * The job reports the chapter it is fetching, counted among the chapters
     * the user selected. The workbench's list is the whole list, so the
     * index is mapped back through the selection before the row is updated.
     *
     * Without this the chapter list sits at "idle" for the whole download,
     * which reads as a broken list rather than a busy one.
     *
     * The job also reports the chapters that have *finished*. A finished
     * chapter keeps its final state for the rest of the download, so the list
     * reads as a record of what has happened rather than a row of spinners
     * that never stop.
     */
    #applyChapterState(progress: DownloadProgress): void {
        const finished = progress.finished;
        if (finished) {
            for (const change of finishedChapterStates(finished, this.#jobChapterIndexes)) {
                this.#store.setChapterState(change.index, change.state);
            }
        }

        const current = progress.current;
        if (!current) return;
        const index = this.#jobChapterIndexes[current.index];
        if (index === undefined) return;
        this.#store.setChapterState(index, current.state);
    }

    /** Stop the progress poll. */
    #stopPolling(): void {
        this.#stopPoll?.();
        this.#stopPoll = undefined;
        if (this.#pollTimer) clearTimeout(this.#pollTimer);
        this.#pollTimer = undefined;
    }

    /** Cancel the running download. */
    async #cancel(): Promise<void> {
        if (!this.#jobId) return;
        const jobId = this.#jobId;
        this.#jobId = undefined;
        this.#stopPolling();
        try {
            await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "download:cancel",
                { jobId },
            );
        } catch {
            // The job may already have finished; nothing to cancel.
        }
    }

    /** Render, coalescing multiple state changes into one frame. */
    #scheduleRender(): void {
        if (this.#renderQueued) return;
        this.#renderQueued = true;
        requestAnimationFrame(() => {
            this.#renderQueued = false;
            this.#render();
        });
    }

    /** Render the view. */
    #render(): void {
        renderWorkbench(
            this.#elements,
            this.#store.state,
            this.#store.visibleChapters,
            this.#store.selectedCount,
        );
    }
}

/**
 * Whether a string is a CSS selector the browser can parse.
 *
 * A selector that throws when it is used takes the whole chapter down with it,
 * so it is checked here — in the page, where the error is visible — rather
 * than in the worker, where it would only be a failed download.
 */
function isValidSelector(selector: string): boolean {
    return isParsableSelector(selector);
}

/**
 * The URL the workbench was opened for, if it was passed one.
 *
 * The popup opens `workbench.html?url=<encoded>`. Reading it here means the
 * workbench analyses the exact page the user was looking at, even if they
 * have since switched tabs.
 */
function requestedUrl(): string | undefined {
    const raw = new URLSearchParams(window.location.search).get("url");
    if (!raw) return undefined;
    try {
        const url = new URL(raw);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Send a message to the background worker.
 *
 * Kept in one place so the message bus's `MessagingApi` contract has a single
 * implementation.
 */
async function sendMessageToWorker(message: unknown): Promise<unknown> {
    const { sendMessage } = await import("../../../core/browser-api");
    return sendMessage(message);
}

/** Start the page. */
async function main(): Promise<void> {
    installI18n();
    const root = document.body;
    const controller = new WorkbenchController(root);
    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The workbench failed to start:", error);
});
