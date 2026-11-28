/**
 * The components' reduce-motion behaviour.
 *
 * The in-app "Reduce motion" setting sets `data-reduce-motion="true"` on the
 * document root. The document's own `[data-reduce-motion="true"] *` rule
 * cannot pierce a shadow boundary, and a `@media (prefers-reduced-motion)`
 * query only knows about the operating system, so the components have to
 * honour the in-app setting themselves.
 *
 * The base class mirrors the preference onto the host as
 * `data-reduced-motion`, which the components' own stylesheets match.
 */
import { afterEach, describe, expect, it } from "vitest";
import "../../../src/ui/components/k-button";
import "../../../src/ui/components/k-checkbox";
import "../../../src/ui/components/k-dialog";
import "../../../src/ui/components/k-empty";
import "../../../src/ui/components/k-list";
import "../../../src/ui/components/k-progress";
import "../../../src/ui/components/k-skeleton";
import "../../../src/ui/components/k-toast";

/** The components that have to react to the setting. */
const COMPONENTS = ["k-button", "k-dialog", "k-list", "k-progress", "k-skeleton", "k-toast"];

describe("the reduce-motion setting", () => {
    afterEach(() => {
        document.documentElement.removeAttribute("data-reduce-motion");
        document.body.replaceChildren();
    });

    it("is off by default", () => {
        const element = document.createElement("k-button");
        document.body.appendChild(element);
        expect(element.hasAttribute("data-reduced-motion")).toBe(false);
    });

    it("is mirrored onto the host when the setting is on", () => {
        document.documentElement.setAttribute("data-reduce-motion", "true");
        const element = document.createElement("k-button");
        document.body.appendChild(element);
        expect(element.hasAttribute("data-reduced-motion")).toBe(true);
    });

    it("reacts to the setting being toggled while the page is open", async () => {
        const element = document.createElement("k-button");
        document.body.appendChild(element);
        expect(element.hasAttribute("data-reduced-motion")).toBe(false);

        document.documentElement.setAttribute("data-reduce-motion", "true");
        // The observer is a microtask, so let it run.
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(element.hasAttribute("data-reduced-motion")).toBe(true);
    });

    it("is honoured by every component that animates", () => {
        document.documentElement.setAttribute("data-reduce-motion", "true");
        for (const name of COMPONENTS) {
            const element = document.createElement(name);
            document.body.appendChild(element);
            expect(element.hasAttribute("data-reduced-motion")).toBe(true);
        }
    });
});

describe("k-progress", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("is a progressbar with a value range", () => {
        const progress = document.createElement("k-progress");
        progress.setAttribute("value", "30");
        progress.setAttribute("max", "120");
        document.body.appendChild(progress);

        const bar = progress.shadowRoot?.querySelector("[role=progressbar]");
        expect(bar).not.toBeNull();
        expect(bar?.getAttribute("aria-valuemin")).toBe("0");
        expect(bar?.getAttribute("aria-valuemax")).toBe("120");
        expect(bar?.getAttribute("aria-valuenow")).toBe("30");
    });

    it("has an accessible name from the label attribute", () => {
        const progress = document.createElement("k-progress");
        progress.setAttribute("label", "Downloading chapters");
        document.body.appendChild(progress);

        const bar = progress.shadowRoot?.querySelector("[role=progressbar]");
        expect(bar?.getAttribute("aria-label")).toBe("Downloading chapters");
    });
});

describe("k-skeleton", () => {
    it("writes the radius the stylesheet reads", () => {
        const skeleton = document.createElement("k-skeleton");
        skeleton.setAttribute("radius", "12px");
        document.body.appendChild(skeleton);

        const block = skeleton.shadowRoot?.querySelector(".skeleton") as HTMLElement | null;
        expect(block?.style.getPropertyValue("--radius-xs")).toBe("12px");
    });
});

describe("k-empty", () => {
    it("upgrades the button it creates", async () => {
        const empty = document.createElement("k-empty");
        empty.setAttribute("action-label", "Add a story");
        document.body.appendChild(empty);

        await Promise.resolve();
        const button = empty.shadowRoot?.querySelector("k-button");
        expect(button).not.toBeNull();
        expect(button).toBeInstanceOf(HTMLElement);
        expect(
            (button as HTMLElement & { shadowRoot: ShadowRoot | null }).shadowRoot,
        ).not.toBeNull();
    });

    it("uses a heading for the title", () => {
        const empty = document.createElement("k-empty");
        empty.setAttribute("heading", "Nothing here yet");
        document.body.appendChild(empty);

        const heading = empty.shadowRoot?.querySelector(".heading");
        expect(heading?.tagName).toBe("H3");
        expect(heading?.textContent).toBe("Nothing here yet");
    });
});

describe("k-button", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("renders the label attribute as the button's text", () => {
        const button = document.createElement("k-button");
        button.setAttribute("label", "Pack the book");
        document.body.appendChild(button);

        const label = button.shadowRoot?.querySelector(".label");
        expect(label?.textContent).toBe("Pack the book");
    });

    it("renders the text property", () => {
        const button = document.createElement("k-button");
        document.body.appendChild(button);

        (button as unknown as { text: string }).text = "From the property";
        expect(button.shadowRoot?.querySelector(".label")?.textContent).toBe("From the property");
    });

    it("keeps the accessible name while loading", () => {
        const button = document.createElement("k-button");
        button.setAttribute("label", "Pack the book");
        button.setAttribute("loading", "");
        document.body.appendChild(button);

        const inner = button.shadowRoot?.querySelector("button");
        expect(inner?.getAttribute("aria-busy")).toBe("true");
        // The label is still in the button, so the accessible name survives.
        expect(button.shadowRoot?.querySelector(".label")?.textContent).toBe("Pack the book");
    });
});

describe("k-checkbox", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("renders the label attribute", () => {
        const checkbox = document.createElement("k-checkbox");
        checkbox.setAttribute("label", "Include the table of contents");
        document.body.appendChild(checkbox);

        const text = checkbox.shadowRoot?.querySelector(".text");
        expect(text?.textContent).toBe("Include the table of contents");
    });
});

describe("k-toast", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("populates the live region after it is connected", async () => {
        const toast = document.createElement("k-toast");
        toast.setAttribute("message", "The book is ready");
        document.body.appendChild(toast);

        // The message is written in a microtask, so that the live region
        // exists before its content changes.
        await Promise.resolve();

        const text = toast.shadowRoot?.querySelector(".text");
        expect(text?.textContent).toBe("The book is ready");
    });

    it("uses a translated label for the dismiss button", () => {
        const toast = document.createElement("k-toast");
        document.body.appendChild(toast);

        const close = toast.shadowRoot?.querySelector(".close");
        expect(close?.getAttribute("aria-label")).toBeTruthy();
    });
});

describe("k-dialog", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    it("is named by its heading", () => {
        const dialog = document.createElement("k-dialog");
        dialog.setAttribute("heading", "Filter chapters");
        document.body.appendChild(dialog);

        const inner = dialog.shadowRoot?.querySelector("dialog");
        const heading = dialog.shadowRoot?.querySelector(".heading");
        expect(inner?.getAttribute("aria-labelledby")).toBe(heading?.id);
    });

    it("restores the focus to the element that opened it", () => {
        const opener = document.createElement("button");
        document.body.appendChild(opener);
        opener.focus();

        const dialog = document.createElement("k-dialog");
        document.body.appendChild(dialog);
        dialog.open();

        dialog.close();

        expect(document.activeElement).toBe(opener);
    });
});
