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

import { sendRequest, type DownloadProgress } from "../../../core/message/bus";
import {
    activePageUrl,
    openTab,
    sendMessage,
    getURL,
    localStorageAdapter,
} from "../../../core/browser-api";
import {
    displayOrigin,
    hasHostAccess,
    originOf,
    requestHostAccess,
} from "../../../core/host-access";
import { SettingsStore } from "../../../core/storage/settings-store";
import { themeController } from "../../styles/theme-controller";
import { t, tDynamic } from "../../i18n";
import { caughtErrorMessage } from "../../error-messages";
import { runGuarded } from "../../guarded";
import type { UserFacingError } from "../../../core/util/errors";
import { pollUntilDone } from "../../poll";
import { LatestOnly } from "../../latest-only";
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
        accessHost: "",
        error: "",
        phase: "",
        done: 0,
        total: 0,
        percent: 0,
    };
    /** The URL the popup is looking at. */
    #url: string | undefined;
    /** Stops the poll for a running download. */
    #stopPoll: (() => void) | undefined;
    #jobId: string | undefined;
    /**
     * The analyses that are in flight.
     *
     * Every analysis takes a number, and only the newest one is allowed to
     * change the popup. Without the guard, a "Try again" pressed while the
     * first attempt is still running lets the older answer land last, and the
     * popup shows a story the user has already moved away from.
     */
    #analyses = new LatestOnly();

    constructor(root: HTMLElement) {
        this.#elements = buildPopup(root);
        this.#wire();
    }

    /** Start the popup. */
    async start(): Promise<void> {
        // The popup honours the user's theme, accent, density and reduced-motion
        // setting. It has to read them before it renders: the popup is the
        // first thing a user sees, and a popup that ignores the settings looks
        // like a different product from the one they configured.
        const settings = await new SettingsStore(localStorageAdapter).get();
        themeController.start();
        themeController.applySettings(settings.appearance);
        this.#render();

        // The popup can be torn down while a poll is in flight, so the timer
        // is cleared on the way out. A stale timer would keep the popup's
        // event loop alive after the window is gone.
        window.addEventListener("unload", () => this.#stopPolling());

        // A user who has not been through the onboarding yet gets the welcome
        // state, whatever page they are on. Introducing the extension before
        // asking it to do anything is the difference between a tool and a
        // puzzle.
        if (!settings.onboardingComplete) {
            this.#set({ state: "welcome" });
            return;
        }

        // A running download is the most valuable thing the popup can show,
        // so it is checked first: it needs no network at all. When one is
        // running the popup follows it instead of analysing the page — a
        // second analysis would replace the progress with a story card.
        if (await this.#checkRunningJob()) return;

        // The popup normally looks at the tab the user is on. A URL on the
        // query string overrides that, which is what makes the popup
        // linkable: a site can offer "add this chapter to your library"
        // without sending the user to the workbench first.
        const url = requestedUrl() ?? (await activePageUrl());
        if (!url) {
            this.#set({ state: "no-story", error: t("popupNoStory") });
            return;
        }

        this.#url = url;
        this.#set({ hostName: hostOf(url) });
        await this.#analyse(url);
    }

    /** Ask the worker what is on the page. */
    async #analyse(url: string): Promise<void> {
        // This analysis is the newest one, so any older answer that arrives
        // later is discarded.
        const analysisNumber = this.#analyses.begin();
        const isCurrent = (): boolean => this.#analyses.isCurrent(analysisNumber);

        try {
            const analysis = await sendRequest(
                { sendMessage: (message) => sendMessage(message) },
                "page:analyze",
                { url },
            );
            if (!isCurrent()) return;

            // The worker reports a failure as an error rather than as an
            // exception, so the error is read first: a page that could not be
            // reached is not the same as a page no parser understands, and
            // telling the user the site is "not supported yet" when the real
            // problem is the network would send them off to write a parser
            // they do not need.
            if (analysis.error) {
                await this.#handleAnalysisError(url, analysis.error);
                return;
            }

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
                if (!isCurrent()) return;
                this.#set({ chapterCount: chapters.chapters.length });
            } catch {
                if (!isCurrent()) return;
                this.#set({ chapterCount: 0 });
            }
        } catch (error) {
            if (!isCurrent()) return;
            this.#set({
                state: "error",
                error: caughtErrorMessage(error),
            });
        }
    }

    /**
     * Show what the analysis failure means.
     *
     * The one case that gets its own state is the one the user can fix: the
     * extension was not allowed to read the site. Everything else is an error
     * with the worker's own wording.
     *
     * @param url The URL that was analysed.
     * @param error The failure the worker reported.
     */
    async #handleAnalysisError(url: string, error: UserFacingError): Promise<void> {
        if (error.code === "UNSUPPORTED") {
            this.#set({ state: "unsupported" });
            return;
        }

        // A page the extension may not read fails to load, and the failure
        // looks exactly like a site that is down. When the extension has not
        // been allowed to read the site, that is what actually happened, and
        // the fix is one button.
        const origin = originOf(url);
        if (error.code === "NETWORK" && origin && !(await hasHostAccess(origin))) {
            this.#set({ state: "access", accessHost: displayOrigin(origin) });
            return;
        }

        this.#set({ state: "error", error: error.message });
    }

    /**
     * Ask the browser for access to the site.
     *
     * The request has to be made from the handler of the user's click, with
     * nothing awaited before it: Firefox only shows the prompt when the
     * request follows a real gesture. The request is therefore made on the
     * first line, before any other work happens.
     */
    async #grantAccess(): Promise<void> {
        const url = this.#url;
        if (!url) return;
        const origin = originOf(url);
        if (!origin) return;

        const granted = await requestHostAccess(origin);
        if (!granted) {
            this.#toast(t("accessDenied"), "warning");
            return;
        }

        this.#toast(t("accessAlreadyGranted"), "success");
        await this.#analyse(url);
    }

    /**
     * Check whether a download is running, and follow it if so.
     *
     * @returns `true` when a running download was found and is now being
     *   followed. The caller uses this to decide not to analyse the page: the
     *   progress is more useful than a story card, and the two fight over the
     *   same screen.
     */
    async #checkRunningJob(): Promise<boolean> {
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
            if (!running) return false;

            this.#jobId = running.jobId;
            this.#set({
                state: "running",
                phase: running.message,
                done: running.chaptersDone,
                total: running.chaptersTotal,
                percent: running.percent,
            });
            this.#startPolling();
            return true;
        } catch {
            // The worker may be asleep. The popup still works without this.
            return false;
        }
    }

    /** Follow the running download. */
    #startPolling(): void {
        if (!this.#jobId) return;
        this.#stopPolling();
        this.#stopPoll = pollUntilDone<DownloadProgress>({
            intervalMs: 600,
            step: async () => {
                const jobId = this.#jobId;
                if (!jobId) return undefined;
                const progress = await sendRequest(
                    { sendMessage: (message) => sendMessage(message) },
                    "download:progress",
                    { jobId },
                );
                this.#set({
                    state: "running",
                    // The worker sends the message *key*, so the popup
                    // translates it in its own locale.
                    phase: tDynamic(progress.message),
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
                    return undefined;
                }
                return progress;
            },
            onGiveUp: () => {
                // The job is gone: the worker was restarted, or the job was
                // cleaned up. Asking again would fail for ever.
                this.#jobId = undefined;
                this.#set({ state: "error", error: t("errorGeneric") });
            },
        });
    }

    /** Stop polling. */
    #stopPolling(): void {
        this.#stopPoll?.();
        this.#stopPoll = undefined;
    }

    /** Wire the events. */
    #wire(): void {
        this.#elements.root.addEventListener("k-click", (event) => {
            const target = (event.target as HTMLElement)?.closest<HTMLElement>("[data-action]");
            const action = target?.dataset["action"];
            if (!action) return;
            runGuarded(
                () => this.#handle(action),
                // A failure inside an action is the user's problem to know
                // about: the popup shows it rather than the browser logging
                // an unhandled rejection to a console nobody is watching.
                (error) => this.#toast(caughtErrorMessage(error), "danger"),
            );
        });
    }

    /** Handle an action. */
    async #handle(action: string): Promise<void> {
        switch (action) {
            case "primary": {
                const url = this.#url;
                await openTab(
                    getURL(`workbench.html${url ? `?url=${encodeURIComponent(url)}` : ""}`),
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
            case "onboarding": {
                await openTab(getURL("onboarding.html"));
                window.close();
                return;
            }
            case "retry": {
                if (this.#url) await this.#analyse(this.#url);
                return;
            }
            case "grant-access": {
                await this.#grantAccess();
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

/**
 * The URL the popup was asked to look at.
 *
 * Read from the query string, so the popup can be pointed at a specific page
 * without the user having to be on it.
 *
 * @returns The URL, or undefined when there is none.
 */
function requestedUrl(): string | undefined {
    const value = new URLSearchParams(window.location.search).get("url");
    if (!value) return undefined;
    try {
        const url = new URL(value);
        // Only http and https are meaningful: an extension page is not a
        // story, and following one would be a way to make the popup fetch
        // something from inside the extension.
        if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
        return url.href;
    } catch {
        return undefined;
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
