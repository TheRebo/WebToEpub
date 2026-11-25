/**
 * The components' reactivity, accessibility and lifecycle.
 *
 * These tests cover the defects the first audit round found in the shared
 * component library — the parts of the UI that every screen is built from:
 *
 *  - `<k-button>` ignored the `icon` attribute set after construction, and
 *    lost its accessible name when it was given slotted content.
 *  - `<k-dialog>` ignored its `size` attribute, and stranded the focus when
 *    it was removed from the document while open.
 *  - `<k-panel>` wrote its heading and summary once, so changing them after
 *    construction did nothing.
 *  - `<k-toast>` restarted its whole lifetime on hover, dismissed twice, and
 *    left its timers running after it left the document.
 *  - `<k-progress>` described an empty range when its maximum was zero.
 *  - `<k-field>` destroyed a select's options when its type changed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../src/ui/components/k-button";
import "../../../src/ui/components/k-dialog";
import "../../../src/ui/components/k-field";
import "../../../src/ui/components/k-panel";
import "../../../src/ui/components/k-progress";
import "../../../src/ui/components/k-toast";

/** The shadow root of an element. */
function shadow(element: Element): ShadowRoot {
    const root = element.shadowRoot;
    if (!root) throw new Error("No shadow root");
    return root;
}

describe("k-button", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("shows the icon it is given after construction", () => {
        const button = document.createElement("k-button");
        document.body.appendChild(button);

        button.setAttribute("icon", "download");
        expect(shadow(button).querySelector("svg")).not.toBeNull();
    });

    it("keeps its accessible name when content is slotted into it", () => {
        const button = document.createElement("k-button");
        button.setAttribute("label", "Save");
        document.body.appendChild(button);

        const slot = document.createElement("span");
        slot.textContent = "Save";
        button.appendChild(slot);

        const label = shadow(button).querySelector(".label") as HTMLElement | null;
        expect(label).not.toBeNull();
        // The label must stay in the accessibility tree, so it may not be
        // hidden with "display: none".
        expect(label?.getAttribute("style") ?? "").not.toContain("display: none");
        expect(label?.textContent).toBe("Save");
    });
});

describe("k-dialog", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("reacts to a size set after construction", () => {
        const dialog = document.createElement("k-dialog");
        document.body.appendChild(dialog);

        dialog.setAttribute("size", "lg");
        expect(dialog.getAttribute("size")).toBe("lg");

        // The size has to reach the shadow root's stylesheet, otherwise the
        // attribute is inert and every dialog is the default width.
        const sheets = shadow(dialog).adoptedStyleSheets;
        const selectors: string[] = [];
        for (const sheet of sheets) {
            for (const rule of Array.from(sheet.cssRules)) {
                const style = rule as CSSStyleRule;
                if (typeof style.selectorText === "string") selectors.push(style.selectorText);
            }
        }
        expect(selectors.some((selector) => selector.includes('[size="lg"]'))).toBe(true);
    });

    it("closes when it is removed from the document while open", () => {
        const dialog = document.createElement("k-dialog");
        document.body.appendChild(dialog);

        const closed: boolean[] = [];
        dialog.addEventListener("k-close", () => closed.push(true));

        dialog.setAttribute("open", "");
        dialog.remove();

        expect(closed.length).toBe(1);
    });
});

describe("k-panel", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("updates its heading when the attribute changes", () => {
        const panel = document.createElement("k-panel");
        panel.setAttribute("heading", "First");
        document.body.appendChild(panel);

        panel.setAttribute("heading", "Second");
        expect(shadow(panel).querySelector(".title")?.textContent).toBe("Second");
    });

    it("updates its summary when the attribute changes", () => {
        const panel = document.createElement("k-panel");
        panel.setAttribute("summary", "One");
        document.body.appendChild(panel);

        panel.setAttribute("summary", "Two");
        expect(shadow(panel).querySelector(".summary-text")?.textContent).toBe("Two");
    });
});

describe("k-progress", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("describes an indeterminate bar when the maximum is zero", () => {
        const progress = document.createElement("k-progress");
        progress.setAttribute("max", "0");
        progress.setAttribute("value", "0");
        document.body.appendChild(progress);

        const bar = shadow(progress).querySelector(".bar");
        // A range whose maximum is zero is not a range: the value attributes
        // have to go, so that the widget reads as indeterminate.
        expect(bar?.hasAttribute("aria-valuemax")).toBe(false);
        expect(bar?.hasAttribute("aria-valuenow")).toBe(false);
        expect(bar?.getAttribute("role")).toBe("progressbar");
    });

    it("describes a determinate bar when the maximum is not zero", () => {
        const progress = document.createElement("k-progress");
        progress.setAttribute("max", "10");
        progress.setAttribute("value", "5");
        document.body.appendChild(progress);

        const bar = shadow(progress).querySelector(".bar");
        expect(bar?.getAttribute("aria-valuemax")).toBe("10");
        expect(bar?.getAttribute("aria-valuenow")).toBe("5");
    });
});

describe("k-field", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("keeps a select's options when the type changes", () => {
        const field = document.createElement("k-field");
        field.setAttribute("type", "select");
        const option = document.createElement("option");
        option.value = "gold";
        option.textContent = "Gold";
        field.appendChild(option);
        document.body.appendChild(field);

        const select = shadow(field).querySelector("select") as HTMLSelectElement;
        expect(select.options).toHaveLength(1);
        expect(select.options[0]?.value).toBe("gold");

        // Changing the type destroys the control; the options have to survive
        // it, because the light DOM is the only place they are kept.
        field.setAttribute("type", "text");
        expect(field.querySelectorAll("option")).toHaveLength(1);

        // And they come back when the field is a select again.
        field.setAttribute("type", "select");
        const restored = shadow(field).querySelector("select") as HTMLSelectElement;
        expect(restored.options).toHaveLength(1);
        expect(restored.options[0]?.value).toBe("gold");
    });

    it("keeps the light DOM's options as the source of truth", () => {
        const field = document.createElement("k-field");
        field.setAttribute("type", "select");
        const option = document.createElement("option");
        option.value = "gold";
        field.appendChild(option);
        document.body.appendChild(field);

        // The option belongs to the page, not to the control.
        expect(option.parentElement).toBe(field);
    });
});

describe("k-toast", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        document.body.replaceChildren();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("resumes the remaining time after a hover, not the whole lifetime", () => {
        const toast = document.createElement("k-toast");
        toast.setAttribute("duration", "6000");
        document.body.appendChild(toast);

        const element = shadow(toast).querySelector(".toast") as HTMLElement;

        // Half the lifetime goes by.
        vi.advanceTimersByTime(5000);

        // The pointer arrives; the timer is paused.
        element.dispatchEvent(new Event("mouseenter"));
        vi.advanceTimersByTime(10_000);
        expect(toast.isConnected).toBe(true);

        // The pointer leaves. Only the second that was left should run, so
        // the toast is still there a moment before the end.
        element.dispatchEvent(new Event("mouseleave"));
        vi.advanceTimersByTime(999);
        expect(toast.isConnected).toBe(true);
        expect(element.dataset["leaving"]).toBeUndefined();

        // A second later the toast starts to leave.
        vi.advanceTimersByTime(2);
        expect(element.dataset["leaving"]).toBe("true");
    });

    it("does not give the toast a fresh lifetime when the pointer leaves", () => {
        const toast = document.createElement("k-toast");
        toast.setAttribute("duration", "6000");
        document.body.appendChild(toast);

        const element = shadow(toast).querySelector(".toast") as HTMLElement;

        // Almost the whole lifetime goes by, then the pointer arrives.
        vi.advanceTimersByTime(5900);
        element.dispatchEvent(new Event("mouseenter"));
        element.dispatchEvent(new Event("mouseleave"));

        // The toast must not live for another full six seconds.
        vi.advanceTimersByTime(200);
        expect(element.dataset["leaving"]).toBe("true");
    });

    it("dismisses only once however many times it is asked to", () => {
        const toast = document.createElement("k-toast");
        toast.setAttribute("duration", "6000");
        document.body.appendChild(toast);

        let dismissals = 0;
        toast.addEventListener("k-dismiss", () => {
            dismissals += 1;
        });

        const typed = toast as unknown as { dismiss(): void };
        typed.dismiss();
        typed.dismiss();
        typed.dismiss();

        expect(dismissals).toBe(1);
    });

    it("cancels its timers when it leaves the document", () => {
        const toast = document.createElement("k-toast");
        toast.setAttribute("duration", "6000");
        document.body.appendChild(toast);

        toast.remove();

        // A timer that survived would call back into a detached element.
        expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
        expect(vi.getTimerCount()).toBe(0);
    });
});
