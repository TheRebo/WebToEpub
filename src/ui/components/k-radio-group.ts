/**
 * `<k-radio-group>`.
 *
 * A group of mutually exclusive choices, rendered as a segmented control.
 *
 * The design system uses this for the theme, accent, and density pickers,
 * where the choices are few, short, and benefit from being seen all at once.
 * A native `<select>` would hide the alternatives behind a click; a group of
 * native radio buttons would show them but not as a designed control.
 *
 * The semantics are real radios in a `<fieldset>`, so the arrow keys move
 * between the options and a screen reader announces "2 of 3".
 */
import { KComponent, defineComponent } from "./base";

const STYLES = `
:host { display: block; }
:host([hidden]) { display: none; }

fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
}

/*
 * The legend is visually hidden, but not with "display: none".
 *
 * A hidden legend is removed from the accessibility tree, and the legend is
 * the fieldset's accessible name — a group with no name is announced as
 * "radio group" and nothing else. Clipping it keeps it in the tree.
 */
.legend {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

label {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 32px;
    padding: 0 var(--space-4);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    transition:
        background-color var(--dur-fast) var(--ease-out),
        border-color var(--dur-fast) var(--ease-out),
        color var(--dur-fast) var(--ease-out);
}

label:hover { background: var(--bg-subtle); color: var(--text); }

input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
}

input:checked + .option-label { color: var(--text-on-accent); }

label:has(input:checked) {
    background: var(--accent);
    border-color: transparent;
    color: var(--text-on-accent);
}

label:has(input:focus-visible) {
    outline: 2px solid transparent;
    box-shadow: var(--ring);
}

/* A swatch, for the accent picker. */
.swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--_swatch, var(--accent));
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 12%);
}

label:has(input:checked) .swatch {
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 45%);
}

:host([disabled]) label {
    cursor: not-allowed;
    color: var(--text-muted);
    background: var(--surface-sunken);
}

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) label { transition: none; }

@media (prefers-reduced-motion: reduce) {
    label { transition: none; }
}
`;

export class KRadioGroup extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["value", "disabled", "legend"];

    private fieldset: HTMLFieldSetElement | undefined;
    private legend: HTMLLegendElement | undefined;

    /**
     * The group's radio name.
     *
     * Every radio in the group shares one name: that is what makes them
     * mutually exclusive, and what makes the arrow keys move between the
     * options rather than between separate groups. The name is generated
     * once, for the group, and not once per option.
     */
    private readonly groupName = `k-radio-group-${crypto.randomUUID().slice(0, 8)}`;

    protected override render(): void {
        this.#ensureStructure();

        const fieldset = this.fieldset;
        const legend = this.legend;
        if (!fieldset || !legend) return;

        // The legend is rebuilt from the attribute on every render, so that
        // changing the attribute changes what the group is called.
        this.setText(legend, this.getAttribute("legend") ?? "");

        // The group's accessible name comes from the label beside it when
        // there is one, and from the legend otherwise. A legend that is
        // visually hidden is still announced by a screen reader, so the group
        // is never nameless.
        const labelledBy = this.getAttribute("aria-labelledby");
        if (labelledBy) fieldset.setAttribute("aria-labelledby", labelledBy);
        else fieldset.removeAttribute("aria-labelledby");

        const disabled = this.hasAttribute("disabled");
        const value = this.getAttribute("value") ?? "";

        for (const input of this.#inputs()) {
            input.disabled = disabled;
            input.checked = input.value === value;
        }
    }

    /**
     * Build the fieldset, if it is not built yet.
     *
     * The structure is built on demand rather than only when the element is
     * connected, because a page may add its options before the element ever
     * reaches the document.
     */
    #ensureStructure(): void {
        if (this.fieldset) return;
        this.root.replaceChildren();
        this.fieldset = document.createElement("fieldset");
        this.legend = document.createElement("legend");
        this.legend.className = "legend";
        this.fieldset.appendChild(this.legend);
        this.root.appendChild(this.fieldset);
    }

    /** The group's inputs. */
    #inputs(): HTMLInputElement[] {
        return Array.from(this.root.querySelectorAll("input[type=radio]"));
    }

    /** The group's value. */
    get value(): string {
        const checked = this.#inputs().find((input) => input.checked);
        return checked?.value ?? "";
    }

    set value(newValue: string) {
        this.setAttribute("value", newValue);
        for (const input of this.#inputs()) input.checked = input.value === newValue;
    }

    /** Add an option. */
    addOption(optionValue: string, label: string, swatch?: string): void {
        this.#ensureStructure();
        const fieldset = this.fieldset;
        if (!fieldset) return;

        const id = `k-radio-${crypto.randomUUID().slice(0, 8)}`;
        const input = document.createElement("input");
        input.type = "radio";
        input.name = this.groupName;
        input.id = id;
        input.value = optionValue;

        const element = document.createElement("label");
        element.setAttribute("for", id);

        if (swatch) {
            const dot = document.createElement("span");
            dot.className = "swatch";
            dot.setAttribute("aria-hidden", "true");
            dot.style.setProperty("--_swatch", swatch);
            element.appendChild(dot);
        }

        const text = document.createElement("span");
        text.className = "option-label";
        text.textContent = label;
        element.appendChild(text);

        element.insertBefore(input, element.firstChild);
        fieldset.appendChild(element);

        input.addEventListener("change", () => {
            if (!input.checked) return;
            this.setAttribute("value", input.value);
            this.emit("k-change", { value: input.value });
        });

        input.checked = optionValue === (this.getAttribute("value") ?? "");
    }

    override focus(options?: FocusOptions): void {
        const checked = this.#inputs().find((input) => input.checked);
        (checked ?? this.#inputs()[0])?.focus(options);
    }
}

defineComponent("k-radio-group", KRadioGroup);

declare global {
    interface HTMLElementTagNameMap {
        "k-radio-group": KRadioGroup;
    }
}
