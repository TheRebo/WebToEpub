/**
 * `<k-progress>`.
 *
 * A determinate progress bar.
 *
 * The fill animates over `--dur-base` with `--ease-out`, so the bar glides
 * between chapter counts instead of teleporting. This is the single
 * highest-value motion in the product: a run can take thirty minutes, and a
 * teleporting bar reads as "stuck".
 *
 * The fill animates with `transform: scaleX()`, not `width`, so the browser
 * never has to lay it out.
 */
import { KComponent, defineComponent } from "./base";

const STYLES = `
:host {
    display: block;
}

:host([hidden]) { display: none; }

.bar {
    position: relative;
    height: 6px;
    border-radius: var(--radius-full);
    background: var(--surface-sunken);
    overflow: hidden;
}

.fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--accent);
    transform-origin: left center;
    transform: scaleX(var(--progress, 0));
    transition: transform var(--dur-base) var(--ease-out);
}

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) .fill { transition: none; }

@media (prefers-reduced-motion: reduce) {
    .fill { transition: none; }
}
`;

export class KProgress extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["value", "max", "label"];

    private fill: HTMLElement | undefined;

    protected override render(): void {
        if (!this.fill) {
            this.root.replaceChildren();
            const bar = document.createElement("div");
            bar.className = "bar";
            bar.setAttribute("role", "progressbar");
            this.fill = document.createElement("div");
            this.fill.className = "fill";
            bar.appendChild(this.fill);
            this.root.appendChild(bar);
        }

        const max = this.max;
        const value = Math.min(Math.max(this.value, 0), max);
        const percent = max > 0 ? value / max : 0;

        this.fill.style.setProperty("--progress", String(percent));

        const bar = this.root.querySelector(".bar");
        bar?.setAttribute("aria-valuemin", "0");
        /*
         * A range whose maximum is zero is not a range.
         *
         * ARIA requires a progress bar's value to be between its minimum and
         * its maximum, and "aria-valuemax=0" with "aria-valuemin=0" describes
         * an empty range, which assistive technology reports as a broken
         * widget. An indeterminate progress bar is the correct thing to show
         * when there is no total to count towards, and that is what dropping
         * the value attributes asks for.
         */
        if (max > 0) {
            bar?.setAttribute("aria-valuemax", String(max));
            bar?.setAttribute("aria-valuenow", String(Math.round(value)));
        } else {
            bar?.removeAttribute("aria-valuemax");
            bar?.removeAttribute("aria-valuenow");
        }

        // The accessible name comes from the `label` attribute. Without it the
        // progressbar is an unnamed widget, and a screen reader announces a
        // bare percentage with no indication of what is progressing.
        const label = this.getAttribute("label");
        if (label) {
            bar?.setAttribute("aria-label", label);
        } else {
            bar?.removeAttribute("aria-label");
        }

        // The value text describes the value, not the name, so it is the
        // percentage rather than the label.
        bar?.setAttribute("aria-valuetext", `${Math.round(percent * 100)}%`);
    }

    /** The current value. */
    get value(): number {
        return Number(this.getAttribute("value") ?? 0);
    }

    set value(newValue: number) {
        this.setAttribute("value", String(newValue));
    }

    /** The maximum value. */
    get max(): number {
        return Number(this.getAttribute("max") ?? 100);
    }

    set max(newValue: number) {
        this.setAttribute("max", String(newValue));
    }
}

defineComponent("k-progress", KProgress);

declare global {
    interface HTMLElementTagNameMap {
        "k-progress": KProgress;
    }
}
