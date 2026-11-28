/**
 * `<k-skeleton>`.
 *
 * The designed loading state: a shimmer block matching the shape of the
 * content that is coming.
 *
 * The block is `aria-hidden`; the loading region that contains it carries
 * `aria-busy="true"` and a visually hidden "Loading…" label.
 */
import { KComponent, defineComponent } from "./base";

const STYLES = `
:host {
    display: block;
}

:host([hidden]) { display: none; }

.skeleton {
    height: var(--_height, 16px);
    width: var(--_width, 100%);
    border-radius: var(--radius-xs);
    background: linear-gradient(
        90deg,
        var(--surface-sunken) 25%,
        var(--bg-subtle) 50%,
        var(--surface-sunken) 75%
    );
    background-size: 200% 100%;
    animation: k-shimmer 1.2s linear infinite;
}

/*
 * The in-app "Reduce motion" setting.
 *
 * The document's own rule cannot pierce the shadow boundary, so the base
 * class mirrors the preference onto the host.
 */
:host([data-reduced-motion]) .skeleton { animation: none; }

@keyframes k-shimmer {
    from { background-position: 200% 0; }
    to { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
    .skeleton { animation: none; }
}
`;

export class KSkeleton extends KComponent {
    static override styles = STYLES;
    static override observedAttributes = ["height", "width", "radius"];

    protected override render(): void {
        let skeleton = this.root.querySelector(".skeleton") as HTMLElement | null;
        if (!skeleton) {
            this.root.replaceChildren();
            skeleton = document.createElement("div");
            skeleton.className = "skeleton";
            skeleton.setAttribute("aria-hidden", "true");
            this.root.appendChild(skeleton);
        }

        const height = this.getAttribute("height");
        const width = this.getAttribute("width");
        const radius = this.getAttribute("radius");

        if (height) skeleton.style.setProperty("--_height", height);
        else skeleton.style.removeProperty("--_height");
        if (width) skeleton.style.setProperty("--_width", width);
        else skeleton.style.removeProperty("--_width");
        if (radius) skeleton.style.setProperty("--radius-xs", radius);
        else skeleton.style.removeProperty("--radius-xs");
    }
}

defineComponent("k-skeleton", KSkeleton);

declare global {
    interface HTMLElementTagNameMap {
        "k-skeleton": KSkeleton;
    }
}
