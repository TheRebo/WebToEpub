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
 *
 * Events:
 *  - `k-change` is dispatched from the host whenever the control's value
 *    changes. The native `input` and `change` events of the internal control
 *    are **not composed**, so they never cross the shadow boundary and the
 *    page around the component would hear nothing at all. The component
 *    re-dispatches them as one composed, bubbling `k-change`, whose detail is
 *    `{ value, name }`.
 *
 *    The event fires once per change: on `input` for the text-like controls,
 *    so that typing is live, and on `change` for a `<select>`, which has no
 *    meaningful `input` event of its own. It deliberately does *not* also
 *    re-dispatch a native `input` or `change` event: a page that listens for
 *    both would then persist the value twice.
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
    border: var(--border);
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

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) input,
:host([data-reduced-motion]) select,
:host([data-reduced-motion]) textarea { transition: none; }

@media (prefers-reduced-motion: reduce) {
    input, select, textarea { transition: none; }
}
`;

/** The controls the field can render. */
type FieldControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

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
        "min",
        "max",
        "step",
        "pattern",
        "name",
        "required",
        "group",
    ];

    /**
     * The field is a form-associated custom element.
     *
     * The control lives in a shadow root, so the browser's own form
     * submission cannot see it. Form association is what puts the value back
     * into the form's data — the equivalent of a plain `<input name="…">`.
     */
    static formAssociated = true;

    /** The control's ID, used to wire the label and the descriptions. */
    readonly inputId = `k-field-${crypto.randomUUID().slice(0, 8)}`;

    /** The ID of the label, for a row that is labelled rather than labelled-for. */
    readonly labelId = `${this.inputId}-label`;

    private input: FieldControl | undefined;
    private controlWrap: HTMLDivElement | undefined;
    private hintNode: HTMLDivElement | undefined;
    private errorNode: HTMLDivElement | undefined;
    private groupField: HTMLDivElement | undefined;
    private groupBuilt = false;
    private internals: ElementInternals | undefined;
    private initialValue = "";

    constructor() {
        super();
        // `attachInternals` is a feature test rather than a version test: a
        // browser without it still renders the field, it just cannot take
        // part in form submission.
        if (typeof this.attachInternals === "function") {
            try {
                this.internals = this.attachInternals();
            } catch {
                this.internals = undefined;
            }
        }
    }

    protected override render(): void {
        const type = this.getAttribute("type") ?? "text";

        // A grouped row has no control of its own: it is a label for a
        // control that lives beside it. The group markup is built on the
        // first render, not only once a control happens to exist — the
        // control never does.
        if (this.hasAttribute("group")) {
            this.#renderGroup();
            return;
        }

        // Recreate the control only when its type changes; otherwise the
        // user's cursor position and selection would be lost on every
        // attribute change.
        let rebuilt = false;
        if (!this.input || this.input.tagName !== tagForType(type)) {
            rebuilt = true;
            this.root.replaceChildren();
            this.input = createControl(type);
            this.#build();
        }

        const input = this.input;
        if (!input) return;
        input.id = this.inputId;

        // A `<select>`'s options are supplied as light DOM children.
        //
        // They stay in the light DOM: the light DOM is the source of truth, and
        // the control gets a copy. Moving them into the control would make
        // the control the owner, and changing the field's type would then
        // destroy the options along with the control that held them.
        if (input instanceof HTMLSelectElement) {
            this.#syncOptions(input);
        }

        input.disabled = this.hasAttribute("disabled");
        input.required = this.hasAttribute("required");

        const name = this.getAttribute("name");
        if (name) input.name = name;
        else input.removeAttribute("name");

        if (input instanceof HTMLInputElement) {
            const value = this.getAttribute("value") ?? "";
            if (input.value !== value) input.value = value;
            const placeholder = this.getAttribute("placeholder");
            if (placeholder) input.placeholder = placeholder;
            else input.removeAttribute("placeholder");
            const currentType = input.getAttribute("type");
            if (currentType !== type) input.setAttribute("type", type);
            this.#forwardConstraint(input, "min", "min");
            this.#forwardConstraint(input, "max", "max");
            this.#forwardConstraint(input, "step", "step");
            this.#forwardConstraint(input, "pattern", "pattern");
        } else if (input instanceof HTMLSelectElement) {
            // The value is set by the option list, not by an attribute, so it
            // is only applied when the select has options.
            const value = this.getAttribute("value") ?? "";
            if (input.options.length > 0 && input.value !== value) input.value = value;
        } else {
            const value = this.getAttribute("value") ?? "";
            if (input.value !== value) input.value = value;
            const placeholder = this.getAttribute("placeholder");
            if (placeholder) input.placeholder = placeholder;
            else input.removeAttribute("placeholder");
        }

        this.#updateDescriptions();

        const error = this.getAttribute("error");
        input.setAttribute("aria-invalid", error ? "true" : "false");

        this.internals?.setFormValue(input.value);

        // The value a form reset returns to is the value the control had when
        // it was built, which is not yet applied at that point — the attribute
        // is applied above.
        if (rebuilt) this.initialValue = input.value;
    }

    /**
     * Copy the light DOM's `<option>` elements into the control.
     *
     * The light DOM keeps the originals, so the options survive a change of
     * the field's type; the control holds copies, so it can be rebuilt at any
     * time without losing them.
     *
     * Options that were appended straight to the control are left alone: they
     * are not the field's to remove, and the control is the only place they
     * exist. Only the copies this method made are taken away again.
     *
     * @param select The control to fill.
     */
    #syncOptions(select: HTMLSelectElement): void {
        const wanted = Array.from(this.querySelectorAll("option"));
        if (wanted.length === 0) return;

        const wantedValues = wanted.map((option) => option.value);

        // Take away the copies that are no longer in the light DOM, and only
        // those: an option the page put straight into the control is left be.
        for (const option of Array.from(select.options)) {
            if (!option.dataset["kintsugiMirror"]) continue;
            if (!wantedValues.includes(option.value)) option.remove();
        }

        // Add the ones that are missing, and refresh the ones that are left.
        for (const source of wanted) {
            const existing = Array.from(select.options).find(
                (option) =>
                    option.dataset["kintsugiMirror"] === "true" && option.value === source.value,
            );
            if (!existing) {
                const copy = document.createElement("option");
                copy.value = source.value;
                copy.textContent = source.textContent;
                copy.disabled = source.disabled;
                copy.dataset["kintsugiMirror"] = "true";
                select.appendChild(copy);
            } else {
                existing.textContent = source.textContent;
                existing.disabled = source.disabled;
            }
        }
    }

    /**
     * Copy a constraint attribute onto the internal control.
     *
     * The constraints live on the host, because that is what the page sets,
     * but the browser validates the control — so they have to be forwarded.
     */
    #forwardConstraint(input: HTMLInputElement, attribute: string, property: string): void {
        const value = this.getAttribute(attribute);
        if (value === null) input.removeAttribute(attribute);
        else input.setAttribute(attribute, value);
        // `min` and `max` are reflected onto the element as properties; the
        // others are not, so the property is only set where it exists.
        if (property in input) {
            (input as unknown as Record<string, unknown>)[property] = value === null ? "" : value;
        }
    }

    /**
     * Render the grouped field: a label and a hint, but no control.
     *
     * The label is a `<span>` rather than a `<label>`, because it does not
     * point at a control — the control is the segmented choice beside it.
     * The row is wired to that control with `aria-labelledby`.
     *
     * The markup is built whether or not a control exists, because a grouped
     * row never has one: the group markup used to be built inside a guard
     * that waited for a control, so a grouped row rendered nothing at all.
     */
    #renderGroup(): void {
        if (!this.groupBuilt) {
            this.root.replaceChildren();
            this.groupBuilt = true;
            this.input = undefined;
            // The descriptions belong to the control, which a grouped row does
            // not have, so the old nodes are dropped with it.
            this.hintNode = undefined;
            this.errorNode = undefined;
            this.controlWrap = undefined;

            const field = document.createElement("div");
            field.className = "field";

            const label = document.createElement("span");
            label.className = "label";
            label.id = this.labelId;
            field.appendChild(label);

            this.groupField = field;
            this.root.appendChild(field);
        }

        const label = this.root.querySelector(".label");
        if (label) this.setText(label, this.getAttribute("label") ?? "");

        this.#updateGroupHint();
    }

    /**
     * Keep the grouped row's hint in step with the attribute.
     *
     * The hint is rebuilt whenever it changes, so that the ID the page wires
     * into `aria-labelledby` — or `aria-describedby` — always points at a node
     * that exists.
     */
    #updateGroupHint(): void {
        const field = this.groupField;
        if (!field) return;

        const hint = this.getAttribute("hint");
        if (hint) {
            if (!this.hintNode) {
                const node = document.createElement("div");
                node.className = "hint";
                node.id = this.hintId;
                this.hintNode = node;
                field.appendChild(node);
            }
            this.setText(this.hintNode, hint);
        } else if (this.hintNode) {
            this.hintNode.remove();
            this.hintNode = undefined;
        }
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
        this.controlWrap = control;
        this.hintNode = undefined;
        this.errorNode = undefined;
        this.groupField = undefined;
        // The field is no longer a grouped row, so the grouped markup has to be
        // built again if the `group` attribute comes back.
        this.groupBuilt = false;

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
        field.appendChild(control);
        this.root.appendChild(field);

        const input = this.input;
        if (!input) return;

        // One event, one source of truth: the control's own `input` event for
        // the text-like controls, and its `change` event for a `<select>`,
        // which has no useful `input` event of its own.
        const eventName = input instanceof HTMLSelectElement ? "change" : "input";
        input.addEventListener(eventName, this.#onControlChanged);
    }

    /**
     * Rebuild the hint and the error, and keep `aria-describedby` accurate.
     *
     * The nodes are created and destroyed as the attributes change, rather
     * than built once: a description that points at a node which no longer
     * exists is worse than no description at all.
     */
    #updateDescriptions(): void {
        const control = this.controlWrap;
        const input = this.input;
        if (!control || !input) return;

        const hint = this.getAttribute("hint");
        if (hint) {
            if (!this.hintNode) {
                const node = document.createElement("div");
                node.className = "hint";
                node.id = this.hintId;
                this.hintNode = node;
                control.appendChild(node);
            }
            this.setText(this.hintNode, hint);
        } else if (this.hintNode) {
            this.hintNode.remove();
            this.hintNode = undefined;
        }

        const error = this.getAttribute("error");
        if (error) {
            if (!this.errorNode) {
                const node = document.createElement("div");
                node.className = "error";
                node.id = this.errorId;
                node.setAttribute("role", "alert");
                const icon = document.createElement("span");
                icon.setAttribute("aria-hidden", "true");
                icon.textContent = "⚠";
                node.appendChild(icon);
                const text = document.createElement("span");
                node.appendChild(text);
                this.errorNode = node;
                control.appendChild(node);
            }
            const text = this.errorNode.lastElementChild;
            if (text) this.setText(text, error);
        } else if (this.errorNode) {
            this.errorNode.remove();
            this.errorNode = undefined;
        }

        const descriptions: string[] = [];
        if (this.hintNode) descriptions.push(this.hintId);
        if (this.errorNode) descriptions.push(this.errorId);

        if (descriptions.length > 0) input.setAttribute("aria-describedby", descriptions.join(" "));
        else input.removeAttribute("aria-describedby");
    }

    /** The control's current value. */
    get value(): string {
        return this.input?.value ?? this.getAttribute("value") ?? "";
    }

    set value(newValue: string) {
        // The attribute is the single source of truth, so that a re-render
        // cannot overwrite what the user typed with a stale value.
        if (this.getAttribute("value") === newValue) {
            if (this.input && this.input.value !== newValue) this.input.value = newValue;
            return;
        }
        this.setAttribute("value", newValue);
    }

    /** The hint's ID. */
    private get hintId(): string {
        return `${this.inputId}-hint`;
    }

    /** The error's ID. */
    private get errorId(): string {
        return `${this.inputId}-error`;
    }

    /** Focus the control. */
    override focus(options?: FocusOptions): void {
        this.input?.focus(options);
    }

    /** The control changed; tell the world. */
    #onControlChanged = (): void => {
        const input = this.input;
        if (!input) return;

        // The value is reflected onto the host so that the attribute never
        // goes stale and a later re-render cannot undo the user's typing.
        if (this.getAttribute("value") !== input.value) {
            this.setAttribute("value", input.value);
        }

        this.internals?.setFormValue(input.value);

        this.emit("k-change", { value: input.value, name: this.getAttribute("name") });
    };

    /** The form was reset. */
    formResetCallback(): void {
        this.value = this.initialValue;
    }

    /** The form's disabled state changed. */
    formDisabledCallback(disabled: boolean): void {
        if (this.input) this.input.disabled = disabled;
    }
}

/** The tag name for an input type. */
function tagForType(type: string): string {
    return type === "select" ? "SELECT" : type === "textarea" ? "TEXTAREA" : "INPUT";
}

/** Create the control for a type. */
function createControl(type: string): FieldControl {
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
