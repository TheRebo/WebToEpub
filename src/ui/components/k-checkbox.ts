/**
 * `<k-checkbox>`.
 *
 * A native `<input type="checkbox">` with a custom 16 px box.
 *
 * The contract:
 *  - the label is part of the component, so clicking the text toggles the
 *    box. The baseline's `<td>label</td><td><input>` pattern made the text
 *    unclickable.
 *  - the indeterminate state is rendered as a dash
 *  - the disabled state uses tokens, never `opacity: 0.5`, which in dark
 *    mode made disabled look enabled
 */
import { KComponent, defineComponent } from "./base";

const STYLES = `
:host {
    display: inline-flex;
}

:host([hidden]) { display: none; }

label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--text-base);
    color: var(--text);
    min-width: 0;
}

input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
}

.box {
    position: relative;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border: 1.5px solid var(--border-strong);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    transition: background-color var(--dur-instant) var(--ease-out),
                border-color var(--dur-instant) var(--ease-out);
}

.box svg {
    position: absolute;
    inset: 0;
    margin: auto;
    opacity: 0;
    transform: scale(0.7);
    transition: opacity var(--dur-instant) var(--ease-out),
                transform var(--dur-instant) var(--ease-out);
    color: var(--text-on-accent);
}

input:checked + .box {
    background: var(--accent);
    border-color: var(--accent);
}

input:checked + .box svg {
    opacity: 1;
    transform: scale(1);
}

input:indeterminate + .box {
    background: var(--accent);
    border-color: var(--accent);
}

input:indeterminate + .box .dash {
    opacity: 1;
}

input:focus-visible + .box {
    box-shadow: var(--ring);
}

:host([disabled]) label {
    cursor: not-allowed;
    color: var(--text-muted);
}

:host([disabled]) .box {
    background: var(--surface-sunken);
    border-color: var(--border);
}

.text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
    .box svg { transition: none; transform: none; }
}
`;

/** The checkbox's visual states. */
export type CheckboxState = "checked" | "unchecked" | "indeterminate";

export class KCheckbox extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["checked", "indeterminate", "disabled", "label"];

    private input: HTMLInputElement | undefined;

    protected override render(): void {
        if (!this.input) {
            this.root.replaceChildren();
            this.input = document.createElement("input");
            this.input.type = "checkbox";
            this.#build();
        }

        const input = this.input;
        input.checked = this.hasAttribute("checked");
        input.indeterminate = this.hasAttribute("indeterminate");
        input.disabled = this.hasAttribute("disabled");
    }

    /** Build the component's structure. */
    #build(): void {
        const input = this.input as HTMLInputElement;
        const label = document.createElement("label");

        const box = document.createElement("span");
        box.className = "box";
        box.setAttribute("aria-hidden", "true");

        const check = document.createElement("span");
        check.style.position = "absolute";
        check.style.inset = "0";
        check.style.margin = "auto";
        check.style.opacity = "0";
        check.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>';
        box.appendChild(check);

        const dash = document.createElement("span");
        dash.className = "dash";
        dash.style.position = "absolute";
        dash.style.inset = "0";
        dash.style.margin = "auto";
        dash.style.opacity = "0";
        dash.innerHTML =
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M6 12h12"/></svg>';
        box.appendChild(dash);

        const text = document.createElement("span");
        text.className = "text";

        label.appendChild(input);
        label.appendChild(box);
        label.appendChild(text);
        this.root.appendChild(label);

        input.addEventListener("change", () => {
            this.toggleAttribute("checked", input.checked);
            this.removeAttribute("indeterminate");
            this.emit("k-change", { checked: input.checked });
        });
    }

    /** The checkbox's label. */
    get text(): string | null {
        return this.getAttribute("label");
    }

    set text(value: string | null) {
        if (value === null) this.removeAttribute("label");
        else this.setAttribute("label", value);
        const element = this.root.querySelector(".text");
        if (element) element.textContent = value ?? "";
    }

    /** Whether the checkbox is checked. */
    get checked(): boolean {
        return this.hasAttribute("checked");
    }

    set checked(value: boolean) {
        this.toggleAttribute("checked", value);
        if (this.input) this.input.checked = value;
    }

    /** Whether the checkbox is in the indeterminate state. */
    get indeterminate(): boolean {
        return this.hasAttribute("indeterminate");
    }

    set indeterminate(value: boolean) {
        this.toggleAttribute("indeterminate", value);
        if (this.input) this.input.indeterminate = value;
    }

    /** Focus the input. */
    override focus(options?: FocusOptions): void {
        this.input?.focus(options);
    }
}

defineComponent("k-checkbox", KCheckbox);

declare global {
    interface HTMLElementTagNameMap {
        "k-checkbox": KCheckbox;
    }
}
