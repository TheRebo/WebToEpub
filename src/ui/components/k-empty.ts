/**
 * `<k-empty>`.
 *
 * The designed empty state.
 *
 * A centred composition: an inline SVG illustration drawn on the same 2 px
 * stroke grid as the icon system, a heading, a sentence explaining *what
 * would go here*, and — where relevant — a primary action that creates it.
 */
import { KComponent, defineComponent } from "./base";
import { createIcon, type IconName } from "./icons";

const STYLES = `
:host {
    display: flex;
    justify-content: center;
    padding: var(--space-8) var(--space-5);
}

:host([hidden]) { display: none; }

.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    max-width: 360px;
    text-align: center;
}

.illustration {
    width: 96px;
    height: 96px;
    color: var(--border-strong);
    margin-bottom: var(--space-2);
}

.heading {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--text);
}

.description {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    line-height: var(--leading-relaxed);
}

.actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
}
`;

/** The illustrations available for an empty state. */
export type EmptyIllustration = "book" | "search" | "image" | "list" | "warning";

export class KEmpty extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["heading", "description", "illustration", "action-label"];

    protected override render(): void {
        const illustration = (this.getAttribute("illustration") ?? "book") as EmptyIllustration;

        this.root.replaceChildren();

        const container = document.createElement("div");
        container.className = "empty";

        const graphic = document.createElement("div");
        graphic.className = "illustration";
        graphic.setAttribute("aria-hidden", "true");
        graphic.appendChild(createIcon(illustration as IconName, 96));

        const heading = document.createElement("p");
        heading.className = "heading";
        heading.textContent = this.getAttribute("heading") ?? "";

        const description = document.createElement("p");
        description.className = "description";
        description.textContent = this.getAttribute("description") ?? "";

        container.appendChild(graphic);
        container.appendChild(heading);
        container.appendChild(description);

        const actionLabel = this.getAttribute("action-label");
        if (actionLabel) {
            const actions = document.createElement("div");
            actions.className = "actions";
            const action = document.createElement("k-button");
            action.setAttribute("variant", "primary");
            action.setAttribute("size", "sm");
            action.textContent = actionLabel;
            actions.appendChild(action);
            container.appendChild(actions);
        }

        this.root.appendChild(container);
    }
}

defineComponent("k-empty", KEmpty);

declare global {
    interface HTMLElementTagNameMap {
        "k-empty": KEmpty;
    }
}
