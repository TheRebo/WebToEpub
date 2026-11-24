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
import { t } from "../i18n";

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
        this.#applyMotionPreference();
        this.#motionDisposer?.();
        this.#motionDisposer = observeReducedMotion(() => this.#applyMotionPreference());
    }

    /** Called when the element is removed from the document. */
    disconnectedCallback(): void {
        this.#motionDisposer?.();
        this.#motionDisposer = undefined;
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
     * Mirror the reduced-motion preference onto the host.
     *
     * The document's own `[data-reduce-motion="true"] *` rule cannot pierce a
     * shadow root, and a media query only knows about the operating system.
     * The in-app setting is a user choice the component has to honour itself,
     * so it is reflected as an attribute the component's own stylesheet can
     * match.
     */
    #applyMotionPreference(): void {
        if (prefersReducedMotion()) this.setAttribute("data-reduced-motion", "");
        else this.removeAttribute("data-reduced-motion");
    }

    /** The disposer for the reduced-motion observer. */
    #motionDisposer: (() => void) | undefined;

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

/**
 * Whether the user has asked for less motion.
 *
 * Two sources are consulted: the in-app setting, which sets
 * `data-reduce-motion` on the document root, and the operating system's
 * `prefers-reduced-motion`.
 *
 * @returns True when motion should be reduced or removed.
 */
export function prefersReducedMotion(): boolean {
    const root = document.documentElement;
    if (root?.getAttribute("data-reduce-motion") === "true") return true;
    return typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;
}

/**
 * Watch the reduced-motion preference.
 *
 * The in-app setting is a runtime toggle, so the preference can change while
 * the page is open; a `MutationObserver` on the document root is the only way
 * to notice.
 *
 * The observer is shared between every subscriber: a page can have hundreds of
 * components, and hundreds of observers on the same attribute is a lot of
 * work for the browser to do on every change.
 *
 * @param callback Called with the new preference.
 * @returns A function that stops watching.
 */
export function observeReducedMotion(callback: (reduced: boolean) => void): () => void {
    const root = document.documentElement;
    if (!root || typeof MutationObserver === "undefined") return () => undefined;

    if (!sharedObserver) {
        sharedObserver = new MutationObserver(() => {
            const reduced = prefersReducedMotion();
            for (const subscriber of sharedSubscribers) subscriber(reduced);
        });
        sharedObserver.observe(root, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    }

    sharedSubscribers.add(callback);
    return () => {
        sharedSubscribers.delete(callback);
        if (sharedSubscribers.size === 0) {
            sharedObserver?.disconnect();
            sharedObserver = undefined;
        }
    };
}

/** The shared observer. */
let sharedObserver: MutationObserver | undefined;

/** The shared observer's subscribers. */
const sharedSubscribers = new Set<(reduced: boolean) => void>();

/**
 * Translate a message, with an English fallback.
 *
 * `t()` returns the key itself when the message is missing, which is useful
 * in a log but not in the interface: the reader would see `commonClose` where
 * a word belongs. The components that need a string they know is right use
 * this, so a missing locale entry degrades to English rather than to a key.
 *
 * @param key The message name.
 * @param fallback The English text to use when the message is missing.
 * @returns The translated string, or the fallback.
 */
export function translate(key: string, fallback: string): string {
    const message = t(key);
    return message && message !== key ? message : fallback;
}
