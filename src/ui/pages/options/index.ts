/**
 * The options page.
 *
 * Settings live in one place, and every change is written immediately. There
 * is no "Apply" button, because there is nothing to batch: a setting that
 * takes effect on the next page is a setting the user cannot trust.
 *
 * The appearance settings apply *live*, as they are changed, so the user
 * chooses the theme by looking at it rather than by imagining it.
 */
import "../../components/base";
import "../../components/icons";
import "../../components/k-button";
import "../../components/k-dialog";
import "../../components/k-field";
import "../../components/k-radio-group";
import "../../components/k-skeleton";
import "../../components/k-switch";
import "../../components/k-toast";

import { localStorageAdapter, sendMessage } from "../../../core/browser-api";
import { SettingsStore, type Settings } from "../../../core/storage/settings-store";
import { themeController } from "../../styles/theme-controller";
import { sendRequest } from "../../../core/message/bus";
import { installI18n } from "../../i18n-bootstrap";
import { OptionsController, type BackgroundPort } from "./controller";
import type { NavTarget } from "./view";

/** The messaging API the background port uses. */
const api = { sendMessage: (message: unknown) => sendMessage(message) };

/** The background worker, as the page uses it. */
const background: BackgroundPort = {
    async library() {
        const { entries } = await sendRequest(api, "library:list", {});
        return entries as Array<Record<string, unknown>>;
    },
    async removeFromLibrary(id: string) {
        await sendRequest(api, "library:delete", { id });
    },
    async siteSelectors() {
        const { entries } = await sendRequest(api, "site-selectors:list", {});
        return entries;
    },
    async forgetSiteSelectors(hostname: string) {
        await sendRequest(api, "site-selectors:remove", { hostname });
    },
};

/** The navigation target the page opens on. */
function initialTarget(): NavTarget {
    const hash = window.location.hash.replace("#", "");
    if (hash === "library") return "library";
    if (hash === "site-selectors") return "site-selectors";
    return "appearance";
}

/** Start the page. */
async function main(): Promise<void> {
    installI18n();

    const store = new SettingsStore(localStorageAdapter);
    const controller = new OptionsController({
        root: document.body,
        store: {
            get: () => store.get(),
            update: (partial: Partial<Settings>) => store.update(partial),
            set: async (settings: Settings) => {
                await store.set(settings);
                return store.get();
            },
            reset: () => store.reset(),
        },
        theme: themeController,
        background,
        target: initialTarget(),
    });

    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The options page failed to start:", error);
});
