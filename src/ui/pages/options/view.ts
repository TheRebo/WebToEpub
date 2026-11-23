/**
 * The options page's view.
 *
 * A jump-list of settings groups on the left, the groups themselves on the
 * right, and a library tab that is a peer of the settings rather than another
 * group inside them.
 *
 * The whole page is built from a declarative description of the settings, so
 * adding a setting means adding one entry to `GROUPS` — not writing a
 * control, wiring it, and remembering to persist it.
 */
import { createIcon } from "../../components/icons";
import { t } from "../../i18n";

/** The settings groups. */
export type GroupId =
    | "appearance"
    | "story"
    | "epub"
    | "images"
    | "behaviour"
    | "privacy"
    | "advanced";

/** A control within a group. */
export type ControlSpec =
    | { kind: "switch"; path: string; label: string; hint?: string }
    | { kind: "text"; path: string; label: string; hint?: string; placeholder?: string }
    | { kind: "number"; path: string; label: string; hint?: string; min: number; max: number }
    | {
          kind: "select";
          path: string;
          label: string;
          hint?: string;
          options: Array<{ value: string; label: string }>;
      }
    | { kind: "theme"; path: string; label: string; hint?: string }
    | { kind: "accent"; path: string; label: string; hint?: string }
    | { kind: "density"; path: string; label: string; hint?: string };

/** A group of controls. */
export interface GroupSpec {
    /** The group's ID. */
    id: GroupId;
    /** The group's title, as a message key. */
    title: string;
    /** The group's controls. */
    controls: ControlSpec[];
}

/** The options page's elements. */
export interface OptionsElements {
    /** The page's root. */
    root: HTMLElement;
    /** The navigation list. */
    nav: HTMLElement;
    /** The content column. */
    content: HTMLElement;
    /** The library section. */
    library: HTMLElement;
    /** The site-selector section. */
    siteSelectors: HTMLElement;
    /** The search box. */
    search: HTMLInputElement;
    /** The toast host. */
    toastHost: HTMLElement;
}

/** Build the options page's structure. */
export function buildOptions(root: HTMLElement): OptionsElements {
    root.replaceChildren();

    // --- The app bar ---
    const bar = document.createElement("header");
    bar.className = "options-bar";

    const mark = document.createElement("span");
    mark.className = "options-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(createIcon("book", 20));

    const wordmark = document.createElement("span");
    wordmark.className = "options-wordmark";
    wordmark.textContent = "Kintsugi";

    const searchWrap = document.createElement("div");
    searchWrap.className = "options-search";

    const searchIcon = document.createElement("span");
    searchIcon.className = "options-search-icon";
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.appendChild(createIcon("search", 16));

    const search = document.createElement("input");
    search.type = "search";
    search.className = "options-search-input";
    search.placeholder = t("optionsSearchSettings");
    search.setAttribute("aria-label", t("optionsSearchSettings"));

    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(search);

    bar.appendChild(mark);
    bar.appendChild(wordmark);
    bar.appendChild(searchWrap);

    // --- The layout ---
    const layout = document.createElement("div");
    layout.className = "options-layout";

    const nav = document.createElement("nav");
    nav.className = "options-nav";
    nav.setAttribute("aria-label", t("optionsNavLabel"));

    const content = document.createElement("main");
    content.className = "options-content";

    layout.appendChild(nav);
    layout.appendChild(content);

    // --- The library ---
    const library = document.createElement("section");
    library.className = "options-library";
    library.id = "library";
    library.hidden = true;

    const libraryBar = document.createElement("div");
    libraryBar.className = "options-library-bar";

    const libraryTitle = document.createElement("h2");
    libraryTitle.className = "options-library-title";
    libraryTitle.textContent = t("optionsLibrary");

    const libraryActions = document.createElement("div");
    libraryActions.className = "options-library-actions";

    library.appendChild(libraryBar);
    library.appendChild(libraryActions);

    // --- The site selectors ---
    //
    // A peer of the library and the settings groups: it lists the sites the
    // user has taught Kintsugi about, so they can take one back.
    const siteSelectors = document.createElement("section");
    siteSelectors.className = "options-site-selectors";
    siteSelectors.id = "site-selectors";
    siteSelectors.hidden = true;

    const siteSelectorsBar = document.createElement("div");
    siteSelectorsBar.className = "options-library-bar";

    const siteSelectorsTitle = document.createElement("h2");
    siteSelectorsTitle.className = "options-library-title";
    siteSelectorsTitle.textContent = t("siteSelectorList");

    siteSelectorsBar.appendChild(siteSelectorsTitle);
    siteSelectors.appendChild(siteSelectorsBar);

    const toastHost = document.createElement("div");
    toastHost.className = "options-toasts";

    root.appendChild(bar);
    root.appendChild(layout);
    root.appendChild(library);
    root.appendChild(siteSelectors);
    root.appendChild(toastHost);

    return { root, nav, content, library, siteSelectors, search, toastHost };
}

/**
 * Render the navigation.
 */
export function renderNav(
    elements: OptionsElements,
    groups: GroupSpec[],
    active: GroupId | "library" | "site-selectors",
): void {
    elements.nav.replaceChildren();

    const list = document.createElement("ul");
    list.className = "options-nav-list";

    for (const group of groups) {
        const item = document.createElement("li");
        const link = document.createElement("button");
        link.type = "button";
        link.className = "options-nav-link";
        link.textContent = t(group.title);
        link.dataset["group"] = group.id;
        link.setAttribute("aria-current", group.id === active ? "true" : "false");
        item.appendChild(link);
        list.appendChild(item);
    }

    // The library is a peer of the settings, so it lives in the same nav.
    const libraryItem = document.createElement("li");
    const libraryLink = document.createElement("button");
    libraryLink.type = "button";
    libraryLink.className = "options-nav-link";
    libraryLink.textContent = t("optionsLibrary");
    libraryLink.dataset["group"] = "library";
    libraryLink.setAttribute("aria-current", active === "library" ? "true" : "false");
    libraryItem.appendChild(libraryLink);
    list.appendChild(libraryItem);

    // So are the site selectors.
    const selectorItem = document.createElement("li");
    const selectorLink = document.createElement("button");
    selectorLink.type = "button";
    selectorLink.className = "options-nav-link";
    selectorLink.textContent = t("siteSelectorList");
    selectorLink.dataset["group"] = "site-selectors";
    selectorLink.setAttribute("aria-current", active === "site-selectors" ? "true" : "false");
    selectorItem.appendChild(selectorLink);
    list.appendChild(selectorItem);

    elements.nav.appendChild(list);
}

/**
 * Render the groups.
 *
 * Only the groups that match the search are shown. A group with no matching
 * control disappears entirely rather than leaving an empty heading behind.
 */
export function renderGroups(
    elements: OptionsElements,
    groups: GroupSpec[],
    values: Record<string, unknown>,
    query: string,
): void {
    elements.content.replaceChildren();

    const needle = query.trim().toLowerCase();
    let rendered = 0;

    for (const group of groups) {
        const controls = needle
            ? group.controls.filter(
                  (control) =>
                      matches(control, needle) || t(group.title).toLowerCase().includes(needle),
              )
            : group.controls;

        if (controls.length === 0) continue;

        const section = document.createElement("section");
        section.className = "options-group";
        section.id = `group-${group.id}`;
        section.dataset["group"] = group.id;

        const heading = document.createElement("h2");
        heading.className = "options-group-title";
        heading.textContent = t(group.title);
        section.appendChild(heading);

        const body = document.createElement("div");
        body.className = "options-group-body";

        for (const control of controls) {
            const row = document.createElement("div");
            row.className = "options-row";
            row.dataset["path"] = control.path;

            switch (control.kind) {
                case "switch": {
                    const toggle = document.createElement("k-switch");
                    toggle.setAttribute("label", t(control.label));
                    if (values[control.path] === true) toggle.setAttribute("checked", "");
                    row.appendChild(toggle);
                    break;
                }
                case "text": {
                    const field = document.createElement("k-field");
                    field.setAttribute("label", t(control.label));
                    field.setAttribute("type", "text");
                    field.setAttribute("value", String(values[control.path] ?? ""));
                    if (control.placeholder) field.setAttribute("placeholder", control.placeholder);
                    if (control.hint) field.setAttribute("hint", t(control.hint));
                    row.appendChild(field);
                    break;
                }
                case "number": {
                    const field = document.createElement("k-field");
                    field.setAttribute("label", t(control.label));
                    field.setAttribute("type", "number");
                    field.setAttribute("value", String(values[control.path] ?? ""));
                    field.setAttribute("min", String(control.min));
                    field.setAttribute("max", String(control.max));
                    if (control.hint) field.setAttribute("hint", t(control.hint));
                    row.appendChild(field);
                    break;
                }
                case "select": {
                    const field = document.createElement("k-field");
                    field.setAttribute("label", t(control.label));
                    field.setAttribute("type", "select");
                    field.setAttribute("value", String(values[control.path] ?? ""));
                    if (control.hint) field.setAttribute("hint", t(control.hint));
                    for (const option of control.options) {
                        const element = document.createElement("option");
                        element.value = option.value;
                        element.textContent = option.label;
                        field.appendChild(element);
                    }
                    row.appendChild(field);
                    break;
                }
                case "theme":
                case "accent":
                case "density": {
                    const field = document.createElement("k-field");
                    field.setAttribute("label", t(control.label));
                    if (control.hint) field.setAttribute("hint", t(control.hint));
                    row.appendChild(field);
                    row.appendChild(buildChoice(control, String(values[control.path] ?? "")));
                    break;
                }
            }

            body.appendChild(row);
        }

        section.appendChild(body);
        elements.content.appendChild(section);
        rendered += 1;
    }

    if (rendered === 0) {
        const empty = document.createElement("p");
        empty.className = "options-no-results";
        empty.textContent = t("optionsNoResults");
        elements.content.appendChild(empty);
    }
}

/**
 * Build the segmented control for a theme, accent, or density choice.
 */
function buildChoice(control: ControlSpec, value: string): HTMLElement {
    const group = document.createElement("k-radio-group");
    group.setAttribute("value", value);
    group.dataset["path"] = control.path;

    if (control.kind === "theme") {
        group.setAttribute("legend", t(control.label));
        group.addOption("light", t("optionsThemeLight"));
        group.addOption("dark", t("optionsThemeDark"));
        group.addOption("system", t("optionsThemeSystem"));
    } else if (control.kind === "accent") {
        group.setAttribute("legend", t(control.label));
        // The swatches show the *other* accents, so the picker cannot be
        // rendered with `var(--accent-500)` for every row: the current
        // accent would make all four swatches look the same.
        group.addOption("gold", t("optionsAccentGold"), "#d99224");
        group.addOption("ink", t("optionsAccentInk"), "#5568c4");
        group.addOption("verdigris", t("optionsAccentVerdigris"), "#359c8b");
        group.addOption("plum", t("optionsAccentPlum"), "#b0529c");
    } else {
        group.setAttribute("legend", t(control.label));
        group.addOption("comfortable", t("optionsDensityComfortable"));
        group.addOption("compact", t("optionsDensityCompact"));
    }

    return group;
}

/**
 * Whether a control matches a search needle.
 *
 * The comparison is against the *translated* label and hint, so searching
 * works in the user's own language rather than only in English.
 */
function matches(control: ControlSpec, needle: string): boolean {
    if (t(control.label).toLowerCase().includes(needle)) return true;
    if (control.hint && t(control.hint).toLowerCase().includes(needle)) return true;
    if (control.kind === "select") {
        return control.options.some((option) => option.label.toLowerCase().includes(needle));
    }
    return false;
}

/**
 * Render the library.
 */
export function renderLibrary(
    elements: OptionsElements,
    entries: Array<{
        id: string;
        title: string;
        author?: string;
        chapterCount: number;
        size: number;
        updatedAt: number;
    }>,
): void {
    const container = elements.library.querySelector(".options-library-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-library-body";

    if (entries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "options-library-empty";

        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.className = "options-library-empty-icon";
        icon.appendChild(createIcon("book", 40));

        const heading = document.createElement("p");
        heading.className = "options-library-empty-title";
        heading.textContent = t("optionsLibraryEmptyTitle");

        const text = document.createElement("p");
        text.className = "options-library-empty-text";
        text.textContent = t("optionsLibraryEmptyText");

        empty.appendChild(icon);
        empty.appendChild(heading);
        empty.appendChild(text);
        body.appendChild(empty);
    } else {
        const grid = document.createElement("div");
        grid.className = "options-library-grid";

        for (const entry of entries) {
            const card = document.createElement("article");
            card.className = "options-library-card";
            card.dataset["id"] = entry.id;

            const cover = document.createElement("div");
            cover.className = "options-library-cover";
            cover.setAttribute("aria-hidden", "true");
            cover.appendChild(createIcon("book", 28));

            const title = document.createElement("p");
            title.className = "options-library-title-text";
            title.textContent = entry.title;

            const author = document.createElement("p");
            author.className = "options-library-author";
            author.textContent = entry.author ?? "";

            const meta = document.createElement("p");
            meta.className = "options-library-meta";
            meta.textContent = t("optionsLibraryMeta", [
                String(entry.chapterCount),
                formatBytes(entry.size),
            ]);

            card.appendChild(cover);
            card.appendChild(title);
            card.appendChild(author);
            card.appendChild(meta);
            grid.appendChild(card);
        }

        body.appendChild(grid);
    }

    elements.library.appendChild(body);
}

/**
 * Render the site-selector list.
 *
 * Each entry is a host name the user has taught Kintsugi about. The Forget
 * button emits a `k-forget` event on the container, so the controller can do
 * the work without the view knowing about the message bus.
 */
export function renderSiteSelectors(
    elements: OptionsElements,
    entries: Array<{
        hostname: string;
        contentCss: string;
        titleCss: string;
        removeCss: string;
    }>,
): void {
    const container = elements.siteSelectors.querySelector(".options-site-selectors-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-site-selectors-body";

    if (entries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "options-library-empty";

        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.className = "options-library-empty-icon";
        icon.appendChild(createIcon("search", 40));

        const heading = document.createElement("p");
        heading.className = "options-library-empty-title";
        heading.textContent = t("siteSelectorListEmpty");

        empty.append(icon, heading);
        body.appendChild(empty);
    } else {
        const list = document.createElement("ul");
        list.className = "options-site-selectors-list";

        for (const entry of entries) {
            const item = document.createElement("li");
            item.className = "options-site-selectors-item";

            const name = document.createElement("span");
            name.className = "options-site-selectors-host";
            name.textContent = entry.hostname;

            const detail = document.createElement("span");
            detail.className = "options-site-selectors-css";
            detail.textContent = entry.contentCss;

            const forget = document.createElement("k-button");
            forget.setAttribute("variant", "ghost");
            forget.setAttribute("size", "sm");
            forget.textContent = t("siteSelectorForget");
            forget.dataset["hostname"] = entry.hostname;

            item.append(name, detail, forget);
            list.appendChild(item);
        }

        body.appendChild(list);
    }

    elements.siteSelectors.appendChild(body);
}

/** A human-readable file size. */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
