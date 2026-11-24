/**
 * `<k-list>` and `<k-list-item>`.
 *
 * The chapter list.
 *
 * The list is **virtualised**: only the visible rows are in the DOM, so five
 * thousand chapters cost about thirty nodes rather than five thousand. It
 * also uses a **roving tabindex**: exactly one item is tabbable at a time,
 * and the arrow keys move within the list. This turns five thousand chapters
 * from ten thousand tab stops into one.
 */
import { KComponent, defineComponent } from "./base";
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

/** The state labels, for the accessible name. */
const STATE_LABELS: Record<ListItemState, string> = {
    idle: "not started",
    queued: "queued",
    fetching: "fetching",
    loaded: "loaded",
    downloaded: "already downloaded",
    failed: "failed",
};

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

.empty-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-8);
    color: var(--text-muted);
    font-size: var(--text-sm);
}
`;

const ITEM_STYLES = `
:host {
    display: block;
}

:host([hidden]) { display: none; }

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

@media (prefers-reduced-motion: reduce) {
    .state svg[data-spin="true"] { animation: none; }
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
        item.accessibleName = `${item.title}, ${STATE_LABELS[state]}`;
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
        row.dataset.state = "idle";
        row.dataset.index = String(index);
        row.style.position = "absolute";
        row.style.top = `${index * this.#rowHeight}px`;
        row.style.left = "0";
        row.style.right = "0";
        // The roving tabindex: exactly one row is tabbable.
        row.tabIndex = index === this.#focusIndex ? 0 : -1;

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
            this.#updateTabIndex();
        });
        row.addEventListener("focus", () => {
            this.#focusIndex = index;
            this.#updateTabIndex();
        });
        row.addEventListener("dblclick", () => {
            this.emit("k-edit", { id: item.id, index });
        });

        return row;
    }

    /** Update the roving tabindex. */
    #updateTabIndex(): void {
        if (!this.rows) return;
        for (const row of Array.from(this.rows.children)) {
            const index = Number((row as HTMLElement).dataset.index);
            (row as HTMLElement).tabIndex = index === this.#focusIndex ? 0 : -1;
        }
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

    /** Move DOM focus to a row. */
    #focusRow(index: number): void {
        if (!this.rows) return;
        const row = this.rows.children[index] as HTMLElement | undefined;
        row?.focus();
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

export class KListItem extends KComponent {
    static override styles = ITEM_STYLES;

    protected override render(): void {
        // The item is rendered by the list, which owns the virtualisation.
    }
}

defineComponent("k-list-item", KListItem);

declare global {
    interface HTMLElementTagNameMap {
        "k-list": KList;
        "k-list-item": KListItem;
    }
}
