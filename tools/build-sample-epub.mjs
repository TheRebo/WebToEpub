/**
 * Build a sample EPUB with the packer, for validation with `epubcheck`.
 *
 * This is a development tool: it is not part of the extension, and it is not
 * run by the test suite. It exists so that the generated container can be
 * checked against the official EPUB specification rather than against our own
 * assumptions about it.
 *
 * Usage: node tools/build-sample-epub.mjs <output.epub>
 */
import { Window } from "happy-dom";
import { packEpub } from "../src/core/epub/packer.ts";
import { buildEpubArchive } from "../src/core/epub/archiver.ts";

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
const { writeFile } = await import("node:fs/promises");
await writeFile(output, bytes);
console.log(`Wrote ${output} (${bytes.length} bytes, ${files.length} files).`);
