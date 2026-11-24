/**
 * `<k-list>`.
 *
 * The chapter list.
 *
 * The list is **virtualised**: only the visible rows are in the DOM, so five
 * thousand chapters cost about thirty nodes rather than five thousand.
 *
 * The list is a **single tab stop**: the viewport is the only element in the
 * tab order, and the rows are focused programmatically as the user arrows
 * through them. A roving tabindex over the rows would lose the tab stop
 * entirely whenever the focused row fell outside the rendered window, which
 * is exactly what a virtualised list does all the time.
 */
import { KComponent, defineComponent, translate } from "./base";
import { createIcon, type IconName } from "./icons";

/** A chapter row's data. */
export interface ListItemData {
    /** A stable identifier. */
    id: string;
    /** The row's text. */
    title: string;
    /** Whether the row is selected. */
    selected?: boolean;
    /** The row's state icon. */
    icon?: IconName;
    /** The row's state, which drives the row's colour. */
    state?: ListItemState;
    /** The row's secondary text, right-aligned. */
    meta?: string;
    /** Whether the row's checkbox is in the indeterminate state. */
    indeterminate?: boolean;
    /** The row's accessible name, when it differs from the title. */
    accessibleName?: string;
}

/** The list's visual states. */
export type ListItemState = "idle" | "queued" | "fetching" | "loaded" | "downloaded" | "failed";

/** The state icons. Every state has a distinct shape. */
const STATE_ICONS: Record<ListItemState, IconName> = {
    idle: "empty-circle",
    queued: "half-circle",
    fetching: "spinner",
    loaded: "filled-circle",
    downloaded: "check-circle",
    failed: "alert-triangle",
};

/**
 * The state a state icon stands for.
 *
 * A page that sets only the icon still gets the right row colour, so the
 * state does not have to be threaded through twice.
 */
const ICON_STATES = new Map<IconName, ListItemState>(
    (Object.entries(STATE_ICONS) as [ListItemState, IconName][]).map(([state, icon]) => [
        icon,
        state,
    ]),
);

/**
 * The state labels, for the accessible name.
 *
 * The labels come from the locale files, which already have a key for every
 * state. The English text is only a fallback for the case where the message
 * is missing.
 *
 * The labels are looked up when they are needed rather than when the module is
 * loaded, because the i18n API is installed after the modules are imported.
 *
 * @param state The state to label.
 * @returns The label.
 */
function stateLabel(state: ListItemState): string {
    switch (state) {
        case "queued":
            return translate("chapterStateQueued", "Queued");
        case "fetching":
            return translate("chapterStateFetching", "Fetching");
        case "loaded":
            return translate("chapterStateLoaded", "Loaded");
        case "downloaded":
            return translate("chapterStateDownloaded", "Downloaded");
        case "failed":
            return translate("chapterStateFailed", "Failed");
        case "idle":
        default:
            return translate("chapterStateNotStarted", "Not started");
    }
}

const LIST_STYLES = `
:host {
    display: block;
    position: relative;
    /*
     * The rows are absolutely positioned inside a spacer of a computed
     * height, so the host needs a size of its own — otherwise it collapses
     * and the rows spill out of the panel.
     *
     * The containment is deliberately "content" rather than "strict":
     * "strict" implies "size", which makes the element's size independent of
     * its contents and stops the flex algorithm from sizing it at all. The
     * list is a flex item that has to grow with the panel.
     */
    flex: 1 1 0;
    min-height: 240px;
    contain: content;
}

:host([hidden]) { display: none; }

.viewport {
    position: relative;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
}

.spacer {
    position: relative;
    width: 100%;
    /*
     * The rows are absolutely positioned, so a margin on the spacer is the
     * only way to give the first and last row some breathing room. The
     * virtualiser adds the same offset to the spacer's height, so the scroll
     * range stays exact.
     */
    margin-block: var(--space-2);
}

.rows {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
}

.row {
    display: grid;
    grid-template-columns: 28px 20px minmax(0, 1fr) 56px;
    align-items: center;
    gap: var(--space-2);
    height: var(--row-height);
    padding: 0 var(--space-3);
    border-bottom: 1px solid var(--border-subtle);
    cursor: default;
    user-select: none;
    transition: background-color var(--dur-instant) var(--ease-out);
}

.row:hover { background: var(--surface-sunken); }
.row[data-selected="true"] { background: var(--accent-subtle); }
.row[data-selected="true"]:hover { background: var(--accent-subtle); filter: brightness(0.98); }

/*
 * The checkbox is drawn with borders and a background rather than with a
 * glyph, so the check mark is a pseudo-element. It inherits the current
 * text colour.
 */
.check {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    margin: 0 auto;
    border: 1.5px solid var(--border-strong);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    color: var(--text-on-accent);
    transition: background-color var(--dur-instant) var(--ease-out),
                border-color var(--dur-instant) var(--ease-out);
}

.row[data-selected="true"] .check {
    border-color: var(--accent);
    background: var(--accent);
}

.check[data-indeterminate="true"]::after {
    content: "";
    width: 8px;
    height: 2px;
    border-radius: 1px;
    background: currentColor;
}

.row[data-selected="true"] .check:not([data-indeterminate="true"])::after {
    content: "";
    width: 4px;
    height: 8px;
    margin-top: -2px;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
}

.state {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
}

.row[data-state="loaded"] .state { color: var(--success); }
.row[data-state="downloaded"] .state { color: var(--success); }
.row[data-state="failed"] .state { color: var(--danger); }
.row[data-state="fetching"] .state { color: var(--accent); }

.state svg[data-spin="true"] {
    animation: k-spin 0.7s linear infinite;
}

@keyframes k-spin { to { transform: rotate(360deg); } }

.title {
    font-size: var(--text-xs);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.meta {
    font-size: var(--text-2xs);
    color: var(--text-muted);
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.row:focus-visible {
    outline: none;
    box-shadow: var(--ring);
    border-radius: var(--radius-xs);
}

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own "[data-reduce-motion="true"] *" rule cannot pierce the
 * shadow boundary, so the component mirrors the preference onto its host
 * and stops the spinner itself.
 */
:host([data-reduced-motion]) .state svg[data-spin="true"] { animation: none; }
:host([data-reduced-motion]) .row { transition: none; }

@media (prefers-reduced-motion: reduce) {
    .state svg[data-spin="true"] { animation: none; }
    .row { transition: none; }
}
`;

export class KList extends KComponent {
    static override styles = LIST_STYLES;
    static override observedAttributes = ["row-height", "overscan"];

    /** The items. */
    #items: ListItemData[] = [];
    /** The index of the focused row. */
    #focusIndex = 0;
    /** The index of the first visible row. */
    #startIndex = 0;
    /** The row height, in pixels. */
    #rowHeight = 32;
    /** How many rows to render above and below the viewport. */
    #overscan = 6;

    private viewport: HTMLDivElement | undefined;
    private rows: HTMLDivElement | undefined;
    private spacer: HTMLDivElement | undefined;

    protected override render(): void {
        if (!this.viewport) {
            this.root.replaceChildren();

            this.viewport = document.createElement("div");
            this.viewport.className = "viewport";
            this.viewport.setAttribute("role", "list");
            // The viewport is the list's one and only tab stop. The rows are
            // focused programmatically as the user arrows through them, so
            // they are never in the tab order themselves — a roving
            // tabindex over a virtualised window would lose the tab stop
            // whenever the focused row was scrolled out of the window.
            this.viewport.tabIndex = 0;

            this.spacer = document.createElement("div");
            this.spacer.className = "spacer";

            this.rows = document.createElement("div");
            this.rows.className = "rows";

            this.spacer.appendChild(this.rows);
            this.viewport.appendChild(this.spacer);
            this.root.appendChild(this.viewport);

            this.viewport.addEventListener("scroll", this.#onScroll, { passive: true });
            this.viewport.addEventListener("keydown", this.#onKeyDown);
        }

        this.#rowHeight = Number(this.getAttribute("row-height") ?? 32);
        this.#overscan = Number(this.getAttribute("overscan") ?? 6);
    }

    /** Set the items and re-render. */
    setItems(items: ListItemData[]): void {
        this.#items = items;
        this.#focusIndex = Math.min(this.#focusIndex, Math.max(0, items.length - 1));
        this.#renderRows();
    }

    /** The items. */
    get items(): readonly ListItemData[] {
        return this.#items;
    }

    /** The state of a row, for the accessible name. */
    setState(id: string, state: ListItemState): void {
        const item = this.#items.find((entry) => entry.id === id);
        if (!item) return;
        item.icon = STATE_ICONS[state];
        item.state = state;
        item.accessibleName = `${item.title}, ${stateLabel(state)}`;
        this.#renderRows();
    }

    /** Toggle an item's selection. */
    toggleSelection(id: string): void {
        const item = this.#items.find((entry) => entry.id === id);
        if (!item) return;
        item.selected = !item.selected;
        this.#renderRows();
        this.emit("k-select", { id, selected: item.selected });
    }

    /** Set every item's selection. */
    setAllSelected(selected: boolean): void {
        for (const item of this.#items) item.selected = selected;
        this.#renderRows();
        this.emit("k-select-all", { selected });
    }

    /** The number of selected items. */
    get selectedCount(): number {
        return this.#items.filter((item) => item.selected).length;
    }

    /** Render the visible rows. */
    #renderRows(): void {
        if (!this.rows || !this.spacer || !this.viewport) return;

        const total = this.#items.length;
        this.spacer.style.height = `${total * this.#rowHeight}px`;

        const viewportHeight = this.viewport.clientHeight || 400;
        const visible = Math.ceil(viewportHeight / this.#rowHeight);
        const start = Math.max(0, this.#startIndex - this.#overscan);
        const end = Math.min(total, this.#startIndex + visible + this.#overscan);

        const fragment = document.createDocumentFragment();
        for (let index = start; index < end; index += 1) {
            fragment.appendChild(this.#createRow(this.#items[index] as ListItemData, index));
        }
        this.rows.replaceChildren(fragment);
    }

    /** Create one row. */
    #createRow(item: ListItemData, index: number): HTMLElement {
        const row = document.createElement("div");
        row.className = "row";
        row.setAttribute("role", "listitem");
        row.dataset.selected = String(item.selected ?? false);
        row.dataset.state =
            item.state ?? (item.icon ? ICON_STATES.get(item.icon) : undefined) ?? "idle";
        row.dataset.index = String(index);
        row.style.position = "absolute";
        row.style.top = `${index * this.#rowHeight}px`;
        row.style.left = "0";
        row.style.right = "0";
        // The rows are not tab stops: the viewport is. They are still
        // focusable, so that the arrow keys can move the focus onto them.
        row.tabIndex = -1;

        const checkbox = document.createElement("span");
        checkbox.className = "check";
        checkbox.setAttribute("aria-hidden", "true");
        if (item.indeterminate) checkbox.dataset.indeterminate = "true";

        const state = document.createElement("span");
        state.className = "state";
        state.setAttribute("aria-hidden", "true");
        if (item.icon) {
            const svg = createIcon(item.icon, 16);
            if (item.icon === "spinner") svg.dataset.spin = "true";
            state.appendChild(svg);
        }

        const title = document.createElement("span");
        title.className = "title";
        title.textContent = item.title;
        title.title = item.title;

        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = item.meta ?? "";

        row.appendChild(checkbox);
        row.appendChild(state);
        row.appendChild(title);
        row.appendChild(meta);

        row.setAttribute("aria-label", item.accessibleName ?? item.title);
        row.addEventListener("click", () => {
            this.#focusIndex = index;
            this.toggleSelection(item.id);
            this.#clampFocusIndex();
        });
        row.addEventListener("focus", () => {
            this.#focusIndex = index;
            this.#clampFocusIndex();
        });
        row.addEventListener("dblclick", () => {
            this.emit("k-edit", { id: item.id, index });
        });

        return row;
    }

    /**
     * Keep the tracked focus index within the list.
     *
     * The rows are not in the tab order, so there is no roving tabindex to
     * update; the viewport is the list's one and only tab stop. The method
     * only keeps the tracked index in step with the list.
     */
    #clampFocusIndex(): void {
        this.#focusIndex = Math.min(this.#focusIndex, Math.max(0, this.#items.length - 1));
    }

    /** Handle the keyboard. */
    #onKeyDown = (event: KeyboardEvent): void => {
        const last = this.#items.length - 1;
        if (last < 0) return;

        let next = this.#focusIndex;
        switch (event.key) {
            case "ArrowDown":
                next = Math.min(last, this.#focusIndex + 1);
                break;
            case "ArrowUp":
                next = Math.max(0, this.#focusIndex - 1);
                break;
            case "Home":
                next = 0;
                break;
            case "End":
                next = last;
                break;
            case " ":
                event.preventDefault();
                this.toggleSelection((this.#items[this.#focusIndex] as ListItemData).id);
                return;
            case "Enter": {
                const item = this.#items[this.#focusIndex] as ListItemData;
                this.emit("k-edit", { id: item.id, index: this.#focusIndex });
                return;
            }
            default:
                return;
        }

        event.preventDefault();
        this.#focusIndex = next;
        this.#scrollToIndex(next);
        this.#renderRows();
        this.#focusRow(next);
    };

    /** Scroll so that an index is visible. */
    #scrollToIndex(index: number): void {
        if (!this.viewport) return;
        const top = index * this.#rowHeight;
        const bottom = top + this.#rowHeight;
        const viewTop = this.viewport.scrollTop;
        const viewBottom = viewTop + this.viewport.clientHeight;
        if (top < viewTop) this.viewport.scrollTop = top;
        else if (bottom > viewBottom) this.viewport.scrollTop = bottom - this.viewport.clientHeight;
    }

    /**
     * Move DOM focus to a row.
     *
     * The rows are a virtualised window, so the row for an index is not
     * necessarily in the DOM: the window is found by the index the row
     * carries, not by the row's position among its siblings. If the row is
     * outside the window, the window is moved to it first — otherwise the
     * focus would land on whatever row happened to be at that position, or on
     * nothing at all.
     */
    #focusRow(index: number): void {
        if (!this.rows || !this.viewport) return;

        let row = this.#rowAt(index);
        if (!row) {
            // The row is outside the rendered window. Scroll to it and
            // render the window around it.
            this.#scrollToIndex(index);
            this.#startIndex = index;
            this.#renderRows();
            row = this.#rowAt(index);
        }
        row?.focus();
    }

    /** The rendered row for an index, if it is in the DOM. */
    #rowAt(index: number): HTMLElement | undefined {
        if (!this.rows) return undefined;
        return this.rows.querySelector<HTMLElement>(`[data-index="${index}"]`) ?? undefined;
    }

    /** Handle scrolling. */
    #onScroll = (): void => {
        if (!this.viewport) return;
        const start = Math.floor(this.viewport.scrollTop / this.#rowHeight);
        if (start !== this.#startIndex) {
            this.#startIndex = start;
            this.#renderRows();
        }
    };
}

defineComponent("k-list", KList);

declare global {
    interface HTMLElementTagNameMap {
        "k-list": KList;
    }
}
