/**
 * Check that the source tree is text.
 *
 * A source file that contains a NUL byte is a defect that hides itself: the
 * code still compiles, the tests still pass, and the only symptom is that
 * Git treats the file as binary — so `git diff` prints "Binary files differ",
 * `git blame` stops being useful, and a reviewer cannot see what changed.
 *
 * Two files in this repository had it: a template literal that built a map
 * key out of a NUL separator, and a test that checked control characters were
 * stripped from a file name. Both were meant to be the two-character escape
 * `\u0000`, and both were written as the byte itself.
 *
 * The check is deliberately narrow: it looks for the NUL byte in the files
 * that are supposed to be text, and it says which file it found.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The directories that are walked. */
const DIRECTORIES = ["src", "tests", "tools", "docs"];

/** The file extensions that are expected to be text. */
const TEXT_EXTENSIONS = new Set([
    ".ts",
    ".js",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".html",
    ".md",
    ".yml",
    ".yaml",
    ".txt",
]);

/**
 * Whether a path should be checked.
 *
 * @param {string} path The path, relative to the repository root.
 * @returns {boolean} True when the path is a text file to check.
 */
function isCheckable(path) {
    if (!TEXT_EXTENSIONS.has(extname(path))) return false;
    // The legacy parsers are a copy of the original project and are not
    // touched by this rewrite.
    if (path.includes("src/core/parsers/legacy/")) return false;
    return true;
}

/**
 * Walk a directory, yielding the paths of the files in it.
 *
 * @param {string} directory The directory to walk.
 * @returns {Promise<string[]>} The paths, relative to the repository root.
 */
async function walk(directory) {
    const found = [];
    let entries;
    try {
        entries = await readdir(directory, { withFileTypes: true });
    } catch {
        return found;
    }
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            found.push(...(await walk(path)));
            continue;
        }
        if (!entry.isFile()) continue;
        found.push(relative(ROOT, path));
    }
    return found;
}

/**
 * Run the check.
 *
 * @returns {Promise<number>} The exit code.
 */
async function main() {
    const paths = [];
    for (const directory of DIRECTORIES) {
        const info = await stat(join(ROOT, directory)).catch(() => undefined);
        if (!info?.isDirectory()) continue;
        paths.push(...(await walk(join(ROOT, directory))));
    }

    const offenders = [];
    for (const path of paths) {
        if (!isCheckable(path)) continue;
        const contents = await readFile(join(ROOT, path));
        if (!contents.includes(0)) continue;
        const position = contents.indexOf(0);
        const line = contents.subarray(0, position).toString("utf8").split("\n").length;
        offenders.push({ path, line });
    }

    if (offenders.length === 0) {
        console.log(`Checked ${paths.length} files: every text file is text.`);
        return 0;
    }

    console.error("These files contain a NUL byte, which makes Git treat them as binary:");
    for (const offender of offenders) {
        console.error(`  ${offender.path}:${offender.line}`);
    }
    console.error("");
    console.error("Write the two-character escape \\u0000 instead of the byte itself.");
    return 1;
}

process.exitCode = await main();
