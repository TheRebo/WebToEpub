/**
 * Capture the original extension's popup, for the before-and-after comparison.
 *
 * The original lives on the `legacy` branch, in a `plugin/` tree that is built
 * by the original's own tooling. This script points a real Firefox at that
 * tree — installed as a temporary add-on, exactly as a user would install it —
 * and captures its popup.
 *
 * Usage:
 *   node tools/legacy-shot.mjs <path-to-original-plugin-dir> <output.png>
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Marionette } from "./marionette.mjs";

const MARIONETTE_PORT = 2829;

/** The original's add-on ID. */
const ADDON_ID = "WebToEpub@Baka-tsuki.org";

/** The original's internal UUID. */
const EXTENSION_UUID = "b7d4e2f1-9c05-4a63-8f2e-1d4c7a9b3e05";

const PREFERENCES = {
    "browser.shell.checkDefaultBrowser": false,
    "browser.startup.homepage_override.mstone": "ignore",
    "datareporting.policy.dataSubmissionEnabled": false,
    "toolkit.telemetry.enabled": false,
    "app.update.enabled": false,
    "extensions.update.enabled": false,
    "extensions.autoDisableScopes": 0,
    "browser.aboutwelcome.enabled": false,
    "trailhead.firstrun.didSeeAboutWelcome": true,
    "network.captive-portal-service.enabled": false,
    "marionette.port": MARIONETTE_PORT,
    "extensions.webextensions.uuids": JSON.stringify({ [ADDON_ID]: EXTENSION_UUID }),
};

/** Find a Firefox to drive. */
async function findFirefox() {
    if (process.env.KINTSUGI_FIREFOX) return process.env.KINTSUGI_FIREFOX;

    const cache = join(homedir(), ".cache", "ms-playwright");
    if (existsSync(cache)) {
        const entries = await readdir(cache);
        const builds = entries
            .filter((entry) => entry.startsWith("firefox-"))
            .map((entry) => join(cache, entry, "firefox", "firefox"))
            .filter((path) => existsSync(path))
            .sort();
        if (builds.length > 0) return builds[builds.length - 1] ?? "";
    }

    for (const candidate of ["/tmp/ffdl/firefox/firefox", "/usr/bin/firefox"]) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error("No Firefox found. Set KINTSUGI_FIREFOX to a Firefox binary.");
}

/** Sleep. */
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

/** Capture the original's popup. */
async function main() {
    const source = resolve(process.argv[2] ?? "");
    const output = resolve(process.argv[3] ?? "legacy-popup.png");
    if (!existsSync(join(source, "manifest.json"))) {
        throw new Error(`${source} does not look like the original's plugin directory.`);
    }

    const firefox = await findFirefox();
    const profile = await mkdtemp(join(tmpdir(), "webtoepub-legacy-"));
    const lines = Object.entries(PREFERENCES).map(
        ([key, value]) => `user_pref("${key}", ${JSON.stringify(value)});`,
    );
    await writeFile(join(profile, "user.js"), lines.join("\n") + "\n", "utf8");
    await writeFile(join(profile, "prefs.js"), lines.join("\n") + "\n", "utf8");

    const browser = spawn(
        firefox,
        ["--marionette", "--profile", profile, "--no-remote", "about:blank"],
        {
            env: { ...process.env, MOZ_HEADLESS: "1", MOZ_DISABLE_AUTO_SAFE_MODE: "1" },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    const log = (chunk) => {
        if (process.env.KINTSUGI_DEBUG) process.stderr.write(`[ff] ${chunk}`);
    };
    browser.stdout.on("data", log);
    browser.stderr.on("data", log);

    const marionette = new Marionette(MARIONETTE_PORT);
    try {
        await marionette.ready();
        await marionette.send("WebDriver:NewSession", {
            capabilities: {
                alwaysMatch: {
                    acceptInsecureCerts: true,
                    /*
                     * The original shows an alert when it cannot work out what
                     * is on the page. Marionette's default is to fail the
                     * command; dismissing the dialog lets the screenshot be
                     * taken anyway.
                     */
                    unhandledPromptBehavior: "dismiss",
                },
            },
        });
        await marionette.send("Addon:Install", { path: source, temporary: true });
        await sleep(1500);

        // The popup is a normal page of the extension.
        const url = `moz-extension://${EXTENSION_UUID}/popup.html`;
        await marionette.send("WebDriver:Navigate", { url });
        await sleep(2500);

        // Size the window to something close to a real popup.
        await marionette.send("WebDriver:SetWindowRect", { width: 460, height: 620, x: 0, y: 0 });
        await sleep(500);

        const shot = await marionette.send("WebDriver:TakeScreenshot", { full: true });
        const buffer = Buffer.from(shot?.value ?? "", "base64");
        await writeFile(output, buffer);
        console.log(`${output} (${(buffer.length / 1024).toFixed(1)} KB)`);
    } finally {
        try {
            marionette.close();
        } catch {
            /* The browser may already be gone. */
        }
        browser.kill("SIGTERM");
        await sleep(500);
        browser.kill("SIGKILL");
        await rm(profile, { recursive: true, force: true });
    }
}

await main();
