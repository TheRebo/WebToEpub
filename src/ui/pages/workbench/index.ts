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

import { sendRequest } from "../../../core/message/bus";
import { localStorageAdapter, activeTab } from "../../../core/browser-api";
import { SettingsStore, type Settings } from "../../../core/storage/settings-store";
import { themeController } from "../../styles/theme-controller";
import { t } from "../../i18n";
import { buildWorkbench, renderWorkbench, type WorkbenchElements } from "./view";
import { WorkbenchStore, type Chapter, type WorkbenchState } from "./state";

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
        },
        chapters: [],
        loadingChapters: false,
        filter: { query: "", useRegex: false, include: [], exclude: [] },
        dirty: false,
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
    #pollTimer: ReturnType<typeof setTimeout> | undefined;
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
        themeController.applySettings({ appearance: this.#settingsValue.appearance });
        this.#render();

        const tab = await activeTab();
        if (!tab?.url) {
            this.#store.setError(t("errorGeneric"));
            this.#render();
            return;
        }

        await this.#analyse(tab.url);
        await this.#loadChapters(tab.url);
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
            });
        } catch (error) {
            this.#store.setError(error instanceof Error ? error.message : t("errorGeneric"));
        }
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
                this.#store.setError(result.error.message);
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
            this.#store.setError(error instanceof Error ? error.message : t("errorGeneric"));
            this.#store.setLoading(false);
        }
    }

    /** Wire the events. */
    #wire(): void {
        const elements = this.#elements;

        // --- Metadata fields ---
        elements.titleField.addEventListener("input", () => {
            this.#store.setStory({ title: elements.titleField.value });
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
            this.#store.markDirty(true);
        });
        elements.resetFilename.addEventListener("click", () => {
            elements.filenameField.value = "";
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
        elements.selectAllButton.addEventListener("k-click", () => this.#store.setAllSelected(true));
        elements.selectNoneButton.addEventListener("k-click", () => this.#store.setAllSelected(false));
        elements.invertButton.addEventListener("k-click", () => this.#store.invertSelection());
        elements.filterButton.addEventListener("k-click", () => {
            const dialog = elements.filterDialog as unknown as { open(): void };
            dialog.open();
        });

        // The Cancel button lives in the status bar and is rebuilt each time
        // the bar is rendered, so it never carries stale state.
        elements.statusActions.addEventListener("k-click", (event) => {
            if ((event.target as HTMLElement)?.closest?.("k-button")) {
                void this.#cancel();
            }
        });
    }

    /** Save one story option. */
    async #saveStoryOption(key: "removeAuthorNotes" | "includeTocPage", value: boolean): Promise<void> {
        const current = await this.#settings.get();
        await this.#settings.update({ story: { ...current.story, [key]: value } });
    }

    /** Save the metadata. */
    async #save(): Promise<void> {
        const state = this.#store.state;
        await this.#settings.update({
            story: {
                ...(await this.#settings.get()).story,
                defaultLanguage: state.story.language,
            },
        });
        this.#store.markDirty(false);
    }

    /** Start the download. */
    async #pack(): Promise<void> {
        const state = this.#store.state;
        const selected = state.chapters.filter((chapter) => chapter.selected);
        if (selected.length === 0) return;

        try {
            const { jobId } = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "download:start",
                {
                    url: state.story.sourceUrl,
                    title: state.story.title,
                    chapterUrls: selected.map((chapter) => chapter.sourceUrl),
                },
            );
            this.#jobId = jobId;
            this.#pollProgress();
        } catch (error) {
            this.#store.setError(error instanceof Error ? error.message : t("errorGeneric"));
        }
    }

    /** Poll the download's progress. */
    async #pollProgress(): Promise<void> {
        if (!this.#jobId) return;
        try {
            const progress = await sendRequest(
                { sendMessage: (message) => sendMessageToWorker(message) },
                "download:progress",
                { jobId: this.#jobId },
            );
            this.#store.setProgress({
                phase: progress.phase,
                done: progress.chaptersDone,
                total: progress.chaptersTotal,
                percent: progress.percent,
                message: progress.message,
                succeeded: progress.phase === "complete",
            });

            if (progress.phase === "complete" || progress.phase === "failed" || progress.phase === "cancelled") {
                this.#jobId = undefined;
                return;
            }
        } catch {
            // The worker may have been suspended. Keep polling; the job's
            // state is durable.
        }

        this.#pollTimer = setTimeout(() => void this.#pollProgress(), 500);
    }

    /** Stop polling, if the page is being torn down. */
    dispose(): void {
        if (this.#pollTimer) clearTimeout(this.#pollTimer);
        this.#pollTimer = undefined;
    }

    /** Cancel the running download. */
    async #cancel(): Promise<void> {
        if (!this.#jobId) return;
        const jobId = this.#jobId;
        this.#jobId = undefined;
        if (this.#pollTimer) {
            clearTimeout(this.#pollTimer);
            this.#pollTimer = undefined;
        }
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
    const root = document.body;
    const controller = new WorkbenchController(root);
    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The workbench failed to start:", error);
});
