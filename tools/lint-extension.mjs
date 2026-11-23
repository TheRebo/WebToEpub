/**
 * Lint the built extension.
 *
 * `web-ext lint` is the authority on whether the package is acceptable to
 * Firefox, and it is run unmodified. What this wrapper adds is a policy:
 *
 *  - **every error fails the build**, and
 *  - **every warning fails the build** except the ones we have explicitly
 *    accepted, each of which is listed here with the file it applies to and
 *    the reason it is acceptable.
 *
 * The alternative — running `web-ext lint` and reading its exit code — treats
 * a warning the same as a catastrophe, and treats a *new* warning the same as
 * the one we already know about. This way a warning that appears tomorrow
 * stops the build, and the one we accepted yesterday does not.
 *
 * Usage:
 *   node tools/lint-extension.mjs
 */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The warnings we accept.
 *
 * Each entry names the exact file and code it applies to. A warning that
 * matches nothing here is a build failure.
 */
const ACCEPTED = [
    {
        file: "assets/vendor/purify.js",
        code: "UNSAFE_VAR_ASSIGNMENT",
        why: [
            "DOMPurify assigns to `documentElement.innerHTML` in the fallback path",
            "it takes when `DOMParser` is unavailable. Firefox always provides",
            "`DOMParser`, so the path is unreachable. The assignment is inside",
            "the sanitiser itself, not in code we wrote, and the value assigned",
            "is the input the sanitiser is about to scrub.",
            "",
            "DOMPurify is emitted as its own file (see `tools/build.mjs`) so that",
            "this warning is attributable to the vendored library rather than to a",
            "shared chunk that also holds our code. The rule stays fully in force",
            "for everything we write.",
        ].join(" "),
    },
];

/**
 * Run `web-ext lint` and return its JSON report.
 *
 * @returns {Promise<{errors: object[], warnings: object[], notices: object[]}>}
 */
function runLint() {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(
            "npx",
            ["web-ext", "lint", "--source-dir", "dist", "--output", "json"],
            { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
        );

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", rejectPromise);
        child.on("close", () => {
            try {
                const report = JSON.parse(stdout);
                resolvePromise({
                    errors: report.errors ?? [],
                    warnings: report.warnings ?? [],
                    notices: report.notices ?? [],
                });
            } catch {
                rejectPromise(
                    new Error(`Could not read the lint report.\n${stdout}\n${stderr}`.trim()),
                );
            }
        });
    });
}

/**
 * Whether a warning is one we have accepted.
 *
 * @param {object} warning The warning.
 * @returns {boolean} True when the warning is expected.
 */
function isAccepted(warning) {
    return ACCEPTED.some((entry) => entry.file === warning.file && entry.code === warning.code);
}

async function main() {
    console.log("\nLinting the built extension…\n");

    const report = await runLint();

    const unexpected = report.warnings.filter((warning) => !isAccepted(warning));
    const accepted = report.warnings.filter((warning) => isAccepted(warning));

    for (const notice of report.notices) {
        console.log(`  notice: ${notice.code} — ${notice.message ?? ""}`);
    }

    for (const warning of accepted) {
        const entry = ACCEPTED.find(
            (item) => item.file === warning.file && item.code === warning.code,
        );
        console.log(`  accepted warning: ${warning.code} in ${warning.file}`);
        console.log(`    ${entry.why}\n`);
    }

    for (const error of report.errors) {
        console.error(`  error: ${error.code} — ${error.message ?? ""}`);
        console.error(`    ${error.description ?? ""}`);
        if (error.file) console.error(`    ${error.file}:${error.line ?? "?"}`);
    }

    for (const warning of unexpected) {
        console.error(`  warning: ${warning.code} — ${warning.message ?? ""}`);
        console.error(`    ${warning.description ?? ""}`);
        if (warning.file) console.error(`    ${warning.file}:${warning.line ?? "?"}`);
    }

    console.log(
        `\n  ${report.errors.length} errors, ${report.warnings.length} warnings ` +
            `(${accepted.length} accepted), ${report.notices.length} notices.`,
    );

    if (report.errors.length > 0 || unexpected.length > 0) {
        console.error("\n  The extension did not pass the lint.\n");
        process.exit(1);
    }

    console.log("\n  The extension passes the lint.\n");
}

main().catch((error) => {
    console.error("\n  Linting failed:", error.message, "\n");
    process.exit(1);
});
