/**
 * The EPUB archiver.
 *
 * Turns a set of files into a ZIP archive that satisfies the EPUB OCF
 * specification.
 *
 * The specification has one hard requirement that is easy to miss: the
 * `mimetype` entry must be the *first* entry in the archive, and it must be
 * stored uncompressed. A reader that identifies a container from its first
 * few bytes cannot read a book where that entry is missing, deflated, or
 * somewhere in the middle.
 *
 * Two details of `zip.js` matter here, and both are traps:
 *
 * - Storing an entry with `level: 0` turns `useCompressionStream` off, which
 *   sends the entry through `zip.js`'s WebAssembly zlib codec. The
 *   extension's content security policy does not allow `wasm-unsafe-eval`,
 *   so the archive never finishes. The compression *method* is set to "store"
 *   instead, which leaves the compression path alone.
 * - `zip.js` offloads compression to a web worker by default. The worker is
 *   resolved relative to the bundle's own URL, which does not exist in a
 *   packaged add-on, so the worker fails to start and the write never
 *   completes. The worker buys nothing for a book of a few megabytes.
 *
 * See ADR-0011.
 */
import type { EpubFile } from "./document";
import { MIMETYPE_PATH } from "./document";

/**
 * The parts of `zip.js` the archiver uses.
 *
 * The module is imported lazily, so the archive code is only loaded when a
 * book is actually written.
 */
interface ZipModule {
    /** Writes a ZIP archive. */
    ZipWriter: new (writer: unknown) => {
        add: (name: string, reader: unknown, options?: unknown) => Promise<void>;
        close: () => Promise<Blob>;
    };
    /** Collects the archive into a blob. */
    BlobWriter: new (type: string) => unknown;
    /** Reads a byte array into the archive. */
    Uint8ArrayReader: new (content: Uint8Array) => unknown;
    /** Sets `zip.js`'s global configuration. */
    configure: (options: { useWebWorkers: boolean }) => void;
}

/**
 * Build the EPUB's archive.
 *
 * @param files The files to archive. The first file is written first, so the
 *   caller puts the `mimetype` file at the head of the list.
 * @returns The archive's bytes.
 */
export async function buildEpubArchive(files: EpubFile[]): Promise<Uint8Array> {
    const { ZipWriter, BlobWriter, Uint8ArrayReader, configure } = (await import(
        "@zip.js/zip.js"
    )) as unknown as ZipModule;

    configure({ useWebWorkers: false });

    const writer = new ZipWriter(new BlobWriter("application/epub+zip"));

    const [first, ...rest] = files;
    if (first) {
        await addFile(writer, Uint8ArrayReader, first, first.path === MIMETYPE_PATH);
    }
    for (const file of rest) {
        await addFile(writer, Uint8ArrayReader, file, false);
    }

    const blob = await writer.close();
    return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Add one file to the archive.
 *
 * @param writer The archive's writer.
 * @param readerClass Reads a byte array into the archive.
 * @param file The file to add.
 * @param stored Whether the file is stored uncompressed.
 */
async function addFile(
    writer: { add: (name: string, reader: unknown, options?: unknown) => Promise<void> },
    readerClass: new (content: Uint8Array) => unknown,
    file: EpubFile,
    stored: boolean,
): Promise<void> {
    // The bytes are built up front rather than streamed, so the entry's size
    // is known before it is written.
    const bytes =
        typeof file.content === "string" ? new TextEncoder().encode(file.content) : file.content;

    // The compression method is set to "store" rather than the level being
    // set to zero. Setting the level would switch `zip.js` off its native
    // compression stream and onto its WebAssembly codec, which the
    // extension's content security policy does not allow.
    //
    // The data descriptor is switched off so the entry's size and checksum
    // sit in its local header, where the specification wants them: a reader
    // identifies the container from the first bytes, without reading the
    // data first.
    const options = stored ? { compressionMethod: 0, dataDescriptor: false } : undefined;
    await writer.add(file.path, new readerClass(bytes), options);
}
