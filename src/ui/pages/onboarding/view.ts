/**
 * The onboarding page's view.
 *
 * Three steps, and nothing else. No account, no network call, no email
 * address. The user is shown what the extension does, pointed at the sites
 * it supports, and then left alone.
 *
 * The third step applies the theme and accent **live**, so the choice is
 * made by looking at it rather than by imagining it.
 */
import { createIcon } from "../../components/icons";
import { t } from "../../i18n";

/** The onboarding steps. */
export type OnboardingStep = 0 | 1 | 2;

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
}

/** Build the onboarding page's structure. */
export function buildOnboarding(root: HTMLElement): OnboardingElements {
    root.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "onboarding-shell";

    // --- The progress dots ---
    const dots = document.createElement("div");
    dots.className = "onboarding-dots";
    dots.setAttribute("role", "presentation");

    const stepLabel = document.createElement("p");
    stepLabel.className = "onboarding-step-label";

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

    shell.appendChild(dots);
    shell.appendChild(stepLabel);
    shell.appendChild(stage);
    shell.appendChild(actions);
    shell.appendChild(skip);

    root.appendChild(shell);

    return { root, dots, stepLabel, stage, back, next, skip };
}

/**
 * Render a step.
 */
export function renderStep(
    elements: OnboardingElements,
    step: OnboardingStep,
    accent: string,
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
        elements.stage.appendChild(buildMakeItYours(accent));
    }

    // --- The actions ---
    elements.back.hidden = step === 0;
    elements.back.textContent = t("onboardingBack");
    elements.next.textContent = step === 2 ? t("onboardingFinish") : t("onboardingGetStarted");
    elements.skip.hidden = step === 2;
    elements.skip.textContent = t("onboardingSkip");
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

/** Step three: the theme and the accent. */
function buildMakeItYours(accent: string): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "onboarding-yours";

    const heading = document.createElement("h1");
    heading.className = "onboarding-title";
    heading.textContent = t("onboardingMakeItYours");

    const text = document.createElement("p");
    text.className = "onboarding-text";
    text.textContent = t("onboardingMakeItYoursText");

    // --- The theme ---
    const themeLabel = document.createElement("p");
    themeLabel.className = "onboarding-choice-label";
    themeLabel.textContent = t("optionsTheme");

    const theme = document.createElement("k-radio-group");
    theme.setAttribute("legend", t("optionsTheme"));
    theme.setAttribute("value", "system");
    theme.dataset["path"] = "appearance.theme";
    theme.addOption("light", t("optionsThemeLight"));
    theme.addOption("dark", t("optionsThemeDark"));
    theme.addOption("system", t("optionsThemeSystem"));

    // --- The accent ---
    const accentLabel = document.createElement("p");
    accentLabel.className = "onboarding-choice-label";
    accentLabel.textContent = t("optionsAccent");

    const accentGroup = document.createElement("k-radio-group");
    accentGroup.setAttribute("legend", t("optionsAccent"));
    accentGroup.setAttribute("value", accent);
    accentGroup.dataset["path"] = "appearance.accent";
    accentGroup.addOption("gold", t("optionsAccentGold"), "#d99224");
    accentGroup.addOption("ink", t("optionsAccentInk"), "#5568c4");
    accentGroup.addOption("verdigris", t("optionsAccentVerdigris"), "#359c8b");
    accentGroup.addOption("plum", t("optionsAccentPlum"), "#b0529c");

    wrapper.appendChild(heading);
    wrapper.appendChild(text);
    wrapper.appendChild(themeLabel);
    wrapper.appendChild(theme);
    wrapper.appendChild(accentLabel);
    wrapper.appendChild(accentGroup);

    return wrapper;
}
