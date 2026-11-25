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
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync, readdirSync, statSync } from "node:fs";
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
 * The directory the test browser downloads into.
 *
 * It is a directory of its own rather than the user's download folder, so a
 * run never litters, and so a leftover file from an earlier run can never be
 * mistaken for one this run produced.
 */
const DOWNLOAD_DIR = join(tmpdir(), "kintsugi-downloads");

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
    "browser.download.useDownloadDir": true,
    // `2` is the folder the preferences below point at. With `1` the files
    // land in the browser's own download folder instead.
    "browser.download.folderList": 2,
    "browser.download.dir": DOWNLOAD_DIR,
    "browser.download.always_ask_before_handling_new_types": false,
    "browser.helperApps.neverAsk.saveToDisk": "application/epub+zip,application/zip",
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
    #mainWindow = "";

    /** Start Firefox and install the extension. */
    async start({ fixture = false } = {}) {
        this.#firefox = await findFirefox();
        if (!existsSync(join(DIST, "manifest.json"))) {
            throw new Error("dist/ is missing. Run `npm run build` first.");
        }

        if (fixture) this.#fixture = await startFixture();

        // The download directory is emptied before every run, so a file the
        // run asserts on can only have been written by this run.
        await rm(DOWNLOAD_DIR, { recursive: true, force: true });
        await mkdir(DOWNLOAD_DIR, { recursive: true });

        this.#profile = await mkdtemp(join(tmpdir(), "kintsugi-profile-"));
        await this.#writePrefs();

        this.#process = spawn(
            this.#firefox,
            [
                "--marionette",
                // Marionette's chrome context — where `AddonManager` lives —
                // is only reachable with system access. The harness uses it to
                // check that the add-on really is installed and enabled.
                "--remote-allow-system-access",
                "--profile",
                this.#profile,
                "--no-remote",
                "about:blank",
            ],
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
        await this.#assertExtensionLoaded();

        // The window Firefox opened on start-up is the one the harness
        // drives; anything else it opens is a satellite.
        const handles = await this.windowHandles();
        if (handles[0]) this.#mainWindow = handles[0];

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

    /**
     * Wait for the document to be interactive.
     *
     * A timeout is a failure, not a shrug: a page that never becomes ready is a
     * broken page, and a suite that treats "still loading" as "loaded" passes
     * when it should fail.
     *
     * @throws When the document is still not ready after the timeout.
     */
    async waitForReady(timeoutMs = 5_000) {
        const deadline = Date.now() + timeoutMs;
        let state = "";
        while (Date.now() < deadline) {
            state = (await this.script("return document.readyState;")) ?? "";
            if (state === "complete") return;
            await sleep(50);
        }
        throw new Error(
            `The page was not ready after ${timeoutMs} ms (document.readyState is "${state}").`,
        );
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

    /**
     * The handle of the window the extension was installed into.
     *
     * It is the first window Firefox opens, so its handle is the first one
     * the browser reports.
     */
    get mainWindow() {
        return this.#mainWindow;
    }

    /** Open a new tab and return its handle. */
    async newTab() {
        const result = await this.#marionette.send("WebDriver:NewWindow", { type: "tab" });
        return result?.handle;
    }

    /** Open a new window and return its handle. */
    async newWindow() {
        const result = await this.#marionette.send("WebDriver:NewWindow", { type: "window" });
        return result?.handle;
    }

    /** Switch to a window by handle. */
    async switchTo(handle) {
        await this.#marionette.send("WebDriver:SwitchToWindow", { handle });
    }

    /**
     * Exercise the extension's own flow, from a real page to a real file.
     *
     * Installing the add-on proves very little. Firefox accepts a manifest
     * that leaves the background worker silent, the content script
     * uninjected, or the parsers unable to find a single chapter — and a suite
     * that only checks the install command did not throw passes in exactly
     * that case.
     *
     * So the extension is driven the way a user drives it: a real page of the
     * fixture site is loaded, the extension reads that page, the extension
     * lists the chapters, the extension builds a book out of them, and the
     * extension writes a file to disk.
     *
     * @throws When any part of the flow does not work.
     * @returns {Promise<string[]>} The checks that were made.
     */
    async assertExtensionFlow() {
        const steps = [];
        await this.#assertStoryFlow(steps);
        await this.#assertDownloadFlow(steps);
        await this.#assertFileIsWritten(steps);
        return steps;
    }

    /**
     * Check that the extension can read a real page.
     *
     * The page is loaded through the browser, over HTTP, from the fixture
     * server — not handed to the extension as a string. The extension's
     * content script has to be running in it, and the extension's own worker
     * has to be able to fetch and parse it.
     *
     * @throws When the page, the content script, or the parsers do not work.
     * @param {string[]} steps The list of checks made.
     */
    async #assertStoryFlow(steps) {
        if (!this.#fixture) {
            throw new Error("The story flow needs the fixture site.");
        }
        const storyUrl = `${this.fixtureOrigin}/`;

        // A real page load. The fixture goes into its own window, so the
        // window the extension's own page lives in stays as it was.
        const pageWindow = await this.newWindow();
        await this.switchTo(pageWindow);
        await this.navigate(storyUrl);

        const title = await this.script("return document.title;");
        if (title !== "The Kintsugi Test Novel") {
            throw new Error(`The fixture page did not load (its title is "${title}").`);
        }
        const links = await this.script(
            'return document.querySelectorAll("ul.chapter-list a").length;',
        );
        if (links !== 12) {
            throw new Error(`The fixture page served ${links} chapter links, not 12.`);
        }

        // Back to the extension's own page: that is where the extension's API
        // lives, and where the extension's messages are sent from.
        await this.switchTo(this.mainWindow);
        await this.goto("popup.html");

        // The content script has to be running in the page that was loaded —
        // that is the extension reading the page the user is looking at.
        const summary = await this.#pageSummary(storyUrl);
        if (summary === null) {
            throw new Error(
                "The extension's content script did not answer in the page that was loaded.",
            );
        }
        if (summary.title !== "The Kintsugi Test Novel") {
            throw new Error(
                `The content script read the title "${summary.title}" instead of the fixture's.`,
            );
        }
        if (summary.looksLikeToc !== true) {
            throw new Error(
                "The content script did not recognise the page as a table of contents.",
            );
        }
        if (summary.chapterLinks.length !== 12) {
            throw new Error(
                `The content script found ${summary.chapterLinks.length} chapter links, not 12.`,
            );
        }

        // The extension's own analysis of the same page, through its own
        // worker: this is the parser registry and the metadata extraction.
        const analysis = await this.#ask("page:analyze", { url: storyUrl });
        if (analysis.supported !== true) {
            throw new Error("The extension did not find a parser for the fixture.");
        }
        if (analysis.title !== "The Kintsugi Test Novel") {
            throw new Error(
                `The extension read the title "${analysis.title}" instead of the fixture's.`,
            );
        }
        if (!String(analysis.author ?? "").includes("A. Fixture")) {
            throw new Error(`The extension read the author "${analysis.author}".`);
        }

        // The chapter list, from the parser: twelve chapters, in order.
        const list = await this.#ask("chapters:list", { url: storyUrl });
        const chapters = list.chapters ?? [];
        if (chapters.length !== 12) {
            throw new Error(`The extension listed ${chapters.length} chapters, not 12.`);
        }
        if (chapters[0]?.sourceUrl !== `${storyUrl}chapter/1`) {
            throw new Error(
                `The first chapter is "${chapters[0]?.sourceUrl}" instead of "${storyUrl}chapter/1".`,
            );
        }

        steps.push("reads a real page through the extension's own content script");
        steps.push("analyses the page and lists every chapter");
    }

    /**
     * Check that the extension can build and save a book.
     *
     * The job is started through the extension's own message protocol, so the
     * whole pipeline runs: the story is fetched, the chapters are parsed, the
     * book is assembled, and the file is written.
     *
     * The job has to reach its `complete` phase and the `.epub` has to appear
     * in the browser's download directory. Anything less is a failure: a job
     * that stops at `saving` is the extension hanging, and a job that
     * completes without a file on disk is the extension lying.
     *
     * @throws When the download job does not run, fails, or writes no file.
     * @param {string[]} steps The list of checks made.
     */
    async #assertDownloadFlow(steps) {
        if (!this.#fixture) {
            throw new Error("The download flow needs the fixture site.");
        }
        const storyUrl = `${this.fixtureOrigin}/`;
        const chapters = [1, 2].map((index) => ({
            sourceUrl: `${storyUrl}chapter/${index}`,
            title: `Chapter ${index}`,
        }));

        const started = await this.#ask("download:start", {
            url: storyUrl,
            title: "The Kintsugi Test Novel",
            chapters,
        });
        const jobId = started.jobId;
        if (typeof jobId !== "string" || jobId === "") {
            throw new Error("The extension did not start a download job.");
        }

        // The job has to get all the way through: fetch the chapters, build
        // the book, write the file. Every phase before `complete` is one
        // where a parser, the fetcher or the packer can be broken.
        const progress = await this.#waitForJob(jobId);
        if (progress.phase === "failed" || progress.phase === "cancelled") {
            throw new Error(
                `The download job ${progress.phase}: ${progress.error?.message ?? "no reason given"}. ${
                    progress.error?.detail ?? ""
                }`,
            );
        }
        if (progress.phase !== "complete") {
            throw new Error(
                `The download job never finished saving (its last phase was "${progress.phase}").`,
            );
        }
        if (progress.chaptersDone !== chapters.length) {
            throw new Error(
                `The download job fetched ${progress.chaptersDone} of ${chapters.length} chapters.`,
            );
        }
        if (progress.percent !== 100) {
            throw new Error(`The download job stopped at ${progress.percent}%.`);
        }

        await this.#assertEpubIsWritten(steps, progress.fileName);

        steps.push("builds a book out of the page's chapters");
        steps.push("saves the book to the browser's download directory");
    }

    /**
     * Check that the extension's own save step wrote an EPUB.
     *
     * The file is written with the extension's downloads API, from the
     * background worker, and the bytes are read back from the browser's
     * download directory. A manifest that lost the `downloads` permission, a
     * save step that hung, or a packer that produced an empty archive all
     * fail here.
     *
     * The file is found by its extension rather than by its name: the name
     * comes from the book's title, sanitised, and the harness should not
     * have to know how the extension spells it.
     *
     * @throws When no file is written, or it is not a readable EPUB.
     * @param {string[]} steps The list of checks made.
     * @param {string} [fileName] The name the job reported, if it reported one.
     */
    async #assertEpubIsWritten(steps, fileName) {
        const deadline = Date.now() + 20_000;
        let path = null;
        for (;;) {
            path = this.#findEpub(fileName);
            if (path !== null) break;
            if (Date.now() >= deadline) {
                throw new Error(
                    `The extension did not write an EPUB to the download directory (it reported "${fileName ?? "no file name"}").`,
                );
            }
            await sleep(100);
        }

        // The file has to be a real EPUB: a ZIP archive that starts with the
        // local file header signature and holds the book's contents.
        const bytes = await readFile(path);
        if (bytes.length < 22) {
            throw new Error(`The book the extension wrote is only ${bytes.length} bytes long.`);
        }
        const signature = bytes.subarray(0, 4).toString("latin1");
        if (signature !== "PK\u0003\u0004") {
            throw new Error(
                `The book the extension wrote does not start with a ZIP header (${JSON.stringify(signature)}).`,
            );
        }
        if (!bytes.includes(Buffer.from("mimetype"))) {
            throw new Error("The book the extension wrote has no mimetype entry.");
        }
        if (!bytes.includes(Buffer.from("OEBPS"))) {
            throw new Error("The book the extension wrote has no content directory.");
        }

        steps.push("writes a readable EPUB to the browser's download directory");
    }

    /**
     * Find the EPUB the extension wrote.
     *
     * The name the job reported is preferred. When the job did not report
     * one, the newest `.epub` in the download directory is used, so a harness
     * that runs against a browser with an old download still finds the file
     * this run wrote.
     *
     * @param {string} [fileName] The name the job reported.
     * @returns {string | null} The file's path, or `null` when there is none.
     */
    #findEpub(fileName) {
        if (fileName) {
            const preferred = join(DOWNLOAD_DIR, fileName);
            if (existsSync(preferred)) return preferred;
        }

        let newest = null;
        let newestTime = 0;
        for (const entry of readdirSync(DOWNLOAD_DIR)) {
            if (!entry.toLowerCase().endsWith(".epub")) continue;
            const candidate = join(DOWNLOAD_DIR, entry);
            let time = 0;
            try {
                time = statSync(candidate).mtimeMs;
            } catch {
                continue;
            }
            if (time > newestTime) {
                newest = candidate;
                newestTime = time;
            }
        }
        return newest;
    }

    /**
     * Check that the extension can write a file to disk.
     *
     * The file is written with the extension's own downloads API, from one of
     * the extension's own pages, and the bytes are read back from the
     * browser's download directory. A manifest that lost the `downloads`
     * permission, or a browser that stopped saving files, fails here.
     *
     * @throws When no file is written, or its contents are wrong.
     * @param {string[]} steps The list of checks made.
     */
    async #assertFileIsWritten(steps) {
        const name = "kintsugi-download-probe.txt";
        const payload = "Kintsugi wrote this file.";
        const path = join(DOWNLOAD_DIR, name);

        await this.asyncScript(`
            const api = globalThis.browser ?? globalThis.chrome;
            const blob = new Blob([${JSON.stringify(payload)}], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            await api.downloads.download({
                url,
                filename: ${JSON.stringify(name)},
                conflictAction: "overwrite",
            });
            return true;
        `);

        const deadline = Date.now() + 15_000;
        for (;;) {
            if (existsSync(path)) break;
            if (Date.now() >= deadline) {
                throw new Error(`The extension did not write "${name}" to the download directory.`);
            }
            await sleep(100);
        }

        const written = await readFile(path, "utf8");
        if (written !== payload) {
            throw new Error(
                `The file the extension wrote holds ${JSON.stringify(written)} instead of ${JSON.stringify(payload)}.`,
            );
        }

        steps.push("writes a file with the extension's own downloads API");
    }

    /**
     * Wait for a download job to finish.
     *
     * The job has to reach `complete`. A job that stops at `saving` is the
     * extension hanging, and the harness must not report that as a pass.
     *
     * @param {string} jobId The job's ID.
     * @param {number} timeoutMs How long to wait.
     * @returns {Promise<{phase: string, chaptersDone: number, chaptersTotal: number, percent: number, fileName?: string, error?: {message?: string}}>}
     *   The job's last progress.
     */
    async #waitForJob(jobId, timeoutMs = 45_000) {
        const deadline = Date.now() + timeoutMs;
        let progress = { phase: "preparing", chaptersDone: 0, chaptersTotal: 0, percent: 0 };
        while (Date.now() < deadline) {
            progress = await this.#ask("download:progress", { jobId });
            if (
                progress.phase === "complete" ||
                progress.phase === "failed" ||
                progress.phase === "cancelled"
            ) {
                return progress;
            }
            await sleep(200);
        }
        throw new Error(
            `The download job never finished (its last phase was "${progress.phase}" at ${progress.percent}%).`,
        );
    }

    /**
     * Ask the extension's background worker something.
     *
     * The request goes through the extension's own message protocol, from one
     * of the extension's own pages, and the answer is checked for the error
     * envelope the protocol uses.
     *
     * @param {string} type The request's name.
     * @param {unknown} payload The request's payload.
     * @returns {Promise<Record<string, unknown>>} The request's result.
     */
    async #ask(type, payload) {
        const raw = await this.asyncScript(`
            const api = globalThis.browser ?? globalThis.chrome;
            const response = await api.runtime.sendMessage({
                type: ${JSON.stringify(type)},
                payload: ${JSON.stringify(payload)},
                id: "harness",
            });
            return JSON.stringify(response ?? null);
        `);
        const response = JSON.parse(raw ?? "null");
        if (response === null) {
            throw new Error(`The extension did not answer "${type}".`);
        }
        if (response.error) {
            throw new Error(
                `The extension could not answer "${type}": ${response.error.message ?? "no reason given"}.`,
            );
        }
        if (response.result === undefined) {
            throw new Error(`The extension's answer to "${type}" was empty.`);
        }
        return response.result;
    }

    /**
     * The content script's summary of a page.
     *
     * The content script only answers in the pages it was injected into, so
     * the tabs are asked one by one until the one that was loaded answers.
     *
     * @param {string} storyUrl The URL of the page that was loaded.
     * @returns {Promise<{title: string, looksLikeToc: boolean, chapterLinks: string[]} | null>}
     *   The summary, or `null` when no tab answered.
     */
    async #pageSummary(storyUrl) {
        const raw = await this.asyncScript(`
            const api = globalThis.browser ?? globalThis.chrome;
            const tabs = await api.tabs.query({});
            for (const tab of tabs) {
                try {
                    const response = await api.tabs.sendMessage(tab.id, {
                        type: "kintsugi:page-summary",
                    });
                    if (response?.ok && response.summary?.url?.startsWith(${JSON.stringify(storyUrl)})) {
                        return JSON.stringify(response.summary);
                    }
                } catch {
                    // Tabs without the content script — the extension's own
                    // pages — cannot answer. The next tab is tried.
                }
            }
            return null;
        `);
        return raw === null ? null : JSON.parse(raw);
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

    /**
     * Install the built extension as a temporary add-on.
     *
     * The add-on's ID is checked against the one the manifest declares: a
     * manifest that changed its ID, or a `dist/` left over from another
     * version, would otherwise install "successfully" and leave the harness
     * driving pages that do not exist.
     *
     * @throws When Firefox installs an add-on with a different ID.
     */
    async #install() {
        const result = await this.#marionette.send("Addon:Install", {
            path: DIST,
            temporary: true,
        });
        const id = result?.value ?? result;
        if (id !== ADDON_ID) {
            throw new Error(
                `Firefox installed the add-on as "${id}", but the manifest declares "${ADDON_ID}".`,
            );
        }
    }

    /**
     * Check that the extension really is installed, enabled and working.
     *
     * Installing an add-on can succeed and still leave the extension
     * unusable — a manifest that Firefox rejects at runtime, a background
     * worker that throws on start-up. A suite that only checks "the install
     * command did not throw" passes in exactly that case, so the add-on is
     * looked up in the browser's own add-on manager, and one of the
     * extension's own pages is loaded through the extension's own flow.
     *
     * @throws When the add-on is missing, disabled, or does not work.
     */
    async #assertExtensionLoaded() {
        const addon = await this.#addonState();
        if (addon === null) {
            throw new Error(`The add-on "${ADDON_ID}" is not installed.`);
        }
        if (addon.active !== true || addon.userDisabled === true) {
            throw new Error(
                `The add-on "${ADDON_ID}" is installed but not active (active: ${addon.active}, user disabled: ${addon.userDisabled}).`,
            );
        }

        // The extension's own flow: a page of the extension is loaded, and the
        // extension's own background worker has to answer a request from it.
        // A broken background worker is invisible to everything else.
        await this.goto("popup.html");
        const wordmark = await this.script(
            'return document.querySelector(".popup-wordmark")?.textContent ?? "";',
        );
        if (wordmark !== "Kintsugi") {
            throw new Error(
                `The extension's popup did not render (the wordmark is "${wordmark}").`,
            );
        }
        const answered = await this.asyncScript(`
            const api = globalThis.browser ?? globalThis.chrome;
            const response = await api.runtime.sendMessage({
                type: "settings:get",
                payload: {},
                id: "harness-check",
            });
            return response?.result !== undefined && response?.error === undefined;
        `);
        if (answered !== true) {
            throw new Error("The extension's background worker did not answer a request.");
        }
    }

    /**
     * The browser's view of the extension's add-on.
     *
     * The add-on manager lives in the browser's chrome scope, so the session
     * is switched to it for the query and back afterwards. The browser is
     * started with `--remote-allow-system-access`, which is what makes that
     * scope reachable.
     *
     * @returns {Promise<{id: string, active: boolean, userDisabled: boolean} | null>}
     *   The add-on's state, or `null` when it is not installed.
     */
    async #addonState() {
        await this.#marionette.send("Marionette:SetContext", { value: "chrome" });
        try {
            const raw = await this.#marionette.send("WebDriver:ExecuteScript", {
                // Marionette's synchronous script has no top-level `await`, so
                // the query is returned as a promise and Marionette unwraps it.
                script: `
                    return AddonManager.getAllAddons().then((list) => {
                        const addon = list.find((entry) => entry.id === ${JSON.stringify(ADDON_ID)});
                        if (!addon) return null;
                        return JSON.stringify({
                            id: addon.id,
                            active: addon.isActive === true,
                            userDisabled: addon.userDisabled === true,
                        });
                    });
                `,
                args: [],
            });
            const value = raw?.value;
            return typeof value === "string" ? JSON.parse(value) : value;
        } finally {
            await this.#marionette.send("Marionette:SetContext", { value: "content" });
        }
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
    // The page is reloaded so it picks the theme up the way it does when a
    // user changes it in the settings. The query string is kept: the popup
    // and the workbench read the story's URL from it.
    const target = await harness.script("return location.pathname + location.search;");
    await harness.navigate(`${harness.baseUrl}/${target}`);
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
        await harness.start({ fixture: true });
        try {
            // The popup reads the *active* tab, so the fixture's index page
            // has to be the active one for the popup to show a story rather
            // than the extension's own page.
            //
            // The fixture goes into its own window and stays active there.
            // The extension's page stays active in the window being
            // photographed, which is a different window — Firefox's "active
            // tab" is a per-window notion, so each window has its own.
            const fixtureWindow = await harness.newWindow();
            await harness.switchTo(fixtureWindow);
            await harness.navigate(`${harness.fixtureOrigin}/`);
            await harness.switchTo(harness.mainWindow);

            for (const page of targets) {
                for (const theme of themes) {
                    await harness.setViewport(page.width, page.height);

                    // The workbench and the popup both take the story's URL on
                    // the query string, so they do not depend on the active
                    // tab — which is the extension's own page while the
                    // harness is driving it.
                    const storyUrl = encodeURIComponent(`${harness.fixtureOrigin}/`);
                    const storyQuery =
                        page.name === "workbench" || page.name === "popup"
                            ? `?url=${storyUrl}`
                            : "";
                    await harness.goto(`${page.file}${storyQuery}`);
                    await sleep(600);

                    // The theme is set last: it reloads the page, and the
                    // reload has to keep the story's URL.
                    await setTheme(harness, theme);
                    await sleep(1200);

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

            // The checks above drive the extension's pages. The check below
            // drives the extension itself: that it loads a real page, reads
            // it, builds a book out of it, and writes a file. Without it, an
            // extension that installs but does nothing at all would pass.
            console.log("The extension");
            try {
                const steps = await harness.assertExtensionFlow();
                for (const step of steps) console.log(`  ✓ ${step}`);
            } catch (error) {
                failures += 1;
                console.log("  ✗ the extension's own flow");
                console.log(`      ${error instanceof Error ? error.message : String(error)}`);
            }
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
