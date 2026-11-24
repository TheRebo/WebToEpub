/**
 * `<k-switch>`.
 *
 * A binary setting that takes effect immediately, as opposed to a checkbox
 * that needs an "Apply" button.
 *
 * Native `<input type="checkbox" role="switch">` under the hood.
 */
import { KComponent, defineComponent } from "./base";

const STYLES = `
:host { display: inline-flex; }
:host([hidden]) { display: none; }

label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
    font-size: var(--text-base);
    color: var(--text);
}

input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
    margin: 0;
    pointer-events: none;
}

.track {
    position: relative;
    width: 34px;
    height: 20px;
    flex-shrink: 0;
    border-radius: var(--radius-full);
    background: var(--border-strong);
    transition: background-color var(--dur-base) var(--ease-out);
}

.thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: var(--shadow-1);
    transition: transform var(--dur-base) var(--ease-out);
}

input:checked + .track { background: var(--accent); }
input:checked + .track .thumb { transform: translateX(14px); }

input:focus-visible + .track { box-shadow: var(--ring); }

:host([disabled]) label { cursor: not-allowed; color: var(--text-muted); }
:host([disabled]) .track { background: var(--surface-sunken); }
:host([disabled]) .thumb { background: var(--border-strong); }

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) .track,
:host([data-reduced-motion]) .thumb { transition: none; }

@media (prefers-reduced-motion: reduce) {
    .track, .thumb { transition: none; }
}
`;

export class KSwitch extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["checked", "disabled", "label"];

    private input: HTMLInputElement | undefined;

    protected override render(): void {
        if (!this.input) {
            this.root.replaceChildren();
            this.input = document.createElement("input");
            this.input.type = "checkbox";
            this.input.setAttribute("role", "switch");
            this.#build();
        }
        this.input.checked = this.hasAttribute("checked");
        this.input.disabled = this.hasAttribute("disabled");

        // The label lives in a shadow node that is built once, so it has to be
        // updated on every render — otherwise a switch whose `label` attribute
        // is set after construction shows nothing at all.
        const text = this.root.querySelector(".text");
        if (text) text.textContent = this.getAttribute("label") ?? "";
    }

    /** Build the component's structure. */
    #build(): void {
        const input = this.input as HTMLInputElement;
        const label = document.createElement("label");

        const track = document.createElement("span");
        track.className = "track";
        track.setAttribute("aria-hidden", "true");

        const thumb = document.createElement("span");
        thumb.className = "thumb";
        track.appendChild(thumb);

        const text = document.createElement("span");
        text.className = "text";
        text.textContent = this.getAttribute("label") ?? "";

        label.appendChild(input);
        label.appendChild(track);
        label.appendChild(text);
        this.root.appendChild(label);

        input.addEventListener("change", () => {
            this.toggleAttribute("checked", input.checked);
            this.emit("k-change", { checked: input.checked });
        });
    }

    /** The switch's label. */
    get text(): string | null {
        return this.getAttribute("label");
    }

    set text(value: string | null) {
        if (value === null) this.removeAttribute("label");
        else this.setAttribute("label", value);
        const element = this.root.querySelector(".text");
        if (element) element.textContent = value ?? "";
    }

    /** Whether the switch is on. */
    get checked(): boolean {
        return this.hasAttribute("checked");
    }

    set checked(value: boolean) {
        this.toggleAttribute("checked", value);
        if (this.input) this.input.checked = value;
    }

    override focus(options?: FocusOptions): void {
        this.input?.focus(options);
    }
}

defineComponent("k-switch", KSwitch);

declare global {
    interface HTMLElementTagNameMap {
        "k-switch": KSwitch;
    }
}
