/**
 * The onboarding page's view.
 *
 * Three steps, and nothing else. No account, no network call, no email
 * address. The user is shown what the extension does, pointed at the sites
 * it supports, and then left alone.
 *
 * The third step applies the theme, the accent, the density and the motion
 * preference **live**, so the choice is made by looking at it rather than by
 * imagining it.
 *
 * The appearance choices are native radio inputs in the light DOM, each with a
 * real `<label for>`. A component would have hidden them behind a shadow root,
 * where a light-DOM label cannot reach them; here the label *is* the control's
 * label, so clicking the text selects the option and a screen reader announces
 * the option's name.
 */
import { createIcon } from "../../components/icons";
import { t, tDynamic } from "../../i18n";
import type { AppearanceSettings } from "../../../core/storage/settings-store";

/** The onboarding steps. */
export type OnboardingStep = 0 | 1 | 2;

/**
 * The appearance settings the onboarding shows, and edits.
 *
 * The same shape the settings store holds, so the values the onboarding reads
 * and writes are the values the rest of the extension uses.
 */
export type OnboardingAppearance = AppearanceSettings;

/** The onboarding page's elements. */
export interface OnboardingElements {
    /** The page's root. */
    root: HTMLElement;
    /** The step indicator. */
    dots: HTMLElement;
    /** The step label. */
    stepLabel: HTMLElement;
    /** The step's content. */
    stage: HTMLElement;
    /** The back button. */
    back: HTMLElement;
    /** The next button. */
    next: HTMLElement;
    /** The skip button. */
    skip: HTMLElement;
    /** The status region, where the loading and error states live. */
    status: HTMLElement;
    /** Where the toasts are shown. */
    toastHost: HTMLElement;
}

/** Build the onboarding page's structure. */
export function buildOnboarding(root: HTMLElement): OnboardingElements {
    root.replaceChildren();

    const shell = document.createElement("main");
    shell.className = "onboarding-shell";

    // --- The progress dots ---
    const dots = document.createElement("div");
    dots.className = "onboarding-dots";
    dots.setAttribute("role", "presentation");

    const stepLabel = document.createElement("p");
    stepLabel.className = "onboarding-step-label";
    // The label is set before anything is read, so the page is never left
    // with an empty heading while the settings are loading.
    stepLabel.textContent = t("onboardingStep1");

    // --- The status region ---
    //
    // It sits above the stage: it is what the page shows while the stored
    // settings are being read, and what it shows when they cannot be.
    const status = document.createElement("div");
    status.className = "onboarding-status";
    status.hidden = true;

    // --- The stage ---
    const stage = document.createElement("div");
    stage.className = "onboarding-stage";

    // --- The actions ---
    const actions = document.createElement("div");
    actions.className = "onboarding-actions";

    const back = document.createElement("k-button");
    back.setAttribute("variant", "ghost");
    back.dataset["action"] = "back";

    const next = document.createElement("k-button");
    next.setAttribute("variant", "primary");
    next.setAttribute("size", "lg");
    next.dataset["action"] = "next";

    actions.appendChild(back);
    actions.appendChild(next);

    const skip = document.createElement("k-button");
    skip.setAttribute("variant", "ghost");
    skip.setAttribute("size", "sm");
    skip.className = "onboarding-skip";
    skip.dataset["action"] = "skip";

    // --- The toast host ---
    const toastHost = document.createElement("div");
    toastHost.className = "onboarding-toasts";

    shell.appendChild(dots);
    shell.appendChild(stepLabel);
    shell.appendChild(status);
    shell.appendChild(stage);
    shell.appendChild(actions);
    shell.appendChild(skip);

    root.appendChild(shell);
    root.appendChild(toastHost);

    return { root, dots, stepLabel, stage, back, next, skip, status, toastHost };
}

/**
 * Render a step.
 *
 * @param elements The page's elements.
 * @param step The step to show.
 * @param appearance The appearance settings, as they are stored.
 */
export function renderStep(
    elements: OnboardingElements,
    step: OnboardingStep,
    appearance: OnboardingAppearance,
): void {
    // --- The dots ---
    elements.dots.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
        const dot = document.createElement("span");
        dot.className = "onboarding-dot";
        if (index < step) dot.classList.add("is-done");
        if (index === step) dot.classList.add("is-current");
        elements.dots.appendChild(dot);
    }

    elements.stepLabel.textContent = t(
        step === 0 ? "onboardingStep1" : step === 1 ? "onboardingStep2" : "onboardingStep3",
    );

    // --- The stage ---
    elements.stage.replaceChildren();
    elements.stage.dataset["step"] = String(step);

    if (step === 0) {
        elements.stage.appendChild(buildWelcome());
    } else if (step === 1) {
        elements.stage.appendChild(buildSites());
    } else {
        elements.stage.appendChild(buildMakeItYours(appearance));
    }

    // --- The actions ---
    elements.back.hidden = step === 0;
    elements.back.textContent = t("onboardingBack");
    // Each step's button says where it leads, so the three are not the same
    // two words over and over.
    elements.next.textContent =
        step === 0
            ? t("onboardingNextSites")
            : step === 1
              ? t("onboardingNextLook")
              : t("onboardingFinish");
    elements.skip.hidden = step === 2;
    elements.skip.textContent = t("onboardingSkip");
}

/**
 * Show the status region: nothing, a loading state, or an error state.
 *
 * @param elements The page's elements.
 * @param state The state to show.
 * @param message The error message, when the state is an error.
 */
export function renderStatus(
    elements: OnboardingElements,
    state: "ready" | "loading" | "error",
    message?: string,
): void {
    const status = elements.status;
    status.replaceChildren();

    // While the settings are being read, or when they cannot be read, the
    // steps' actions are hidden: they would have nothing to act on, and a
    // "Next" button that does nothing is worse than no button at all. The
    // ready state restores them, and `renderStep` sets their exact visibility.
    const busy = state !== "ready";
    elements.back.hidden = busy;
    elements.next.hidden = busy;
    elements.skip.hidden = busy;

    if (state === "ready") {
        status.hidden = true;
        status.removeAttribute("role");
        status.removeAttribute("aria-busy");
        return;
    }

    status.hidden = false;
    status.setAttribute("role", state === "error" ? "alert" : "status");
    status.setAttribute("aria-busy", state === "loading" ? "true" : "false");

    const panel = document.createElement("div");
    panel.className = `onboarding-status-panel onboarding-status-panel--${state}`;

    if (state === "loading") {
        const label = document.createElement("p");
        label.className = "onboarding-status-label";
        label.textContent = t("phasePreparing");
        panel.appendChild(label);

        for (const width of ["100%", "88%"]) {
            const skeleton = document.createElement("k-skeleton");
            skeleton.setAttribute("height", "14px");
            skeleton.setAttribute("width", width);
            skeleton.setAttribute("radius", "4px");
            panel.appendChild(skeleton);
        }
    } else {
        const heading = document.createElement("p");
        heading.className = "onboarding-status-title";
        heading.textContent = t("errorGeneric");

        const text = document.createElement("p");
        text.className = "onboarding-status-text";
        text.textContent = message ?? "";

        const actions = document.createElement("div");
        actions.className = "onboarding-status-actions";

        const retry = document.createElement("k-button");
        retry.setAttribute("variant", "primary");
        retry.setAttribute("size", "sm");
        retry.setAttribute("label", t("popupTryAgain"));
        retry.dataset["action"] = "retry";

        actions.appendChild(retry);
        panel.appendChild(heading);
        panel.appendChild(text);
        panel.appendChild(actions);
    }

    status.appendChild(panel);
}

/**
 * Update the live preview, so that it shows the settings the user has chosen.
 *
 * The preview used to have a density and a motion setting of its own, which
 * meant it showed something the user was not going to get. It now follows the
 * same values as the rest of the page.
 *
 * @param root The element that holds the preview.
 * @param appearance The appearance settings.
 */
export function updatePreview(root: HTMLElement, appearance: OnboardingAppearance): void {
    const preview = root.querySelector<HTMLElement>(".onboarding-preview");
    if (!preview) return;

    preview.dataset["density"] = appearance.density;
    preview.dataset["reduceMotion"] = String(appearance.reduceMotion);
}

/** Step one: the welcome. */
function buildWelcome(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "onboarding-welcome";

    const mark = document.createElement("div");
    mark.className = "onboarding-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(createIcon("book", 56));

    const heading = document.createElement("h1");
    heading.className = "onboarding-title";
    heading.textContent = t("onboardingWelcome");

    const text = document.createElement("p");
    text.className = "onboarding-text";
    text.textContent = t("onboardingWelcomeText");

    const footnote = document.createElement("p");
    footnote.className = "onboarding-footnote";
    footnote.textContent = t("onboardingWelcomeFootnote");

    wrapper.appendChild(mark);
    wrapper.appendChild(heading);
    wrapper.appendChild(text);
    wrapper.appendChild(footnote);

    return wrapper;
}

/** Step two: the supported sites. */
function buildSites(): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "onboarding-sites";

    const heading = document.createElement("h1");
    heading.className = "onboarding-title";
    heading.textContent = t("onboardingWhichSite");

    const text = document.createElement("p");
    text.className = "onboarding-text";
    text.textContent = t("onboardingWhichSiteText");

    const list = document.createElement("ul");
    list.className = "onboarding-site-list";

    const sites: Array<[string, string]> = [
        ["Royal Road", "royalroad.com"],
        ["Scribble Hub", "scribblehub.com"],
        ["Novel Updates", "novelupdates.com"],
        ["Webnovel", "webnovel.com"],
    ];

    for (const [name, host] of sites) {
        const item = document.createElement("li");
        item.className = "onboarding-site";

        const siteName = document.createElement("span");
        siteName.className = "onboarding-site-name";
        siteName.textContent = name;

        const siteHost = document.createElement("span");
        siteHost.className = "onboarding-site-host";
        siteHost.textContent = host;

        item.appendChild(siteName);
        item.appendChild(siteHost);
        list.appendChild(item);
    }

    const footnote = document.createElement("p");
    footnote.className = "onboarding-footnote";
    footnote.textContent = t("onboardingWhichSiteFootnote");

    wrapper.appendChild(heading);
    wrapper.appendChild(text);
    wrapper.appendChild(list);
    wrapper.appendChild(footnote);

    return wrapper;
}

/**
 * Step three: how the extension should look.
 *
 * Every control starts from the *stored* value, so a user who has already
 * chosen a dark theme is not asked to choose it again.
 */
function buildMakeItYours(appearance: OnboardingAppearance): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "onboarding-yours";

    const heading = document.createElement("h1");
    heading.className = "onboarding-title";
    heading.textContent = t("onboardingMakeItYours");

    const text = document.createElement("p");
    text.className = "onboarding-text";
    text.textContent = t("onboardingMakeItYoursText");

    wrapper.appendChild(heading);
    wrapper.appendChild(text);

    // --- The theme ---
    wrapper.appendChild(
        buildChoice({
            id: "theme",
            label: "optionsTheme",
            value: appearance.theme,
            options: [
                ["light", "optionsThemeLight"],
                ["dark", "optionsThemeDark"],
                ["system", "optionsThemeSystem"],
            ],
        }),
    );

    // --- The accent ---
    wrapper.appendChild(
        buildChoice({
            id: "accent",
            label: "optionsAccent",
            value: appearance.accent,
            options: [
                ["gold", "optionsAccentGold"],
                ["ink", "optionsAccentInk"],
                ["verdigris", "optionsAccentVerdigris"],
                ["plum", "optionsAccentPlum"],
            ],
            swatches: {
                gold: "var(--swatch-gold)",
                ink: "var(--swatch-ink)",
                verdigris: "var(--swatch-verdigris)",
                plum: "var(--swatch-plum)",
            },
        }),
    );

    // --- The density ---
    wrapper.appendChild(
        buildChoice({
            id: "density",
            label: "optionsDensity",
            value: appearance.density,
            options: [
                ["comfortable", "optionsDensityComfortable"],
                ["compact", "optionsDensityCompact"],
            ],
        }),
    );

    // --- Reduce motion ---
    wrapper.appendChild(
        buildMotion({
            id: "reduceMotion",
            label: "settingReduceMotion",
            hint: "settingReduceMotionHint",
            value: appearance.reduceMotion,
        }),
    );

    // --- The live preview ---
    wrapper.appendChild(buildPreview());

    // The preview starts from the stored values, so it shows what the user
    // already has rather than a default.
    updatePreview(wrapper, appearance);

    return wrapper;
}

/** A choice within the appearance step. */
interface ChoiceSpec {
    /** The choice's ID, which is also the settings path's last segment. */
    id: string;
    /** The label's message key. */
    label: string;
    /** The stored value. */
    value: string;
    /** The options, as value and message key. */
    options: Array<[string, string]>;
    /** The swatch colours, for the accent picker. */
    swatches?: Record<string, string>;
}

/**
 * Build one of the appearance choices.
 *
 * The group is a `<fieldset>` with a `<legend>`, so it has an accessible
 * name, and every option is a native radio with a `<label for>` bound to it.
 * The labels are therefore real labels: clicking the text selects the option,
 * and a screen reader announces the option's name.
 */
function buildChoice(spec: ChoiceSpec): HTMLElement {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "onboarding-choice";

    const legend = document.createElement("legend");
    legend.className = "onboarding-choice-legend";
    legend.textContent = tDynamic(spec.label);
    fieldset.appendChild(legend);

    const options = document.createElement("div");
    options.className = "onboarding-options";

    const name = `onboarding-${spec.id}`;

    for (const [value, key] of spec.options) {
        const id = `onboarding-${spec.id}-${value}`;

        const input = document.createElement("input");
        input.type = "radio";
        input.id = id;
        input.name = name;
        input.value = value;
        input.checked = value === spec.value;
        input.dataset["path"] = `appearance.${spec.id}`;

        const label = document.createElement("label");
        label.className = "onboarding-option-label";
        label.htmlFor = id;

        const swatch = spec.swatches?.[value];
        if (swatch) {
            const dot = document.createElement("span");
            dot.className = "onboarding-swatch";
            dot.setAttribute("aria-hidden", "true");
            dot.style.backgroundColor = swatch;
            label.appendChild(dot);
        }

        const text = document.createElement("span");
        text.className = "onboarding-option-text";
        text.textContent = tDynamic(key);
        label.appendChild(text);

        options.appendChild(input);
        options.appendChild(label);
    }

    fieldset.appendChild(options);

    return fieldset;
}

/**
 * Build the reduce-motion switch.
 *
 * The switch's own `label` attribute is what names it — the text is rendered
 * inside the component's shadow root, and the control is wrapped in that
 * label, so the accessible name and the visible text are the same thing. A
 * light-DOM `aria-labelledby` would not resolve inside the shadow root.
 */
function buildMotion(spec: {
    id: string;
    label: string;
    hint: string;
    value: boolean;
}): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "onboarding-choice onboarding-choice--motion";

    const toggle = document.createElement("k-switch");
    toggle.setAttribute("label", tDynamic(spec.label));
    toggle.dataset["path"] = `appearance.${spec.id}`;
    if (spec.value) toggle.setAttribute("checked", "");

    const hint = document.createElement("p");
    hint.className = "onboarding-choice-hint";
    hint.textContent = tDynamic(spec.hint);

    wrapper.appendChild(toggle);
    wrapper.appendChild(hint);

    return wrapper;
}

/**
 * Build the live preview.
 *
 * The preview is a miniature of the extension's own layout, so the density and
 * the motion preference can be judged by looking at them. It is decorative:
 * the controls above it are what the user actually chooses, so the preview is
 * hidden from assistive technology.
 */
function buildPreview(): HTMLElement {
    const preview = document.createElement("div");
    preview.className = "onboarding-preview";
    preview.setAttribute("aria-hidden", "true");

    const caption = document.createElement("p");
    caption.className = "onboarding-preview-caption";
    caption.textContent = t("optionsAppearance");
    preview.appendChild(caption);

    const panel = document.createElement("div");
    panel.className = "onboarding-preview-panel";

    for (const width of ["92%", "76%", "84%"]) {
        const row = document.createElement("span");
        row.className = "onboarding-preview-row";
        row.style.width = width;
        panel.appendChild(row);
    }

    const chip = document.createElement("span");
    chip.className = "onboarding-preview-chip";
    panel.appendChild(chip);

    const pulse = document.createElement("span");
    pulse.className = "onboarding-preview-pulse";
    panel.appendChild(pulse);

    preview.appendChild(panel);

    return preview;
}
