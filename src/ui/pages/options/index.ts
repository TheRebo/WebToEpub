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
import { listHostAccess, revokeHostPattern } from "../../../core/host-access";
import {
    SettingsStore,
    type Settings,
    type SettingsPatch,
} from "../../../core/storage/settings-store";
import { themeController } from "../../styles/theme-controller";
import { sendRequest } from "../../../core/message/bus";
import { installI18n } from "../../i18n-bootstrap";
import { OptionsController, type BackgroundPort, type HostAccessPort } from "./controller";
import { createHashPort } from "./hash";
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
    async importLibrary(data: ArrayBuffer) {
        const { imported } = await sendRequest(api, "library:import", { data });
        return imported;
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
function initialTarget(hash: { read(): NavTarget }): NavTarget {
    return hash.read();
}

/**
 * The host access the options page shows.
 *
 * The permissions API is available to the options page directly, so this does
 * not go through the background worker. Asking the worker would be the wrong
 * shape anyway: a permission *request* needs a user gesture, and the options
 * page is not the place where one is made.
 */
const hostAccess: HostAccessPort = {
    list: () => listHostAccess(),
    async revoke(pattern: string) {
        return revokeHostPattern(pattern);
    },
    async revokeAll() {
        const origins = await listHostAccess();
        let revoked = false;
        for (const pattern of origins) {
            if (await revokeHostPattern(pattern)) revoked = true;
        }
        return revoked;
    },
};

/** Start the page. */
async function main(): Promise<void> {
    installI18n("popupSettings");

    const store = new SettingsStore(localStorageAdapter);
    const hash = createHashPort();
    const controller = new OptionsController({
        root: document.body,
        store: {
            get: () => store.get(),
            update: (partial: SettingsPatch) => store.update(partial),
            set: async (settings: Settings) => {
                await store.set(settings);
                return store.get();
            },
            reset: () => store.reset(),
        },
        theme: themeController,
        background,
        hostAccess,
        hash,
        target: initialTarget(hash),
    });

    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The options page failed to start:", error);
});
