/**
 * `<k-panel>`.
 *
 * A collapsible section with a header that always shows a title and a
 * summary.
 *
 * Built on `<details>`/`<summary>`, so the keyboard behaviour and the
 * screen-reader semantics come for free.
 */
import { KComponent, defineComponent } from "./base";
import { createIcon } from "./icons";

const STYLES = `
:host { display: block; }
:host([hidden]) { display: none; }

details {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    overflow: hidden;
}

summary {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    list-style: none;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    letter-spacing: 0.02em;
    color: var(--text);
    user-select: none;
    transition: background-color var(--dur-instant) var(--ease-out);
}

summary::-webkit-details-marker { display: none; }
summary:hover { background: var(--bg-subtle); }
summary:focus-visible { outline: none; box-shadow: var(--ring); }

.title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.summary-text {
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    color: var(--text-muted);
    flex-shrink: 0;
}

.chevron {
    flex-shrink: 0;
    color: var(--text-muted);
    transition: transform var(--dur-base) var(--ease-out);
}

details[open] .chevron { transform: rotate(180deg); }

.body {
    padding: 0 var(--space-4) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) .chevron { transition: none; }

@media (prefers-reduced-motion: reduce) {
    .chevron { transition: none; }
}
`;

export class KPanel extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["heading", "summary", "open"];

    private details: HTMLDetailsElement | undefined;
    private titleNode: HTMLElement | undefined;
    private summaryNode: HTMLElement | undefined;

    protected override render(): void {
        if (!this.details) {
            this.root.replaceChildren();
            this.details = document.createElement("details");
            this.#build();
        }
        this.details.open = this.hasAttribute("open");
        this.details.ontoggle = this.#onToggle;
        this.#updateLabels();
    }

    /**
     * Write the heading and summary into the header.
     *
     * The attributes are observed, so changing them after construction has to
     * update the header; writing them once in #build() would leave a panel
     * showing the title it was born with.
     */
    #updateLabels(): void {
        if (this.titleNode) this.titleNode.textContent = this.getAttribute("heading") ?? "";
        if (this.summaryNode) this.summaryNode.textContent = this.getAttribute("summary") ?? "";
    }

    /** Build the component's structure. */
    #build(): void {
        const details = this.details as HTMLDetailsElement;

        const summary = document.createElement("summary");
        const title = document.createElement("span");
        title.className = "title";
        this.titleNode = title;

        const summaryText = document.createElement("span");
        summaryText.className = "summary-text";
        this.summaryNode = summaryText;

        const chevron = document.createElement("span");
        chevron.className = "chevron";
        chevron.setAttribute("aria-hidden", "true");
        chevron.appendChild(createIcon("chevron-down", 16));

        summary.appendChild(title);
        summary.appendChild(summaryText);
        summary.appendChild(chevron);

        const body = document.createElement("div");
        body.className = "body";
        const slot = document.createElement("slot");
        body.appendChild(slot);

        details.appendChild(summary);
        details.appendChild(body);
        this.root.appendChild(details);
    }

    #onToggle = (): void => {
        const open = this.details?.open ?? false;
        this.toggleAttribute("open", open);
        this.emit("k-toggle", { open });
    };
}

defineComponent("k-panel", KPanel);

declare global {
    interface HTMLElementTagNameMap {
        "k-panel": KPanel;
    }
}
