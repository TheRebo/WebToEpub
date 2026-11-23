/**
 * The parser migration.
 *
 * Converts the baseline's 437 site parsers into ES modules.
 *
 * The baseline's parsers were plain scripts that relied on a dozen ambient
 * globals — `Parser`, `util`, `HttpClient`, `parserFactory` and so on. The
 * rewrite has modules, not globals. This tool bridges the two: it reads each
 * parser from the `legacy` branch, works out which globals the file actually
 * uses, and writes an ES module that imports them.
 *
 * **The parser's logic is never touched.** Only the wiring changes: the
 * imports are added, the top-level declarations are exported so that other
 * parsers can reach the base classes they extend, and the file is wrapped in
 * a module.
 *
 * The order of the generated imports is the baseline's load order, taken from
 * the baseline's `popup.html`. That order matters: the baseline's URL rules
 * were consulted in registration order, so a parser that registered a rule
 * before another one kept its priority.
 *
 * Usage:
 *   node tools/migrate-parsers.mjs           migrate the parsers
 *   node tools/migrate-parsers.mjs --check   report what would change
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LEGACY_REF = "legacy";
const LEGACY_PARSER_DIR = "plugin/js/parsers";
const OUT_DIR = join(ROOT, "src", "core", "parsers", "legacy", "sites");
const OUT_INDEX = join(ROOT, "src", "core", "parsers", "legacy-parsers.ts");

const isCheck = process.argv.includes("--check");

/* ------------------------------------------------------------------ */
/* Reading the legacy tree                                             */
/* ------------------------------------------------------------------ */

/** Run a git command and return its output. */
function git(args) {
    return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * Read a file from the legacy branch.
 *
 * Line endings are normalised to LF. A handful of the baseline's parsers were
 * committed with CRLF, and the rewrites below are written with LF; normalising
 * here keeps one representation in the tool and one in the output. The
 * repository's `.gitattributes` asks for LF everywhere anyway.
 */
function readLegacy(path) {
    try {
        return git(["show", `${LEGACY_REF}:${path}`]).replace(/\r\n/g, "\n");
    } catch {
        return null;
    }
}

/**
 * The baseline's parser load order.
 *
 * The baseline's `popup.html` listed every parser as a `<script>` tag, and
 * the browser evaluated them in order. The order is the registration order.
 */
function legacyParserOrder() {
    const html = readLegacy("plugin/popup.html");
    if (html === null) throw new Error("Could not read plugin/popup.html from the legacy branch.");
    const names = [];
    const pattern = /js\/parsers\/([A-Za-z0-9_]+\.js)/g;
    let match;
    while ((match = pattern.exec(html)) !== null) {
        if (!names.includes(match[1])) names.push(match[1]);
    }
    return names;
}

/* ------------------------------------------------------------------ */
/* The import map                                                      */
/* ------------------------------------------------------------------ */

/**
 * The globals a parser may use, and where they live now.
 *
 * The order matters only for the generated file's readability.
 */
const GLOBAL_IMPORTS = [
    { name: "Parser", from: "../../compat/legacy-parser.js", as: "LegacyParser as Parser" },
    { name: "util", from: "../../compat/legacy-util.js" },
    { name: "HttpClient", from: "../../compat/legacy-http-client.js" },
    { name: "parserFactory", from: "../../compat/legacy-factory.js" },
    { name: "DOMPurify", from: "../../compat/legacy-globals.js" },
    { name: "UIText", from: "../../compat/legacy-globals.js" },
    { name: "ErrorLog", from: "../../compat/legacy-globals.js" },
    { name: "ChapterUrlsUI", from: "../../compat/legacy-globals.js" },
    { name: "CoverImageUI", from: "../../compat/legacy-globals.js" },
    { name: "ProgressBar", from: "../../compat/legacy-globals.js" },
    { name: "Imgur", from: "../../compat/legacy-globals.js" },
    { name: "main", from: "../../compat/legacy-globals.js" },
    { name: "FetchErrorHandler", from: "../../compat/legacy-globals.js" },
    { name: "ImageCollector", from: "../../compat/legacy-image-collector.js" },
    { name: "VariableSizeImageCollector", from: "../../compat/legacy-image-collector.js" },
    { name: "EpubItem", from: "../../compat/legacy-epub-items.js" },
    { name: "ChapterEpubItem", from: "../../compat/legacy-epub-items.js" },
    { name: "EpubItemSupplier", from: "../../compat/legacy-epub-items.js" },
    { name: "EpubMetaInfo", from: "../../compat/legacy-epub-items.js" },
    { name: "FontInfo", from: "../../compat/legacy-epub-items.js" },
    { name: "FetchCache", from: "../../compat/legacy-globals.js" },
    { name: "FootnoteExtractor", from: "../../compat/legacy-globals.js" },
    { name: "DefaultParserSiteSettings", from: "../../compat/legacy-default-parser.js" },
    { name: "DefaultParserUI", from: "../../compat/legacy-default-parser.js" },
    { name: "zip", from: "../../compat/legacy-zip.js" },
];

/* ------------------------------------------------------------------ */
/* Source analysis                                                     */
/* ------------------------------------------------------------------ */

/**
 * Find the top-level declarations in a source file.
 *
 * "Top level" means the declaration starts at the beginning of a line, with
 * no indentation. The baseline's parsers are formatted that way, and it is
 * the only reliable signal without a full parser.
 */
function topLevelDeclarations(source) {
    const names = new Set();
    const pattern = /^(?:export\s+)?(?:class|const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        names.add(match[1]);
    }
    return names;
}

/** Whether an identifier appears in the source as a whole word. */
function usesIdentifier(source, name) {
    const pattern = new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`);
    return pattern.test(source);
}

/* ------------------------------------------------------------------ */
/* Dead baseline branches                                               */
/* ------------------------------------------------------------------ */

/**
 * Branches the baseline kept for Manifest V2 that can never run here.
 *
 * The baseline shipped both an MV2 and an MV3 build. Kintsugi is MV3 only, so
 * the MV2 arms are dead code that the extension linter flags (`tabs.
 * executeScript` no longer exists in MV3). Rather than leave them in — or
 * hand-edit 434 generated files — the codemod removes them on the way
 * through.
 *
 * Each entry names the file it applies to, the exact text to look for, and
 * the replacement. A `find` that does not match is a hard error, so the
 * codemod fails loudly if a baseline file changes underneath it.
 */
const DEAD_BRANCH_REWRITES = [
    {
        file: "FenrirealmParser.js",
        note: "Drop the MV2 `chrome.tabs.executeScript` arm of `readChapterTab`.",
        find: `            const usesManifestV3 =
                chrome.runtime.getManifest().manifest_version >= 3;
            const onResult = (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    let snapshot = results?.[0];
                    if (usesManifestV3) {
                        snapshot = snapshot?.result;
                    }
                    resolve(snapshot);
                }
            };
            if (usesManifestV3) {
                chrome.scripting.executeScript(
                    {
                        target: { tabId: tabId },
                        func: FenrirealmParser.readChapterInTab,
                        args: [chapterId, observeChanges],
                    },
                    onResult,
                );
            } else {
                // Firefox's packaged MV2 build omits the scripting permission.
                chrome.tabs.executeScript(
                    tabId,
                    {
                        code: \`(\${FenrirealmParser.readChapterInTab.toString()})(\${JSON.stringify(chapterId)}, \${observeChanges})\`,
                        runAt: "document_idle",
                    },
                    onResult,
                );
            }
`,
        replace: `            const onResult = (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(results?.[0]?.result);
                }
            };
            chrome.scripting.executeScript(
                {
                    target: { tabId: tabId },
                    func: FenrirealmParser.readChapterInTab,
                    args: [chapterId, observeChanges],
                },
                onResult,
            );
`,
    },
    {
        file: "LunarxParser.js",
        note: "Drop the MV2 `extensionApi.tabs.executeScript` arm of `readChapterHtmlFromTab`.",
        find: `        if (extensionApi.runtime.getManifest().manifest_version >= 3) {
            const [injection] = await extensionApi.scripting.executeScript({
                target: { tabId },
                func: this.waitForChapterHtml,
                args,
            });
            return injection?.result ?? null;
        }

        // Firefox's packaged MV2 build uses the tabs injection API.
        const results = await extensionApi.tabs.executeScript(tabId, {
            code: \`(\${this.waitForChapterHtml.toString()})(...\${JSON.stringify(args)})\`,
            runAt: "document_idle",
        });
        return results?.[0] ?? null;
`,
        replace: `        const [injection] = await extensionApi.scripting.executeScript({
            target: { tabId },
            func: this.waitForChapterHtml,
            args,
        });
        return injection?.result ?? null;
`,
    },
    {
        file: "LunarxParser.js",
        note: "Update the `waitForChapterHtml` doc comment, which referred to the MV2 API.",
        find: `     * Keep this as an arrow-function field: Firefox serializes it into an
     * expression for tabs.executeScript(). Method syntax would be invalid there.
`,
        replace: `     * Keep this as an arrow-function field: the scripting API serializes it into an
     * expression for the injected call. Method syntax would be invalid there.
`,
    },
    {
        file: "FictionreadParser.js",
        note: "Parse the sanitised chunk with DOMParser instead of assigning to `innerHTML`.",
        find: `        const context = dom.createElement("div");
        context.innerHTML = sanitized;

        const fragment = dom.createDocumentFragment();
        fragment.append(...context.childNodes);
`,
        replace: `        const context = new DOMParser().parseFromString(sanitized, "text/html").body;

        const fragment = dom.createDocumentFragment();
        fragment.append(...context.childNodes);
`,
    },
    {
        file: "NullTranslation.js",
        note: "Parse the rendered markdown with DOMParser instead of assigning to `innerHTML`.",
        find: `            const p = newDoc.dom.createElement("p");
            p.innerHTML = NullTranslationParser.renderInlineMarkdown(trimmed).replace(
                /\\n/g,
                "<br>",
            );
            fragment.appendChild(p);
`,
        replace: `            const p = newDoc.dom.createElement("p");
            const rendered = new DOMParser().parseFromString(
                NullTranslationParser.renderInlineMarkdown(trimmed).replace(
                    /\\n/g,
                    "<br>",
                ),
                "text/html",
            );
            p.append(...rendered.body.childNodes);
            fragment.appendChild(p);
`,
    },
];

/**
 * Remove the baseline's dead MV2 branches from a parser.
 *
 * @param {string} fileName The legacy file's name.
 * @param {string} source The legacy source.
 * @returns {string} The source without the dead branches.
 */
function stripDeadBranches(fileName, source) {
    let result = source;
    for (const rewrite of DEAD_BRANCH_REWRITES) {
        if (rewrite.file !== fileName) continue;
        if (!result.includes(rewrite.find)) {
            throw new Error(
                `The dead-branch rewrite for ${fileName} no longer matches the baseline.\n` +
                    `Rewrite: ${rewrite.note}\n` +
                    `Update DEAD_BRANCH_REWRITES in tools/migrate-parsers.mjs.`,
            );
        }
        result = result.replace(rewrite.find, rewrite.replace);
    }
    return result;
}

/**
 * Remove the baseline's `"use strict";` directive and the comment above it.
 *
 * The rewritten file gets its own header, and a module is always strict.
 */
function stripPrologue(source) {
    return source.replace(/^\s*"use strict";\s*$/m, "").replace(/\n{3,}/g, "\n\n").trimStart();
}

/* ------------------------------------------------------------------ */
/* The transformation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Transform one legacy parser into an ES module.
 *
 * @param {string} fileName The legacy file's name.
 * @param {string} source The legacy source.
 * @param {Map<string, string>} exportedBy Which file declares which name.
 * @param {Set<string>} ownNames The names the file declares itself.
 */
function transform(fileName, source, exportedBy, ownNames) {
    const imports = [];

    // The globals the file uses.
    for (const entry of GLOBAL_IMPORTS) {
        if (ownNames.has(entry.name)) continue;
        if (!usesIdentifier(source, entry.name)) continue;
        imports.push(
            entry.as
                ? `import { ${entry.as} } from "${entry.from}";`
                : `import { ${entry.name} } from "${entry.from}";`,
        );
    }

    // The names another parser declares.
    const crossFile = new Map();
    for (const [name, owner] of exportedBy) {
        if (owner === fileName) continue;
        if (ownNames.has(name)) continue;
        if (!usesIdentifier(source, name)) continue;
        if (crossFile.has(name)) continue;
        crossFile.set(name, owner);
    }
    const byModule = new Map();
    for (const [name, owner] of crossFile) {
        const list = byModule.get(owner) ?? [];
        list.push(name);
        byModule.set(owner, list);
    }
    for (const [owner, names] of byModule) {
        names.sort();
        imports.push(`import { ${names.join(", ")} } from "./${owner}";`);
    }

    // Export the top-level declarations so that other parsers can import them.
    const body = stripPrologue(stripDeadBranches(fileName, source)).replace(
        /^(export\s+)?(class|const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm,
        (match, existingExport, keyword, name) => `${existingExport ?? ""}export ${keyword} ${name}`,
    );

    const header = `// Ai generated + Claude Opus 4.6
// Migrated from \`${LEGACY_PARSER_DIR}/${fileName}\` on the \`${LEGACY_REF}\` branch.
// The parser's logic is unchanged; only the module wiring is new.
"use strict";
`;

    return `${header}\n${imports.join("\n")}\n\n${body}\n`;
}

/* ------------------------------------------------------------------ */
/* The generated index                                                 */
/* ------------------------------------------------------------------ */

/**
 * The generated module that loads every parser.
 *
 * The imports are static and in the baseline's load order, so the parsers
 * register themselves in the same order they always did.
 */
function buildIndex(fileNames) {
    const lines = fileNames.map((name) => `import "./legacy/sites/${name}";`);
    return `/**
 * The migrated site parsers.
 *
 * GENERATED FILE — do not edit. Run \`node tools/migrate-parsers.mjs\` instead.
 *
 * Every parser is imported for its side effect: each one registers itself
 * with the parser factory when the module is evaluated.
 *
 * The order is the baseline's load order, taken from the baseline's
 * \`popup.html\`. It matters: the baseline's URL rules were consulted in
 * registration order, so a parser that registered a rule before another one
 * kept its priority.
 *
 * These modules are plain JavaScript on purpose. They are the baseline's
 * code, unchanged; annotating 437 untyped files would be churn, and the
 * contract they implement is already described by the compat layer.
 *
 * See ADR-0002.
 */
${lines.join("\n")}
`;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
    const order = legacyParserOrder();
    console.log(`\nMigrating ${order.length} parsers from the \`${LEGACY_REF}\` branch…\n`);

    const sources = new Map();
    for (const name of order) {
        const source = readLegacy(`${LEGACY_PARSER_DIR}/${name}`);
        if (source === null) {
            console.warn(`  ! ${name} is listed in popup.html but is missing from the branch.`);
            continue;
        }
        sources.set(name, source);
    }

    // Which file declares which name.
    const exportedBy = new Map();
    const ownNames = new Map();
    for (const [name, source] of sources) {
        const names = topLevelDeclarations(source);
        ownNames.set(name, names);
        for (const declared of names) {
            if (exportedBy.has(declared)) {
                console.warn(
                    `  ! "${declared}" is declared in both ${exportedBy.get(declared)} and ${name}. ` +
                        `The first one wins.`,
                );
                continue;
            }
            exportedBy.set(declared, name);
        }
    }

    if (isCheck) {
        console.log(`  ${sources.size} parsers would be migrated.`);
        return;
    }

    await rm(join(ROOT, "src", "core", "parsers", "legacy"), { recursive: true, force: true });
    await mkdir(OUT_DIR, { recursive: true });

    let written = 0;
    for (const [name, source] of sources) {
        const output = transform(name, source, exportedBy, ownNames.get(name));
        await writeFile(join(OUT_DIR, name), output, "utf8");
        written += 1;
    }

    const index = buildIndex([...sources.keys()]);
    await writeFile(OUT_INDEX, index, "utf8");

    console.log(`  Wrote ${written} parsers to src/core/parsers/legacy/sites/.`);
    console.log(`  Wrote the loader to src/core/parsers/legacy-parsers.ts.\n`);
}

main().catch((error) => {
    console.error("\n  Migration failed:", error.message);
    process.exit(1);
});
