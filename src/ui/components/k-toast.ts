/**
 * `<k-toast>`.
 *
 * A transient, non-blocking notification.
 *
 * Errors use `role="alert"`; everything else uses `role="status"`. The toast
 * auto-dismisses after six seconds, with a visible progress bar that pauses
 * on hover.
 */
import { KComponent, defineComponent } from "./base";
import { createIcon, type IconName } from "./icons";

const STYLES = `
:host {
    position: fixed;
    right: var(--space-5);
    bottom: var(--space-5);
    z-index: var(--z-toast);
    display: block;
    pointer-events: none;
}

.toast {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 260px;
    max-width: 380px;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-2);
    pointer-events: auto;
    overflow: hidden;
    animation: k-toast-in var(--dur-base) var(--ease-out);
}

.toast[data-leaving="true"] {
    animation: k-toast-out var(--dur-base) var(--ease-out) forwards;
}

.icon { flex-shrink: 0; color: var(--text-muted); }
.toast[data-variant="success"] .icon { color: var(--success); }
.toast[data-variant="error"] .icon { color: var(--danger); }
.toast[data-variant="warning"] .icon { color: var(--warning); }

.text {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
}

.action {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
}

.action:hover { background: var(--accent-subtle); }
.action:focus-visible { outline: none; box-shadow: var(--ring); }

.close {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}

.close:hover { background: var(--bg-subtle); color: var(--text); }
.close:focus-visible { outline: none; box-shadow: var(--ring); }

.timer {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 100%;
    background: var(--accent);
    transform-origin: left center;
    animation: k-timer linear forwards;
}

@keyframes k-toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes k-toast-out {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(8px); }
}

@keyframes k-timer {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
}

@media (prefers-reduced-motion: reduce) {
    .toast, .toast[data-leaving="true"] { animation: none; }
    .timer { animation: none; }
}
`;

/** The toast's variants. */
export type ToastVariant = "info" | "success" | "warning" | "error";

/** The icon used for each variant. */
const VARIANT_ICONS: Record<ToastVariant, IconName> = {
    info: "info",
    success: "check-circle",
    warning: "warning",
    error: "alert-triangle",
};

export class KToast extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["message", "variant", "duration", "action-label"];

    /** The dismiss timer. */
    #timer: ReturnType<typeof setTimeout> | undefined;

    protected override render(): void {
        const variant = (this.getAttribute("variant") ?? "info") as ToastVariant;
        const message = this.getAttribute("message") ?? "";
        const duration = Number(this.getAttribute("duration") ?? 6000);

        this.root.replaceChildren();

        const toast = document.createElement("div");
        toast.className = "toast";
        toast.dataset.variant = variant;
        toast.setAttribute("role", variant === "error" ? "alert" : "status");
        toast.setAttribute("aria-live", variant === "error" ? "assertive" : "polite");

        const icon = document.createElement("span");
        icon.className = "icon";
        icon.setAttribute("aria-hidden", "true");
        icon.appendChild(createIcon(VARIANT_ICONS[variant], 18));

        const text = document.createElement("span");
        text.className = "text";
        text.textContent = message;

        toast.appendChild(icon);
        toast.appendChild(text);

        const actionLabel = this.getAttribute("action-label");
        if (actionLabel) {
            const action = document.createElement("button");
            action.type = "button";
            action.className = "action";
            action.textContent = actionLabel;
            action.addEventListener("click", () => {
                this.emit("k-action", {});
                this.dismiss();
            });
            toast.appendChild(action);
        }

        const close = document.createElement("button");
        close.type = "button";
        close.className = "close";
        close.setAttribute("aria-label", "Dismiss");
        close.appendChild(createIcon("close", 14));
        close.addEventListener("click", () => this.dismiss());
        toast.appendChild(close);

        if (duration > 0) {
            const timer = document.createElement("span");
            timer.className = "timer";
            timer.setAttribute("aria-hidden", "true");
            timer.style.animationDuration = `${duration}ms`;
            toast.appendChild(timer);

            toast.addEventListener("mouseenter", () => {
                if (this.#timer) clearTimeout(this.#timer);
                timer.style.animationPlayState = "paused";
            });
            toast.addEventListener("mouseleave", () => {
                timer.style.animationPlayState = "running";
                this.#startTimer(duration);
            });
        }

        this.root.appendChild(toast);
        this.#startTimer(duration);
    }

    /** Start the dismiss timer. */
    #startTimer(duration: number): void {
        if (duration <= 0) return;
        if (this.#timer) clearTimeout(this.#timer);
        this.#timer = setTimeout(() => this.dismiss(), duration);
    }

    /** Dismiss the toast. */
    dismiss(): void {
        if (this.#timer) clearTimeout(this.#timer);
        const toast = this.root.querySelector(".toast") as HTMLElement | null;
        if (toast) {
            toast.dataset.leaving = "true";
            setTimeout(() => this.remove(), 220);
        } else {
            this.remove();
        }
        this.emit("k-dismiss", {});
    }
}

defineComponent("k-toast", KToast);

declare global {
    interface HTMLElementTagNameMap {
        "k-toast": KToast;
    }
}
