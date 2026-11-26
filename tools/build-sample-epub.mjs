/**
 * Build a sample EPUB with the packer, for validation with `epubcheck`.
 *
 * This is a development tool: it is not part of the extension, and it is not
 * run by the test suite. It exists so that the generated container can be
 * checked against the official EPUB specification rather than against our own
 * assumptions about it.
 *
 * Usage: node tools/build-sample-epub.mjs <output.epub> [2|3]
 */
import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Window } from "happy-dom";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The packer and the archiver, as modules Node can import.
 *
 * Both are TypeScript, and their own imports are written without a file
 * extension — the extensionless form is what a bundler expects, and what the
 * extension's build uses. Node's own loader cannot resolve it, so the modules
 * are bundled first, with the same bundler the extension is built with. That
 * way the sample book is made from the *same* code the extension ships,
 * rather than from a copy of it.
 *
 * @returns The packer and the archiver.
 */
async function loadCore() {
    const directory = await mkdtemp(join(tmpdir(), "kintsugi-sample-"));
    const outfile = join(directory, "core.mjs");
    await build({
        stdin: {
            contents: `
                export { packEpub } from ${JSON.stringify(join(ROOT, "src/core/epub/packer.ts"))};
                export { buildEpubArchive } from ${JSON.stringify(join(ROOT, "src/core/epub/archiver.ts"))};
            `,
            resolveDir: ROOT,
            loader: "js",
        },
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node20",
        outfile,
        logLevel: "silent",
    });
    const core = await import(pathToFileURL(outfile).href);
    return { core, directory };
}

const { core, directory } = await loadCore();
const { packEpub, buildEpubArchive } = core;

/** The DOM the packer needs to turn a chapter's HTML into XHTML. */
const window = new Window();
globalThis.DOMParser = window.DOMParser;
globalThis.document = window.document;

/** A chapter with a heading, a paragraph, an image and a link. */
const chapters = [
    {
        sourceUrl: "https://example.com/chapter-1",
        title: "Chapter 1 — The Beginning",
        contentHtml: `<h1>Chapter 1</h1>
    <p>A paragraph with an <em>emphasis</em> and an &amp; ampersand.</p>
    <p>Second paragraph.</p>
    <p><img src="https://example.com/pic.png" alt="A picture"></p>
    <p><a href="https://example.com/chapter-2">Next chapter</a></p>
    <ul><li>A list item</li><li>Another</li></ul>`,
        images: new Map([
            [
                "https://example.com/pic.png",
                {
                    url: "https://example.com/pic.png",
                    mediaType: "image/png",
                    data: new Uint8Array([
                        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
                        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
                        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
                    ]),
                },
            ],
        ]),
    },
    {
        sourceUrl: "https://example.com/chapter-2",
        title: "Chapter 2 — The Middle",
        contentHtml: `<h1>Chapter 2</h1>
    <p>The second chapter.</p>
    <p>Text with a special character: &lt;not a tag&gt; &amp; more.</p>`,
    },
];

/** The EPUB version to build. */
const version = Number(process.argv[3] ?? "3") === 2 ? 2 : 3;

/** Pack the chapters. */
const { files } = packEpub(chapters, {
    title: "A Sample Book",
    author: "An Author",
    language: "en",
    version,
    includeInfoPage: true,
    subjects: ["Fiction"],
    publisher: "A Publisher",
    date: "2024-01-01",
    cover: {
        url: "https://example.com/cover.png",
        mediaType: "image/png",
        data: new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1f, 0x15, 0xc4, 0x89,
        ]),
    },
});

/** Write the archive. */
const output = process.argv[2] ?? "sample.epub";
const bytes = await buildEpubArchive(files);
await writeFile(output, bytes);

// The bundle has served its purpose once it has been imported.
await rm(directory, { recursive: true, force: true });

console.log(`Wrote ${output} (${bytes.length} bytes, ${files.length} files).`);
