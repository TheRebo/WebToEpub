/**
 * The base component.
 *
 * Every Kintsugi component extends this. It provides the Shadow DOM, the
 * stylesheet injection, the observed-attribute handling, and the
 * accessibility helpers that the design system's contract requires.
 *
 * Components are native Web Components with no framework behind them. The
 * Shadow DOM boundary means the page's styles cannot reach the UI, which
 * matters because the extension renders untrusted content.
 */

/** The parts of a component's shadow DOM that can be styled from outside. */
export type PartName = string;

/** A base class for the components. */
export abstract class KComponent extends HTMLElement {
    /** The shadow root. */
    protected readonly root: ShadowRoot;

    /**
     * The component's stylesheet.
     *
     * It is applied through `adoptedStyleSheets` rather than as a `<style>`
     * element, because most components rebuild their shadow root from
     * scratch. A `<style>` element would be deleted along with the old
     * markup, and the component would render unstyled — a bug that is
     * invisible in a code review and glaring on screen. An adopted stylesheet
     * belongs to the shadow root, not to its contents, so it survives.
     */
    static styles: string | undefined;

    /** The static observed attributes. */
    static observedAttributes: string[] = [];

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.applyStyles();
    }

    /** Called when the element is connected to the document. */
    connectedCallback(): void {
        this.render();
    }

    /** Called when the element is removed from the document. */
    disconnectedCallback(): void {
        // Overridden by components that attach listeners.
    }

    /** Called when an observed attribute changes. */
    attributeChangedCallback(
        _name: string,
        _oldValue: string | null,
        _newValue: string | null,
    ): void {
        this.render();
    }

    /** Render the component's contents. */
    protected abstract render(): void;

    /**
     * Apply the component's stylesheet to its shadow root.
     *
     * `adoptedStyleSheets` is used where the browser supports it, and a
     * `<style>` element is the fallback. Both live outside the shadow root's
     * *contents*, so a component is free to rebuild its markup without
     * losing its styling.
     */
    protected applyStyles(): void {
        const styles = this.styleText;
        if (!styles) return;

        if (supportsAdoptedStyleSheets(this.root)) {
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(styles);
            this.root.adoptedStyleSheets = [...this.root.adoptedStyleSheets, sheet];
            return;
        }

        if (this.root.querySelector("style[data-kintsugi]")) return;
        const style = document.createElement("style");
        style.dataset["kintsugi"] = "";
        style.textContent = styles;
        this.root.prepend(style);
    }

    /**
     * Move focus to the component's focusable inner element.
     *
     * Declared on the base class so every component exposes a uniform focus
     * behaviour, even when the focusable element is inside a shadow root.
     */
    override focus(options?: FocusOptions): void {
        const focusable = this.root.querySelector<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
        focusable?.focus(options);
    }

    /** The element's stylesheet, if it has one. */
    protected get styleText(): string {
        return (this.constructor as typeof KComponent).styles ?? "";
    }

    /**
     * Set the component's text content.
     *
     * Uses `textContent`, never `innerHTML`, so a value that came from a
     * page can never become markup.
     */
    protected setText(element: Element, text: string | null | undefined): void {
        element.textContent = text ?? "";
    }

    /** Dispatch a composed, bubbling custom event. */
    protected emit<T>(name: string, detail: T): void {
        this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }

    /** The element's accessible name, from `aria-label`. */
    get label(): string | null {
        return this.getAttribute("aria-label");
    }

    set label(value: string | null) {
        if (value === null) this.removeAttribute("aria-label");
        else this.setAttribute("aria-label", value);
    }

    /** Whether the component is disabled. */
    get disabled(): boolean {
        return this.hasAttribute("disabled");
    }

    set disabled(value: boolean) {
        if (value) this.setAttribute("disabled", "");
        else this.removeAttribute("disabled");
    }
}

/**
 * Register a custom element, ignoring a duplicate registration.
 *
 * The extension's pages are loaded more than once in development, and a
 * duplicate registration throws.
 */
export function defineComponent(name: string, constructor: CustomElementConstructor): void {
    if (customElements.get(name)) return;
    customElements.define(name, constructor);
}

/**
 * Whether the shadow root can adopt a stylesheet.
 *
 * Firefox 101 and every Chromium-based browser can. The check is a feature
 * test rather than a version test, so a browser that adds the capability
 * later is picked up without a change here.
 *
 * @param root The shadow root.
 * @returns True when the shadow root supports adopted stylesheets.
 */
function supportsAdoptedStyleSheets(root: ShadowRoot): boolean {
    return "adoptedStyleSheets" in root && "replaceSync" in CSSStyleSheet.prototype;
}
