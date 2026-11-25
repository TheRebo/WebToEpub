/**
 * `<k-button>`.
 *
 * A native `<button>` under the hood, so the semantics, the activation
 * behaviour, and `:focus-visible` come for free.
 *
 * The design system's contract:
 *  - variants: primary, secondary, ghost, danger, subtle
 *  - sizes: sm (28px), md (34px), lg (42px)
 *  - the loading state replaces the label with a spinner of the same optical
 *    size and does **not** change the button's width
 *  - icon-only buttons must supply an `aria-label`
 *
 * The accessible name comes from the `aria-label` attribute, then the
 * `label` attribute, then the slotted content. The `label` attribute is
 * rendered as the button's text when nothing is slotted, so that a button
 * built in code has a name without anyone having to write markup.
 */
import { KComponent, defineComponent } from "./base";
import { createIcon, type IconName } from "./icons";

/** The button's variants. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "subtle";

/** The button's sizes. */
export type ButtonSize = "sm" | "md" | "lg";

const STYLES = `
:host {
    display: inline-flex;
    --_bg: transparent;
    --_fg: var(--text);
    --_border: transparent;
    --_pad-x: var(--space-4);
    --_height: var(--control-height-md);
    --_font: var(--text-sm);
    --_radius: var(--radius-md);
    --_transition: background-color var(--dur-instant) var(--ease-out),
                   border-color var(--dur-instant) var(--ease-out),
                   color var(--dur-instant) var(--ease-out);
}

:host([hidden]) { display: none; }

button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: 0;
    height: var(--_height);
    padding: 0 var(--_pad-x);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    background: var(--_bg);
    color: var(--_fg);
    font-family: var(--font-sans);
    font-size: var(--_font);
    font-weight: var(--weight-medium);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    transition: var(--_transition);
    -webkit-appearance: none;
    appearance: none;
}

button:hover:not(:disabled) { --_bg-hover: var(--bg-subtle); }
button:active:not(:disabled) { transform: scale(0.98); }
button:disabled { cursor: not-allowed; }

/* Variants */
:host([variant="primary"]) button {
    --_bg: var(--accent);
    --_fg: var(--text-on-accent);
    --_border: transparent;
}
:host([variant="primary"]) button:hover:not(:disabled) { --_bg: var(--accent-hover); }
:host([variant="primary"]) button:active:not(:disabled) { --_bg: var(--accent-active); }

:host([variant="secondary"]) button {
    --_bg: var(--surface);
    --_fg: var(--text);
    --_border: var(--border-strong);
}
:host([variant="secondary"]) button:hover:not(:disabled) { --_bg: var(--bg-subtle); }

:host([variant="ghost"]) button {
    --_bg: transparent;
    --_fg: var(--text-secondary);
    --_border: transparent;
}
:host([variant="ghost"]) button:hover:not(:disabled) {
    --_bg: var(--bg-subtle);
    --_fg: var(--text);
}

:host([variant="danger"]) button {
    --_bg: var(--danger);
    --_fg: #ffffff;
    --_border: transparent;
}
:host([variant="danger"]) button:hover:not(:disabled) { --_bg: var(--danger); filter: brightness(1.1); }

:host([variant="subtle"]) button {
    --_bg: var(--accent-subtle);
    --_fg: var(--accent-text);
    --_border: transparent;
}
:host([variant="subtle"]) button:hover:not(:disabled) { --_bg: var(--accent-subtle); filter: brightness(0.97); }

/* Sizes */
:host([size="sm"]) button {
    --_height: 28px;
    --_pad-x: var(--space-3);
    --_font: var(--text-xs);
    --_radius: var(--radius-sm);
}
:host([size="lg"]) button {
    --_height: 42px;
    --_pad-x: var(--space-5);
    --_font: var(--text-base);
}

/* Icon-only */
:host([icon-only]) button { padding: 0; width: var(--_height); }

/* The focus ring lives on the inner button so it follows the shape. */
button:focus-visible {
    outline: none;
    box-shadow: var(--ring);
}

/* Disabled uses tokens, never opacity, so it stays legible in dark mode. */
:host([disabled]) button {
    --_bg: var(--surface-sunken);
    --_fg: var(--text-muted);
    --_border: var(--border);
}

/* The spinner keeps the button's width stable. */
.spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: k-spin 0.7s linear infinite;
    flex-shrink: 0;
}

@keyframes k-spin { to { transform: rotate(360deg); } }

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own "[data-reduce-motion="true"] *" rule cannot pierce the
 * shadow boundary, so the component mirrors the preference onto its host.
 */
:host([data-reduced-motion]) .spinner {
    animation: none;
    border-right-color: currentColor;
    opacity: 0.6;
}
:host([data-reduced-motion]) button:active:not(:disabled) { transform: none; }

@media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; border-right-color: currentColor; opacity: 0.6; }
    button:active:not(:disabled) { transform: none; }
}

/*
 * The content wrapper.
 *
 * The label and the slotted content live in one wrapper so that the loading
 * state can fade out the whole of the button's text in one go.
 */
.content {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

/*
 * The label.
 *
 * The text is kept in the button even while it is loading, so that the
 * accessible name survives; the spinner is drawn over it.
 */
.label {
    overflow: hidden;
    text-overflow: ellipsis;
}

/*
 * The label is only shown when there is no slotted content.
 *
 * The hiding is done with a component rule rather than the "hidden"
 * attribute, because the document's "[hidden] { display: none !important }"
 * rule does not pierce the shadow boundary and the user-agent rule it
 * replaces is not guaranteed to win against an author rule.
 *
 * The text is clipped rather than removed with "display: none", so that it
 * stays in the accessibility tree. A button whose only name came from the
 * label attribute would otherwise be announced as an unlabelled button
 * whenever something was slotted into it.
 */
.label[data-suppressed="true"] {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

/*
 * While loading, the text is made transparent rather than hidden.
 *
 * "display: none" and "visibility: hidden" would both take the text out of
 * the accessibility tree, and the accessible name is exactly what a screen
 * reader needs when the button is busy. Opacity leaves the text in the tree
 * and in the layout, so the button also keeps its width.
 */
:host([loading]) .content {
    opacity: 0;
}

/*
 * The spinner sits over the label rather than replacing it, so that the
 * button does not change width when it enters the loading state.
 */
:host([loading]) .spinner {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
}
`;

export class KButton extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = [
        "variant",
        "size",
        "disabled",
        "loading",
        "icon-only",
        "icon",
        "label",
        "aria-label",
    ];

    /** The inner button. */
    private button: HTMLButtonElement | undefined;

    override connectedCallback(): void {
        super.connectedCallback();
        this.addEventListener("click", this.#onClick);
    }

    override disconnectedCallback(): void {
        this.removeEventListener("click", this.#onClick);
        super.disconnectedCallback();
    }

    protected override render(): void {
        if (!this.button) {
            this.button = document.createElement("button");
            this.button.type = "button";
            this.root.appendChild(this.button);
        }

        const button = this.button;
        const loading = this.hasAttribute("loading");
        const disabled = this.disabled || loading;
        button.disabled = disabled;
        button.setAttribute("aria-busy", loading ? "true" : "false");

        // The accessible name comes from the aria-label, the label attribute,
        // or the slotted content — in that order of preference.
        const ariaLabel = this.getAttribute("aria-label");
        if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
        else button.removeAttribute("aria-label");

        button.replaceChildren();

        if (loading) {
            const spinner = document.createElement("span");
            spinner.className = "spinner";
            spinner.setAttribute("aria-hidden", "true");
            button.appendChild(spinner);
        } else {
            const iconName = this.getAttribute("icon") as IconName | null;
            if (iconName) {
                button.appendChild(
                    createIcon(iconName, this.getAttribute("size") === "sm" ? 16 : 20),
                );
            }
        }

        // The label text and the slotted content share a wrapper, so that the
        // loading state can fade the whole of the button's text out in one
        // go without taking it out of the accessibility tree.
        const content = document.createElement("span");
        content.className = "content";

        // The label text is rendered whether or not anything is slotted: when
        // nothing is slotted it *is* the button's text, and when something is
        // slotted the slotted content wins visually while the label stays in
        // the button as a fallback for the accessible name.
        const label = this.getAttribute("label");
        if (label) {
            const text = document.createElement("span");
            text.className = "label";
            text.textContent = label;
            content.appendChild(text);
        }

        const slot = document.createElement("slot");
        slot.addEventListener("slotchange", this.#onSlotChange);
        content.appendChild(slot);
        button.appendChild(content);

        // The label text is only shown when there is no slotted content, so
        // that the two do not appear side by side.
        this.#syncSlot();
    }

    /**
     * Hide the rendered label when the slot has content.
     *
     * Whether the slot has content is read from the light DOM rather than
     * from `assignedNodes()`, because the light DOM is what the page
     * controls and it is available before the slot has been distributed.
     */
    #syncSlot(): void {
        const button = this.button;
        const label = button?.querySelector<HTMLElement>(".label");
        if (!label) return;
        label.dataset["suppressed"] = String(this.#hasSlottedContent());
    }

    /** Whether the host has light DOM content for the slot. */
    #hasSlottedContent(): boolean {
        for (const node of Array.from(this.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
                if ((node.textContent ?? "").trim() !== "") return true;
                continue;
            }
            if (node.nodeType === Node.ELEMENT_NODE) return true;
        }
        return false;
    }

    /** The button's text label, when set through the `label` attribute. */
    get text(): string | null {
        return this.getAttribute("label");
    }

    set text(value: string | null) {
        if (value === null) this.removeAttribute("label");
        else this.setAttribute("label", value);
    }

    /** Focus the inner button. */
    override focus(options?: FocusOptions): void {
        this.button?.focus(options);
    }

    #onClick = (event: Event): void => {
        if (this.disabled || this.hasAttribute("loading")) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        this.emit("k-click", { original: event });
    };

    #onSlotChange = (): void => {
        this.#syncSlot();
    };
}

defineComponent("k-button", KButton);

declare global {
    interface HTMLElementTagNameMap {
        "k-button": KButton;
    }
}
