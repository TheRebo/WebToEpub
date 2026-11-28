/**
 * Install a packaged `.xpi` into a real Firefox, and report whether it works.
 *
 * The end-to-end harness installs the extension from `dist/`, a directory. That
 * path never reads a ZIP archive, so it cannot notice that the packaged
 * `.xpi` is malformed — and the packaged `.xpi` is what a user installs.
 *
 * This script installs the `.xpi` itself, through the same Marionette command
 * the harness uses, so the archive is read by Firefox's own `jar:` reader.
 *
 * Usage:
 *   node tools/verify-xpi.mjs [path/to/extension.xpi]
 */
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Marionette } from "./marionette.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const ADDON_ID = "kintsugi@localhost";
const MARIONETTE_PORT = 2828;

/** Locate a Firefox build, the same way the harness does. */
async function findFirefox() {
    if (process.env.KINTSUGI_FIREFOX) return process.env.KINTSUGI_FIREFOX;

    const cache = join(process.env.HOME ?? "", ".cache", "ms-playwright");
    if (!existsSync(cache)) throw new Error("No Firefox found.");
    const entries = await readdir(cache);
    const builds = entries
        .filter((entry) => entry.startsWith("firefox-"))
        .map((entry) => join(cache, entry, "firefox", "firefox"))
        .filter((path) => existsSync(path))
        .sort();
    if (builds.length === 0) throw new Error("No Firefox found.");
    return builds[builds.length - 1];
}

/**
 * The packaged `.xpi` for the version in `package.json`.
 *
 * The version is read rather than written down, so the path keeps pointing at
 * the right artefact after a version bump.
 *
 * @returns {Promise<string>} The absolute path of the packaged `.xpi`.
 */
async function defaultXpiPath() {
    const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
    return join(ROOT, "release", `kintsugi-${pkg.version}`, `kintsugi-${pkg.version}.xpi`);
}

async function main() {
    const xpi = resolve(process.argv[2] ?? (await defaultXpiPath()));
    if (!existsSync(xpi)) {
        throw new Error(`No such file: ${xpi}`);
    }

    const firefox = await findFirefox();
    const profile = await mkdtemp(join(tmpdir(), "kintsugi-xpi-"));

    const prefs = join(profile, "user.js");
    await writeFile(
        prefs,
        [
            `user_pref("marionette.port", ${MARIONETTE_PORT});`,
            'user_pref("xpinstall.signatures.required", false);',
            'user_pref("extensions.langpacks.signatures.required", false);',
            'user_pref("browser.shell.checkDefaultBrowser", false);',
            'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
        ].join("\n"),
    );

    console.log(`\nInstalling ${xpi}`);
    console.log(`  with: ${firefox}\n`);

    const proc = spawn(
        firefox,
        [
            "--marionette",
            "--remote-allow-system-access",
            "--profile",
            profile,
            "--no-remote",
            "about:blank",
        ],
        {
            env: { ...process.env, MOZ_HEADLESS: "1", MOZ_DISABLE_AUTO_SAFE_MODE: "1" },
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
    const log = (c) => {
        if (process.env.KINTSUGI_DEBUG) process.stderr.write(`[ff] ${c}`);
    };
    proc.stdout.on("data", log);
    proc.stderr.on("data", log);

    let exitCode = 1;
    try {
        const marionette = new Marionette(MARIONETTE_PORT);
        await marionette.ready();
        await marionette.send("WebDriver:NewSession", {
            capabilities: { alwaysMatch: { acceptInsecureCerts: true } },
        });

        // The command under test: Firefox reads the archive with its own
        // `jar:` reader, exactly as it does when a user drops an `.xpi` in.
        let result;
        try {
            result = await marionette.send("Addon:Install", { path: xpi, temporary: true });
        } catch (error) {
            throw new Error(`Firefox refused to install the .xpi: ${error.message}`);
        }

        const id = result?.value ?? result;
        console.log(`  install returned id: ${id}`);

        if (id !== ADDON_ID) {
            throw new Error(`Expected id "${ADDON_ID}", got "${id}".`);
        }

        // Confirm it is actually live, not merely present in the add-on list.
        // The add-on manager lives in the browser's chrome scope, so the
        // session is switched to it for the query and back afterwards.
        await marionette.send("Marionette:SetContext", { value: "chrome" });
        let state;
        try {
            const raw = await marionette.send("WebDriver:ExecuteScript", {
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
            state = typeof value === "string" ? JSON.parse(value) : value;
        } finally {
            await marionette.send("Marionette:SetContext", { value: "content" });
        }

        console.log(`  add-on state: active=${state?.active} userDisabled=${state?.userDisabled}`);

        if (!state?.active) {
            throw new Error("The add-on installed but is not active.");
        }

        console.log("\n  PASS — Firefox read the .xpi and installed the extension.\n");
        exitCode = 0;
    } catch (error) {
        console.error(`\n  FAIL — ${error.message}\n`);
        exitCode = 1;
    } finally {
        proc.kill("SIGTERM");
        await rm(profile, { recursive: true, force: true });
    }
    process.exit(exitCode);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
