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
 * An import is a file the user chose, but it is still a file from somewhere,
 * and an archive is a thing that can lie about its size. Every read here is
 * therefore bounded: an archive that says it holds a gigabyte, or that
 * expands to one, is refused rather than believed. See ADR-0035.
 *
 * See ADR-0034.
 */
import { DEFAULT_IMPORT_LIMITS, ImportLimitError, type ImportLimits } from "./import-limits";

export { DEFAULT_IMPORT_LIMITS, ImportLimitError };
export type { ImportLimits };

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
}

/** An entry in a ZIP archive. */
interface ZipEntry {
    /** The entry's name. */
    filename: string;
    /** Whether the entry is a directory. */
    directory: boolean;
    /** The entry's size once decompressed, when the archive says. */
    uncompressedSize?: number;
    /** Reads the entry's contents, in the writer's own type. */
    getData: (writer: unknown) => Promise<unknown>;
}

/** The export format this module understands. */
const SUPPORTED_VERSION = "2";

/**
 * The budget an import spends against.
 *
 * The budget is shared by every read in one import, so that an archive with a
 * thousand entries of 60 MB each is refused for the same reason one entry of
 * 60 MB is not: the total is what the browser has to hold.
 */
class ByteBudget {
    /** How many bytes are left. */
    #remaining: number;

    /**
     * @param total The total number of bytes the import may decompress.
     */
    constructor(total: number) {
        this.#remaining = total;
    }

    /**
     * Whether the budget can cover so many bytes.
     *
     * @param count How many bytes would be spent.
     * @returns `true` when there is room for them.
     */
    canTake(count: number): boolean {
        return count <= this.#remaining;
    }

    /**
     * Spend bytes from the budget.
     *
     * @param count How many bytes are being spent.
     */
    take(count: number): void {
        this.#remaining -= count;
    }
}

/**
 * A writer that collects an entry's bytes and refuses to grow past its limit.
 *
 * The archive's own claim about an entry's size is not trusted — an archive
 * that says its entry is small and is not is exactly the case worth catching.
 * The bytes are counted as they come out of the decompressor, and the read is
 * abandoned the moment the count is too high.
 *
 * The refusal is recorded rather than thrown, because the reader that drives
 * the decompressor replaces whatever error came out of the stream with one of
 * its own. A limit that was only reported by throwing would therefore arrive
 * as an ordinary failure and the book would be quietly skipped. Recording it
 * makes the limit the one thing that is never mistaken for corruption.
 */
class CappedWriter {
    /** The stream `zip.js` writes the entry into. */
    readonly writable: WritableStream;
    /** The chunks read so far. */
    #chunks: Uint8Array[] = [];
    /** How many bytes have been read. */
    #read = 0;
    /** Whether a limit was reached. */
    #refused = false;
    /** Why the read was refused. */
    #reason = "";

    /**
     * @param limit The most bytes this entry may have.
     * @param budget The budget the bytes are spent from.
     */
    constructor(
        private readonly limit: number,
        private readonly budget: ByteBudget,
    ) {
        this.writable = new WritableStream({
            write: (chunk: Uint8Array) => {
                this.#read += chunk.byteLength;
                if (this.#read > this.limit) {
                    throw this.#refuse(
                        "This library export holds an entry that is too large to read.",
                    );
                }
                if (!this.budget.canTake(chunk.byteLength)) {
                    throw this.#refuse(
                        "This library export is larger than Kintsugi can read in one go.",
                    );
                }
                this.budget.take(chunk.byteLength);
                this.#chunks.push(chunk);
            },
        });
    }

    /**
     * Record that a limit was reached.
     *
     * @param reason The message to show the user.
     * @returns The error to throw, so that the read stops at once.
     */
    #refuse(reason: string): ImportLimitError {
        if (!this.#refused) {
            this.#refused = true;
            this.#reason = reason;
        }
        return new ImportLimitError(this.#reason);
    }

    /**
     * Whether a limit was reached during the read.
     *
     * @returns `true` when the read was refused.
     */
    get refused(): boolean {
        return this.#refused;
    }

    /**
     * Why the read was refused.
     *
     * @returns The message to show the user.
     */
    get reason(): string {
        return this.#reason;
    }

    /**
     * The bytes that were read.
     *
     * @returns The entry's bytes.
     */
    getData(): Uint8Array {
        const total = this.#chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of this.#chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return bytes;
    }
}

/**
 * Read a library export.
 *
 * A book that cannot be read is skipped rather than failing the import: one
 * corrupt book in a hundred should not cost the user the other ninety-nine.
 * An archive that is too large is a different matter, and is refused.
 *
 * @param bytes The export archive's bytes.
 * @param limits The limits the import works within.
 * @returns The books the archive carries.
 */
export async function parseLibraryExport(
    bytes: Uint8Array,
    limits: ImportLimits = DEFAULT_IMPORT_LIMITS,
): Promise<ImportedBook[]> {
    if (bytes.byteLength > limits.maxArchiveBytes) {
        throw new ImportLimitError("This library export is too large for Kintsugi to read.");
    }

    const budget = new ByteBudget(limits.maxTotalBytes);
    const entries = await readArchive(bytes, limits);
    const byName = new Map<string, ZipEntry>();
    for (const entry of entries) {
        if (!entry.directory) byName.set(entry.filename, entry);
    }

    const version = await readText(byName.get("LibraryVersion.txt"), limits, budget);
    if (version !== undefined && version.trim() !== SUPPORTED_VERSION) {
        throw new Error(
            `This library export is version ${version.trim()}, and this version of Kintsugi reads version ${SUPPORTED_VERSION}.`,
        );
    }

    const books: ImportedBook[] = [];
    for (const name of byName.keys()) {
        const match = /^Library\/(\d+)\/LibEpub$/.exec(name);
        if (!match) continue;
        const book = await readBook(byName, match[1]!, limits, budget);
        if (book) books.push(book);
    }

    return books;
}

/**
 * Read one book out of the export.
 *
 * @param entries The export's entries, by name.
 * @param index The book's index, as it appears in the entry's path.
 * @param limits The limits the import works within.
 * @param budget The budget the reads are spent from.
 * @returns The book, or `null` when it cannot be read.
 */
async function readBook(
    entries: Map<string, ZipEntry>,
    index: string,
    limits: ImportLimits,
    budget: ByteBudget,
): Promise<ImportedBook | null> {
    const epubText = await readText(entries.get(`Library/${index}/LibEpub`), limits, budget);
    if (epubText === undefined) return null;

    const epub = decodeDataUrl(epubText);
    if (!epub) return null;

    const filename = (
        await readText(entries.get(`Library/${index}/LibFilename`), limits, budget)
    )?.trim();
    const storyUrl = (
        await readText(entries.get(`Library/${index}/LibStoryURL`), limits, budget)
    )?.trim();

    // The book's own metadata is better than the file name: the name is what
    // the user typed, and the title is what the book says it is.
    const metadata = await readEpubMetadata(epub.bytes, limits, budget);

    const coverText = await readText(entries.get(`Library/${index}/LibCover`), limits, budget);
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
 * @param limits The limits the import works within.
 * @param budget The budget the read is spent from.
 * @returns The text, or `undefined` when the entry is not there.
 */
async function readText(
    entry: ZipEntry | undefined,
    limits: ImportLimits,
    budget: ByteBudget,
): Promise<string | undefined> {
    if (!entry) return undefined;
    const bytes = await readEntry(entry, limits, budget);
    if (!bytes) return undefined;
    return new TextDecoder().decode(bytes);
}

/**
 * Read an entry's bytes, within the limits.
 *
 * @param entry The entry.
 * @param limits The limits the import works within.
 * @param budget The budget the read is spent from.
 * @returns The bytes, or `undefined` when the entry cannot be read.
 */
async function readEntry(
    entry: ZipEntry,
    limits: ImportLimits,
    budget: ByteBudget,
): Promise<Uint8Array | undefined> {
    // The archive's own claim is checked first, because refusing on a claim
    // costs nothing and refusing after the fact costs the memory.
    if (
        typeof entry.uncompressedSize === "number" &&
        entry.uncompressedSize > limits.maxEntryBytes
    ) {
        throw new ImportLimitError("This library export holds an entry that is too large to read.");
    }

    const writer = new CappedWriter(limits.maxEntryBytes, budget);
    try {
        await entry.getData(writer);
    } catch {
        // The reader replaces whatever error came out of the stream with one
        // of its own, so the reason is taken from the writer rather than from
        // the exception: a limit that was reached is never mistaken for a
        // file that cannot be read.
    }
    if (writer.refused) {
        throw new ImportLimitError(writer.reason);
    }
    return writer.getData();
}

/**
 * Read a ZIP archive's entries.
 *
 * @param bytes The archive's bytes.
 * @param limits The limits the import works within.
 * @returns The entries.
 */
async function readArchive(bytes: Uint8Array, limits: ImportLimits): Promise<ZipEntry[]> {
    const { ZipReader, Uint8ArrayReader } = await loadZip();
    const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
    try {
        const entries = await reader.getEntries();
        if (entries.length > limits.maxEntries) {
            throw new ImportLimitError("This library export holds too many files to read.");
        }
        return entries;
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
 * The book is itself an archive, so it is read within the same limits: an
 * export that carries a book which is really a bomb is refused at the book,
 * not after it has been expanded.
 *
 * @param bytes The book's bytes.
 * @param limits The limits the import works within.
 * @param budget The budget the reads are spent from.
 * @returns The metadata, or `undefined` when the book cannot be read.
 */
async function readEpubMetadata(
    bytes: Uint8Array,
    limits: ImportLimits,
    budget: ByteBudget,
): Promise<EpubMetadata | undefined> {
    if (bytes.byteLength > limits.maxArchiveBytes) {
        throw new ImportLimitError("This library export holds a book that is too large to read.");
    }

    const { ZipReader, Uint8ArrayReader } = await loadZip();
    const reader = new ZipReader(new Uint8ArrayReader(bytes), { useWebWorkers: false });
    try {
        const entries = await reader.getEntries();
        if (entries.length > limits.maxEntries) {
            throw new ImportLimitError("This library export holds too many files to read.");
        }
        const opf = entries.find((entry) => entry.filename === "OEBPS/content.opf");
        if (!opf) return undefined;
        const xml = await readText(opf, limits, budget);
        if (xml === undefined) return undefined;

        const dom = new DOMParser().parseFromString(xml, "application/xml");
        if (dom.querySelector("parsererror")) return undefined;

        return {
            title: firstText(dom, "title"),
            author: firstText(dom, "creator"),
            chapterCount: dom.getElementsByTagName("itemref").length,
        };
    } catch (error) {
        if (error instanceof ImportLimitError) throw error;
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
