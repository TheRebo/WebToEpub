import { describe, expect, it } from "vitest";
import { buildEpubArchive } from "../../src/core/epub/archiver";
import { packEpub, type ChapterToPack } from "../../src/core/epub/packer";
import { MIMETYPE_CONTENT, MIMETYPE_PATH, type EpubFile } from "../../src/core/epub/document";

/** A chapter with a little content. */
function chapter(title: string): ChapterToPack {
    return { sourceUrl: `https://example.com/${title}`, title, contentHtml: "<p>Hello.</p>" };
}

/**
 * Read a ZIP archive's central directory.
 *
 * Only the fields the OCF rules depend on are read: the entry's name, its
 * compression method, and the size of its compressed and uncompressed data.
 */
interface ZipEntry {
    /** The entry's name. */
    name: string;
    /** The compression method: 0 is stored, 8 is deflated. */
    method: number;
    /** The compressed size. */
    compressedSize: number;
    /** The uncompressed size. */
    uncompressedSize: number;
    /** The offset of the entry's local header. */
    offset: number;
    /** The entry's CRC-32, as recorded in the central directory. */
    crc: number;
    /** Whether the entry's local header points at a data descriptor. */
    hasDataDescriptor: boolean;
}

/** Parse a ZIP archive's central directory. */
function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // The end-of-central-directory record sits at the end of the archive.
    let end = bytes.length - 22;
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) --end;
    if (end < 0) throw new Error("The archive has no central directory.");

    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);

    const entries: ZipEntry[] = [];
    for (let index = 0; index < count; ++index) {
        if (view.getUint32(offset, true) !== 0x02014b50) {
            throw new Error("The central directory is malformed.");
        }
        const method = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const uncompressedSize = view.getUint32(offset + 24, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localOffset = view.getUint32(offset + 42, true);
        const crc = view.getUint32(offset + 16, true);
        const name = new TextDecoder().decode(
            bytes.subarray(offset + 46, offset + 46 + nameLength),
        );
        entries.push({
            name,
            method,
            compressedSize,
            uncompressedSize,
            offset: localOffset,
            crc,
            hasDataDescriptor: (view.getUint16(localOffset + 6, true) & 0x08) !== 0,
        });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
}

/** Read the name of a local file header. */
function readLocalName(bytes: Uint8Array, entry: ZipEntry): string {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(entry.offset, true) !== 0x04034b50) {
        throw new Error("The local file header is malformed.");
    }
    const nameLength = view.getUint16(entry.offset + 26, true);
    const extraLength = view.getUint16(entry.offset + 28, true);
    const start = entry.offset + 30 + nameLength + extraLength;
    return new TextDecoder().decode(bytes.subarray(start, start + entry.uncompressedSize));
}

/**
 * Compute a CRC-32, the way a ZIP entry's header records it.
 *
 * @param bytes The bytes to sum.
 * @returns The CRC-32.
 */
function crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; ++bit) {
            crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

describe("buildEpubArchive", () => {
    it("writes the mimetype entry first", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        expect(entries[0]?.name).toBe(MIMETYPE_PATH);
    });

    it("stores the mimetype entry uncompressed", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        const mimetype = entries[0];
        expect(mimetype?.method).toBe(0);
        expect(mimetype?.compressedSize).toBe(mimetype?.uncompressedSize);
    });

    it("writes the mimetype entry's content", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        expect(readLocalName(bytes, entries[0]!)).toBe(MIMETYPE_CONTENT);
    });

    it("writes the mimetype entry at the very start of the archive", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);

        // The first local file header has to be the mimetype entry, with its
        // name and its data, before anything else.
        expect(
            new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true),
        ).toBe(0x04034b50);
        expect(entries[0]?.offset).toBe(0);
    });

    it("gives the mimetype entry a correct checksum", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        const mimetype = entries[0]!;
        const content = new TextEncoder().encode(MIMETYPE_CONTENT);
        expect(mimetype.crc).toBe(crc32(content));
    });

    it("writes the mimetype entry without a data descriptor", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        // The specification wants the entry's size and checksum in the local
        // header, where a reader can find them without reading the data.
        expect(entries[0]?.hasDataDescriptor).toBe(false);
    });

    it("writes the mimetype entry without an extra field", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

        // The OCF specification forbids an extra field on the `mimetype`
        // entry: a validator rejects the whole book for one.
        const localOffset = entries[0]!.offset;
        const nameLength = view.getUint16(localOffset + 26, true);
        const extraLength = view.getUint16(localOffset + 28, true);
        expect(extraLength).toBe(0);
        expect(nameLength).toBe(MIMETYPE_PATH.length);
    });

    it("compresses the rest of the book", async () => {
        const files = packEpub([chapter("One")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        const container = entries.find((entry) => entry.name === "META-INF/container.xml");
        expect(container?.method).toBe(8);
    });

    it("keeps every file the packer produced", async () => {
        const files = packEpub([chapter("One"), chapter("Two")], { title: "A Story" }).files;
        const bytes = await buildEpubArchive(files);
        const entries = readCentralDirectory(bytes);
        expect(entries.map((entry) => entry.name).sort()).toEqual(
            files.map((file: EpubFile) => file.path).sort(),
        );
    });
});
