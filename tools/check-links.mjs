/**
 * Check that every link in the documentation resolves.
 *
 * A broken link in a README is a small thing, but there are a lot of links in
 * a lot of documents, and a link that rots is worse than no link at all. This
 * checks the relative links in every Markdown file, and the anchors within
 * them.
 *
 * Usage:
 *   node tools/check-links.mjs
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The directories that are walked. */
const ROOTS = ["."];

/**
 * The directories that are skipped, as paths relative to the repository's
 * root.
 *
 * The paths are relative on purpose: a bare name would skip every directory
 * with that name, so a `docs/dist/` would be skipped along with the
 * repository's own `dist/`.
 */
const SKIP = new Set([
    "node_modules",
    ".git",
    "dist",
    "release",
    "coverage",
    "playwright-report",
    "test-results",
]);

/**
 * Collect every Markdown file.
 *
 * @param {string} dir The directory to walk.
 * @returns {Promise<string[]>} The files' paths, relative to the root.
 */
async function markdownFiles(dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (SKIP.has(repositoryPath(path))) continue;
        if (entry.isDirectory()) {
            found.push(...(await markdownFiles(path)));
        } else if (entry.name.endsWith(".md")) {
            found.push(path);
        }
    }
    return found;
}

/**
 * A path relative to the repository's root, with forward slashes.
 *
 * @param {string} path The path.
 * @returns {string} The relative path.
 */
function repositoryPath(path) {
    return relative(ROOT, path).split(sep).join("/");
}

/**
 * The anchors a Markdown file defines.
 *
 * Only the headings that GitHub would turn into anchors are counted: an ATX
 * heading, with its text lowercased and its punctuation stripped.
 *
 * @param {string} text The file's contents.
 * @returns {Set<string>} The anchors.
 */
function anchorsOf(text) {
    const anchors = new Set();
    for (const line of text.split("\n")) {
        const match = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
        if (!match) continue;
        const anchor = match[1]
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\s-]/gu, "")
            .trim()
            .replace(/\s+/g, "-");
        anchors.add(anchor);
    }
    return anchors;
}

/** Run the check. */
async function main() {
    const files = [];
    for (const root of ROOTS) {
        files.push(...(await markdownFiles(join(ROOT, root))));
    }

    const problems = [];
    const anchorCache = new Map();

    for (const file of files) {
        const text = await readFile(file, "utf8");
        const relativePath = relative(ROOT, file);

        // Markdown links and images: [label](target)
        const pattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const target = match[1];
            if (/^(https?:|mailto:|#)/.test(target)) {
                // An external link, or a link within this page.
                if (target.startsWith("#")) {
                    const anchor = decodeURIComponent(target.slice(1)).toLowerCase();
                    if (!anchorCache.has(file)) anchorCache.set(file, anchorsOf(text));
                    if (!anchorCache.get(file).has(anchor)) {
                        problems.push(`${relativePath}: anchor #${anchor} is not defined here`);
                    }
                }
                continue;
            }

            const [pathPart, anchorPart] = target.split("#");
            const resolved = resolve(dirname(file), pathPart);
            if (!existsSync(resolved)) {
                problems.push(`${relativePath}: ${target} — no such file`);
                continue;
            }

            if (anchorPart) {
                const info = await stat(resolved);
                if (info.isFile() && resolved.endsWith(".md")) {
                    if (!anchorCache.has(resolved)) {
                        anchorCache.set(resolved, anchorsOf(await readFile(resolved, "utf8")));
                    }
                    const anchor = decodeURIComponent(anchorPart).toLowerCase();
                    if (!anchorCache.get(resolved).has(anchor)) {
                        problems.push(`${relativePath}: ${target} — anchor not found`);
                    }
                }
            }
        }
    }

    if (problems.length > 0) {
        console.error(`\n  ${problems.length} broken link(s):\n`);
        for (const problem of problems) console.error(`    ${problem}`);
        console.error("");
        process.exit(1);
    }

    console.log(`\n  All ${files.length} documents' links resolve.\n`);
}

await main();
