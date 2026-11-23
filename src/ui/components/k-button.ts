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

@media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; border-right-color: currentColor; opacity: 0.6; }
    button:active:not(:disabled) { transform: none; }
}

.label { overflow: hidden; text-overflow: ellipsis; }
`;

export class KButton extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = [
        "variant",
        "size",
        "disabled",
        "loading",
        "icon-only",
        "label",
    ];

    /** The inner button. */
    private button: HTMLButtonElement | undefined;

    override connectedCallback(): void {
        super.connectedCallback();
        this.addEventListener("click", this.#onClick);
    }

    override disconnectedCallback(): void {
        this.removeEventListener("click", this.#onClick);
    }

    protected override render(): void {
        if (!this.button) {
            this.button = document.createElement("button");
            this.button.type = "button";
            this.root.appendChild(this.button);
        }

        const button = this.button;
        const disabled = this.disabled || this.hasAttribute("loading");
        button.disabled = disabled;
        button.setAttribute("aria-busy", this.hasAttribute("loading") ? "true" : "false");

        // The accessible name comes from the aria-label, the slot, or the
        // label attribute — in that order of preference.
        const ariaLabel = this.getAttribute("aria-label");
        if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
        else button.removeAttribute("aria-label");

        button.replaceChildren();

        if (this.hasAttribute("loading")) {
            const spinner = document.createElement("span");
            spinner.className = "spinner";
            spinner.setAttribute("aria-hidden", "true");
            button.appendChild(spinner);
            return;
        }

        const iconName = this.getAttribute("icon") as IconName | null;
        if (iconName) {
            button.appendChild(createIcon(iconName, this.getAttribute("size") === "sm" ? 16 : 20));
        }

        const slot = document.createElement("slot");
        button.appendChild(slot);
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
}

defineComponent("k-button", KButton);

declare global {
    interface HTMLElementTagNameMap {
        "k-button": KButton;
    }
}
