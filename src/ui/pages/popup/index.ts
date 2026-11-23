/**
 * The popup page.
 *
 * The popup is the extension's front door, and it is deliberately small. It
 * asks the background worker what is on the current page, and it shows the
 * user one card and one button.
 *
 * It never fetches a page and never loads a parser: the worker owns both.
 * That is what keeps the popup opening instantly, even with 437 parsers in
 * the extension.
 *
 * See ADR-0005.
 */
import "../../components/base";
import "../../components/icons";
import "../../components/k-button";
import "../../components/k-progress";
import "../../components/k-toast";

import { sendRequest } from "../../../core/message/bus";
import { activeTab, openTab, sendMessage, getURL } from "../../../core/browser-api";
import { themeController } from "../../styles/theme-controller";
import { t } from "../../i18n";
import { installI18n } from "../../i18n-bootstrap";
import { buildPopup, renderPopup, type PopupElements, type PopupViewState } from "./view";

/** The popup's controller. */
class PopupController {
    #elements: PopupElements;
    #state: PopupViewState = {
        state: "loading",
        title: "",
        author: "",
        coverUrl: "",
        chapterCount: 0,
        hostName: "",
        error: "",
        phase: "",
        done: 0,
        total: 0,
        percent: 0,
    };
    #pollTimer: ReturnType<typeof setTimeout> | undefined;
    #jobId: string | undefined;

    constructor(root: HTMLElement) {
        this.#elements = buildPopup(root);
        this.#wire();
    }

    /** Start the popup. */
    async start(): Promise<void> {
        themeController.start();
        this.#render();

        // The popup can be torn down while a poll is in flight, so the timer
        // is cleared on the way out. A stale timer would keep the popup's
        // event loop alive after the window is gone.
        window.addEventListener("unload", () => this.#stopPolling());

        // A running download is the most valuable thing the popup can show,
        // so it is checked first: it needs no network at all.
        await this.#checkRunningJob();

        const tab = await activeTab();
        if (!tab?.url) {
            this.#set({ state: "no-story", error: t("popupNoStory") });
            return;
        }

        this.#set({ hostName: hostOf(tab.url) });
        await this.#analyse(tab.url);
    }

    /** Ask the worker what is on the page. */
    async #analyse(url: string): Promise<void> {
        try {
            const analysis = await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "page:analyze",
                { url },
            );

            if (!analysis.supported) {
                this.#set({ state: "unsupported" });
                return;
            }

            this.#set({
                state: "story",
                title: analysis.title ?? hostOf(url),
                author: analysis.author ?? "",
                coverUrl: analysis.coverUrl ?? "",
            });

            // The chapter count is a nice-to-have; failing to get it must not
            // take the card down with it.
            try {
                const chapters = await sendRequest(
                    { sendMessage: (message) => sendMessage(message) },
                    "chapters:list",
                    { url },
                );
                this.#set({ chapterCount: chapters.chapters.length });
            } catch {
                this.#set({ chapterCount: 0 });
            }
        } catch (error) {
            this.#set({
                state: "error",
                error: error instanceof Error ? error.message : t("errorGeneric"),
            });
        }
    }

    /** Check whether a download is running, and follow it if so. */
    async #checkRunningJob(): Promise<void> {
        try {
            const { jobs } = await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "download:list",
                {},
            );
            const running = jobs.find(
                (job) =>
                    job.phase !== "complete" && job.phase !== "failed" && job.phase !== "cancelled",
            );
            if (!running) return;

            this.#jobId = running.jobId;
            this.#set({
                state: "running",
                phase: running.message,
                done: running.chaptersDone,
                total: running.chaptersTotal,
                percent: running.percent,
            });
            this.#poll();
        } catch {
            // The worker may be asleep. The popup still works without this.
        }
    }

    /** Follow the running download. */
    async #poll(): Promise<void> {
        if (!this.#jobId) return;
        try {
            const progress = await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "download:progress",
                { jobId: this.#jobId },
            );
            this.#set({
                state: "running",
                phase: progress.message,
                done: progress.chaptersDone,
                total: progress.chaptersTotal,
                percent: progress.percent,
            });

            if (
                progress.phase === "complete" ||
                progress.phase === "failed" ||
                progress.phase === "cancelled"
            ) {
                this.#jobId = undefined;
                if (progress.phase === "complete") {
                    this.#toast(t("popupSaved"), "success");
                    this.#set({ state: "story" });
                }
                return;
            }
        } catch {
            // Keep polling: the job's state is durable.
        }
        this.#pollTimer = setTimeout(() => void this.#poll(), 600);
    }

    /** Stop polling. */
    #stopPolling(): void {
        if (this.#pollTimer) clearTimeout(this.#pollTimer);
        this.#pollTimer = undefined;
    }

    /** Wire the events. */
    #wire(): void {
        this.#elements.root.addEventListener("k-click", (event) => {
            const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-action]");
            const action = target?.dataset["action"];
            if (!action) return;
            void this.#handle(action);
        });
    }

    /** Handle an action. */
    async #handle(action: string): Promise<void> {
        switch (action) {
            case "primary": {
                const tab = await activeTab();
                await openTab(
                    getURL(`workbench.html${tab?.url ? `?url=${encodeURIComponent(tab.url)}` : ""}`),
                );
                window.close();
                return;
            }
            case "workbench": {
                await openTab(getURL("workbench.html"));
                window.close();
                return;
            }
            case "library": {
                await openTab(getURL("options.html#library"));
                window.close();
                return;
            }
            case "settings": {
                await openTab(getURL("options.html"));
                window.close();
                return;
            }
            case "retry": {
                const tab = await activeTab();
                if (tab?.url) await this.#analyse(tab.url);
                return;
            }
            default:
                return;
        }
    }

    /** Show a toast. */
    #toast(message: string, variant: "info" | "success" | "warning" | "danger"): void {
        const toast = document.createElement("k-toast");
        toast.setAttribute("message", message);
        toast.setAttribute("variant", variant);
        document.body.appendChild(toast);
    }

    /** Merge a change into the state and render. */
    #set(change: Partial<PopupViewState>): void {
        this.#state = { ...this.#state, ...change };
        this.#render();
    }

    /** Render. */
    #render(): void {
        renderPopup(this.#elements, this.#state);
    }
}

/** The host name of a URL, for the "not supported" message. */
function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

/** Start the popup. */
async function main(): Promise<void> {
    installI18n();
    const controller = new PopupController(document.body);
    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The popup failed to start:", error);
});
