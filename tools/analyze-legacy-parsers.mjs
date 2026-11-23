#!/usr/bin/env node
/**
 * Analyse the baseline parsers: which ambient globals they use, which
 * `super.*` calls they make, and which `this.*` members they expect the base
 * class to provide.
 *
 * Run: node tools/analyze-legacy-parsers.mjs <dir>
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] ?? "/tmp/legacycore/plugin/js/parsers";
const files = (await readdir(dir)).filter((f) => f.endsWith(".js"));

const globalsUsed = new Map();
const superCalls = new Map();
const utilCalls = new Map();
const httpCalls = new Map();
const factoryCalls = new Map();
const thisMembers = new Map();
const parserClasses = new Map();

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

for (const file of files) {
    const text = await readFile(join(dir, file), "utf8");
    // Strip comments crudely to avoid counting them.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const m of code.matchAll(/\b([A-Z][A-Za-z0-9_]*)\s*\.\s*[A-Za-z_$][\w$]*/g)) {
        bump(globalsUsed, m[1]);
    }
    for (const m of code.matchAll(/\bsuper\s*\.\s*([A-Za-z_$][\w$]*)/g)) bump(superCalls, m[1]);
    for (const m of code.matchAll(/\butil\s*\.\s*([A-Za-z_$][\w$]*)/g)) bump(utilCalls, m[1]);
    for (const m of code.matchAll(/\bHttpClient\s*\.\s*([A-Za-z_$][\w$]*)/g)) bump(httpCalls, m[1]);
    for (const m of code.matchAll(/\bparserFactory\s*\.\s*([A-Za-z_$][\w$]*)/g))
        bump(factoryCalls, m[1]);
    for (const m of code.matchAll(/\bthis\s*\.\s*([A-Za-z_$][\w$]*)/g)) bump(thisMembers, m[1]);
    for (const m of code.matchAll(/class\s+([A-Za-z_$][\w$]*)\s+extends\s+([A-Za-z_$][\w$]*)/g)) {
        parserClasses.set(m[1], { base: m[2], file });
    }
}

const show = (title, map) => {
    console.log(`\n=== ${title} (${map.size}) ===`);
    for (const [k, v] of [...map.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(v).padStart(5)}  ${k}`);
    }
};

console.log(`files: ${files.length}`);
console.log(`classes: ${parserClasses.size}`);
show("AMBIENT GLOBALS", globalsUsed);
show("super.* CALLS", superCalls);
show("util.* CALLS", utilCalls);
show("HttpClient.* CALLS", httpCalls);
show("parserFactory.* CALLS", factoryCalls);
show("this.* MEMBERS", thisMembers);
