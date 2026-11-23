/**
 * Remove the build output.
 *
 * The build directory is disposable, so this deletes it rather than trying to
 * work out what is stale. `release/` holds the packaged artifact and is left
 * alone: a `.xpi` is the thing you ship, and cleaning it by accident is the
 * kind of small annoyance that makes a build script untrustworthy.
 *
 * Usage:
 *   node tools/clean.mjs
 */
import { rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The directories this script owns. */
const TARGETS = [
    join(ROOT, "dist"),
    join(ROOT, "coverage"),
    join(ROOT, "playwright-report"),
    join(ROOT, "test-results"),
];

/** Remove a directory, and say so. */
async function clean(path) {
    try {
        await stat(path);
    } catch {
        return;
    }
    await rm(path, { recursive: true, force: true });
    console.log(`  removed ${path.slice(ROOT.length + 1)}`);
}

async function main() {
    console.log("\nCleaning…\n");
    for (const target of TARGETS) {
        await clean(target);
    }
    console.log("\n  Clean.\n");
}

main().catch((error) => {
    console.error("\n  Clean failed:", error.message);
    process.exit(1);
});
