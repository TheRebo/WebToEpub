/**
 * `<k-field>`.
 *
 * A label, a control, an optional hint, and an optional error, in a vertical
 * stack.
 *
 * The contract:
 *  - the label is a real `<label for>`, not a `<td>`
 *  - the hint is wired via `aria-describedby`
 *  - the error is wired via `aria-describedby` plus `aria-invalid="true"`,
 *    and is not conveyed by colour alone
 *  - the `horizontal` variant puts the label to the left, for dense forms
 *  - the `group` variant renders **only** a label and a hint, for a row that
 *    is controlled by another element — a segmented choice, say — and labels
 *    it with `aria-labelledby` rather than with a `for`
 */
import { KComponent, defineComponent } from "./base";

const STYLES = `
:host {
    display: block;
    --_gap: var(--space-1);
}

:host([hidden]) { display: none; }

.field {
    display: flex;
    flex-direction: column;
    gap: var(--_gap);
}

:host([horizontal]) .field {
    flex-direction: row;
    align-items: flex-start;
    gap: var(--space-4);
}

:host([horizontal]) .label {
    flex: 0 0 132px;
    padding-top: 7px;
    text-align: right;
}

.label {
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    color: var(--text-secondary);
}

.control {
    display: flex;
    flex-direction: column;
    gap: var(--_gap);
    flex: 1;
    min-width: 0;
}

:host([horizontal]) .control { padding-top: 0; }

input, select, textarea {
    width: 100%;
    min-height: 34px;
    padding: 6px 10px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--text);
    font-family: var(--font-sans);
    font-size: var(--text-base);
    line-height: 1.4;
    transition: border-color var(--dur-fast) var(--ease-out);
    -webkit-appearance: none;
    appearance: none;
}

select {
    padding-right: 30px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237c7466' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 16px;
}

input::placeholder, textarea::placeholder { color: var(--text-muted); }

input:focus-visible, select:focus-visible, textarea:focus-visible {
    outline: none;
    border-color: var(--accent);
    box-shadow: var(--ring);
}

input:disabled, select:disabled, textarea:disabled {
    background: var(--surface-sunken);
    color: var(--text-muted);
    border-color: var(--border);
    cursor: not-allowed;
}

.hint {
    font-size: var(--text-xs);
    color: var(--text-muted);
}

.error {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--danger);
}

.error svg { flex-shrink: 0; margin-top: 1px; }

.invalid input, .invalid select, .invalid textarea {
    border-color: var(--danger);
}

.detected {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-2xs);
    color: var(--text-muted);
}

.detected .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
}
`;

export class KField extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = [
        "label",
        "hint",
        "error",
        "type",
        "value",
        "disabled",
        "placeholder",
        "detected",
    ];

    /** The control's ID, used to wire the label and the descriptions. */
    readonly inputId = `k-field-${crypto.randomUUID().slice(0, 8)}`;

    /** The ID of the label, for a row that is labelled rather than labelled-for. */
    readonly labelId = `${this.inputId}-label`;

    private input: HTMLInputElement | HTMLSelectElement | undefined;
    private hintId = `${this.inputId}-hint`;
    private errorId = `${this.inputId}-error`;

    protected override render(): void {
        const type = this.getAttribute("type") ?? "text";
        const value = this.getAttribute("value") ?? "";
        const disabled = this.hasAttribute("disabled");
        const isGroup = this.hasAttribute("group");

        // A grouped row has no control of its own: it is a label for a
        // control that lives beside it.
        if (isGroup) {
            if (this.input) {
                this.input = undefined;
                this.root.replaceChildren();
                this.#buildGroup();
            }
            return;
        }

        // Recreate the control only when its type changes; otherwise the
        // user's cursor position and selection would be lost on every
        // attribute change.
        if (!this.input || this.input.tagName !== tagForType(type)) {
            this.root.replaceChildren();
            this.input = createControl(type) as HTMLInputElement | HTMLSelectElement;
            this.#build();
        }

        // A `<select>`'s options are supplied as light DOM children, so they
        // have to be moved into the control whenever it is (re)built.
        if (this.input instanceof HTMLSelectElement) {
            const options = Array.from(this.querySelectorAll("option"));
            for (const option of options) {
                if (option.parentElement !== this.input) this.input.appendChild(option);
            }
        }

        const input = this.input;
        input.id = this.inputId;
        input.disabled = disabled;

        if (input instanceof HTMLInputElement) {
            if (input.value !== value) input.value = value;
            const placeholder = this.getAttribute("placeholder");
            if (placeholder) input.placeholder = placeholder;
            else input.removeAttribute("placeholder");
            const type2 = input.getAttribute("type");
            if (type2 !== type) input.setAttribute("type", type);
        } else if (input instanceof HTMLSelectElement) {
            // The value is set by the option list, not by an attribute, so it
            // is only applied when the select has options.
            if (input.options.length > 0 && input.value !== value) input.value = value;
        }

        const descriptions: string[] = [];
        const hint = this.getAttribute("hint");
        if (hint) descriptions.push(this.hintId);
        const error = this.getAttribute("error");
        if (error) descriptions.push(this.errorId);

        if (descriptions.length > 0) {
            input.setAttribute("aria-describedby", descriptions.join(" "));
        } else {
            input.removeAttribute("aria-describedby");
        }

        input.setAttribute("aria-invalid", error ? "true" : "false");
    }

    /** Build the field's structure. */
    #build(): void {
        const field = document.createElement("div");
        field.className = "field";

        const label = document.createElement("label");
        label.className = "label";
        label.htmlFor = this.inputId;
        this.setText(label, this.getAttribute("label") ?? "");
        field.appendChild(label);

        const control = document.createElement("div");
        control.className = "control";

        const detected = this.getAttribute("detected");
        if (detected) {
            const marker = document.createElement("span");
            marker.className = "detected";
            const dot = document.createElement("span");
            dot.className = "dot";
            marker.appendChild(dot);
            const text = document.createElement("span");
            this.setText(text, detected);
            marker.appendChild(text);
            control.appendChild(marker);
        }

        control.appendChild(this.input as Element);

        const hint = this.getAttribute("hint");
        if (hint) {
            const hintElement = document.createElement("div");
            hintElement.className = "hint";
            hintElement.id = this.hintId;
            this.setText(hintElement, hint);
            control.appendChild(hintElement);
        }

        const error = this.getAttribute("error");
        if (error) {
            const errorElement = document.createElement("div");
            errorElement.className = "error";
            errorElement.id = this.errorId;
            errorElement.setAttribute("role", "alert");
            const icon = document.createElement("span");
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "⚠";
            errorElement.appendChild(icon);
            const text = document.createElement("span");
            this.setText(text, error);
            errorElement.appendChild(text);
            control.appendChild(errorElement);
        }

        field.appendChild(control);
        this.root.appendChild(field);
    }

    /**
     * Build a grouped field: a label and a hint, but no control.
     *
     * The label is a `<span>` rather than a `<label>`, because it does not
     * point at a control — the control is the segmented choice beside it.
     * The row is wired to that control with `aria-labelledby`.
     */
    #buildGroup(): void {
        const field = document.createElement("div");
        field.className = "field";

        const label = document.createElement("span");
        label.className = "label";
        label.id = this.labelId;
        this.setText(label, this.getAttribute("label") ?? "");
        field.appendChild(label);

        const hint = this.getAttribute("hint");
        if (hint) {
            const hintElement = document.createElement("div");
            hintElement.className = "hint";
            hintElement.id = this.hintId;
            this.setText(hintElement, hint);
            field.appendChild(hintElement);
        }

        this.root.appendChild(field);
    }

    /** The control's current value. */
    get value(): string {
        return this.input?.value ?? "";
    }

    set value(newValue: string) {
        if (this.input) this.input.value = newValue;
    }

    /** Focus the control. */
    override focus(options?: FocusOptions): void {
        this.input?.focus(options);
    }
}

/** The tag name for an input type. */
function tagForType(type: string): string {
    return type === "select" ? "SELECT" : type === "textarea" ? "TEXTAREA" : "INPUT";
}

/** Create the control for a type. */
function createControl(type: string): Element {
    if (type === "select") return document.createElement("select");
    if (type === "textarea") return document.createElement("textarea");
    const input = document.createElement("input");
    input.setAttribute("type", type);
    return input;
}

defineComponent("k-field", KField);

declare global {
    interface HTMLElementTagNameMap {
        "k-field": KField;
    }
}
