/**
 * The popup's view.
 *
 * The popup is a **launcher**, not the tool. It answers one question — "can
 * Kintsugi do anything with this page?" — and gets out of the way.
 *
 * The view is built once and then updated in place. Nothing here creates
 * markup from a string, so a page title can never become HTML.
 */
import { createIcon } from "../../components/icons";
import { t, tCount } from "../../i18n";

/** The states the popup can be in. */
export type PopupState =
    | "loading"
    | "welcome"
    | "story"
    | "no-story"
    | "unsupported"
    | "access"
    | "running"
    | "error";

/** What the popup shows. */
export interface PopupViewState {
    /** The state. */
    state: PopupState;
    /** The story's title. */
    title: string;
    /** The story's author. */
    author: string;
    /** The cover image's URL. */
    coverUrl: string;
    /** The number of chapters found. */
    chapterCount: number;
    /** The site's host name. */
    hostName: string;
    /**
     * The host the extension is asking to be allowed to read.
     *
     * It is set in the `access` state, and is empty everywhere else.
     */
    accessHost: string;
    /** The error, if the state is `error`. */
    error: string;
    /** The download's phase, when a download is running. */
    phase: string;
    /** How many chapters have been fetched. */
    done: number;
    /** How many chapters there are in total. */
    total: number;
    /** The download's percentage. */
    percent: number;
}

/** The popup's elements. */
export interface PopupElements {
    /** The popup's root. */
    root: HTMLElement;
    /** The header. */
    header: HTMLElement;
    /** The card that shows the story. */
    card: HTMLElement;
    /** The card's cover image. */
    cover: HTMLImageElement;
    /** The card's title. */
    title: HTMLElement;
    /** The card's subtitle. */
    subtitle: HTMLElement;
    /** The chapter count. */
    chapterCount: HTMLElement;
    /** The empty state. */
    empty: HTMLElement;
    /** The state that asks the user for access to the site. */
    access: HTMLElement;
    /** The host in the access state. */
    accessHost: HTMLElement;
    /** The state shown while the worker is answering. */
    loading: HTMLElement;
    /** The live progress strip. */
    progress: HTMLElement;
    /** The progress label. */
    progressLabel: HTMLElement;
    /** The progress bar. */
    progressBar: HTMLElement;
    /** The progress count. */
    progressCount: HTMLElement;
    /** The primary action. */
    primary: HTMLElement;
    /** The secondary actions. */
    actions: HTMLElement;
    /** The error message, shown in the error state. */
    error: HTMLElement;
    /** The error message's text. */
    errorText: HTMLElement;
}

/**
 * Build the popup's structure.
 *
 * The DOM is assembled once. State changes only toggle attributes and set
 * text, which keeps the popup at a steady frame budget no matter how often
 * it re-renders.
 */
export function buildPopup(root: HTMLElement): PopupElements {
    root.replaceChildren();

    // --- Header ---
    const header = document.createElement("header");
    header.className = "popup-header";

    const mark = document.createElement("span");
    mark.className = "popup-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(createIcon("book", 20));

    const wordmark = document.createElement("h1");
    wordmark.className = "popup-wordmark";
    wordmark.textContent = t("appName");

    const settings = document.createElement("k-button");
    settings.className = "popup-settings";
    settings.setAttribute("variant", "ghost");
    settings.setAttribute("size", "sm");
    settings.setAttribute("icon-only", "");
    settings.setAttribute("icon", "settings");
    settings.setAttribute("aria-label", t("popupSettings"));
    settings.dataset["action"] = "settings";

    header.appendChild(mark);
    header.appendChild(wordmark);
    header.appendChild(settings);

    // --- The story card ---
    const card = document.createElement("div");
    card.className = "popup-card";
    card.setAttribute("role", "group");

    const cover = document.createElement("img");
    cover.className = "popup-cover";
    cover.alt = "";
    cover.width = 56;
    cover.height = 80;
    cover.decoding = "async";
    cover.loading = "lazy";

    const cardBody = document.createElement("div");
    cardBody.className = "popup-card-body";

    const title = document.createElement("p");
    title.className = "popup-card-title";

    const subtitle = document.createElement("p");
    subtitle.className = "popup-card-subtitle";

    const chapterCount = document.createElement("p");
    chapterCount.className = "popup-card-chapters";

    cardBody.appendChild(title);
    cardBody.appendChild(subtitle);
    cardBody.appendChild(chapterCount);

    card.appendChild(cover);
    card.appendChild(cardBody);

    // --- The empty state ---
    const empty = document.createElement("div");
    empty.className = "popup-empty";

    const emptyIcon = document.createElement("span");
    emptyIcon.className = "popup-empty-icon";
    emptyIcon.setAttribute("aria-hidden", "true");
    emptyIcon.appendChild(createIcon("search", 28));

    const emptyText = document.createElement("p");
    emptyText.className = "popup-empty-text";

    empty.appendChild(emptyIcon);
    empty.appendChild(emptyText);

    // --- The access state ---
    //
    // The extension can only read a site the user has allowed. When it has not
    // been allowed, the popup says so and offers the one button that fixes it,
    // rather than showing a network error the user cannot act on.
    const access = document.createElement("div");
    access.className = "popup-access";

    const accessIcon = document.createElement("span");
    accessIcon.className = "popup-access-icon";
    accessIcon.setAttribute("aria-hidden", "true");
    accessIcon.appendChild(createIcon("lock", 20));

    const accessTitle = document.createElement("p");
    accessTitle.className = "popup-access-title";
    accessTitle.textContent = t("accessTitle");

    const accessHostNode = document.createElement("p");
    accessHostNode.className = "popup-access-host";

    const accessButton = document.createElement("k-button");
    accessButton.className = "popup-access-button";
    accessButton.setAttribute("variant", "primary");
    accessButton.setAttribute("size", "lg");
    accessButton.dataset["action"] = "grant-access";
    accessButton.textContent = t("accessGrant");

    access.appendChild(accessIcon);
    access.appendChild(accessTitle);
    access.appendChild(accessHostNode);
    access.appendChild(accessButton);

    // --- The loading state ---
    //
    // The popup opens while the worker is still answering. It used to show
    // nothing at all during that time, which reads as a broken window: a
    // blank rectangle with no text and no spinner. The state says what it is
    // waiting for instead.
    const loading = document.createElement("div");
    loading.className = "popup-loading";

    const loadingSpinner = document.createElement("span");
    loadingSpinner.className = "popup-loading-spinner";
    loadingSpinner.setAttribute("aria-hidden", "true");
    loadingSpinner.appendChild(createIcon("spinner", 18));

    const loadingText = document.createElement("p");
    loadingText.className = "popup-loading-text";
    loadingText.textContent = t("popupChecking");

    loading.append(loadingSpinner, loadingText);

    // --- The error state ---
    //
    // An error the user is never shown is an error they cannot act on. The
    // message is the worker's own wording, so it says what actually failed.
    const error = document.createElement("div");
    error.className = "popup-error";
    error.setAttribute("role", "alert");

    const errorIcon = document.createElement("span");
    errorIcon.className = "popup-error-icon";
    errorIcon.setAttribute("aria-hidden", "true");
    errorIcon.appendChild(createIcon("alert-triangle", 18));

    const errorText = document.createElement("p");
    errorText.className = "popup-error-text";

    error.append(errorIcon, errorText);

    // --- The live progress strip ---
    const progress = document.createElement("div");
    progress.className = "popup-progress";
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");

    const progressLabel = document.createElement("p");
    progressLabel.className = "popup-progress-label";

    const progressCount = document.createElement("p");
    progressCount.className = "popup-progress-count";

    const progressTrack = document.createElement("div");
    progressTrack.className = "popup-progress-track";

    const progressBar = document.createElement("div");
    progressBar.className = "popup-progress-bar";

    progressTrack.appendChild(progressBar);

    progress.appendChild(progressLabel);
    progress.appendChild(progressCount);
    progress.appendChild(progressTrack);

    // --- Actions ---
    const primary = document.createElement("k-button");
    primary.className = "popup-primary";
    primary.setAttribute("variant", "primary");
    primary.setAttribute("size", "lg");
    primary.dataset["action"] = "primary";

    const actions = document.createElement("div");
    actions.className = "popup-actions";

    const library = document.createElement("k-button");
    library.className = "popup-action";
    library.setAttribute("variant", "secondary");
    library.setAttribute("size", "sm");
    library.setAttribute("icon", "book");
    library.dataset["action"] = "library";
    library.appendChild(document.createTextNode(t("popupLibraryShort")));

    const workbench = document.createElement("k-button");
    workbench.className = "popup-action";
    workbench.setAttribute("variant", "secondary");
    workbench.setAttribute("size", "sm");
    workbench.setAttribute("icon", "list");
    workbench.dataset["action"] = "workbench";
    workbench.appendChild(document.createTextNode(t("popupWorkbenchShort")));

    actions.appendChild(library);
    actions.appendChild(workbench);

    const body = document.createElement("main");
    body.className = "popup-body";
    body.appendChild(card);
    body.appendChild(empty);
    body.appendChild(access);
    body.appendChild(loading);
    body.appendChild(error);
    body.appendChild(progress);
    body.appendChild(primary);
    body.appendChild(actions);

    root.appendChild(header);
    root.appendChild(body);

    return {
        root,
        header,
        card,
        cover,
        title,
        subtitle,
        chapterCount,
        empty,
        access,
        accessHost: accessHostNode,
        loading,
        progress,
        progressLabel,
        progressBar,
        progressCount,
        primary,
        actions,
        error,
        errorText,
    };
}

/**
 * Render the popup.
 *
 * Every branch sets every visible element, so the popup can never show a
 * half-updated screen.
 */
export function renderPopup(elements: PopupElements, state: PopupViewState): void {
    const { root } = elements;
    root.dataset["state"] = state.state;

    // --- The card ---
    const showCard = state.state === "story";
    elements.card.hidden = !showCard;
    elements.title.textContent = state.title;
    elements.subtitle.textContent = state.author;

    if (state.coverUrl) {
        elements.cover.src = state.coverUrl;
        elements.cover.hidden = false;
    } else {
        elements.cover.removeAttribute("src");
        elements.cover.hidden = true;
    }

    elements.chapterCount.textContent =
        state.chapterCount > 0 ? tCount("popupChapterCount", state.chapterCount) : "";

    // --- The empty state ---
    const showEmpty =
        state.state === "no-story" || state.state === "unsupported" || state.state === "welcome";
    elements.empty.hidden = !showEmpty;
    const emptyText = elements.empty.querySelector(".popup-empty-text");
    if (emptyText) {
        emptyText.textContent =
            state.state === "unsupported"
                ? t("popupUnsupportedHost", state.hostName)
                : state.state === "welcome"
                  ? t("popupWelcome")
                  : t("popupNoStory");
    }

    // --- The access state ---
    //
    // The extension is asking to be allowed to read the site. The button that
    // grants it has to be the primary action, because it is the only thing
    // that makes the rest of the popup work.
    const showAccess = state.state === "access";
    elements.access.hidden = !showAccess;
    elements.accessHost.textContent = state.accessHost;

    // --- The loading state ---
    elements.loading.hidden = state.state !== "loading";

    // --- The error state ---
    //
    // The message is the worker's own wording. The state is not hidden when
    // there is no message, because an empty red box is worse than a red box
    // with a sentence in it — but the box is only shown in the error state, so
    // it never appears with nothing in it by accident.
    elements.error.hidden = state.state !== "error";
    elements.errorText.textContent = state.error;

    // --- The progress strip ---
    const showProgress = state.state === "running";
    elements.progress.hidden = !showProgress;
    elements.progressLabel.textContent = state.phase;
    elements.progressCount.textContent = state.total > 0 ? `${state.done} / ${state.total}` : "";
    // The width is driven by a custom property rather than an inline
    // `width`, so the transition animates and the layout never jumps.
    elements.progressBar.style.setProperty("--k-progress", `${state.percent}%`);

    // --- The primary action ---
    elements.primary.hidden = state.state === "loading";

    if (state.state === "running") {
        // A download the user started can be stopped from where they see it.
        elements.primary.setAttribute("variant", "secondary");
        elements.primary.textContent = t("workbenchCancel");
        elements.primary.dataset["action"] = "cancel";
    } else if (state.state === "error") {
        elements.primary.setAttribute("variant", "primary");
        elements.primary.textContent = t("popupTryAgain");
        elements.primary.dataset["action"] = "retry";
    } else if (state.state === "welcome") {
        // The first run gets its own button: the point of the welcome state
        // is to show the user the way in, not to make them guess.
        elements.primary.setAttribute("variant", "primary");
        elements.primary.textContent = t("popupGetStarted");
        elements.primary.dataset["action"] = "onboarding";
    } else if (state.state === "unsupported") {
        // The workbench can be shown where the story is on a site it does
        // not know yet.
        elements.primary.setAttribute("variant", "secondary");
        elements.primary.textContent = t("siteSelectorOpen");
        elements.primary.dataset["action"] = "primary";
    } else if (state.state === "no-story") {
        elements.primary.setAttribute("variant", "secondary");
        elements.primary.textContent = t("popupOpenWorkbench");
        elements.primary.dataset["action"] = "primary";
    } else if (state.state === "access") {
        // The access state has its own button, so the primary action would be
        // a second way of doing the same thing. It is hidden rather than
        // disabled, so a screen reader is not offered a button that does
        // nothing. The action is still set, so that a stale "retry" from a
        // previous state cannot survive into this one.
        elements.primary.dataset["action"] = "grant-access";
        elements.primary.hidden = true;
    } else {
        elements.primary.setAttribute("variant", "primary");
        elements.primary.textContent = t("popupOpenWorkbench");
        elements.primary.dataset["action"] = "primary";
    }

    // --- The secondary actions ---
    elements.actions.hidden = state.state === "loading";
    const library = elements.actions.querySelector<HTMLElement>('[data-action="library"]');
    const workbench = elements.actions.querySelector<HTMLElement>('[data-action="workbench"]');
    if (library) {
        library.hidden =
            state.state === "no-story" ||
            state.state === "unsupported" ||
            state.state === "welcome";
    }
    // The primary button already opens the workbench in these states, so a
    // second button doing the same would only be noise.
    if (workbench) {
        workbench.hidden = ["story", "no-story", "unsupported"].includes(state.state);
    }
}
