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
import { t } from "../../i18n";

/** The states the popup can be in. */
export type PopupState =
    | "loading"
    | "story"
    | "no-story"
    | "unsupported"
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

    const wordmark = document.createElement("span");
    wordmark.className = "popup-wordmark";
    wordmark.textContent = "Kintsugi";

    const settings = document.createElement("k-button");
    settings.className = "popup-settings";
    settings.setAttribute("variant", "ghost");
    settings.setAttribute("size", "sm");
    settings.setAttribute("icon-only", "");
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
    library.setAttribute("variant", "ghost");
    library.setAttribute("size", "sm");
    library.setAttribute("icon", "book");
    library.dataset["action"] = "library";

    const workbench = document.createElement("k-button");
    workbench.className = "popup-action";
    workbench.setAttribute("variant", "ghost");
    workbench.setAttribute("size", "sm");
    workbench.setAttribute("icon", "list");
    workbench.dataset["action"] = "workbench";

    actions.appendChild(library);
    actions.appendChild(workbench);

    const body = document.createElement("div");
    body.className = "popup-body";
    body.appendChild(card);
    body.appendChild(empty);
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
        progress,
        progressLabel,
        progressBar,
        progressCount,
        primary,
        actions,
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
        state.chapterCount > 0
            ? `${state.chapterCount} ${state.chapterCount === 1 ? "chapter" : "chapters"}`
            : "";

    // --- The empty state ---
    const showEmpty = state.state === "no-story" || state.state === "unsupported";
    elements.empty.hidden = !showEmpty;
    const emptyText = elements.empty.querySelector(".popup-empty-text");
    if (emptyText) {
        emptyText.textContent =
            state.state === "unsupported"
                ? t("popupUnsupportedHost", state.hostName)
                : t("popupNoStory");
    }

    // --- The progress strip ---
    const showProgress = state.state === "running";
    elements.progress.hidden = !showProgress;
    elements.progressLabel.textContent = state.phase;
    elements.progressCount.textContent =
        state.total > 0 ? `${state.done} / ${state.total}` : "";
    // The width is driven by a custom property rather than an inline
    // `width`, so the transition animates and the layout never jumps.
    elements.progressBar.style.setProperty("--k-progress", `${state.percent}%`);

    // --- The primary action ---
    const showPrimary = state.state !== "running" && state.state !== "loading";
    elements.primary.hidden = !showPrimary;

    if (state.state === "error") {
        elements.primary.setAttribute("variant", "primary");
        elements.primary.textContent = t("popupTryAgain");
        elements.primary.dataset["action"] = "retry";
    } else if (state.state === "unsupported" || state.state === "no-story") {
        elements.primary.setAttribute("variant", "secondary");
        elements.primary.textContent = t("workbenchTryAnyway");
        elements.primary.dataset["action"] = "primary";
    } else {
        elements.primary.setAttribute("variant", "primary");
        elements.primary.textContent = t("popupOpenWorkbench");
        elements.primary.dataset["action"] = "primary";
    }

    // --- The secondary actions ---
    elements.actions.hidden = state.state === "loading";
    const library = elements.actions.querySelector<HTMLElement>('[data-action="library"]');
    const workbench = elements.actions.querySelector<HTMLElement>('[data-action="workbench"]');
    if (library) library.hidden = state.state === "no-story" || state.state === "unsupported";
    if (workbench) workbench.hidden = false;
}
