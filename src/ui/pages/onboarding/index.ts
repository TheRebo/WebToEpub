/**
 * The onboarding page.
 *
 * Shown once, on the first run. Three steps: what the extension does, where
 * it works, and how it should look.
 *
 * The onboarding never blocks the user. It can be skipped at any point, it
 * makes no network call, and it asks for nothing — no account, no email, no
 * permission. The only thing it writes is `onboardingComplete`, so the page
 * is not shown again.
 */
import "../../components/base";
import "../../components/icons";
import "../../components/k-button";
import "../../components/k-skeleton";
import "../../components/k-switch";
import "../../components/k-toast";

import { localStorageAdapter, getURL } from "../../../core/browser-api";
import { SettingsStore, type SettingsPatch } from "../../../core/storage/settings-store";
import { themeController } from "../../styles/theme-controller";
import { installI18n } from "../../i18n-bootstrap";
import { OnboardingController } from "./controller";

/** Start the page. */
async function main(): Promise<void> {
    installI18n("onboardingWelcome");

    const store = new SettingsStore(localStorageAdapter);
    const controller = new OnboardingController({
        root: document.body,
        store: {
            get: () => store.get(),
            update: (partial: SettingsPatch) => store.update(partial),
        },
        theme: themeController,
        // The onboarding is opened in a tab, so it cannot close itself the way
        // a popup can. It hands over to the workbench instead: the user has
        // just finished setting things up, and the next thing they want is
        // the tool itself.
        close: () => {
            window.location.href = getURL("workbench.html");
        },
    });

    await controller.start();
}

void main().catch((error) => {
    console.error("[kintsugi] The onboarding failed to start:", error);
});
