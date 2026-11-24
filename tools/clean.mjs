/**
 * Remove the build output.
 *
 * The build directory is disposable, so this deletes it rather than trying to
 * work out what is stale. `release/` goes with it: a leftover `.xpi` from an
 * earlier version is a stale artefact that can be published by accident, and
 * the packaging step rebuilds `release/` from scratch anyway.
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
    join(ROOT, "release"),
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
