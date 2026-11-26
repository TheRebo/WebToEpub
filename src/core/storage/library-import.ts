/**
 * Importing a library that WebToEpub 1.x exported.
 *
 * The original extension kept its library — the books the user had made, with
 * their covers — in `chrome.storage.local`, as base64 data, under keys the
 * user never saw. It also had an export button, and the export is a ZIP
 * archive with a shape that is written down:
 *
 * ```text
 * LibraryVersion.txt          "2"
 * LibraryCountEntries.txt     the number of books
 * Library/<i>/LibEpub         the book, as a base64 data URL
 * Library/<i>/LibFilename     the file name the user gave it
 * Library/<i>/LibStoryURL     the address of the story
 * Library/<i>/LibCover        the cover, as a data URL
 * Library/<i>/LibNewChapterCount
 * ReadingList.json
 * ```
 *
 * Kintsugi cannot read the original's storage directly: `storage.local` is
 * scoped to the extension's own ID, and Kintsugi does not have the original's
 * ID — nor should it, since the ID belongs to the original's author. So the
 * user exports from the old extension and imports the file here.
 *
 * What comes across is the *library*: the books, their covers and where they
 * came from. The books themselves are not copied — they are files on the
 * user's disk, and Kintsugi's library has never held a book, only the record
 * of one.
 *
 * See ADR-0034.
 */

/** A book read out of an export. */
export interface ImportedBook {
    /** The book's title. */
    title: string;
    /** The book's author, when the book says. */
    author?: string;
    /** The address of the story the book was made from. */
    sourceUrl: string;
    /** How many chapters the book has. */
    chapterCount: number;
    /** The book's size, in bytes. */
    size: number;
    /** The cover's bytes, when the export carries one. */
    cover?: Uint8Array;
    /** The cover's media type. */
    coverMediaType?: string;
}

/**
 * The parts of `zip.js` this module uses.
 *
 * The library is imported once in a user's life, so the ZIP code is loaded
 * only when an import is actually happening.
 */
interface ZipModule {
    /** Reads a ZIP archive. */
    ZipReader: new (
        reader: unknown,
        options?: unknown,
    ) => {
        getEntries: () => Promise<ZipEntry[]>;
        close: () => Promise<void>;
    };
    /** Reads a byte array. */
    Uint8ArrayReader: new (content: Uint8Array) => unknown;
    /** Collects an entry's bytes. */
    Uint8ArrayWriter: new () => unknown;
    /** Collects an entry's text. */
    TextWriter: new () => unknown;
}

/** An entry in a ZIP archive. */
interface ZipEntry {
    /** The entry's name. */
    filename: string;
    /** Whether the entry is a directory. */
    directory: boolean;
    /** Reads the entry's contents, in the writer's own type. */
    getData: (writer: unknown) => Promise<unknown>;
}

/** The export format this module understands. */
const SUPPORTED_VERSION = "2";

/**
 * Read a library export.
 *
 * A book that cannot be read is skipped rather than failing the import: one
 * corrupt book in a hundred should not cost the user the other ninety-nine.
 *
 * @param bytes The export archive's bytes.
 * @returns The books the archive carries.
 */
export async function parseLibraryExport(bytes: Uint8Array): Promise<ImportedBook[]> {
    const entries = await readArchive(bytes);
    const byName = new Map<string, ZipEntry>();
    for (const entry of entries) {
        if (!entry.directory) byName.set(entry.filename, entry);
    }

    const version = await readText(byName.get("LibraryVersion.txt"));
    if (version !== undefined && version.trim() !== SUPPORTED_VERSION) {
        throw new Error(
            `This library export is version ${version.trim()}, and this version of Kintsugi reads version ${SUPPORTED_VERSION}.`,
        );
    }

    const books: ImportedBook[] = [];
    for (const name of byName.keys()) {
        const match = /^Library\/(\d+)\/LibEpub$/.exec(name);
        if (!match) continue;
        const book = await readBook(byName, match[1]!);
        if (book) books.push(book);
    }

    return books;
}

/**
 * Read one book out of the export.
 *
 * @param entries The export's entries, by name.
 * @param index The book's index, as it appears in the entry's path.
 * @returns The book, or `null` when it cannot be read.
 */
async function readBook(
    entries: Map<string, ZipEntry>,
    index: string,
): Promise<ImportedBook | null> {
    const epubText = await readText(entries.get(`Library/${index}/LibEpub`));
    if (epubText === undefined) return null;

    const epub = decodeDataUrl(epubText);
    if (!epub) return null;

    const filename = (await readText(entries.get(`Library/${index}/LibFilename`)))?.trim();
    const storyUrl = (await readText(entries.get(`Library/${index}/LibStoryURL`)))?.trim();

    // The book's own metadata is better than the file name: the name is what
    // the user typed, and the title is what the book says it is.
    const metadata = await readEpubMetadata(epub.bytes);

    const coverText = await readText(entries.get(`Library/${index}/LibCover`));
    const cover = coverText ? decodeDataUrl(coverText) : undefined;

    return {
        title: metadata?.title || filename || "Untitled",
        author: metadata?.author,
        sourceUrl: storyUrl || "",
        chapterCount: metadata?.chapterCount ?? 0,
        size: epub.bytes.length,
        cover: cover?.bytes,
        coverMediaType: cover?.mediaType,
    };
}

/**
 * Read an entry's text.
 *
 * @param entry The entry, or `undefined` when the archive does not have it.
 * @returns The text, or `undefined` when the entry is not there.
 */
async function readText(entry: ZipEntry | undefined): Promise<string | undefined> {
    if (!entry) return undefined;
    try {
        const { TextWriter } = await loadZip();
        const result = await entry.getData(new TextWriter());
        return typeof result === "string" ? result : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Read a ZIP archive's entries.
 *
 * @param bytes The archive's bytes.
 * @returns The entries.
 */
async function readArchive(bytes: Uint8Array): Promise<ZipEntry[]> {
    const { ZipReader, Uint8ArrayReader } = await loadZip();
    const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
    try {
        return await reader.getEntries();
    } finally {
        await reader.close().catch(() => undefined);
    }
}

/** The metadata a book's package document carries. */
interface EpubMetadata {
    /** The book's title. */
    title?: string;
    /** The book's author. */
    author?: string;
    /** How many chapters the book's spine has. */
    chapterCount?: number;
}

/**
 * Read a book's title, author and chapter count from its package document.
 *
 * @param bytes The book's bytes.
 * @returns The metadata, or `undefined` when the book cannot be read.
 */
async function readEpubMetadata(bytes: Uint8Array): Promise<EpubMetadata | undefined> {
    const { ZipReader, Uint8ArrayReader } = await loadZip();
    const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
    try {
        const entries = await reader.getEntries();
        const opf = entries.find((entry) => entry.filename === "OEBPS/content.opf");
        if (!opf) return undefined;
        const xml = await readText(opf);
        if (xml === undefined) return undefined;

        const dom = new DOMParser().parseFromString(xml, "application/xml");
        if (dom.querySelector("parsererror")) return undefined;

        return {
            title: firstText(dom, "title"),
            author: firstText(dom, "creator"),
            chapterCount: dom.getElementsByTagName("itemref").length,
        };
    } catch {
        return undefined;
    } finally {
        await reader.close().catch(() => undefined);
    }
}

/**
 * The text of the first element with a given name.
 *
 * The package document uses the Dublin Core namespace, and the namespace
 * prefix is not the same in every book, so the local name is matched rather
 * than the qualified one.
 *
 * @param dom The package document.
 * @param name The element's local name.
 * @returns The text, or `undefined` when there is no such element.
 */
function firstText(dom: Document, name: string): string | undefined {
    const elements = dom.getElementsByTagName("*");
    for (const element of Array.from(elements)) {
        if (element.localName !== name) continue;
        const text = element.textContent?.trim();
        if (text) return text;
    }
    return undefined;
}

/**
 * Decode a data URL.
 *
 * The original stored the book and the cover as data URLs, and the book's was
 * sometimes written with the wrong media type — a browser that did not know
 * the type wrote `application/octet-stream`, and the original patched it
 * back to `application/epub+zip` when it read it.
 *
 * @param text The data URL.
 * @returns The bytes and the media type, or `undefined` when the text is not
 *   a data URL.
 */
export function decodeDataUrl(text: string): { bytes: Uint8Array; mediaType: string } | undefined {
    const trimmed = text.trim();
    const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(trimmed);
    if (!match) return undefined;

    const mediaType = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const payload = match[3] ?? "";

    try {
        if (isBase64) {
            const binary = atob(payload.replace(/\s/g, ""));
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; ++index) {
                bytes[index] = binary.charCodeAt(index);
            }
            return { bytes, mediaType };
        }
        return {
            bytes: new TextEncoder().encode(decodeURIComponent(payload)),
            mediaType,
        };
    } catch {
        return undefined;
    }
}

/** The loaded `zip.js` module. */
let zipModule: Promise<ZipModule> | undefined;

/**
 * Load `zip.js`.
 *
 * @returns The module.
 */
async function loadZip(): Promise<ZipModule> {
    if (!zipModule) {
        zipModule = import("@zip.js/zip.js").then((module) => module as unknown as ZipModule);
    }
    return zipModule;
}
