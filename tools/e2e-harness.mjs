/**
 * The end-to-end harness.
 *
 * It launches a **real Firefox**, installs the built extension as a temporary
 * add-on, and hands back a Marionette session pointed at the extension's
 * pages.
 *
 * The point of using Firefox's own protocol, rather than a patched browser, is
 * that the artefact under test is the artefact a user installs: the same
 * `dist/`, the same manifest, the same content script, the same background
 * worker. Nothing is simulated.
 *
 * Usage:
 *   node tools/e2e-harness.mjs <command> [options]
 *
 * Commands:
 *   pages    List the extension's pages and their URLs.
 *   shot     Capture a screenshot of one page.
 *   shots    Capture a screenshot of every page, in both themes.
 *   run      Run the checks in `tests/e2e/checks.mjs`.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Marionette } from "./marionette.mjs";
import { startFixture } from "./e2e-fixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

/** The extension's ID, from the manifest. */
const ADDON_ID = "kintsugi@localhost";

/**
 * The internal UUID of the extension.
 *
 * Firefox normally assigns a random one. Pinning it in the profile's
 * preferences means the `moz-extension://` URL of an extension page is known
 * before the browser starts, which keeps the harness free of chrome-scope
 * script execution.
 */
const EXTENSION_UUID = "8f3a1c22-4b6d-4e2f-9a71-2c5d8e0b4f13";

/** The port Marionette listens on. */
const MARIONETTE_PORT = 2828;

/**
 * The preferences the test browser runs with.
 *
 * They disable everything that would make the run non-deterministic: the
 * first-run wizard, the network onboarding, the update check, telemetry, and
 * the "what's new" page.
 */
const PREFERENCES = {
    "browser.shell.checkDefaultBrowser": false,
    "browser.startup.homepage_override.mstone": "ignore",
    "datareporting.policy.dataSubmissionEnabled": false,
    "datareporting.healthreport.uploadEnabled": false,
    "toolkit.telemetry.enabled": false,
    "toolkit.telemetry.unified": false,
    "app.update.enabled": false,
    "extensions.update.enabled": false,
    "extensions.autoDisableScopes": 0,
    "browser.sessionstore.resume_from_crash": false,
    "browser.tabs.warnOnClose": false,
    "browser.tabs.warnOnCloseOtherTabs": false,
    "browser.aboutwelcome.enabled": false,
    "browser.messaging-system.whatsNewPanel.enabled": false,
    "trailhead.firstrun.didSeeAboutWelcome": true,
    "network.captive-portal-service.enabled": false,
    "network.connectivity-service.enabled": false,
    "signon.rememberSignons": false,
    "browser.urlbar.suggest.quickactions": false,
    "marionette.port": MARIONETTE_PORT,
    "devtools.console.stdout.content": true,
    "extensions.webextensions.uuids": JSON.stringify({ [ADDON_ID]: EXTENSION_UUID }),
};

/**
 * Find a Firefox to drive.
 *
 * The Playwright build is preferred: its Marionette is allowed to navigate to
 * a `moz-extension://` URL, which is the only way to reach an extension page
 * programmatically. Stock Firefox refuses, because navigating to a privileged
 * URL is only allowed from the browser's chrome scope — and the chrome scope
 * needs system access that a headless test run has no reason to grant.
 *
 * @returns {Promise<string>} The path to the Firefox binary.
 */
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

    for (const candidate of [
        "/tmp/ffdl/firefox/firefox",
        "/usr/bin/firefox",
        "/usr/lib/firefox/firefox",
    ]) {
        if (existsSync(candidate)) return candidate;
    }
    throw new Error("No Firefox found. Set KINTSUGI_FIREFOX to a Firefox binary.");
}

/** The harness. */
export class Harness {
    #process;
    #marionette;
    #profile;
    #firefox = "";
    #fixture;

    /** Start Firefox and install the extension. */
    async start({ fixture = false } = {}) {
        this.#firefox = await findFirefox();
        if (!existsSync(join(DIST, "manifest.json"))) {
            throw new Error("dist/ is missing. Run `npm run build` first.");
        }

        if (fixture) this.#fixture = await startFixture();

        this.#profile = await mkdtemp(join(tmpdir(), "kintsugi-profile-"));
        await this.#writePrefs();

        this.#process = spawn(
            this.#firefox,
            ["--marionette", "--profile", this.#profile, "--no-remote", "about:blank"],
            {
                env: {
                    ...process.env,
                    MOZ_HEADLESS: "1",
                    MOZ_DISABLE_AUTO_SAFE_MODE: "1",
                },
                stdio: ["ignore", "pipe", "pipe"],
            },
        );
        const log = (chunk) => {
            if (process.env.KINTSUGI_DEBUG) process.stderr.write(`[ff] ${chunk}`);
        };
        this.#process.stdout.on("data", log);
        this.#process.stderr.on("data", log);

        this.#marionette = new Marionette(MARIONETTE_PORT);
        await this.#marionette.ready();
        await this.#marionette.send("WebDriver:NewSession", {
            capabilities: { alwaysMatch: { acceptInsecureCerts: true } },
        });

        await this.#install();
        return this;
    }

    /**
     * The extension's internal UUID, which forms the `moz-extension://` base.
     *
     * The UUID is pinned in the profile's preferences before Firefox starts, so
     * the URL of an extension page is known in advance.
     */
    get baseUrl() {
        return `moz-extension://${EXTENSION_UUID}`;
    }

    /** The Marionette session. */
    get session() {
        return this.#marionette;
    }

    /** The fixture site's origin, when the harness was started with one. */
    get fixtureOrigin() {
        return this.#fixture?.origin ?? "";
    }

    /** Navigate to a page of the extension. */
    async goto(page) {
        await this.#marionette.send("WebDriver:Navigate", { url: `${this.baseUrl}/${page}` });
        await this.waitForReady();
    }

    /** Navigate to an arbitrary URL. */
    async navigate(url) {
        await this.#marionette.send("WebDriver:Navigate", { url });
        await this.waitForReady();
    }

    /** Wait for the document to be interactive. */
    async waitForReady() {
        for (let attempt = 0; attempt < 100; attempt += 1) {
            const state = await this.#marionette.send("WebDriver:ExecuteScript", {
                script: "return document.readyState;",
                args: [],
            });
            if (state?.value === "complete") return;
            await sleep(50);
        }
    }

    /** Run a script in the page and return its value. */
    async script(body, args = []) {
        const result = await this.#marionette.send("WebDriver:ExecuteScript", {
            script: body,
            args,
        });
        return result?.value;
    }

    /**
     * Run an asynchronous script in the page and return its value.
     *
     * Marionette's asynchronous script is not an `async` function: it hands the
     * body a completion callback as its last argument. The body is therefore
     * wrapped, so it can be written with `await` and simply return a value.
     */
    async asyncScript(body, args = []) {
        const result = await this.#marionette.send("WebDriver:ExecuteAsyncScript", {
            script: `
                const done = arguments[arguments.length - 1];
                (async () => {
                    try {
                        done({ value: await (async () => { ${body} })() });
                    } catch (error) {
                        done({ error: String(error && error.message ? error.message : error) });
                    }
                })();
            `,
            args,
        });
        if (result?.error) throw new Error(result.error);
        // Marionette wraps the callback's argument in its own envelope, and the
        // wrapper above adds a second one. Unwrap both, so callers get the
        // value they returned rather than a box around a box.
        let payload = result?.value;
        if (payload && typeof payload === "object" && "error" in payload) {
            throw new Error(String(payload.error));
        }
        if (payload && typeof payload === "object" && "value" in payload) {
            payload = payload.value;
        }
        return payload;
    }

    /** Take a screenshot and return it as a PNG buffer. */
    async screenshot() {
        const result = await this.#marionette.send("WebDriver:TakeScreenshot", { full: true });
        return Buffer.from(result?.value ?? "", "base64");
    }

    /** Set the window size. */
    async setViewport(width, height) {
        await this.#marionette.send("WebDriver:SetWindowRect", { width, height, x: 0, y: 0 });
    }

    /**
     * Send a key press to the page.
     *
     * The key is a WebDriver key name — `"Tab"`, `"Enter"`, `"Escape"`. A real
     * key event is needed for `:focus-visible` to match: a synthetic one
     * dispatched from a script is untrusted, and the browser treats it as a
     * pointer interaction.
     *
     * @param {string} key The key's name.
     */
    async sendKey(key) {
        // `WebDriver:SendKeys` is not part of Marionette's command set, so the
        // key is pressed with the Actions API instead.
        await this.#marionette.send("WebDriver:PerformActions", {
            actions: [
                {
                    type: "key",
                    id: "keyboard",
                    actions: [
                        { type: "keyDown", value: key },
                        { type: "keyUp", value: key },
                    ],
                },
            ],
        });
    }

    /** The handles of the browser's windows. */
    async windowHandles() {
        const result = await this.#marionette.send("WebDriver:GetWindowHandles");
        return Array.isArray(result) ? result : [];
    }

    /** Open a new tab and return its handle. */
    async newTab() {
        const result = await this.#marionette.send("WebDriver:NewWindow", { type: "tab" });
        return result?.handle;
    }

    /** Switch to a window by handle. */
    async switchTo(handle) {
        await this.#marionette.send("WebDriver:SwitchToWindow", { handle });
    }

    /** Stop Firefox and clean up. */
    async stop() {
        try {
            this.#marionette?.close();
        } catch {
            // The browser may already be gone.
        }
        this.#process?.kill("SIGTERM");
        await sleep(500);
        this.#process?.kill("SIGKILL");
        if (this.#profile) await rm(this.#profile, { recursive: true, force: true });
        await this.#fixture?.close();
    }

    /** Install the built extension as a temporary add-on. */
    async #install() {
        await this.#marionette.send("Addon:Install", {
            path: DIST,
            temporary: true,
        });
    }

    /** Write the profile's preferences. */
    async #writePrefs() {
        const lines = Object.entries(PREFERENCES).map(
            ([key, value]) => `user_pref("${key}", ${JSON.stringify(value)});`,
        );
        await writeFile(join(this.#profile, "user.js"), lines.join("\n") + "\n", "utf8");
        await writeFile(join(this.#profile, "prefs.js"), lines.join("\n") + "\n", "utf8");
    }
}

/** Sleep. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The pages the extension ships. */
export const PAGES = [
    { name: "popup", file: "popup.html", width: 400, height: 580 },
    { name: "workbench", file: "workbench.html", width: 1440, height: 900 },
    { name: "options", file: "options.html", width: 1280, height: 900 },
    { name: "onboarding", file: "onboarding.html", width: 1100, height: 820 },
];

/**
 * Switch the page between the light and the dark theme.
 *
 * The theme lives in `browser.storage.local`, so it is set there and the page
 * is told to apply it — the same path a user's choice takes.
 *
 * @param {Harness} harness The harness.
 * @param {"light" | "dark"} theme The theme to apply.
 */
export async function setTheme(harness, theme) {
    await harness.asyncScript(`
        const api = globalThis.browser ?? globalThis.chrome;
        const stored = await api.storage.local.get("kintsugi.settings");
        const settings = stored["kintsugi.settings"] ?? {};
        settings.appearance = { ...(settings.appearance ?? {}), theme: ${JSON.stringify(theme)} };
        await api.storage.local.set({ "kintsugi.settings": settings });
        return true;
    `);
    await harness.goto(await harness.script("return location.pathname.split('/').pop();"));
    await sleep(400);
}

/** Run the command line interface. */
async function main() {
    const [command = "pages", ...rest] = process.argv.slice(2);
    const options = parseOptions(rest);

    if (command === "pages") {
        const harness = new Harness();
        await harness.start();
        try {
            for (const page of PAGES) {
                console.log(`${page.name}\t${harness.baseUrl}/${page.file}`);
            }
        } finally {
            await harness.stop();
        }
        return;
    }

    if (command === "shot" || command === "shots") {
        const targets = command === "shots" ? PAGES : PAGES.filter((p) => p.name === options.page);
        if (targets.length === 0) throw new Error(`Unknown page: ${options.page}`);
        const themes = command === "shots" ? ["light", "dark"] : [options.theme ?? "light"];

        const harness = new Harness();
        await harness.start();
        try {
            for (const page of targets) {
                for (const theme of themes) {
                    await harness.setViewport(page.width, page.height);
                    await harness.goto(page.file);
                    await sleep(600);
                    await setTheme(harness, theme);
                    await sleep(400);
                    const suffix = themes.length > 1 ? `-${theme}` : "";
                    const out = resolve(
                        ROOT,
                        options.out ?? `docs/screenshots/${page.name}${suffix}.png`,
                    );
                    await mkdir(dirname(out), { recursive: true });
                    const png = await harness.screenshot();
                    await writeFile(out, png);
                    console.log(`${out} (${(png.length / 1024).toFixed(1)} KB)`);
                }
            }
        } finally {
            await harness.stop();
        }
        return;
    }

    if (command === "run") {
        const checks = await import("../tests/e2e/checks.mjs");
        const harness = new Harness();
        await harness.start({ fixture: true });
        let failures = 0;
        try {
            failures = await checks.run(harness);
        } finally {
            await harness.stop();
        }
        process.exitCode = failures > 0 ? 1 : 0;
        return;
    }

    throw new Error(`Unknown command: ${command}`);
}

/** Parse `--key=value` options. */
function parseOptions(args) {
    const options = {};
    for (const arg of args) {
        const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
        if (!match) continue;
        options[match[1]] = match[2] ?? "true";
    }
    return options;
}

/**
 * Whether this module is the entry point.
 *
 * The comparison is done on the resolved paths rather than on the URLs,
 * because the project's path contains square brackets, which `file:` URLs
 * percent-encode — so the two would never match.
 *
 * @returns {boolean} True when the module was run directly.
 */
function isEntryPoint() {
    const entry = process.argv[1];
    if (!entry) return false;
    try {
        return resolve(entry) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    main().catch((error) => {
        console.error(error.message);
        process.exit(1);
    });
}
