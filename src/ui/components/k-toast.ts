/**
 * `<k-toast>`.
 *
 * A transient, non-blocking notification.
 *
 * Errors use `role="alert"`; everything else uses `role="status"`. The toast
 * auto-dismisses after six seconds, with a visible progress bar that pauses
 * on hover.
 */
import { KComponent, defineComponent, translate } from "./base";
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
.action:focus-visible { outline: 2px solid transparent; box-shadow: var(--ring); }

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
.close:focus-visible { outline: 2px solid transparent; box-shadow: var(--ring); }

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

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) .toast,
:host([data-reduced-motion]) .toast[data-leaving="true"] { animation: none; }
:host([data-reduced-motion]) .timer { animation: none; }
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

    /**
     * How much of the toast's life is left, in milliseconds.
     *
     * The time is counted down rather than measured against a deadline, so
     * that a pause genuinely stops the clock. A deadline would keep running
     * while the toast was paused, and a toast whose pointer rested on it for
     * a moment would be dismissed the instant the pointer left.
     */
    #remaining = 0;

    /**
     * When the current stretch of the toast's life started.
     *
     * A monotonic clock is used rather than the wall clock: the wall clock
     * can jump when the machine's clock is corrected, which would make a
     * toast vanish early or hang on for ever.
     */
    #startedAt = 0;

    /** The token that guards against a stale announcement. */
    #announceToken = 0;

    /** Whether the toast has already been dismissed. */
    #dismissed = false;

    /** The timer that removes the element once its exit animation is over. */
    #leaveTimer: ReturnType<typeof setTimeout> | undefined;

    protected override render(): void {
        const variant = (this.getAttribute("variant") ?? "info") as ToastVariant;
        const duration = Number(this.getAttribute("duration") ?? 6000);

        this.root.replaceChildren();
        this.#dismissed = false;
        this.#clearTimer();

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
        // The message is filled in by #announce(), once the element is in the
        // document, so that assistive technology announces the change.

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
        close.setAttribute("aria-label", translate("commonDismiss", "Dismiss"));
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
                this.#pauseTimer(duration);
                timer.style.animationPlayState = "paused";
            });
            toast.addEventListener("mouseleave", () => {
                timer.style.animationPlayState = "running";
                this.#resumeTimer(duration);
            });
        }

        this.root.appendChild(toast);
        this.#announce();
        this.#startTimer(duration);
    }

    /**
     * Put the message into the live region.
     *
     * A live region that is populated in the same tick it is created is often
     * missed: the assistive technology has not yet registered the region, so
     * there is no change for it to announce. The message is therefore written
     * in a microtask, after the element is in the document.
     */
    #announce(): void {
        const message = this.getAttribute("message") ?? "";
        const text = this.root.querySelector(".text");
        if (!text) return;

        const token = ++this.#announceToken;
        const write = (): void => {
            if (token !== this.#announceToken) return;
            text.textContent = message;
        };

        if (this.isConnected) {
            queueMicrotask(write);
        } else {
            write();
        }
    }

    /**
     * Start the dismiss timer.
     *
     * @param duration How long the toast should live, in milliseconds.
     */
    #startTimer(duration: number): void {
        if (duration <= 0) return;
        this.#clearTimer();
        this.#remaining = duration;
        this.#startedAt = now();
        this.#timer = setTimeout(() => this.dismiss(), duration);
    }

    /**
     * Stop the dismiss timer, keeping the time that is left.
     *
     * @param duration The toast's full lifetime, in milliseconds.
     */
    #pauseTimer(duration: number): void {
        if (this.#timer === undefined) return;
        const elapsed = now() - this.#startedAt;
        clearTimeout(this.#timer);
        this.#timer = undefined;
        // The timer's own schedule knows how much of the toast's life it
        // was going to use, so what is left is what it was not.
        this.#remaining = Math.max(0, Math.min(duration, duration - elapsed));
    }

    /**
     * Restart the dismiss timer for the time that is left.
     *
     * @param duration The toast's full lifetime, in milliseconds.
     */
    #resumeTimer(duration: number): void {
        if (duration <= 0) return;
        const remaining = this.#remaining;
        this.#clearTimer();
        // A toast whose time ran out while the pointer was over it goes now,
        // rather than waiting out another full period.
        if (remaining <= 0) {
            this.dismiss();
            return;
        }
        this.#timer = setTimeout(() => this.dismiss(), remaining);
    }

    /** Cancel the dismiss timer. */
    #clearTimer(): void {
        if (this.#timer !== undefined) {
            clearTimeout(this.#timer);
            this.#timer = undefined;
        }
    }

    /**
     * Dismiss the toast.
     *
     * Dismissing twice does nothing the second time: the toast emits one
     * dismissal event and is removed once, however many callers ask for it.
     */
    dismiss(): void {
        if (this.#dismissed) return;
        this.#dismissed = true;
        this.#clearTimer();
        const toast = this.root.querySelector(".toast") as HTMLElement | null;
        if (toast) {
            toast.dataset.leaving = "true";
            this.#leaveTimer = setTimeout(() => this.remove(), leaveDuration(this));
        } else {
            this.remove();
        }
        this.emit("k-dismiss", {});
    }

    /** Cancel the timers when the toast leaves the document. */
    override disconnectedCallback(): void {
        this.#clearTimer();
        if (this.#leaveTimer !== undefined) {
            clearTimeout(this.#leaveTimer);
            this.#leaveTimer = undefined;
        }
        super.disconnectedCallback();
    }
}

/**
 * A monotonic clock, in milliseconds.
 *
 * `performance.now()` is monotonic: it cannot jump backwards when the
 * machine's clock is corrected, and it does not include the time the machine
 * was asleep. That matters for a toast, whose lifetime is a stretch of
 * attention rather than a stretch of calendar time.
 *
 * @returns The current value of the monotonic clock.
 */
function now(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
}

/**
 * The leave animation's duration, in milliseconds.
 *
 * The removal has to wait for the exit animation, so it uses the same
 * `--dur-base` token the animation uses.
 *
 * @param host The toast element.
 * @returns The duration in milliseconds.
 */
function leaveDuration(host: Element): number {
    try {
        const raw = getComputedStyle(host).getPropertyValue("--dur-base").trim();
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    } catch {
        // The computed style is unavailable; fall through to the token's
        // declared value.
    }
    return 200;
}

defineComponent("k-toast", KToast);

declare global {
    interface HTMLElementTagNameMap {
        "k-toast": KToast;
    }
}
