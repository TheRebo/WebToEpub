#!/usr/bin/env node
/**
 * Find the cross-parser dependencies and the ambient legacy globals that the
 * baseline parsers rely on.
 *
 * Run: node tools/analyze-legacy-deps.mjs <dir>
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] ?? "/tmp/legacycore/plugin/js/parsers";
const files = (await readdir(dir)).filter((f) => f.endsWith(".js"));

/** Every class defined in a parser file. */
const defined = new Map();
/** class -> files that reference it. */
const referenced = new Map();

for (const file of files) {
    const code = await readFile(join(dir, file), "utf8");
    for (const m of code.matchAll(/class\s+([A-Za-z_$][\w$]*)/g)) {
        if (!defined.has(m[1])) defined.set(m[1], []);
        defined.get(m[1]).push(file);
    }
}

for (const file of files) {
    const code = await readFile(join(dir, file), "utf8");
    const stripped = code.replace(/class\s+([A-Za-z_$][\w$]*)/g, "");
    for (const m of stripped.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
        const name = m[1];
        if (!defined.has(name)) continue;
        if (defined.get(name).includes(file)) continue;
        if (!referenced.has(name)) referenced.set(name, new Set());
        referenced.get(name).add(file);
    }
}

console.log("=== CROSS-PARSER REFERENCES ===");
for (const [name, users] of [...referenced.entries()].sort()) {
    console.log(`  ${name}  <- ${[...users].map((f) => f.replace("Parser.js", "")).join(", ")}`);
}

/* Legacy globals that are not parsers. */
const GLOBALS = [
    "UIText",
    "ErrorLog",
    "ChapterUrlsUI",
    "CoverImageUI",
    "ProgressBar",
    "DOMPurify",
    "Imgur",
    "UserPreferences",
    "ImageCollector",
    "EpubItem",
    "ChapterEpubItem",
    "EpubItemSupplier",
    "EpubMetaInfo",
    "FetchErrorHandler",
    "main",
    "Parser",
    "util",
    "HttpClient",
    "parserFactory",
];
const counts = new Map();
for (const file of files) {
    const code = (await readFile(join(dir, file), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const g of GLOBALS) {
        const re = new RegExp(`\\b${g}\\b`, "g");
        const n = [...code.matchAll(re)].length;
        if (n) counts.set(g, (counts.get(g) ?? 0) + n);
    }
}
console.log("\n=== LEGACY GLOBAL USAGE (occurrences) ===");
for (const [g, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${g}`);
}
