/**
 * Find the ambient globals the migrated parsers still expect.
 *
 * The codemod knows about the globals it was told about. This tool asks
 * ESLint instead: it lints the generated parser modules with `no-undef`
 * enabled, and reports every identifier that is used but never defined.
 *
 * Usage: node tools/analyze-legacy-globals.mjs
 */
import { ESLint } from "eslint";
import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import globals from "globals";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITES = join(ROOT, "src", "core", "parsers", "legacy", "sites");

const files = (await readdir(SITES)).filter((name) => name.endsWith(".js"));

const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: true,
    overrideConfig: [
        {
            files: ["**/*.js"],
            languageOptions: {
                ecmaVersion: 2022,
                sourceType: "module",
                globals: { ...globals.browser, ...globals.webextensions },
            },
            rules: { "no-undef": "error" },
        },
    ],
});

const results = await eslint.lintFiles(files.map((name) => join(SITES, name)));

/** Every undefined name, with the files that use it. */
const undefinedByName = new Map();

for (const result of results) {
    const file = result.filePath.split("/").pop();
    for (const message of result.messages) {
        if (message.ruleId !== "no-undef") continue;
        const name = message.message.replace(/^'(.+)' is not defined\.$/, "$1");
        if (!undefinedByName.has(name)) undefinedByName.set(name, new Set());
        undefinedByName.get(name).add(file);
    }
}

console.log(`\n${undefinedByName.size} undefined name(s) in ${results.length} parser file(s):\n`);
for (const [name, users] of [...undefinedByName].sort()) {
    console.log(`  ${name}`);
    for (const file of [...users].sort().slice(0, 6)) console.log(`      ${file}`);
    if (users.size > 6) console.log(`      … and ${users.size - 6} more`);
}
