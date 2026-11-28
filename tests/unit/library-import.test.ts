import { describe, expect, it } from "vitest";
import { buildEpubArchive } from "../../src/core/epub/archiver";
import { packEpub, type ChapterToPack } from "../../src/core/epub/packer";
import { encodePng } from "../../src/core/epub/png";
import { decodeDataUrl, parseLibraryExport } from "../../src/core/storage/library-import";
import {
    DEFAULT_IMPORT_LIMITS,
    ImportLimitError,
    type ImportLimits,
} from "../../src/core/storage/import-limits";

/**
 * The parts of `zip.js` the fixture is built with.
 */
interface ZipModule {
    ZipWriter: new (writer: unknown) => {
        add: (name: string, reader: unknown) => Promise<void>;
        close: () => Promise<Blob>;
    };
    BlobWriter: new (type: string) => unknown;
    Uint8ArrayReader: new (content: Uint8Array) => unknown;
    TextReader: new (content: string) => unknown;
    configure: (options: { useWebWorkers: boolean }) => void;
}

/** Load `zip.js`. */
async function loadZip(): Promise<ZipModule> {
    const module = (await import("@zip.js/zip.js")) as unknown as ZipModule;
    module.configure({ useWebWorkers: false });
    return module;
}

/**
 * Build a ZIP archive from a set of files.
 *
 * @param files The files, by name.
 * @returns The archive's bytes.
 */
async function buildZip(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
    const { ZipWriter, BlobWriter, Uint8ArrayReader, TextReader } = await loadZip();
    const writer = new ZipWriter(new BlobWriter("application/zip"));
    for (const [name, content] of Object.entries(files)) {
        const reader =
            typeof content === "string" ? new TextReader(content) : new Uint8ArrayReader(content);
        await writer.add(name, reader);
    }
    const blob = await writer.close();
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Rewrite an archive so that it claims an entry is smaller than it is.
 *
 * The size in the header is the archive's own claim about the entry. A
 * crafted archive can lie about it, so the reader must not take the claim at
 * face value — this is how a test makes it lie.
 *
 * @param bytes The archive's bytes.
 * @param name The entry to lie about.
 * @param claimed The size to claim, in bytes.
 * @returns The archive's bytes, with the claim rewritten.
 */
function claimSize(bytes: Uint8Array, name: string, claimed: number): Uint8Array {
    const patched = new Uint8Array(bytes);
    const view = new DataView(patched.buffer);
    const decoder = new TextDecoder();
    const nameBytes = new TextEncoder().encode(name);

    // The local file header: the size fields sit after the CRC.
    for (let index = 0; index < patched.length - 4; ++index) {
        if (view.getUint32(index, true) !== 0x04034b50) continue;
        const nameLength = view.getUint16(index + 26, true);
        const start = index + 30;
        const entryName = decoder.decode(patched.subarray(start, start + nameLength));
        if (entryName === name) {
            view.setUint32(index + 22, claimed, true);
        }
    }

    // The central directory: the same claim, written a second time.
    for (let index = 0; index < patched.length - 4; ++index) {
        if (view.getUint32(index, true) !== 0x02014b50) continue;
        const nameLength = view.getUint16(index + 28, true);
        const start = index + 46;
        const entryName = decoder.decode(patched.subarray(start, start + nameLength));
        if (entryName === name) {
            view.setUint32(index + 24, claimed, true);
        }
    }

    expect(nameBytes.length).toBeGreaterThan(0);
    return patched;
}

/**
 * Encode bytes as a base64 data URL.
 *
 * @param bytes The bytes.
 * @param mediaType The media type.
 * @returns The data URL.
 */
function dataUrl(bytes: Uint8Array, mediaType: string): string {
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${mediaType};base64,${btoa(binary)}`;
}

/**
 * Build a small EPUB.
 *
 * @param title The book's title.
 * @param author The book's author.
 * @param chapters How many chapters the book has.
 * @returns The book's bytes.
 */
async function buildBook(title: string, author: string, chapters: number): Promise<Uint8Array> {
    const list: ChapterToPack[] = [];
    for (let index = 1; index <= chapters; ++index) {
        list.push({
            sourceUrl: `https://example.com/story/chapter-${index}`,
            title: `Chapter ${index}`,
            contentHtml: "<p>Hello.</p>",
        });
    }
    const packed = packEpub(list, { title, author });
    return buildEpubArchive(packed.files);
}

/**
 * Build an export archive.
 *
 * @param books The books, by index.
 * @param version The export's version.
 * @returns The archive's bytes.
 */
async function buildExport(
    books: Array<{
        epub: Uint8Array;
        filename: string;
        storyUrl: string;
        cover?: Uint8Array;
    }>,
    version = "2",
): Promise<Uint8Array> {
    const files: Record<string, string | Uint8Array> = {
        "LibraryVersion.txt": version,
        "LibraryCountEntries.txt": String(books.length),
    };
    books.forEach((book, index) => {
        files[`Library/${index}/LibEpub`] = dataUrl(book.epub, "application/epub+zip");
        files[`Library/${index}/LibFilename`] = book.filename;
        files[`Library/${index}/LibStoryURL`] = book.storyUrl;
        if (book.cover) {
            files[`Library/${index}/LibCover`] = dataUrl(book.cover, "image/png");
        }
    });
    return buildZip(files);
}

/** Limits that are small enough to be reached by a test fixture. */
const TIGHT: ImportLimits = {
    maxArchiveBytes: 1024 * 1024,
    maxEntryBytes: 4096,
    maxTotalBytes: 8192,
    maxEntries: 10,
};

describe("parseLibraryExport", () => {
    it("reads a book out of the export", async () => {
        const epub = await buildBook("A Story", "An Author", 3);
        const bytes = await buildExport([
            { epub, filename: "a-story", storyUrl: "https://example.com/story" },
        ]);

        const books = await parseLibraryExport(bytes);
        expect(books).toHaveLength(1);
        expect(books[0]?.title).toBe("A Story");
        expect(books[0]?.author).toBe("An Author");
        expect(books[0]?.sourceUrl).toBe("https://example.com/story");
        expect(books[0]?.chapterCount).toBe(3);
    });

    it("reads the cover", async () => {
        const epub = await buildBook("A Story", "An Author", 1);
        const cover = encodePng(1, 1, new Uint8Array([1, 2, 3]));
        const bytes = await buildExport([
            { epub, filename: "a-story", storyUrl: "https://example.com/story", cover },
        ]);

        const books = await parseLibraryExport(bytes);
        expect(books[0]?.coverMediaType).toBe("image/png");
        expect(Array.from(books[0]?.cover ?? [])).toEqual(Array.from(cover));
    });

    it("reads every book in the export", async () => {
        const bytes = await buildExport([
            {
                epub: await buildBook("One", "Author", 1),
                filename: "one",
                storyUrl: "https://example.com/one",
            },
            {
                epub: await buildBook("Two", "Author", 2),
                filename: "two",
                storyUrl: "https://example.com/two",
            },
        ]);

        const books = await parseLibraryExport(bytes);
        expect(books.map((book) => book.title)).toEqual(["One", "Two"]);
    });

    it("falls back to the file name when the book has no title", async () => {
        const bytes = await buildExport([
            {
                // A book with no package document: there is no title to read.
                epub: await buildZip({ "OEBPS/nothing.txt": "nothing" }),
                filename: "the-file-name",
                storyUrl: "https://example.com/story",
            },
        ]);

        const books = await parseLibraryExport(bytes);
        expect(books[0]?.title).toBe("the-file-name");
    });

    it("refuses an export it does not understand", async () => {
        const bytes = await buildExport(
            [
                {
                    epub: await buildBook("One", "Author", 1),
                    filename: "one",
                    storyUrl: "https://example.com/one",
                },
            ],
            "99",
        );

        await expect(parseLibraryExport(bytes)).rejects.toThrow(/version 99/);
    });

    it("skips a book it cannot read", async () => {
        const bytes = await buildZip({
            "LibraryVersion.txt": "2",
            "Library/0/LibEpub": "not a data url at all",
            "Library/0/LibFilename": "broken",
            "Library/0/LibStoryURL": "https://example.com/broken",
        });

        const books = await parseLibraryExport(bytes);
        expect(books).toHaveLength(0);
    });

    it("returns nothing for an archive that is not a library export", async () => {
        const bytes = await buildZip({ "something.txt": "else" });
        const books = await parseLibraryExport(bytes);
        expect(books).toHaveLength(0);
    });
});

describe("parseLibraryExport limits", () => {
    it("refuses an archive that is larger than the limit", async () => {
        const bytes = await buildZip({ "LibraryVersion.txt": "2" });

        await expect(
            parseLibraryExport(bytes, { ...TIGHT, maxArchiveBytes: 16 }),
        ).rejects.toBeInstanceOf(ImportLimitError);
    });

    it("refuses an archive with too many entries", async () => {
        const files: Record<string, string> = { "LibraryVersion.txt": "2" };
        for (let index = 0; index < 12; ++index) files[`file-${index}`] = "x";
        const bytes = await buildZip(files);

        await expect(parseLibraryExport(bytes, TIGHT)).rejects.toBeInstanceOf(ImportLimitError);
    });

    it("refuses an entry that is larger than the limit", async () => {
        // The entry is large, and the archive says so: the size is checked
        // before the entry is decompressed, so the memory is never spent.
        const bytes = await buildZip({
            "LibraryVersion.txt": "2",
            "Library/0/LibEpub": "x".repeat(64 * 1024),
            "Library/0/LibFilename": "big",
            "Library/0/LibStoryURL": "https://example.com/big",
        });

        await expect(parseLibraryExport(bytes, TIGHT)).rejects.toBeInstanceOf(ImportLimitError);
    });

    it("refuses an entry that lies about its size", async () => {
        // The archive's own claim is that the entry is small; the entry is
        // not. The bytes are counted as they come out, so the lie is caught.
        const bytes = claimSize(
            await buildZip({
                "LibraryVersion.txt": "2",
                "Library/0/LibEpub": "y".repeat(64 * 1024),
                "Library/0/LibFilename": "liar",
                "Library/0/LibStoryURL": "https://example.com/liar",
            }),
            "Library/0/LibEpub",
            16,
        );

        const limits: ImportLimits = {
            ...TIGHT,
            // The claim is believed; the bytes are not.
            maxEntryBytes: 4096,
            maxTotalBytes: 1024 * 1024,
        };

        await expect(parseLibraryExport(bytes, limits)).rejects.toBeInstanceOf(ImportLimitError);
    });

    it("refuses an import that decompresses to more than the total limit", async () => {
        const epub = await buildBook("A Story", "An Author", 1);
        const bytes = await buildExport([
            { epub, filename: "a-story", storyUrl: "https://example.com/story" },
        ]);

        const limits: ImportLimits = {
            ...TIGHT,
            maxEntryBytes: 1024 * 1024,
            maxTotalBytes: 128,
        };

        await expect(parseLibraryExport(bytes, limits)).rejects.toBeInstanceOf(ImportLimitError);
    });

    it("reports a limit as a limit, not as a corrupt file", async () => {
        const bytes = await buildZip({ "LibraryVersion.txt": "2" });

        const error = await parseLibraryExport(bytes, {
            ...TIGHT,
            maxArchiveBytes: 16,
        }).catch((thrown: unknown) => thrown);

        expect(error).toBeInstanceOf(ImportLimitError);
        // The error has to survive the trip across the message bus, or the
        // page would show "Could not reach the site" for a file that is
        // simply too big.
        expect((error as ImportLimitError).code).toBe("UNSUPPORTED");
    });

    it("uses limits that are generous enough for a real library", () => {
        expect(DEFAULT_IMPORT_LIMITS.maxArchiveBytes).toBeGreaterThan(64 * 1024 * 1024);
        expect(DEFAULT_IMPORT_LIMITS.maxEntryBytes).toBeGreaterThan(8 * 1024 * 1024);
        expect(DEFAULT_IMPORT_LIMITS.maxTotalBytes).toBeGreaterThan(
            DEFAULT_IMPORT_LIMITS.maxEntryBytes,
        );
    });
});

describe("decodeDataUrl", () => {
    it("decodes a base64 data URL", () => {
        const decoded = decodeDataUrl(dataUrl(new Uint8Array([1, 2, 3]), "image/png"));
        expect(decoded?.mediaType).toBe("image/png");
        expect(Array.from(decoded?.bytes ?? [])).toEqual([1, 2, 3]);
    });

    it("decodes a percent-encoded data URL", () => {
        const decoded = decodeDataUrl("data:text/plain,hello%20there");
        expect(decoded?.mediaType).toBe("text/plain");
        expect(new TextDecoder().decode(decoded?.bytes)).toBe("hello there");
    });

    it("refuses something that is not a data URL", () => {
        expect(decodeDataUrl("https://example.com/book.epub")).toBeUndefined();
    });
});
