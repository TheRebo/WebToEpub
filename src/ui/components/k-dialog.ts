/**
 * `<k-dialog>`.
 *
 * A modal dialog built on the native `<dialog>` element, so focus trapping,
 * `Escape` handling, and the top layer all come for free — with the
 * background correctly inert.
 *
 * The design system's contract:
 *  - sizes: sm (360px), md (480px, the default), lg (720px), full (960px)
 *  - the dialog is named by its heading, so a screen reader announces
 *    "Filter, dialog" rather than "dialog"
 */
import { KComponent, defineComponent, translate } from "./base";
import { createIcon } from "./icons";

const STYLES = `
:host { display: contents; }

dialog {
    width: var(--_dialog-width, min(480px, calc(100vw - 32px)));
    max-height: calc(100vh - 64px);
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-3);
    overflow: hidden;
}

/*
 * The dialog's width.
 *
 * The attribute is what the callers use, so it has to do something: a
 * size that was set but ignored meant the site's selector dialog and the
 * filter dialog were both the default width, whatever the design asked for.
 *
 * Every size has its own rule, including the default one. A size that
 * was only implied — "md" meaning whatever the dialog happened to be —
 * was a size the design system did not really have.
 */
:host([size="sm"]) { --_dialog-width: min(360px, calc(100vw - 32px)); }
:host([size="md"]) { --_dialog-width: min(480px, calc(100vw - 32px)); }
:host([size="lg"]) { --_dialog-width: min(720px, calc(100vw - 32px)); }
:host([size="full"]) {
    --_dialog-width: min(960px, calc(100vw - 32px));
    height: min(720px, calc(100vh - 64px));
}

dialog::backdrop {
    background: rgb(0 0 0 / 55%);
    backdrop-filter: blur(2px);
}

.dialog {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 64px);
}

.header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-5) var(--space-3);
}

.heading {
    flex: 1;
    min-width: 0;
    font-size: var(--text-lg);
    font-weight: var(--weight-semibold);
    line-height: var(--leading-snug);
}

.close {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    transition: background-color var(--dur-instant) var(--ease-out);
}

.close:hover { background: var(--bg-subtle); color: var(--text); }
.close:focus-visible { outline: 2px solid transparent; box-shadow: var(--ring); }

.body {
    flex: 1;
    overflow-y: auto;
    padding: 0 var(--space-5) var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    font-size: var(--text-base);
    color: var(--text-secondary);
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--border-subtle);
    background: var(--surface);
}

.footer .spacer { flex: 1; }

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own "[data-reduce-motion="true"] *" rule cannot pierce the
 * shadow boundary, so the component mirrors the preference onto its host.
 */
:host([data-reduced-motion]) dialog[open] { animation: none; }
:host([data-reduced-motion]) .close { transition: none; }

@media (prefers-reduced-motion: reduce) {
    dialog[open] { animation: none; }
    .close { transition: none; }
}
`;

export class KDialog extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["heading", "open", "size"];

    /** The dialog's own ID, used to wire the heading to it. */
    readonly headingId = `k-dialog-${crypto.randomUUID().slice(0, 8)}-heading`;

    private dialog: HTMLDialogElement | undefined;
    private heading: HTMLHeadingElement | undefined;

    /**
     * The element that had the focus before the dialog opened.
     *
     * It is restored when the dialog closes, so that closing a dialog puts
     * the reader back where they were rather than at the top of the page.
     */
    #previouslyFocused: HTMLElement | null = null;

    protected override render(): void {
        if (!this.dialog) {
            this.root.replaceChildren();
            this.dialog = document.createElement("dialog");
            this.#build();
        }

        const heading = this.heading;
        if (heading) this.setText(heading, this.getAttribute("heading") ?? "");

        // The dialog is named by its heading, so that a screen reader
        // announces "Filter, dialog" rather than "dialog".
        this.dialog?.setAttribute("aria-labelledby", this.headingId);

        if (this.hasAttribute("open")) {
            this.#show();
        } else if (this.dialog?.open) {
            this.dialog.close();
        }
    }

    /** Build the component's structure. */
    #build(): void {
        const dialog = this.dialog as HTMLDialogElement;

        const wrapper = document.createElement("div");
        wrapper.className = "dialog";

        const header = document.createElement("div");
        header.className = "header";

        const heading = document.createElement("h2");
        heading.className = "heading";
        heading.id = this.headingId;
        this.heading = heading;

        const close = document.createElement("button");
        close.type = "button";
        close.className = "close";
        close.setAttribute("aria-label", translate("commonClose", "Close"));
        close.appendChild(createIcon("close", 18));
        close.addEventListener("click", () => this.close());

        header.appendChild(heading);
        header.appendChild(close);

        const body = document.createElement("div");
        body.className = "body";
        body.appendChild(document.createElement("slot"));

        const footer = document.createElement("div");
        footer.className = "footer";
        const footerSlot = document.createElement("slot");
        footerSlot.name = "footer";
        footer.appendChild(footerSlot);

        wrapper.appendChild(header);
        wrapper.appendChild(body);
        wrapper.appendChild(footer);
        dialog.appendChild(wrapper);
        this.root.appendChild(dialog);

        dialog.addEventListener("close", () => {
            this.removeAttribute("open");
            this.#restoreFocus();
            this.emit("k-close", {});
        });

        dialog.addEventListener("cancel", (event) => {
            // The `cancel` event fires on Escape; the default action is to
            // close, which also fires `close`, so nothing extra is needed.
            event.preventDefault();
            this.close();
        });
    }

    /** Open the dialog. */
    open(): void {
        this.setAttribute("open", "");
        this.#show();
    }

    /** Close the dialog. */
    close(): void {
        this.removeAttribute("open");
        if (this.dialog?.open) this.dialog.close();
    }

    /** Show the dialog, remembering what had the focus. */
    #show(): void {
        const dialog = this.dialog;
        if (!dialog || dialog.open) return;
        const active = document.activeElement;
        this.#previouslyFocused = active instanceof HTMLElement ? active : null;
        try {
            dialog.showModal();
        } catch {
            // `showModal()` throws when the dialog is already open as a
            // modal, or when the document is not fully active. Neither is
            // worth breaking the page over: the dialog is a convenience, and
            // the work around it still works.
            this.removeAttribute("open");
        }
    }

    /**
     * Close the dialog when it is removed from the document.
     *
     * A dialog that is removed while it is open leaves the page's focus
     * stranded: the browser had moved the focus into the dialog's top layer,
     * and the dialog is gone. Closing it first restores the focus to where
     * it was.
     */
    override disconnectedCallback(): void {
        if (this.dialog?.open) {
            this.dialog.close();
        }
        super.disconnectedCallback();
    }

    /** Put the focus back where it was before the dialog opened. */
    #restoreFocus(): void {
        const previous = this.#previouslyFocused;
        this.#previouslyFocused = null;
        if (!previous || !previous.isConnected) return;
        previous.focus();
    }
}

defineComponent("k-dialog", KDialog);

declare global {
    interface HTMLElementTagNameMap {
        "k-dialog": KDialog;
    }
}
