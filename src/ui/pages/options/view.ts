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
 *
 * The page is built **once**. The navigation is a tab list whose panels are
 * the settings groups, so choosing a group shows that group and hides the
 * rest. Because nothing is torn down and rebuilt, a setting the user is
 * halfway through typing survives every re-render, along with the caret and
 * the focus.
 */
import { createIcon } from "../../components/icons";
import { displayHost } from "../../../core/host-access";
import { t, tDynamic } from "../../i18n";

/** The settings groups. */
export type GroupId = "appearance" | "story" | "epub" | "images" | "behaviour" | "advanced";

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

/**
 * An action a group can offer, alongside its settings.
 *
 * The actions are the ones that are not a setting: they do something to the
 * settings rather than change one.
 */
export interface ActionSpec {
    /** The action's ID, used to recognise it when it is triggered. */
    id: string;
    /** Whether the action opens a file picker. */
    kind: "button" | "file";
    /** The action's label, as a message key. */
    label: string;
}

/** A group of controls. */
export interface GroupSpec {
    /** The group's ID. */
    id: GroupId;
    /** The group's title, as a message key. */
    title: string;
    /** The group's controls. */
    controls: ControlSpec[];
    /** The group's actions, if it has any. */
    actions?: ActionSpec[];
}

/**
 * What the navigation can select.
 *
 * The library and the site selectors are peers of the settings rather than
 * groups inside them, so they are navigable in the same way.
 */
export type NavTarget = GroupId | "library" | "site-selectors" | "site-access";

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
    /** The site-access section. */
    siteAccess: HTMLElement;
    /** The search box. */
    search: HTMLInputElement;
    /** The toast host. */
    toastHost: HTMLElement;
    /** The status region, where the loading and error states live. */
    status: HTMLElement;
    /** The "nothing matches that search" message. */
    noResults: HTMLElement;
    /** The navigation's buttons, by target. */
    navButtons: Map<string, HTMLButtonElement>;
    /** The settings groups' panels, by group ID. */
    sections: Map<string, HTMLElement>;
    /** The rows, by settings path. */
    rows: Map<string, HTMLElement>;
    /** The control of each row, by settings path. */
    controls: Map<string, HTMLElement>;
    /**
     * The element that holds each control's value, by settings path.
     *
     * This is the control itself for a switch or a field, and the segmented
     * choice for a theme, an accent or a density — the row shows a label and a
     * choice, and only the choice carries the value.
     */
    valueHosts: Map<string, HTMLElement>;
    /** The specification of each row, by settings path. */
    specs: Map<string, ControlSpec>;
    /** The action buttons, by action ID. */
    actions: Map<string, HTMLElement>;
    /** The file inputs, by action ID. */
    files: Map<string, HTMLInputElement>;
    /** The dialog that asks before the settings are reset. */
    resetDialog: HTMLElement;
    /** The dialog's "yes" button. */
    resetConfirm: HTMLElement;
    /** The dialog's "no" button. */
    resetCancel: HTMLElement;
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

    // The status region sits inside the content column: it is what the page
    // shows while the settings are being read, and what it shows when they
    // cannot be read.
    const status = document.createElement("div");
    status.className = "options-status";
    status.hidden = true;

    // The "nothing matches" message lives at the end of the content column,
    // so it appears below the groups rather than above them.
    const noResults = document.createElement("p");
    noResults.className = "options-no-results";
    noResults.textContent = t("optionsNoResults");
    noResults.hidden = true;

    // The privacy note lives at the foot of the settings column, below every
    // group. It is a standing statement rather than a setting, and it is the
    // last thing the user reads.
    const privacyNote = document.createElement("p");
    privacyNote.className = "options-privacy-note";
    privacyNote.textContent = t("optionsPrivacyNote");

    content.appendChild(status);
    content.appendChild(noResults);
    content.appendChild(privacyNote);

    layout.appendChild(nav);
    layout.appendChild(content);

    // --- The library ---
    const library = document.createElement("section");
    library.className = "options-library";
    library.id = "library";
    library.setAttribute("role", "tabpanel");
    library.setAttribute("aria-labelledby", "options-tab-library");
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
    siteSelectors.setAttribute("role", "tabpanel");
    siteSelectors.setAttribute("aria-labelledby", "options-tab-site-selectors");
    siteSelectors.hidden = true;

    const siteSelectorsBar = document.createElement("div");
    siteSelectorsBar.className = "options-library-bar";

    const siteSelectorsTitle = document.createElement("h2");
    siteSelectorsTitle.className = "options-library-title";
    siteSelectorsTitle.textContent = t("siteSelectorList");

    siteSelectorsBar.appendChild(siteSelectorsTitle);
    siteSelectors.appendChild(siteSelectorsBar);

    // --- The site access ---
    //
    // The list of sites the extension has been allowed to read. It is the one
    // place the user can see — and take back — what the extension can reach.
    const siteAccess = document.createElement("section");
    siteAccess.className = "options-site-access";
    siteAccess.id = "site-access";
    siteAccess.setAttribute("role", "tabpanel");
    siteAccess.setAttribute("aria-labelledby", "options-tab-site-access");
    siteAccess.hidden = true;

    const siteAccessBar = document.createElement("div");
    siteAccessBar.className = "options-library-bar";

    const siteAccessTitle = document.createElement("h2");
    siteAccessTitle.className = "options-library-title";
    siteAccessTitle.textContent = t("optionsSiteAccess");

    const siteAccessHint = document.createElement("p");
    siteAccessHint.className = "options-site-access-hint";
    siteAccessHint.textContent = t("optionsSiteAccessHint");

    const siteAccessActions = document.createElement("div");
    siteAccessActions.className = "options-library-actions";

    const revokeAll = document.createElement("k-button");
    revokeAll.setAttribute("variant", "ghost");
    revokeAll.setAttribute("size", "sm");
    revokeAll.textContent = t("optionsRevokeAll");
    revokeAll.dataset["action"] = "revoke-all-access";
    siteAccessActions.appendChild(revokeAll);

    siteAccessBar.append(siteAccessTitle, siteAccessActions);
    siteAccess.append(siteAccessBar, siteAccessHint);

    const toastHost = document.createElement("div");
    toastHost.className = "options-toasts";

    // --- The reset dialog ---
    //
    // Resetting throws away every preference the user has set, so it asks
    // first. The dialog is built once and opened by the controller.
    const resetDialog = document.createElement("k-dialog");
    resetDialog.setAttribute("heading", t("optionsResetAll"));
    resetDialog.setAttribute("size", "sm");

    const resetBody = document.createElement("p");
    resetBody.className = "options-dialog-body";
    resetBody.textContent = t("optionsResetConfirm");
    resetDialog.appendChild(resetBody);

    const resetFooter = document.createElement("div");
    resetFooter.setAttribute("slot", "footer");
    resetFooter.className = "options-dialog-footer";

    const resetCancel = document.createElement("k-button");
    resetCancel.setAttribute("variant", "ghost");
    resetCancel.setAttribute("label", t("commonCancel"));

    const resetConfirm = document.createElement("k-button");
    resetConfirm.setAttribute("variant", "danger");
    resetConfirm.setAttribute("label", t("optionsResetConfirmAction"));

    resetFooter.append(resetCancel, resetConfirm);
    resetDialog.appendChild(resetFooter);

    root.appendChild(bar);
    root.appendChild(layout);
    root.appendChild(library);
    root.appendChild(siteSelectors);
    root.appendChild(siteAccess);
    root.appendChild(resetDialog);
    root.appendChild(toastHost);

    return {
        root,
        nav,
        content,
        library,
        siteSelectors,
        siteAccess,
        search,
        toastHost,
        status,
        noResults,
        navButtons: new Map(),
        sections: new Map(),
        rows: new Map(),
        controls: new Map(),
        valueHosts: new Map(),
        specs: new Map(),
        actions: new Map(),
        files: new Map(),
        resetDialog,
        resetConfirm,
        resetCancel,
    };
}

/**
 * Build the navigation.
 *
 * The navigation is built once and never rebuilt: a re-render that removed
 * the button the user had just pressed would throw their focus back to the
 * top of the document. After the first build, this only updates the
 * selection state.
 *
 * @param elements The page's elements.
 * @param groups The settings groups.
 */
export function renderNav(elements: OptionsElements, groups: GroupSpec[]): void {
    // The navigation is built once. A later call is not a rebuild: the
    // selection state is the controller's business, and forcing it here
    // would fight with it.
    if (elements.navButtons.size > 0) return;

    const list = document.createElement("ul");
    list.className = "options-nav-list";
    list.setAttribute("role", "tablist");
    list.setAttribute("aria-label", t("optionsNavLabel"));

    const targets: Array<{ id: NavTarget; title: string; panel: string }> = groups.map((group) => ({
        id: group.id,
        title: tDynamic(group.title),
        panel: `group-${group.id}`,
    }));

    // The library is a peer of the settings, so it lives in the same nav.
    targets.push({ id: "library", title: t("optionsLibrary"), panel: "library" });

    // So are the site selectors.
    targets.push({
        id: "site-selectors",
        title: t("siteSelectorList"),
        panel: "site-selectors",
    });

    // And the list of sites the extension has been allowed to read.
    targets.push({
        id: "site-access",
        title: t("optionsSiteAccess"),
        panel: "site-access",
    });

    for (const target of targets) {
        const item = document.createElement("li");
        item.setAttribute("role", "presentation");

        const link = document.createElement("button");
        link.type = "button";
        link.className = "options-nav-link";
        link.textContent = target.title;
        link.id = `options-tab-${target.id}`;
        link.dataset["group"] = target.id;
        link.setAttribute("role", "tab");
        link.setAttribute("aria-controls", target.panel);
        link.setAttribute("aria-selected", "false");
        link.tabIndex = -1;

        item.appendChild(link);
        list.appendChild(item);
        elements.navButtons.set(target.id, link);
    }

    elements.nav.appendChild(list);
    list.addEventListener("keydown", (event) => onNavKeydown(elements, event));
}

/**
 * Update the navigation's selection state.
 *
 * Only the attributes change: the buttons themselves are never replaced, so
 * the button the user pressed keeps the focus.
 *
 * @param elements The page's elements.
 * @param active The selected target.
 */
export function updateNav(elements: OptionsElements, active: NavTarget): void {
    for (const [id, button] of elements.navButtons) {
        const selected = id === active;
        button.setAttribute("aria-selected", selected ? "true" : "false");
        // `aria-current` mirrors the selection for anything that looks for it;
        // the tab list's own state is `aria-selected`.
        if (selected) button.setAttribute("aria-current", "true");
        else button.removeAttribute("aria-current");
        button.tabIndex = selected ? 0 : -1;
    }
}

/**
 * Move the selection with the keyboard.
 *
 * The navigation is a tab list, so the arrow keys move between the tabs and
 * Home and End jump to the ends. Moving the focus also selects the tab, which
 * is what a tab list is expected to do.
 *
 * @param elements The page's elements.
 * @param event The key event.
 */
function onNavKeydown(elements: OptionsElements, event: KeyboardEvent): void {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;

    const buttons = [...elements.navButtons.values()];
    const current = buttons.findIndex((button) => button === document.activeElement);
    if (current < 0) return;

    event.preventDefault();

    let next = current;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        next = (current + 1) % buttons.length;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        next = (current - 1 + buttons.length) % buttons.length;
    } else if (event.key === "Home") {
        next = 0;
    } else {
        next = buttons.length - 1;
    }

    const button = buttons[next];
    if (!button) return;
    button.focus();
    button.click();
}

/**
 * Build the settings groups.
 *
 * Each group is a panel of the navigation's tab list. The panels are built
 * once and then shown or hidden, so the controls inside them keep their
 * values — and their focus — whatever happens elsewhere on the page.
 *
 * @param elements The page's elements.
 * @param groups The settings groups.
 * @param values The settings, as a map of dotted paths.
 */
export function renderGroups(
    elements: OptionsElements,
    groups: GroupSpec[],
    values: Record<string, unknown>,
): void {
    if (elements.sections.size > 0) return;

    for (const group of groups) {
        const section = document.createElement("section");
        section.className = "options-group";
        section.id = `group-${group.id}`;
        section.dataset["group"] = group.id;
        section.setAttribute("role", "tabpanel");
        section.setAttribute("aria-labelledby", `options-tab-${group.id}`);

        const heading = document.createElement("h2");
        heading.className = "options-group-title";
        heading.textContent = tDynamic(group.title);
        section.appendChild(heading);

        const body = document.createElement("div");
        body.className = "options-group-body";

        for (const control of group.controls) {
            const row = document.createElement("div");
            row.className = "options-row";
            row.dataset["path"] = control.path;

            const built = buildControl(control, values[control.path]);
            row.appendChild(built.element);

            body.appendChild(row);
            elements.rows.set(control.path, row);
            elements.controls.set(control.path, built.element);
            elements.valueHosts.set(control.path, built.valueHost ?? built.element);
            elements.specs.set(control.path, control);
        }

        section.appendChild(body);

        // The actions live at the bottom of the group, separated from the
        // settings by a rule: they are the things the user *does* to the
        // settings, not the settings themselves.
        if (group.actions && group.actions.length > 0) {
            section.appendChild(buildActions(group, elements));
        }

        // The groups go before the "nothing matches" message, so that the
        // message sits at the bottom of the column.
        elements.content.insertBefore(section, elements.noResults);
        elements.sections.set(group.id, section);
    }
}

/**
 * Build a group's actions.
 *
 * @param group The group.
 * @param elements The page's elements, so the actions can be found later.
 * @returns The actions' element.
 */
function buildActions(group: GroupSpec, elements: OptionsElements): HTMLElement {
    const row = document.createElement("div");
    row.className = "options-actions";

    for (const action of group.actions ?? []) {
        const button = document.createElement("k-button");
        button.setAttribute("variant", "secondary");
        button.setAttribute("label", tDynamic(action.label));
        button.dataset["action"] = action.id;
        elements.actions.set(action.id, button);
        row.appendChild(button);

        if (action.kind !== "file") continue;

        // The file picker is a real `<input type="file">`, kept out of the
        // layout. It is the only way to open a file picker that works with
        // the keyboard and with the assistive technology the browser gives
        // it, and the button in front of it is what the user presses.
        const input = document.createElement("input");
        input.type = "file";
        input.className = "options-file-input";
        input.accept = "application/json,.json";
        input.dataset["action"] = action.id;
        elements.files.set(action.id, input);
        row.appendChild(input);
    }

    return row;
}

/**
 * Build one control.
 *
 * @param control The control's specification.
 * @param value The control's current value.
 * @returns The control's element, and the element that holds its value.
 */
function buildControl(
    control: ControlSpec,
    value: unknown,
): { element: HTMLElement; valueHost?: HTMLElement } {
    switch (control.kind) {
        case "switch": {
            const toggle = document.createElement("k-switch");
            toggle.setAttribute("label", tDynamic(control.label));
            toggle.dataset["path"] = control.path;
            if (value === true) toggle.setAttribute("checked", "");
            return { element: toggle };
        }
        case "text": {
            const field = document.createElement("k-field");
            field.setAttribute("label", tDynamic(control.label));
            field.setAttribute("type", "text");
            field.setAttribute("value", String(value ?? ""));
            field.setAttribute("name", control.path);
            field.dataset["path"] = control.path;
            if (control.placeholder) field.setAttribute("placeholder", control.placeholder);
            if (control.hint) field.setAttribute("hint", tDynamic(control.hint));
            return { element: field };
        }
        case "number": {
            const field = document.createElement("k-field");
            field.setAttribute("label", tDynamic(control.label));
            field.setAttribute("type", "number");
            field.setAttribute("value", String(value ?? ""));
            field.setAttribute("name", control.path);
            field.dataset["path"] = control.path;
            field.setAttribute("min", String(control.min));
            field.setAttribute("max", String(control.max));
            if (control.hint) field.setAttribute("hint", tDynamic(control.hint));
            return { element: field };
        }
        case "select": {
            const field = document.createElement("k-field");
            field.setAttribute("label", tDynamic(control.label));
            field.setAttribute("type", "select");
            field.setAttribute("value", String(value ?? ""));
            field.setAttribute("name", control.path);
            field.dataset["path"] = control.path;
            if (control.hint) field.setAttribute("hint", tDynamic(control.hint));
            for (const option of control.options) {
                const element = document.createElement("option");
                element.value = option.value;
                element.textContent = option.label;
                field.appendChild(element);
            }
            return { element: field };
        }
        case "theme":
        case "accent":
        case "density": {
            // The row is a label for the segmented choice below it, so the
            // field renders no control of its own.
            const field = document.createElement("k-field");
            field.setAttribute("group", "");
            field.setAttribute("label", tDynamic(control.label));
            if (control.hint) field.setAttribute("hint", tDynamic(control.hint));
            field.dataset["path"] = control.path;

            const choice = buildChoice(control, String(value ?? ""));
            // The label lives in the field's shadow root, so its ID cannot be
            // resolved from the light DOM. The choice is named with an
            // `aria-label` instead, and the group's own legend names it
            // inside the shadow root.
            choice.setAttribute("aria-label", tDynamic(control.label));

            const wrapper = document.createElement("div");
            wrapper.className = "options-choice";
            wrapper.appendChild(field);
            wrapper.appendChild(choice);
            return { element: wrapper, valueHost: choice };
        }
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
        group.setAttribute("legend", tDynamic(control.label));
        group.addOption("light", t("optionsThemeLight"));
        group.addOption("dark", t("optionsThemeDark"));
        group.addOption("system", t("optionsThemeSystem"));
    } else if (control.kind === "accent") {
        group.setAttribute("legend", tDynamic(control.label));
        // The swatches show the *other* accents, so the picker cannot be
        // rendered with `var(--accent-500)` for every row: the current
        // accent would make all four swatches look the same.
        group.addOption("gold", t("optionsAccentGold"), "#d99224");
        group.addOption("ink", t("optionsAccentInk"), "#5568c4");
        group.addOption("verdigris", t("optionsAccentVerdigris"), "#359c8b");
        group.addOption("plum", t("optionsAccentPlum"), "#b0529c");
    } else {
        group.setAttribute("legend", tDynamic(control.label));
        group.addOption("comfortable", t("optionsDensityComfortable"));
        group.addOption("compact", t("optionsDensityCompact"));
    }

    return group;
}

/**
 * Show the groups that the search matches, and only those.
 *
 * The navigation is a tab list, so exactly one panel is shown at a time: the
 * selected group's. The search narrows *within* that group rather than
 * replacing the selection, because a tab list with two visible panels is not a
 * tab list any more — the tab that is selected would not be the one whose
 * panel the user is looking at.
 *
 * @param elements The page's elements.
 * @param groups The settings groups.
 * @param active The selected group.
 * @param query The search term.
 */
export function updateGroups(
    elements: OptionsElements,
    groups: GroupSpec[],
    active: NavTarget,
    query: string,
): void {
    const needle = query.trim().toLowerCase();
    let matched = 0;

    for (const group of groups) {
        const section = elements.sections.get(group.id);
        if (!section) continue;

        // Only the selected group is shown, whatever the search says.
        const selected = group.id === active;
        const groupMatches = needle ? tDynamic(group.title).toLowerCase().includes(needle) : false;
        let groupMatched = 0;

        for (const control of group.controls) {
            const row = elements.rows.get(control.path);
            if (!row) continue;

            const visible = selected && (needle ? groupMatches || matches(control, needle) : true);
            row.hidden = !visible;
            if (visible) groupMatched += 1;
        }

        // The actions are searchable too, so that "export" finds the group
        // that holds the export button rather than nothing at all.
        for (const action of group.actions ?? []) {
            const button = elements.actions.get(action.id);
            if (!button) continue;

            const actionMatches = needle
                ? groupMatches || tDynamic(action.label).toLowerCase().includes(needle)
                : false;
            const visible = selected && (needle ? actionMatches : true);
            button.hidden = !visible;
            if (visible) groupMatched += 1;
        }

        section.hidden = groupMatched === 0;
        matched += groupMatched;
    }

    const empty = elements.noResults;
    if (empty) {
        empty.hidden = matched > 0 || needle === "";
    }
}

/**
 * Push new values into the controls.
 *
 * The page is built once, so a control owns its own value. When the settings
 * change *underneath* the page — because the user imported a file, or reset
 * everything — the controls have to be told, or the page would keep showing
 * the values it was built with.
 *
 * @param elements The page's elements.
 * @param values The values, by settings path.
 */
export function applyValues(elements: OptionsElements, values: Record<string, unknown>): void {
    for (const [path, control] of elements.valueHosts) {
        const value = values[path];
        if (value === undefined) continue;

        // A switch holds a boolean and exposes it as `checked`; a field and a
        // segmented choice hold a string and expose it as `value`.
        //
        // The old code looked for `value` only, so every switch in the page
        // kept the value it was built with: importing a settings file or
        // resetting the settings changed the stored values and left the
        // controls showing the old ones.
        const target = control as unknown as { value?: unknown; checked?: unknown };

        if (typeof value === "boolean") {
            if ("checked" in target) {
                target.checked = value;
                continue;
            }
            if ("value" in target) {
                target.value = value;
                continue;
            }
            continue;
        }

        if (!("value" in target)) continue;
        target.value = String(value);
    }
}

/**
 * The first group that has a row matching a search term.
 *
 * A tab list shows one panel at a time, so a search that matched a setting in
 * another group would have nowhere to put it. The group that holds the match
 * is therefore selected, and the search narrows within it.
 *
 * @param groups The settings groups.
 * @param query The search term.
 * @returns The matching group's ID, or `undefined` when nothing matches.
 */
export function firstMatchingGroup(groups: GroupSpec[], query: string): GroupId | undefined {
    const needle = query.trim().toLowerCase();
    if (!needle) return undefined;

    for (const group of groups) {
        const groupMatches = tDynamic(group.title).toLowerCase().includes(needle);
        if (groupMatches) return group.id;
        for (const control of group.controls) {
            if (matches(control, needle)) return group.id;
        }
    }

    return undefined;
}

/**
 * Whether a control matches a search needle.
 *
 * The comparison is against the *translated* label and hint, so searching
 * works in the user's own language rather than only in English.
 */
function matches(control: ControlSpec, needle: string): boolean {
    if (tDynamic(control.label).toLowerCase().includes(needle)) return true;
    if (control.hint && tDynamic(control.hint).toLowerCase().includes(needle)) return true;
    if (control.kind === "select") {
        return control.options.some((option) => option.label.toLowerCase().includes(needle));
    }
    return false;
}

/**
 * Show the status region: nothing, a loading state, or an error state.
 *
 * @param elements The page's elements.
 * @param state The state to show.
 * @param message The error message, when the state is an error.
 */
export function renderStatus(
    elements: OptionsElements,
    state: "ready" | "loading" | "error",
    message?: string,
): void {
    const status = elements.status;
    status.replaceChildren();

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
    panel.className = `options-status-panel options-status-panel--${state}`;

    if (state === "loading") {
        const label = document.createElement("p");
        label.className = "options-status-label";
        label.textContent = t("phasePreparing");
        panel.appendChild(label);

        for (const width of ["100%", "92%", "78%"]) {
            const skeleton = document.createElement("k-skeleton");
            skeleton.setAttribute("height", "16px");
            skeleton.setAttribute("width", width);
            skeleton.setAttribute("radius", "4px");
            panel.appendChild(skeleton);
        }
    } else {
        const heading = document.createElement("p");
        heading.className = "options-status-title";
        heading.textContent = t("errorGeneric");

        const text = document.createElement("p");
        text.className = "options-status-text";
        text.textContent = message ?? "";

        const actions = document.createElement("div");
        actions.className = "options-status-actions";

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

            // The book itself is on the user's disk; this removes the
            // library's *record* of it, which is what the library holds.
            const remove = document.createElement("k-button");
            remove.setAttribute("variant", "ghost");
            remove.setAttribute("size", "sm");
            remove.textContent = t("libraryRemove");
            remove.dataset["libraryId"] = entry.id;

            card.append(cover, title, author, meta, remove);
            grid.appendChild(card);
        }

        body.appendChild(grid);
    }

    elements.library.appendChild(body);
}

/**
 * Render the library's loading state.
 */
export function renderLibraryLoading(elements: OptionsElements): void {
    const container = elements.library.querySelector(".options-library-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-library-body";

    const panel = document.createElement("div");
    panel.className = "options-status-panel options-status-panel--loading";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-busy", "true");

    const label = document.createElement("p");
    label.className = "options-status-label";
    label.textContent = t("phasePreparing");
    panel.appendChild(label);

    for (const width of ["100%", "88%"]) {
        const skeleton = document.createElement("k-skeleton");
        skeleton.setAttribute("height", "14px");
        skeleton.setAttribute("width", width);
        skeleton.setAttribute("radius", "4px");
        panel.appendChild(skeleton);
    }

    body.appendChild(panel);
    elements.library.appendChild(body);
}

/**
 * Render the library's error state.
 *
 * @param elements The page's elements.
 * @param message The error message.
 */
export function renderLibraryError(elements: OptionsElements, message: string): void {
    const container = elements.library.querySelector(".options-library-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-library-body";

    const panel = document.createElement("div");
    panel.className = "options-status-panel options-status-panel--error";
    panel.setAttribute("role", "alert");

    const heading = document.createElement("p");
    heading.className = "options-status-title";
    heading.textContent = t("errorGeneric");

    const text = document.createElement("p");
    text.className = "options-status-text";
    text.textContent = message;

    const actions = document.createElement("div");
    actions.className = "options-status-actions";

    const retry = document.createElement("k-button");
    retry.setAttribute("variant", "primary");
    retry.setAttribute("size", "sm");
    retry.setAttribute("label", t("popupTryAgain"));
    retry.dataset["action"] = "retry-library";

    actions.appendChild(retry);
    panel.appendChild(heading);
    panel.appendChild(text);
    panel.appendChild(actions);

    body.appendChild(panel);
    elements.library.appendChild(body);
}

/**
 * Render the site-selector list.
 *
 * Each entry is a host name the user has taught Kintsugi about. The Forget
 * button emits a `k-click` event on the container, so the controller can do
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

/**
 * Render the list of sites the extension may read.
 *
 * Each entry is a host permission the user has granted. The Revoke button
 * emits a `k-click` event on the container, so the controller can do the work
 * without the view knowing about the permissions API.
 *
 * @param elements The page's elements.
 * @param origins The granted patterns.
 */
export function renderSiteAccess(elements: OptionsElements, origins: string[]): void {
    const container = elements.siteAccess.querySelector(".options-site-access-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-site-access-body";

    if (origins.length === 0) {
        const empty = document.createElement("div");
        empty.className = "options-library-empty";

        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.className = "options-library-empty-icon";
        icon.appendChild(createIcon("shield", 40));

        const heading = document.createElement("p");
        heading.className = "options-library-empty-title";
        heading.textContent = t("optionsSiteAccessEmpty");

        empty.append(icon, heading);
        body.appendChild(empty);
    } else {
        const list = document.createElement("ul");
        list.className = "options-site-access-list";

        for (const origin of origins) {
            const item = document.createElement("li");
            item.className = "options-site-access-item";

            const name = document.createElement("span");
            name.className = "options-site-access-host";
            name.textContent = displayHost(origin);

            const detail = document.createElement("span");
            detail.className = "options-site-access-pattern";
            detail.textContent = origin;

            const revoke = document.createElement("k-button");
            revoke.setAttribute("variant", "ghost");
            revoke.setAttribute("size", "sm");
            revoke.textContent = t("optionsRevoke");
            revoke.dataset["origin"] = origin;

            item.append(name, detail, revoke);
            list.appendChild(item);
        }

        body.appendChild(list);
    }

    elements.siteAccess.appendChild(body);
}

/**
 * Render the site-access list's loading state.
 *
 * @param elements The page's elements.
 */
export function renderSiteAccessLoading(elements: OptionsElements): void {
    const container = elements.siteAccess.querySelector(".options-site-access-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-site-access-body";

    const panel = document.createElement("div");
    panel.className = "options-status-panel options-status-panel--loading";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-busy", "true");

    const label = document.createElement("p");
    label.className = "options-status-label";
    label.textContent = t("phasePreparing");
    panel.appendChild(label);

    for (const width of ["100%", "80%"]) {
        const skeleton = document.createElement("k-skeleton");
        skeleton.setAttribute("height", "14px");
        skeleton.setAttribute("width", width);
        skeleton.setAttribute("radius", "4px");
        panel.appendChild(skeleton);
    }

    body.appendChild(panel);
    elements.siteAccess.appendChild(body);
}

/**
 * Render the site-access list's error state.
 *
 * @param elements The page's elements.
 * @param message The error message.
 */
export function renderSiteAccessError(elements: OptionsElements, message: string): void {
    const container = elements.siteAccess.querySelector(".options-site-access-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-site-access-body";

    const panel = document.createElement("div");
    panel.className = "options-status-panel options-status-panel--error";
    panel.setAttribute("role", "alert");

    const heading = document.createElement("p");
    heading.className = "options-status-title";
    heading.textContent = t("errorGeneric");

    const text = document.createElement("p");
    text.className = "options-status-text";
    text.textContent = message;

    const actions = document.createElement("div");
    actions.className = "options-status-actions";

    const retry = document.createElement("k-button");
    retry.setAttribute("variant", "primary");
    retry.setAttribute("size", "sm");
    retry.setAttribute("label", t("popupTryAgain"));
    retry.dataset["action"] = "retry-site-access";

    actions.appendChild(retry);
    panel.appendChild(heading);
    panel.appendChild(text);
    panel.appendChild(actions);

    body.appendChild(panel);
    elements.siteAccess.appendChild(body);
}

/**
 * Render the site-selector list's loading state.
 */
export function renderSiteSelectorsLoading(elements: OptionsElements): void {
    const container = elements.siteSelectors.querySelector(".options-site-selectors-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-site-selectors-body";

    const panel = document.createElement("div");
    panel.className = "options-status-panel options-status-panel--loading";
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-busy", "true");

    const label = document.createElement("p");
    label.className = "options-status-label";
    label.textContent = t("phasePreparing");
    panel.appendChild(label);

    for (const width of ["100%", "80%"]) {
        const skeleton = document.createElement("k-skeleton");
        skeleton.setAttribute("height", "14px");
        skeleton.setAttribute("width", width);
        skeleton.setAttribute("radius", "4px");
        panel.appendChild(skeleton);
    }

    body.appendChild(panel);
    elements.siteSelectors.appendChild(body);
}

/**
 * Render the site-selector list's error state.
 *
 * @param elements The page's elements.
 * @param message The error message.
 */
export function renderSiteSelectorsError(elements: OptionsElements, message: string): void {
    const container = elements.siteSelectors.querySelector(".options-site-selectors-body");
    if (container) container.remove();

    const body = document.createElement("div");
    body.className = "options-site-selectors-body";

    const panel = document.createElement("div");
    panel.className = "options-status-panel options-status-panel--error";
    panel.setAttribute("role", "alert");

    const heading = document.createElement("p");
    heading.className = "options-status-title";
    heading.textContent = t("errorGeneric");

    const text = document.createElement("p");
    text.className = "options-status-text";
    text.textContent = message;

    const actions = document.createElement("div");
    actions.className = "options-status-actions";

    const retry = document.createElement("k-button");
    retry.setAttribute("variant", "primary");
    retry.setAttribute("size", "sm");
    retry.setAttribute("label", t("popupTryAgain"));
    retry.dataset["action"] = "retry-site-selectors";

    actions.appendChild(retry);
    panel.appendChild(heading);
    panel.appendChild(text);
    panel.appendChild(actions);

    body.appendChild(panel);
    elements.siteSelectors.appendChild(body);
}

/** A human-readable file size. */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
